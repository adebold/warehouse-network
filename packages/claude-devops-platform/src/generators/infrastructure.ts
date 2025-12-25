import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { logger } from '../utils/logger';

export interface InfrastructureOptions {
  cloud?: 'aws' | 'gcp' | 'azure' | 'all';
  kubernetes?: boolean;
  observability?: boolean;
  terraform?: boolean;
}

export class InfrastructureGenerator {
  constructor(
    private projectPath: string,
    private options: InfrastructureOptions
  ) {}

  async generate(): Promise<void> {
    logger.debug('Generating infrastructure code...');

    await this.createInfrastructureStructure();
    
    if (this.options.terraform !== false) {
      await this.generateTerraformModules();
    }
    
    if (this.options.kubernetes) {
      await this.generateKubernetesManifests();
      await this.generateHelmCharts();
    }
    
    if (this.options.observability) {
      await this.generateObservabilityStack();
    }
    
    await this.generateDockerCompose();
    await this.generateServiceMeshConfig();
  }

  private async createInfrastructureStructure(): Promise<void> {
    const dirs = [
      'infrastructure',
      'infrastructure/terraform',
      'infrastructure/terraform/modules',
      'infrastructure/terraform/environments',
      'infrastructure/ansible',
      'infrastructure/ansible/playbooks',
      'infrastructure/ansible/roles',
      'infrastructure/scripts',
      'k8s/base',
      'k8s/overlays/development',
      'k8s/overlays/staging',
      'k8s/overlays/production',
      'helm/charts',
      'docker',
    ];

    for (const dir of dirs) {
      await fs.ensureDir(path.join(this.projectPath, dir));
    }
  }

  private async generateTerraformModules(): Promise<void> {
    const terraformPath = path.join(this.projectPath, 'infrastructure', 'terraform');

    // Main Terraform configuration
    await this.generateMainTerraformConfig(terraformPath);
    
    // Cloud provider specific modules
    if (this.options.cloud === 'aws' || this.options.cloud === 'all') {
      await this.generateAWSTerraformModules(terraformPath);
    }
    
    if (this.options.cloud === 'gcp' || this.options.cloud === 'all') {
      await this.generateGCPTerraformModules(terraformPath);
    }
    
    if (this.options.cloud === 'azure' || this.options.cloud === 'all') {
      await this.generateAzureTerraformModules(terraformPath);
    }
    
    // Common modules
    await this.generateCommonTerraformModules(terraformPath);
  }

