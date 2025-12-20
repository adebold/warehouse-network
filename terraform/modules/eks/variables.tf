variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where EKS cluster will be deployed"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for EKS cluster"
  type        = list(string)
}

variable "kubernetes_version" {
  description = "Kubernetes version to use for the EKS cluster"
  type        = string
  default     = "1.28"
}

variable "endpoint_public_access" {
  description = "Whether the Amazon EKS public API server endpoint is enabled"
  type        = bool
  default     = true
}

variable "public_access_cidrs" {
  description = "List of CIDR blocks that can access the public API server endpoint"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "node_groups" {
  description = "Map of EKS node group configurations"
  type = map(object({
    instance_types       = list(string)
    capacity_type       = string
    desired_size        = number
    max_size            = number
    min_size            = number
    disk_size           = number
    bootstrap_arguments = string
  }))
  default = {
    general = {
      instance_types       = ["t3.medium"]
      capacity_type       = "ON_DEMAND"
      desired_size        = 2
      max_size            = 4
      min_size            = 1
      disk_size           = 50
      bootstrap_arguments = ""
    }
  }
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}