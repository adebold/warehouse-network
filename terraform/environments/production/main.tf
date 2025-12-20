terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket         = "warehouse-network-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

data "aws_eks_cluster" "cluster" {
  name = module.eks.cluster_id
}

data "aws_eks_cluster_auth" "cluster" {
  name = module.eks.cluster_id
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.cluster.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

provider "helm" {
  kubernetes {
    host                   = data.aws_eks_cluster.cluster.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.cluster.certificate_authority[0].data)
    token                  = data.aws_eks_cluster_auth.cluster.token
  }
}

locals {
  environment = "production"
  project_name = "warehouse-network"
  
  common_tags = {
    Environment = local.environment
    Project     = local.project_name
    ManagedBy   = "terraform"
    CostCenter  = "engineering"
  }
}

# VPC Module
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "5.1.2"

  name = "${local.project_name}-${local.environment}-vpc"
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  private_subnets = var.private_subnet_cidrs
  public_subnets  = var.public_subnet_cidrs

  enable_nat_gateway   = true
  single_nat_gateway   = false
  enable_dns_hostnames = true
  enable_dns_support   = true

  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true

  public_subnet_tags = {
    "kubernetes.io/role/elb"                        = 1
    "kubernetes.io/cluster/${local.project_name}-${local.environment}" = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"               = 1
    "kubernetes.io/cluster/${local.project_name}-${local.environment}" = "shared"
  }

  tags = local.common_tags
}

# EKS Cluster
module "eks" {
  source = "../../modules/eks"

  project_name       = local.project_name
  environment        = local.environment
  vpc_id             = module.vpc.vpc_id
  vpc_cidr           = var.vpc_cidr
  private_subnet_ids = module.vpc.private_subnets

  kubernetes_version     = var.kubernetes_version
  endpoint_public_access = false
  public_access_cidrs    = []

  node_groups = {
    general = {
      instance_types      = ["t3.large", "t3a.large"]
      capacity_type       = "SPOT"
      desired_size        = 3
      max_size            = 10
      min_size            = 3
      disk_size           = 100
      bootstrap_arguments = ""
    }
    critical = {
      instance_types      = ["t3.large"]
      capacity_type       = "ON_DEMAND"
      desired_size        = 2
      max_size            = 4
      min_size            = 2
      disk_size           = 100
      bootstrap_arguments = "--kubelet-extra-args '--node-labels=workload=critical'"
    }
  }

  tags = local.common_tags
}

# RDS Database
module "rds" {
  source = "terraform-aws-modules/rds/aws"
  version = "6.3.0"

  identifier = "${local.project_name}-${local.environment}"

  engine            = "postgres"
  engine_version    = "15.4"
  instance_class    = var.rds_instance_class
  allocated_storage = 100
  storage_encrypted = true

  db_name  = "warehouse"
  username = "warehouse_admin"
  password = random_password.db_password.result
  port     = "5432"

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period = 30
  backup_window          = "03:00-06:00"
  maintenance_window     = "sun:06:00-sun:07:00"

  enabled_cloudwatch_logs_exports = ["postgresql"]
  monitoring_interval             = "60"
  monitoring_role_arn            = aws_iam_role.rds_monitoring.arn

  deletion_protection = true
  skip_final_snapshot = false

  tags = local.common_tags
}

# ElastiCache Redis
module "elasticache" {
  source = "terraform-aws-modules/elasticache/aws"
  version = "1.0.0"

  cluster_id           = "${local.project_name}-${local.environment}"
  engine              = "redis"
  node_type           = var.elasticache_node_type
  num_cache_nodes     = 1
  parameter_group_name = "default.redis7"
  port                = 6379

  subnet_group_name = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.elasticache.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                = random_password.redis_auth.result

  snapshot_retention_limit = 5
  snapshot_window         = "03:00-05:00"

  tags = local.common_tags
}

# S3 Buckets
module "s3_assets" {
  source = "terraform-aws-modules/s3-bucket/aws"
  version = "3.15.1"

  bucket = "${local.project_name}-${local.environment}-assets"

  versioning = {
    enabled = true
  }

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }

  lifecycle_rule = [
    {
      id      = "transition-to-ia"
      enabled = true
      
      transition = [
        {
          days          = 30
          storage_class = "STANDARD_IA"
        },
        {
          days          = 90
          storage_class = "GLACIER"
        }
      ]
    }
  ]

  tags = local.common_tags
}

# CloudFront Distribution
module "cloudfront" {
  source = "terraform-aws-modules/cloudfront/aws"
  version = "3.2.1"

  aliases = ["warehouse-network.com", "www.warehouse-network.com"]

  comment             = "Warehouse Network Production CDN"
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_200"
  retain_on_delete    = false
  wait_for_deployment = false

  origin = {
    alb = {
      domain_name = aws_lb.main.dns_name
      custom_origin_config = {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior = {
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods  = ["GET", "HEAD"]
    compress        = true
    query_string    = true
    cookies = {
      forward = "all"
    }
  }

  viewer_certificate = {
    acm_certificate_arn = aws_acm_certificate.main.arn
    ssl_support_method  = "sni-only"
  }

  tags = local.common_tags
}

# WAF Web ACL
resource "aws_wafv2_web_acl" "main" {
  name  = "${local.project_name}-${local.environment}-waf"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "RateLimitRule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "WAFv2WebACL"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}

# Random passwords
resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

# Outputs
output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "rds_endpoint" {
  value = module.rds.db_instance_endpoint
}

output "elasticache_endpoint" {
  value = module.elasticache.configuration_endpoint_address
}

output "cloudfront_domain" {
  value = module.cloudfront.cloudfront_distribution_domain_name
}