  private async generateMainTerraformConfig(terraformPath: string): Promise<void> {
    // versions.tf
    const versions = `terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    ${this.options.cloud === 'aws' || this.options.cloud === 'all' ? `aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }` : ''}
    ${this.options.cloud === 'gcp' || this.options.cloud === 'all' ? `google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }` : ''}
    ${this.options.cloud === 'azure' || this.options.cloud === 'all' ? `azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }` : ''}
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  
  backend "s3" {
    # Configuration will be provided via backend config file
  }
}
`;

    await fs.writeFile(
      path.join(terraformPath, 'versions.tf'),
      versions.trim()
    );

    // variables.tf
    const variables = `variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "region" {
  description = "Cloud region"
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use a single NAT Gateway for all private subnets"
  type        = bool
  default     = false
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

variable "node_instance_type" {
  description = "Instance type for Kubernetes nodes"
  type        = string
  default     = "t3.medium"
}

variable "min_node_count" {
  description = "Minimum number of nodes"
  type        = number
  default     = 2
}

variable "max_node_count" {
  description = "Maximum number of nodes"
  type        = number
  default     = 10
}

variable "database_instance_class" {
  description = "Database instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "database_allocated_storage" {
  description = "Database allocated storage in GB"
  type        = number
  default     = 20
}

variable "database_multi_az" {
  description = "Enable Multi-AZ for database"
  type        = bool
  default     = true
}

variable "enable_monitoring" {
  description = "Enable monitoring and observability"
  type        = bool
  default     = true
}

variable "enable_backup" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Backup retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}
`;

    await fs.writeFile(
      path.join(terraformPath, 'variables.tf'),
      variables
    );

    // outputs.tf
    const outputs = `output "vpc_id" {
  description = "ID of the VPC"
  value       = module.network.vpc_id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.network.private_subnet_ids
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.network.public_subnet_ids
}

output "kubernetes_cluster_endpoint" {
  description = "Endpoint for Kubernetes cluster"
  value       = module.kubernetes.cluster_endpoint
  sensitive   = true
}

output "database_endpoint" {
  description = "Database connection endpoint"
  value       = module.database.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis connection endpoint"
  value       = module.cache.endpoint
  sensitive   = true
}

output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = module.load_balancer.dns_name
}

output "monitoring_url" {
  description = "URL for monitoring dashboard"
  value       = var.enable_monitoring ? module.monitoring[0].dashboard_url : null
}
`;

    await fs.writeFile(
      path.join(terraformPath, 'outputs.tf'),
      outputs
    );

    // main.tf
    const mainTf = `locals {
  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "terraform"
    }
  )
}

# Network Module
module "network" {
  source = "./modules/network"
  
  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr          = var.vpc_cidr
  availability_zones = var.availability_zones
  enable_nat_gateway = var.enable_nat_gateway
  single_nat_gateway = var.single_nat_gateway
  tags              = local.common_tags
}

# Security Module
module "security" {
  source = "./modules/security"
  
  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.network.vpc_id
  tags         = local.common_tags
}

# Kubernetes Module
module "kubernetes" {
  source = "./modules/kubernetes"
  
  project_name        = var.project_name
  environment         = var.environment
  kubernetes_version  = var.kubernetes_version
  vpc_id              = module.network.vpc_id
  subnet_ids          = module.network.private_subnet_ids
  node_instance_type  = var.node_instance_type
  min_node_count      = var.min_node_count
  max_node_count      = var.max_node_count
  tags                = local.common_tags
}

# Database Module
module "database" {
  source = "./modules/database"
  
  project_name         = var.project_name
  environment          = var.environment
  vpc_id               = module.network.vpc_id
  subnet_ids           = module.network.private_subnet_ids
  instance_class       = var.database_instance_class
  allocated_storage    = var.database_allocated_storage
  multi_az             = var.database_multi_az
  backup_retention_days = var.backup_retention_days
  security_group_id    = module.security.database_security_group_id
  tags                 = local.common_tags
}

# Cache Module (Redis)
module "cache" {
  source = "./modules/cache"
  
  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.network.vpc_id
  subnet_ids        = module.network.private_subnet_ids
  security_group_id = module.security.cache_security_group_id
  tags              = local.common_tags
}

# Load Balancer Module
module "load_balancer" {
  source = "./modules/load_balancer"
  
  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.network.vpc_id
  subnet_ids        = module.network.public_subnet_ids
  security_group_id = module.security.load_balancer_security_group_id
  tags              = local.common_tags
}

# Storage Module
module "storage" {
  source = "./modules/storage"
  
  project_name = var.project_name
  environment  = var.environment
  enable_backup = var.enable_backup
  tags         = local.common_tags
}

# Monitoring Module
module "monitoring" {
  count  = var.enable_monitoring ? 1 : 0
  source = "./modules/monitoring"
  
  project_name           = var.project_name
  environment            = var.environment
  vpc_id                 = module.network.vpc_id
  kubernetes_cluster_id  = module.kubernetes.cluster_id
  database_instance_id   = module.database.instance_id
  tags                   = local.common_tags
}
`;

    await fs.writeFile(path.join(terraformPath, 'main.tf'), mainTf);

    // Backend configuration for different environments
    const environments = ['dev', 'staging', 'prod'];
    
    for (const env of environments) {
      const envPath = path.join(terraformPath, 'environments', env);
      await fs.ensureDir(envPath);
      
      const backendConfig = `bucket         = "${env}-terraform-state"
key            = "infrastructure/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
dynamodb_table = "${env}-terraform-locks"
`;
      
      await fs.writeFile(
        path.join(envPath, 'backend.tfvars'),
        backendConfig
      );
      
      const tfvars = `project_name = "myapp"
environment = "${env}"
region = "us-east-1"

# VPC Configuration
vpc_cidr = "10.${env === 'dev' ? '0' : env === 'staging' ? '1' : '2'}.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# Kubernetes Configuration  
kubernetes_version = "1.28"
node_instance_type = "${env === 'prod' ? 't3.large' : 't3.medium'}"
min_node_count = ${env === 'prod' ? '3' : '2'}
max_node_count = ${env === 'prod' ? '20' : '10'}

# Database Configuration
database_instance_class = "${env === 'prod' ? 'db.t3.medium' : 'db.t3.micro'}"
database_allocated_storage = ${env === 'prod' ? '100' : '20'}
database_multi_az = ${env === 'prod' ? 'true' : 'false'}

# Monitoring
enable_monitoring = ${env === 'dev' ? 'false' : 'true'}

# Backup
enable_backup = true
backup_retention_days = ${env === 'prod' ? '30' : '7'}

# Tags
tags = {
  Owner       = "DevOps Team"
  CostCenter  = "Engineering"
  Environment = "${env}"
}
`;
      
      await fs.writeFile(path.join(envPath, 'terraform.tfvars'), tfvars);
    }
  }

  private async generateAWSTerraformModules(terraformPath: string): Promise<void> {
    const modulesPath = path.join(terraformPath, 'modules');
    
    // Network module for AWS
    const networkModulePath = path.join(modulesPath, 'network');
    await fs.ensureDir(networkModulePath);
    
    const networkMain = `# VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(
    var.tags,
    {
      Name = "\${var.project_name}-\${var.environment}-vpc"
    }
  )
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    var.tags,
    {
      Name = "\${var.project_name}-\${var.environment}-igw"
    }
  )
}

# Public Subnets
resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    var.tags,
    {
      Name                                           = "\${var.project_name}-\${var.environment}-public-\${var.availability_zones[count.index]}"
      "kubernetes.io/role/elb"                       = "1"
      "kubernetes.io/cluster/\${var.project_name}-\${var.environment}" = "shared"
    }
  )
}

# Private Subnets
resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + length(var.availability_zones))
  availability_zone = var.availability_zones[count.index]

  tags = merge(
    var.tags,
    {
      Name                                           = "\${var.project_name}-\${var.environment}-private-\${var.availability_zones[count.index]}"
      "kubernetes.io/role/internal-elb"              = "1"
      "kubernetes.io/cluster/\${var.project_name}-\${var.environment}" = "shared"
    }
  )
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.availability_zones)) : 0
  domain = "vpc"

  tags = merge(
    var.tags,
    {
      Name = "\${var.project_name}-\${var.environment}-nat-eip-\${count.index + 1}"
    }
  )
}

# NAT Gateways
resource "aws_nat_gateway" "main" {
  count         = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.availability_zones)) : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(
    var.tags,
    {
      Name = "\${var.project_name}-\${var.environment}-nat-\${count.index + 1}"
    }
  )

  depends_on = [aws_internet_gateway.main]
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(
    var.tags,
    {
      Name = "\${var.project_name}-\${var.environment}-public-rt"
    }
  )
}

# Private Route Tables
resource "aws_route_table" "private" {
  count  = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.availability_zones)) : 0
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = var.single_nat_gateway ? aws_nat_gateway.main[0].id : aws_nat_gateway.main[count.index].id
  }

  tags = merge(
    var.tags,
    {
      Name = "\${var.project_name}-\${var.environment}-private-rt-\${count.index + 1}"
    }
  )
}

# Route Table Associations - Public
resource "aws_route_table_association" "public" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Route Table Associations - Private
resource "aws_route_table_association" "private" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = var.enable_nat_gateway ? (var.single_nat_gateway ? aws_route_table.private[0].id : aws_route_table.private[count.index].id) : aws_route_table.public.id
}

# VPC Endpoints
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.\${data.aws_region.current.name}.s3"

  tags = merge(
    var.tags,
    {
      Name = "\${var.project_name}-\${var.environment}-s3-endpoint"
    }
  )
}

data "aws_region" "current" {}
`;

    await fs.writeFile(
      path.join(networkModulePath, 'main.tf'),
      networkMain
    );

    // Network module variables
    const networkVars = `variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use single NAT Gateway"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags for resources"
  type        = map(string)
  default     = {}
}
`;

    await fs.writeFile(
      path.join(networkModulePath, 'variables.tf'),
      networkVars
    );

    // Network module outputs
    const networkOutputs = `output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "nat_gateway_ids" {
  value = aws_nat_gateway.main[*].id
}
`;

    await fs.writeFile(
      path.join(networkModulePath, 'outputs.tf'),
      networkOutputs
    );

    // EKS module
    const eksModulePath = path.join(modulesPath, 'kubernetes');
    await fs.ensureDir(eksModulePath);

    const eksMain = `# EKS Cluster
resource "aws_eks_cluster" "main" {
  name     = "\${var.project_name}-\${var.environment}"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs    = ["0.0.0.0/0"]
  }

  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"]
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
    aws_iam_role_policy_attachment.eks_vpc_resource_controller,
  ]

  tags = var.tags
}

# KMS Key for EKS encryption
resource "aws_kms_key" "eks" {
  description             = "EKS Secret Encryption Key"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = var.tags
}

# IAM Role for EKS Cluster
resource "aws_iam_role" "eks_cluster" {
  name = "\${var.project_name}-\${var.environment}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

# Attach required policies to EKS cluster role
resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}

resource "aws_iam_role_policy_attachment" "eks_vpc_resource_controller" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.eks_cluster.name
}

# EKS Node Group
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "\${var.project_name}-\${var.environment}-node-group"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = var.subnet_ids

  scaling_config {
    desired_size = var.min_node_count
    max_size     = var.max_node_count
    min_size     = var.min_node_count
  }

  update_config {
    max_unavailable = 1
  }

  instance_types = [var.node_instance_type]

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.eks_container_registry_ro,
  ]

  tags = var.tags
}

# IAM Role for EKS Nodes
resource "aws_iam_role" "eks_nodes" {
  name = "\${var.project_name}-\${var.environment}-eks-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

# Attach required policies to node group role
resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_nodes.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_nodes.name
}

resource "aws_iam_role_policy_attachment" "eks_container_registry_ro" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_nodes.name
}

# OIDC Provider for EKS
data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = var.tags
}
`;

    await fs.writeFile(path.join(eksModulePath, 'main.tf'), eksMain);
  }

  private async generateGCPTerraformModules(terraformPath: string): Promise<void> {
    // GCP specific modules would go here
    // This is a placeholder for GCP-specific infrastructure
  }

  private async generateAzureTerraformModules(terraformPath: string): Promise<void> {
    // Azure specific modules would go here
    // This is a placeholder for Azure-specific infrastructure
  }

  private async generateCommonTerraformModules(terraformPath: string): Promise<void> {
    const modulesPath = path.join(terraformPath, 'modules');

    // Database module (RDS)
    const dbModulePath = path.join(modulesPath, 'database');
    await fs.ensureDir(dbModulePath);

    const dbMain = `# RDS PostgreSQL Instance
resource "aws_db_instance" "main" {
  identifier     = "\${var.project_name}-\${var.environment}-db"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.instance_class
  
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2
  storage_encrypted     = true
  storage_type          = "gp3"
  
  db_name  = replace(var.project_name, "-", "_")
  username = "dbadmin"
  password = random_password.db_password.result
  
  vpc_security_group_ids = [var.security_group_id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  
  backup_retention_period = var.backup_retention_days
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  multi_az               = var.multi_az
  deletion_protection    = var.environment == "prod" ? true : false
  skip_final_snapshot    = var.environment == "prod" ? false : true
  final_snapshot_identifier = var.environment == "prod" ? "\${var.project_name}-\${var.environment}-final-snapshot-\${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  performance_insights_enabled = var.environment == "prod" ? true : false
  performance_insights_retention_period = var.environment == "prod" ? 7 : 0
  
  tags = var.tags
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "\${var.project_name}-\${var.environment}-db-subnet-group"
  subnet_ids = var.subnet_ids
  
  tags = merge(
    var.tags,
    {
      Name = "\${var.project_name}-\${var.environment}-db-subnet-group"
    }
  )
}

# Random password for DB
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Store password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name = "\${var.project_name}-\${var.environment}-db-password"
  
  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.db_password.result
    engine   = "postgres"
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
  })
}
`;

    await fs.writeFile(path.join(dbModulePath, 'main.tf'), dbMain);

    // Cache module (ElastiCache Redis)
    const cacheModulePath = path.join(modulesPath, 'cache');
    await fs.ensureDir(cacheModulePath);

    const cacheMain = `# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "\${var.project_name}-\${var.environment}-redis"
  replication_group_description = "Redis cluster for \${var.project_name} \${var.environment}"
  
  engine               = "redis"
  engine_version       = "7.0"
  node_type           = var.node_type
  number_cache_clusters = var.environment == "prod" ? 2 : 1
  port                = 6379
  
  subnet_group_name = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.security_group_id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                = random_password.redis_auth.result
  
  automatic_failover_enabled = var.environment == "prod" ? true : false
  multi_az_enabled          = var.environment == "prod" ? true : false
  
  snapshot_retention_limit = var.environment == "prod" ? 5 : 1
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "sun:05:00-sun:06:00"
  
  notification_topic_arn = var.sns_topic_arn
  
  tags = var.tags
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "\${var.project_name}-\${var.environment}-redis-subnet-group"
  subnet_ids = var.subnet_ids
  
  tags = var.tags
}

# Random auth token for Redis
resource "random_password" "redis_auth" {
  length  = 32
  special = false  # Redis AUTH doesn't support special characters
}

# Store auth token in Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth" {
  name = "\${var.project_name}-\${var.environment}-redis-auth"
  
  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id = aws_secretsmanager_secret.redis_auth.id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth.result
    endpoint   = aws_elasticache_replication_group.main.configuration_endpoint_address
    port       = aws_elasticache_replication_group.main.port
  })
}
`;

    await fs.writeFile(path.join(cacheModulePath, 'main.tf'), cacheMain);
  }

  private async generateKubernetesManifests(): Promise<void> {
    const k8sBasePath = path.join(this.projectPath, 'k8s', 'base');
    
    // Namespace
    const namespace = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'myapp',
        labels: {
          'app.kubernetes.io/name': 'myapp',
          'app.kubernetes.io/part-of': 'myapp-platform',
        },
      },
    };
    
    await fs.writeFile(
      path.join(k8sBasePath, 'namespace.yaml'),
      yaml.dump(namespace)
    );

    // Deployment
    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'api',
        namespace: 'myapp',
        labels: {
          'app.kubernetes.io/name': 'api',
          'app.kubernetes.io/component': 'backend',
          'app.kubernetes.io/part-of': 'myapp-platform',
        },
      },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: {
            'app.kubernetes.io/name': 'api',
            'app.kubernetes.io/component': 'backend',
          },
        },
        template: {
          metadata: {
            labels: {
              'app.kubernetes.io/name': 'api',
              'app.kubernetes.io/component': 'backend',
              'app.kubernetes.io/part-of': 'myapp-platform',
            },
          },
          spec: {
            serviceAccountName: 'api',
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 1001,
              fsGroup: 1001,
            },
            containers: [
              {
                name: 'api',
                image: 'myapp/api:latest',
                imagePullPolicy: 'Always',
                ports: [
                  {
                    name: 'http',
                    containerPort: 3000,
                    protocol: 'TCP',
                  },
                ],
                env: [
                  {
                    name: 'NODE_ENV',
                    value: 'production',
                  },
                  {
                    name: 'PORT',
                    value: '3000',
                  },
                  {
                    name: 'DATABASE_URL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'api-secrets',
                        key: 'database-url',
                      },
                    },
                  },
                  {
                    name: 'REDIS_URL',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'api-secrets',
                        key: 'redis-url',
                      },
                    },
                  },
                ],
                resources: {
                  requests: {
                    cpu: '100m',
                    memory: '256Mi',
                  },
                  limits: {
                    cpu: '500m',
                    memory: '512Mi',
                  },
                },
                livenessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 'http',
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                },
                readinessProbe: {
                  httpGet: {
                    path: '/health/ready',
                    port: 'http',
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                },
                securityContext: {
                  allowPrivilegeEscalation: false,
                  capabilities: {
                    drop: ['ALL'],
                  },
                  readOnlyRootFilesystem: true,
                },
                volumeMounts: [
                  {
                    name: 'tmp',
                    mountPath: '/tmp',
                  },
                ],
              },
            ],
            volumes: [
              {
                name: 'tmp',
                emptyDir: {},
              },
            ],
            affinity: {
              podAntiAffinity: {
                preferredDuringSchedulingIgnoredDuringExecution: [
                  {
                    weight: 100,
                    podAffinityTerm: {
                      labelSelector: {
                        matchExpressions: [
                          {
                            key: 'app.kubernetes.io/name',
                            operator: 'In',
                            values: ['api'],
                          },
                        ],
                      },
                      topologyKey: 'kubernetes.io/hostname',
                    },
                  },
                ],
              },
            },
          },
        },
      },
    };

    await fs.writeFile(
      path.join(k8sBasePath, 'deployment.yaml'),
      yaml.dump(deployment)
    );

    // Service
    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'api',
        namespace: 'myapp',
        labels: {
          'app.kubernetes.io/name': 'api',
          'app.kubernetes.io/component': 'backend',
          'app.kubernetes.io/part-of': 'myapp-platform',
        },
      },
      spec: {
        type: 'ClusterIP',
        ports: [
          {
            port: 80,
            targetPort: 'http',
            protocol: 'TCP',
            name: 'http',
          },
        ],
        selector: {
          'app.kubernetes.io/name': 'api',
          'app.kubernetes.io/component': 'backend',
        },
      },
    };

    await fs.writeFile(
      path.join(k8sBasePath, 'service.yaml'),
      yaml.dump(service)
    );

    // ServiceAccount
    const serviceAccount = {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name: 'api',
        namespace: 'myapp',
        labels: {
          'app.kubernetes.io/name': 'api',
          'app.kubernetes.io/component': 'backend',
          'app.kubernetes.io/part-of': 'myapp-platform',
        },
      },
    };

    await fs.writeFile(
      path.join(k8sBasePath, 'serviceaccount.yaml'),
      yaml.dump(serviceAccount)
    );

    // ConfigMap
    const configMap = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'api-config',
        namespace: 'myapp',
      },
      data: {
        'app.conf': `# Application Configuration
log_level=info
max_connections=100
timeout=30s
`,
      },
    };

    await fs.writeFile(
      path.join(k8sBasePath, 'configmap.yaml'),
      yaml.dump(configMap)
    );

    // HorizontalPodAutoscaler
    const hpa = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: 'api',
        namespace: 'myapp',
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'api',
        },
        minReplicas: 3,
        maxReplicas: 10,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: 70,
              },
            },
          },
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              target: {
                type: 'Utilization',
                averageUtilization: 80,
              },
            },
          },
        ],
      },
    };

    await fs.writeFile(
      path.join(k8sBasePath, 'hpa.yaml'),
      yaml.dump(hpa)
    );

    // NetworkPolicy
    const networkPolicy = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'api-network-policy',
        namespace: 'myapp',
      },
      spec: {
        podSelector: {
          matchLabels: {
            'app.kubernetes.io/name': 'api',
          },
        },
        policyTypes: ['Ingress', 'Egress'],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: {
                    name: 'myapp',
                  },
                },
              },
              {
                namespaceSelector: {
                  matchLabels: {
                    name: 'ingress-nginx',
                  },
                },
              },
            ],
            ports: [
              {
                protocol: 'TCP',
                port: 3000,
              },
            ],
          },
        ],
        egress: [
          {
            to: [
              {
                namespaceSelector: {},
              },
            ],
            ports: [
              {
                protocol: 'TCP',
                port: 5432,  // PostgreSQL
              },
              {
                protocol: 'TCP',
                port: 6379,  // Redis
              },
              {
                protocol: 'TCP',
                port: 443,   // HTTPS
              },
              {
                protocol: 'TCP',
                port: 53,    // DNS
              },
              {
                protocol: 'UDP',
                port: 53,    // DNS
              },
            ],
          },
        ],
      },
    };

    await fs.writeFile(
      path.join(k8sBasePath, 'networkpolicy.yaml'),
      yaml.dump(networkPolicy)
    );

    // Kustomization
    const kustomization = {
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      namespace: 'myapp',
      resources: [
        'namespace.yaml',
        'serviceaccount.yaml',
        'configmap.yaml',
        'deployment.yaml',
        'service.yaml',
        'hpa.yaml',
        'networkpolicy.yaml',
      ],
      commonLabels: {
        'app.kubernetes.io/managed-by': 'kustomize',
      },
    };

    await fs.writeFile(
      path.join(k8sBasePath, 'kustomization.yaml'),
      yaml.dump(kustomization)
    );

    // Environment-specific overlays
    const environments = ['development', 'staging', 'production'];
    
    for (const env of environments) {
      const overlayPath = path.join(this.projectPath, 'k8s', 'overlays', env);
      
      const overlayKustomization = {
        apiVersion: 'kustomize.config.k8s.io/v1beta1',
        kind: 'Kustomization',
        namespace: `myapp-${env}`,
        namePrefix: `${env}-`,
        commonLabels: {
          environment: env,
        },
        resources: [
          '../../base',
        ],
        patchesStrategicMerge: [
          'deployment-patch.yaml',
        ],
        configMapGenerator: [
          {
            name: 'env-config',
            literals: [
              `ENVIRONMENT=${env}`,
              `LOG_LEVEL=${env === 'production' ? 'warn' : 'debug'}`,
            ],
          },
        ],
        secretGenerator: [
          {
            name: 'api-secrets',
            envs: [
              'secrets.env',
            ],
          },
        ],
        images: [
          {
            name: 'myapp/api',
            newTag: env === 'production' ? 'stable' : 'latest',
          },
        ],
        replicas: [
          {
            name: 'api',
            count: env === 'production' ? 5 : env === 'staging' ? 3 : 1,
          },
        ],
      };

      await fs.writeFile(
        path.join(overlayPath, 'kustomization.yaml'),
        yaml.dump(overlayKustomization)
      );

      // Deployment patch for environment
      const deploymentPatch = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'api',
        },
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: 'api',
                  resources: {
                    requests: {
                      cpu: env === 'production' ? '500m' : '100m',
                      memory: env === 'production' ? '1Gi' : '256Mi',
                    },
                    limits: {
                      cpu: env === 'production' ? '2000m' : '500m',
                      memory: env === 'production' ? '2Gi' : '512Mi',
                    },
                  },
                },
              ],
            },
          },
        },
      };

      await fs.writeFile(
        path.join(overlayPath, 'deployment-patch.yaml'),
        yaml.dump(deploymentPatch)
      );

      // Secrets template
      const secretsTemplate = `# Database connection string
DATABASE_URL=postgresql://user:password@db-${env}.example.com:5432/myapp_${env}

# Redis connection string  
REDIS_URL=redis://:password@redis-${env}.example.com:6379/0

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-for-${env}

# API Keys
API_KEY=your-api-key-for-${env}
`;

      await fs.writeFile(
        path.join(overlayPath, 'secrets.env.example'),
        secretsTemplate
      );
    }
  }

  private async generateHelmCharts(): Promise<void> {
    const helmPath = path.join(this.projectPath, 'helm', 'charts', 'myapp');
    await fs.ensureDir(path.join(helmPath, 'templates'));

    // Chart.yaml
    const chart = {
      apiVersion: 'v2',
      name: 'myapp',
      description: 'A Helm chart for MyApp platform',
      type: 'application',
      version: '0.1.0',
      appVersion: '1.0.0',
      keywords: [
        'myapp',
        'kubernetes',
        'helm',
      ],
      maintainers: [
        {
          name: 'DevOps Team',
          email: 'devops@mycompany.com',
        },
      ],
      dependencies: [
        {
          name: 'postgresql',
          version: '12.x.x',
          repository: 'https://charts.bitnami.com/bitnami',
          condition: 'postgresql.enabled',
        },
        {
          name: 'redis',
          version: '17.x.x',
          repository: 'https://charts.bitnami.com/bitnami',
          condition: 'redis.enabled',
        },
      ],
    };

    await fs.writeFile(
      path.join(helmPath, 'Chart.yaml'),
      yaml.dump(chart)
    );

    // values.yaml
    const values = `# Default values for myapp.
# This is a YAML-formatted file.
# Declare variables to be passed into your templates.

replicaCount: 3

image:
  repository: myapp/api
  pullPolicy: IfNotPresent
  tag: "latest"

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

podAnnotations: {}

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1001
  fsGroup: 1001

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: true

service:
  type: ClusterIP
  port: 80
  targetPort: 3000

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
  hosts:
    - host: api.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: api-tls
      hosts:
        - api.example.com

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

nodeSelector: {}

tolerations: []

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app.kubernetes.io/name
            operator: In
            values:
            - myapp
        topologyKey: kubernetes.io/hostname

# Application configuration
config:
  nodeEnv: production
  port: 3000
  logLevel: info

# Secrets - these should be provided via --set or values file
secrets:
  databaseUrl: ""
  redisUrl: ""
  jwtSecret: ""
  apiKey: ""

# PostgreSQL subchart configuration
postgresql:
  enabled: true
  auth:
    database: myapp
    username: myapp
    password: changeme
  primary:
    persistence:
      enabled: true
      size: 10Gi

# Redis subchart configuration
redis:
  enabled: true
  auth:
    enabled: true
    password: changeme
  master:
    persistence:
      enabled: true
      size: 8Gi

# Monitoring
metrics:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s

# Network policies
networkPolicy:
  enabled: true
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: myapp
      - namespaceSelector:
          matchLabels:
            name: ingress-nginx
      ports:
      - protocol: TCP
        port: 3000
`;

    await fs.writeFile(
      path.join(helmPath, 'values.yaml'),
      values
    );

    // .helmignore
    const helmignore = `# Patterns to ignore when building packages.
# This supports shell glob matching, relative path matching, and
# negation (prefixed with !). Only one pattern per line.
.DS_Store
# Common VCS dirs
.git/
.gitignore
.bzr/
.bzrignore
.hg/
.hgignore
.svn/
# Common backup files
*.swp
*.bak
*.tmp
*.orig
*~
# Various IDEs
.project
.idea/
*.tmproj
.vscode/
`;

    await fs.writeFile(path.join(helmPath, '.helmignore'), helmignore);

    // Templates
    const templatesPath = path.join(helmPath, 'templates');

    // _helpers.tpl
    const helpers = `{{/*
Expand the name of the chart.
*/}}
{{- define "myapp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "myapp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "myapp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "myapp.labels" -}}
helm.sh/chart: {{ include "myapp.chart" . }}
{{ include "myapp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "myapp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "myapp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
`;

    await fs.writeFile(path.join(templatesPath, '_helpers.tpl'), helpers);

    // deployment.yaml
    const deploymentTemplate = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
      {{- with .Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
      {{- end }}
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "myapp.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
        - name: {{ .Chart.Name }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.config.port }}
              protocol: TCP
          env:
            - name: NODE_ENV
              value: {{ .Values.config.nodeEnv | quote }}
            - name: PORT
              value: {{ .Values.config.port | quote }}
            - name: LOG_LEVEL
              value: {{ .Values.config.logLevel | quote }}
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "myapp.fullname" . }}
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "myapp.fullname" . }}
                  key: redis-url
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: {{ include "myapp.fullname" . }}
                  key: jwt-secret
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            - name: config
              mountPath: /app/config
              readOnly: true
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: config
          configMap:
            name: {{ include "myapp.fullname" . }}
        - name: tmp
          emptyDir: {}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
