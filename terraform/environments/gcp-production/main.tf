terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.4"
    }
  }
  
  backend "gcs" {
    bucket = "easyreno-demo-20251219144606-terraform-state"
    prefix = "warehouse-network/gcp-production"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Variables
variable "project_id" {
  description = "The GCP project ID"
  type        = string
  default     = "easyreno-demo-20251219144606"
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "nextauth_secret" {
  description = "NextAuth secret"
  type        = string
  sensitive   = true
}

# Random password generation if not provided
resource "random_password" "db_password" {
  count   = var.db_password == "" ? 1 : 0
  length  = 32
  special = true
}

resource "random_password" "nextauth_secret" {
  count   = var.nextauth_secret == "" ? 1 : 0
  length  = 64
  special = true
}

locals {
  db_password     = var.db_password != "" ? var.db_password : random_password.db_password[0].result
  nextauth_secret = var.nextauth_secret != "" ? var.nextauth_secret : random_password.nextauth_secret[0].result
}

# Enable required APIs
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "sql-component.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com"
  ])
  
  project = var.project_id
  service = each.value
  
  disable_dependent_services = false
  disable_on_destroy        = false
}

# Terraform state bucket
resource "google_storage_bucket" "terraform_state" {
  name     = "${var.project_id}-terraform-state"
  location = var.region
  
  versioning {
    enabled = true
  }
  
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }
  
  depends_on = [google_project_service.services]
}

# Cloud SQL PostgreSQL instance
resource "google_sql_database_instance" "main" {
  name             = "warehouse-network-${var.environment}"
  database_version = "POSTGRES_15"
  region          = var.region
  deletion_protection = false

  settings {
    tier = "db-f1-micro"
    
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }
    
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
    
    backup_configuration {
      enabled = true
      start_time = "02:00"
      location = var.region
      
      backup_retention_settings {
        retained_backups = 7
        retention_unit = "COUNT"
      }
    }
    
    ip_configuration {
      ipv4_enabled = true
      authorized_networks {
        name  = "all"
        value = "0.0.0.0/0"
      }
    }
    
    maintenance_window {
      day  = 7
      hour = 3
      update_track = "stable"
    }
  }
  
  depends_on = [google_project_service.services]
}

# Database
resource "google_sql_database" "warehouse_network" {
  name     = "warehouse_network"
  instance = google_sql_database_instance.main.name
}

# Database user
resource "google_sql_user" "warehouse" {
  name     = "warehouse"
  instance = google_sql_database_instance.main.name
  password = local.db_password
}

# Memory Store Redis instance
resource "google_redis_instance" "cache" {
  name           = "warehouse-network-${var.environment}"
  memory_size_gb = 1
  region         = var.region
  
  redis_version = "REDIS_7_0"
  display_name  = "Warehouse Network Cache"
  
  auth_enabled = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  
  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 3
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }
  
  depends_on = [google_project_service.services]
}

# Secret Manager secrets
resource "google_secret_manager_secret" "database_url" {
  secret_id = "warehouse-network-database-url"
  
  replication {
    auto {}
  }
  
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${google_sql_user.warehouse.name}:${local.db_password}@${google_sql_database_instance.main.public_ip_address}:5432/${google_sql_database.warehouse_network.name}?sslmode=require"
}

resource "google_secret_manager_secret" "nextauth_secret" {
  secret_id = "warehouse-network-nextauth-secret"
  
  replication {
    auto {}
  }
  
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "nextauth_secret" {
  secret      = google_secret_manager_secret.nextauth_secret.id
  secret_data = local.nextauth_secret
}

# IAM for Cloud Run service
resource "google_service_account" "cloud_run" {
  account_id   = "warehouse-network-cloud-run"
  display_name = "Warehouse Network Cloud Run Service Account"
  description  = "Service account for warehouse network Cloud Run service"
}

# Grant necessary permissions
resource "google_project_iam_member" "cloud_run_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_redis" {
  project = var.project_id
  role    = "roles/redis.editor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Run service
resource "google_cloud_run_v2_service" "warehouse_network" {
  name         = "warehouse-network-app"
  location     = var.region
  launch_stage = "GA"

  template {
    service_account = google_service_account.cloud_run.email
    
    scaling {
      min_instance_count = 1
      max_instance_count = 100
    }
    
    containers {
      image = "gcr.io/${var.project_id}/warehouse-network:latest"
      
      ports {
        container_port = 8080
        name          = "http1"
      }
      
      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      
      env {
        name  = "NEXT_TELEMETRY_DISABLED"
        value = "1"
      }
      
      env {
        name  = "PORT"
        value = "8080"
      }
      
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }
      
      env {
        name = "NEXTAUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.nextauth_secret.secret_id
            version = "latest"
          }
        }
      }
      
      env {
        name  = "NEXTAUTH_URL"
        value = "https://warehouse-network-app-${var.project_id}.${var.region}.run.app"
      }
      
      env {
        name  = "REDIS_URL"
        value = "redis://:${google_redis_instance.cache.auth_string}@${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
      }
      
      startup_probe {
        http_get {
          path = "/api/health"
          port = 8080
        }
        initial_delay_seconds = 10
        timeout_seconds      = 5
        period_seconds       = 10
        failure_threshold    = 3
      }
      
      liveness_probe {
        http_get {
          path = "/api/health"
          port = 8080
        }
        initial_delay_seconds = 30
        timeout_seconds      = 5
        period_seconds       = 30
        failure_threshold    = 3
      }
    }
  }
  
  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
  
  depends_on = [
    google_sql_database_instance.main,
    google_redis_instance.cache,
    google_project_service.services
  ]
}

# Allow unauthenticated access
resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_v2_service.warehouse_network.name
  location = google_cloud_run_v2_service.warehouse_network.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Outputs
output "service_url" {
  description = "URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.warehouse_network.uri
}

output "database_connection_name" {
  description = "Connection name for the database instance"
  value       = google_sql_database_instance.main.connection_name
}

output "database_ip" {
  description = "Public IP of the database instance"
  value       = google_sql_database_instance.main.public_ip_address
}

output "redis_host" {
  description = "Redis instance host"
  value       = google_redis_instance.cache.host
  sensitive   = true
}