`;

    await fs.writeFile(
      path.join(templatesPath, 'deployment.yaml'),
      deploymentTemplate
    );
  }

  private async generateObservabilityStack(): Promise<void> {
    const observabilityPath = path.join(this.projectPath, 'infrastructure', 'observability');
    await fs.ensureDir(observabilityPath);

    // Prometheus configuration
    const prometheusConfig = {
      global: {
        scrape_interval: '30s',
        evaluation_interval: '30s',
      },
      alerting: {
        alertmanagers: [
          {
            static_configs: [
              {
                targets: ['alertmanager:9093'],
              },
            ],
          },
        ],
      },
      rule_files: [
        'alerts/*.yml',
      ],
      scrape_configs: [
        {
          job_name: 'prometheus',
          static_configs: [
            {
              targets: ['localhost:9090'],
            },
          ],
        },
        {
          job_name: 'kubernetes-apiservers',
          kubernetes_sd_configs: [
            {
              role: 'endpoints',
            },
          ],
          scheme: 'https',
          tls_config: {
            ca_file: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
          },
          bearer_token_file: '/var/run/secrets/kubernetes.io/serviceaccount/token',
          relabel_configs: [
            {
              source_labels: ['__meta_kubernetes_namespace', '__meta_kubernetes_service_name', '__meta_kubernetes_endpoint_port_name'],
              action: 'keep',
              regex: 'default;kubernetes;https',
            },
          ],
        },
        {
          job_name: 'kubernetes-nodes',
          kubernetes_sd_configs: [
            {
              role: 'node',
            },
          ],
          scheme: 'https',
          tls_config: {
            ca_file: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
          },
          bearer_token_file: '/var/run/secrets/kubernetes.io/serviceaccount/token',
          relabel_configs: [
            {
              action: 'labelmap',
              regex: '__meta_kubernetes_node_label_(.+)',
            },
          ],
        },
        {
          job_name: 'kubernetes-pods',
          kubernetes_sd_configs: [
            {
              role: 'pod',
            },
          ],
          relabel_configs: [
            {
              source_labels: ['__meta_kubernetes_pod_annotation_prometheus_io_scrape'],
              action: 'keep',
              regex: true,
            },
            {
              source_labels: ['__meta_kubernetes_pod_annotation_prometheus_io_path'],
              action: 'replace',
              target_label: '__metrics_path__',
              regex: '(.+)',
            },
            {
              source_labels: ['__address__', '__meta_kubernetes_pod_annotation_prometheus_io_port'],
              action: 'replace',
              regex: '([^:]+)(?::\\d+)?;(\\d+)',
              replacement: '$1:$2',
              target_label: '__address__',
            },
            {
              action: 'labelmap',
              regex: '__meta_kubernetes_pod_label_(.+)',
            },
            {
              source_labels: ['__meta_kubernetes_namespace'],
              action: 'replace',
              target_label: 'kubernetes_namespace',
            },
            {
              source_labels: ['__meta_kubernetes_pod_name'],
              action: 'replace',
              target_label: 'kubernetes_pod_name',
            },
          ],
        },
      ],
    };

    await fs.writeFile(
      path.join(observabilityPath, 'prometheus.yaml'),
      yaml.dump(prometheusConfig)
    );

    // Grafana dashboard
    const grafanaDashboard = {
      dashboard: {
        id: null,
        uid: 'myapp-overview',
        title: 'MyApp Overview',
        tags: ['myapp', 'kubernetes'],
        timezone: 'browser',
        panels: [
          {
            gridPos: { h: 8, w: 12, x: 0, y: 0 },
            id: 1,
            title: 'Request Rate',
            type: 'graph',
            targets: [
              {
                expr: 'sum(rate(http_requests_total[5m])) by (status)',
                refId: 'A',
              },
            ],
          },
          {
            gridPos: { h: 8, w: 12, x: 12, y: 0 },
            id: 2,
            title: 'Response Time',
            type: 'graph',
            targets: [
              {
                expr: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
                refId: 'A',
              },
            ],
          },
          {
            gridPos: { h: 8, w: 12, x: 0, y: 8 },
            id: 3,
            title: 'CPU Usage',
            type: 'graph',
            targets: [
              {
                expr: 'sum(rate(container_cpu_usage_seconds_total{pod=~"myapp-.*"}[5m])) by (pod)',
                refId: 'A',
              },
            ],
          },
          {
            gridPos: { h: 8, w: 12, x: 12, y: 8 },
            id: 4,
            title: 'Memory Usage',
            type: 'graph',
            targets: [
              {
                expr: 'sum(container_memory_working_set_bytes{pod=~"myapp-.*"}) by (pod)',
                refId: 'A',
              },
            ],
          },
        ],
        schemaVersion: 16,
        version: 0,
      },
    };

    await fs.writeJson(
      path.join(observabilityPath, 'grafana-dashboard.json'),
      grafanaDashboard,
      { spaces: 2 }
    );

    // Jaeger configuration
    const jaegerConfig = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'jaeger-config',
        namespace: 'observability',
      },
      data: {
        'collector.yaml': `receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024
  memory_limiter:
    limit_mib: 512
    spike_limit_mib: 128
    check_interval: 5s

exporters:
  jaeger:
    endpoint: jaeger-collector:14250
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [jaeger]
`,
      },
    };

    await fs.writeFile(
      path.join(observabilityPath, 'jaeger-config.yaml'),
      yaml.dump(jaegerConfig)
    );

    // Alerting rules
    const alertRules = {
      groups: [
        {
          name: 'myapp.rules',
          interval: '30s',
          rules: [
            {
              alert: 'HighRequestLatency',
              expr: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 1',
              for: '10m',
              labels: {
                severity: 'warning',
              },
              annotations: {
                summary: 'High request latency on {{ $labels.instance }}',
                description: '95th percentile latency is above 1s (current value: {{ $value }}s)',
              },
            },
            {
              alert: 'HighErrorRate',
              expr: 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05',
              for: '5m',
              labels: {
                severity: 'critical',
              },
              annotations: {
                summary: 'High error rate',
                description: 'Error rate is above 5% (current value: {{ $value | humanizePercentage }})',
              },
            },
            {
              alert: 'PodCPUUsage',
              expr: 'sum(rate(container_cpu_usage_seconds_total{pod=~"myapp-.*"}[5m])) by (pod) > 0.8',
              for: '5m',
              labels: {
                severity: 'warning',
              },
              annotations: {
                summary: 'High CPU usage for pod {{ $labels.pod }}',
                description: 'Pod CPU usage is above 80% (current value: {{ $value | humanizePercentage }})',
              },
            },
            {
              alert: 'PodMemoryUsage',
              expr: 'sum(container_memory_working_set_bytes{pod=~"myapp-.*"}) by (pod) / sum(container_spec_memory_limit_bytes{pod=~"myapp-.*"}) by (pod) > 0.8',
              for: '5m',
              labels: {
                severity: 'warning',
              },
              annotations: {
                summary: 'High memory usage for pod {{ $labels.pod }}',
                description: 'Pod memory usage is above 80% (current value: {{ $value | humanizePercentage }})',
              },
            },
            {
              alert: 'PodRestartingTooOften',
              expr: 'rate(kube_pod_container_status_restarts_total{pod=~"myapp-.*"}[15m]) > 0',
              for: '5m',
              labels: {
                severity: 'critical',
              },
              annotations: {
                summary: 'Pod {{ $labels.pod }} is restarting too often',
                description: 'Pod has restarted {{ $value }} times in the last 15 minutes',
              },
            },
          ],
        },
      ],
    };

    await fs.writeFile(
      path.join(observabilityPath, 'alerts.yaml'),
      yaml.dump(alertRules)
    );

    // Fluent Bit configuration for log collection
    const fluentBitConfig = `[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info
    Parsers_File  parsers.conf

[INPUT]
    Name              tail
    Path              /var/log/containers/*myapp*.log
    Parser            docker
    Tag               kube.*
    Refresh_Interval  5
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   On

[FILTER]
    Name                kubernetes
    Match               kube.*
    Kube_URL            https://kubernetes.default.svc:443
    Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
    Kube_Tag_Prefix     kube.var.log.containers.
    Merge_Log           On
    Keep_Log            Off
    K8S-Logging.Parser  On
    K8S-Logging.Exclude On

[OUTPUT]
    Name                es
    Match               *
    Host                elasticsearch
    Port                9200
    Logstash_Format     On
    Logstash_Prefix     myapp
    Retry_Limit         False
    Type                _doc
`;

    await fs.writeFile(
      path.join(observabilityPath, 'fluent-bit.conf'),
      fluentBitConfig
    );
  }

  private async generateDockerCompose(): Promise<void> {
    const dockerPath = path.join(this.projectPath, 'docker');
    await fs.ensureDir(dockerPath);

    const composeOverride = {
      version: '3.8',
      services: {
        prometheus: {
          image: 'prom/prometheus:latest',
          container_name: 'prometheus',
          ports: ['9090:9090'],
          volumes: [
            './infrastructure/observability/prometheus.yaml:/etc/prometheus/prometheus.yml',
            'prometheus_data:/prometheus',
          ],
          command: [
            '--config.file=/etc/prometheus/prometheus.yml',
            '--storage.tsdb.path=/prometheus',
            '--web.console.libraries=/usr/share/prometheus/console_libraries',
            '--web.console.templates=/usr/share/prometheus/consoles',
          ],
          networks: ['monitoring'],
        },
        grafana: {
          image: 'grafana/grafana:latest',
          container_name: 'grafana',
          ports: ['3001:3000'],
          environment: {
            GF_SECURITY_ADMIN_PASSWORD: 'admin',
            GF_USERS_ALLOW_SIGN_UP: 'false',
          },
          volumes: [
            'grafana_data:/var/lib/grafana',
          ],
          networks: ['monitoring'],
        },
        jaeger: {
          image: 'jaegertracing/all-in-one:latest',
          container_name: 'jaeger',
          ports: [
            '5775:5775/udp',
            '6831:6831/udp',
            '6832:6832/udp',
            '5778:5778',
            '16686:16686',
            '14268:14268',
            '14250:14250',
            '9411:9411',
          ],
          environment: {
            COLLECTOR_ZIPKIN_HOST_PORT: '9411',
          },
          networks: ['monitoring'],
        },
      },
      networks: {
        monitoring: {
          driver: 'bridge',
        },
      },
      volumes: {
        prometheus_data: {},
        grafana_data: {},
      },
    };

    await fs.writeFile(
      path.join(this.projectPath, 'docker-compose.override.yml'),
      yaml.dump(composeOverride)
    );
  }

  private async generateServiceMeshConfig(): Promise<void> {
    const meshPath = path.join(this.projectPath, 'infrastructure', 'service-mesh');
    await fs.ensureDir(meshPath);

    // Istio VirtualService
    const virtualService = {
      apiVersion: 'networking.istio.io/v1beta1',
      kind: 'VirtualService',
      metadata: {
        name: 'myapp',
        namespace: 'myapp',
      },
      spec: {
        hosts: [
          'api.example.com',
        ],
        gateways: [
          'myapp-gateway',
        ],
        http: [
          {
            match: [
              {
                uri: {
                  prefix: '/api/v1',
                },
              },
            ],
            route: [
              {
                destination: {
                  host: 'api',
                  port: {
                    number: 80,
                  },
                },
                weight: 100,
              },
            ],
            timeout: '30s',
            retries: {
              attempts: 3,
              perTryTimeout: '10s',
              retryOn: 'gateway-error,connect-failure,refused-stream',
            },
          },
        ],
      },
    };

    await fs.writeFile(
      path.join(meshPath, 'virtual-service.yaml'),
      yaml.dump(virtualService)
    );

    // Istio Gateway
    const gateway = {
      apiVersion: 'networking.istio.io/v1beta1',
      kind: 'Gateway',
      metadata: {
        name: 'myapp-gateway',
        namespace: 'myapp',
      },
      spec: {
        selector: {
          istio: 'ingressgateway',
        },
        servers: [
          {
            port: {
              number: 443,
              name: 'https',
              protocol: 'HTTPS',
            },
            tls: {
              mode: 'SIMPLE',
              credentialName: 'myapp-tls',
            },
            hosts: [
              'api.example.com',
            ],
          },
          {
            port: {
              number: 80,
              name: 'http',
              protocol: 'HTTP',
            },
            hosts: [
              'api.example.com',
            ],
          },
        ],
      },
    };

    await fs.writeFile(
      path.join(meshPath, 'gateway.yaml'),
      yaml.dump(gateway)
    );

    // Istio DestinationRule
    const destinationRule = {
      apiVersion: 'networking.istio.io/v1beta1',
      kind: 'DestinationRule',
      metadata: {
        name: 'api',
        namespace: 'myapp',
      },
      spec: {
        host: 'api',
        trafficPolicy: {
          connectionPool: {
            tcp: {
              maxConnections: 100,
            },
            http: {
              http1MaxPendingRequests: 100,
              http2MaxRequests: 100,
              maxRequestsPerConnection: 2,
            },
          },
          loadBalancer: {
            simple: 'ROUND_ROBIN',
          },
          outlierDetection: {
            consecutiveErrors: 5,
            interval: '30s',
            baseEjectionTime: '30s',
            maxEjectionPercent: 50,
            minHealthPercent: 50,
          },
        },
        subsets: [
          {
            name: 'v1',
            labels: {
              version: 'v1',
            },
          },
        ],
      },
    };

    await fs.writeFile(
      path.join(meshPath, 'destination-rule.yaml'),
      yaml.dump(destinationRule)
    );

    // PeerAuthentication for mTLS
    const peerAuth = {
      apiVersion: 'security.istio.io/v1beta1',
      kind: 'PeerAuthentication',
      metadata: {
        name: 'default',
        namespace: 'myapp',
      },
      spec: {
        mtls: {
          mode: 'STRICT',
        },
      },
    };

    await fs.writeFile(
      path.join(meshPath, 'peer-authentication.yaml'),
      yaml.dump(peerAuth)
    );

    // AuthorizationPolicy
    const authPolicy = {
      apiVersion: 'security.istio.io/v1beta1',
      kind: 'AuthorizationPolicy',
      metadata: {
        name: 'api-authz',
        namespace: 'myapp',
      },
      spec: {
        selector: {
          matchLabels: {
            'app.kubernetes.io/name': 'api',
          },
        },
        action: 'ALLOW',
        rules: [
          {
            from: [
              {
                source: {
                  principals: ['cluster.local/ns/myapp/sa/*'],
                },
              },
              {
                source: {
                  namespaces: ['istio-system'],
                },
              },
            ],
            to: [
              {
                operation: {
                  methods: ['GET', 'POST', 'PUT', 'DELETE'],
                },
              },
            ],
          },
        ],
      },
    };

    await fs.writeFile(
      path.join(meshPath, 'authorization-policy.yaml'),
      yaml.dump(authPolicy)
    );
  }
}