#!/bin/bash
set -euo pipefail

# Claude Platform Infrastructure Setup Script
# This script initializes and deploys the infrastructure using Terraform

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
STATE_BUCKET_PREFIX="claude-platform-terraform-state"
LOCK_TABLE_NAME="claude-platform-terraform-locks"

# Functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check for required tools
    local required_tools=("terraform" "aws" "kubectl" "helm" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            print_error "$tool is not installed or not in PATH"
            exit 1
        fi
    done
    
    # Check Terraform version
    local tf_version=$(terraform version -json | jq -r '.terraform_version')
    if [[ ! "$tf_version" =~ ^1\.[5-9]\. ]]; then
        print_error "Terraform version 1.5.0 or higher is required (found: $tf_version)"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured properly"
        exit 1
    fi
    
    print_info "✓ All prerequisites satisfied"
}

setup_backend() {
    print_info "Setting up Terraform backend..."
    
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    local region=${AWS_DEFAULT_REGION:-us-east-1}
    local bucket_name="${STATE_BUCKET_PREFIX}-${account_id}"
    
    # Create S3 bucket for state
    if ! aws s3api head-bucket --bucket "$bucket_name" 2>/dev/null; then
        print_info "Creating S3 bucket: $bucket_name"
        
        aws s3api create-bucket \
            --bucket "$bucket_name" \
            --region "$region" \
            $(if [ "$region" != "us-east-1" ]; then echo "--create-bucket-configuration LocationConstraint=$region"; fi)
        
        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "$bucket_name" \
            --versioning-configuration Status=Enabled
        
        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket "$bucket_name" \
            --server-side-encryption-configuration '{
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    }
                }]
            }'
        
        # Block public access
        aws s3api put-public-access-block \
            --bucket "$bucket_name" \
            --public-access-block-configuration \
            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
        
        print_info "✓ S3 bucket created successfully"
    else
        print_info "✓ S3 bucket already exists"
    fi
    
    # Create DynamoDB table for state locking
    if ! aws dynamodb describe-table --table-name "$LOCK_TABLE_NAME" &>/dev/null; then
        print_info "Creating DynamoDB table: $LOCK_TABLE_NAME"
        
        aws dynamodb create-table \
            --table-name "$LOCK_TABLE_NAME" \
            --attribute-definitions AttributeName=LockID,AttributeType=S \
            --key-schema AttributeName=LockID,KeyType=HASH \
            --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
            --tags Key=Project,Value=claude-platform Key=ManagedBy,Value=terraform
        
        # Wait for table to be active
        aws dynamodb wait table-exists --table-name "$LOCK_TABLE_NAME"
        
        print_info "✓ DynamoDB table created successfully"
    else
        print_info "✓ DynamoDB table already exists"
    fi
    
    # Update backend configuration
    cat > "$INFRA_DIR/backend.tf" <<EOF
terraform {
  backend "s3" {
    bucket         = "$bucket_name"
    key            = "infrastructure/terraform.tfstate"
    region         = "$region"
    dynamodb_table = "$LOCK_TABLE_NAME"
    encrypt        = true
  }
}
EOF
    
    print_info "✓ Backend configuration updated"
}

initialize_terraform() {
    print_info "Initializing Terraform..."
    
    cd "$INFRA_DIR"
    
    # Initialize Terraform
    terraform init -upgrade
    
    print_info "✓ Terraform initialized successfully"
}

validate_configuration() {
    print_info "Validating Terraform configuration..."
    
    cd "$INFRA_DIR"
    
    # Validate
    terraform validate
    
    # Format check
    if ! terraform fmt -check -recursive; then
        print_warn "Terraform files need formatting. Running terraform fmt..."
        terraform fmt -recursive
    fi
    
    print_info "✓ Configuration validated successfully"
}

plan_infrastructure() {
    print_info "Planning infrastructure changes..."
    
    cd "$INFRA_DIR"
    
    # Check for tfvars file
    if [ ! -f "terraform.tfvars" ]; then
        print_warn "terraform.tfvars not found. Creating from example..."
        cp terraform.tfvars.example terraform.tfvars
        print_warn "Please review and update terraform.tfvars before applying"
        exit 1
    fi
    
    # Create plan
    terraform plan -out=tfplan
    
    print_info "✓ Infrastructure plan created"
}

apply_infrastructure() {
    print_info "Applying infrastructure changes..."
    
    cd "$INFRA_DIR"
    
    # Apply with auto-approve if CI environment
    if [ "${CI:-false}" = "true" ]; then
        terraform apply -auto-approve tfplan
    else
        terraform apply tfplan
    fi
    
    print_info "✓ Infrastructure deployed successfully"
}

configure_kubectl() {
    print_info "Configuring kubectl..."
    
    cd "$INFRA_DIR"
    
    local cluster_name=$(terraform output -raw cluster_name)
    local region=${AWS_DEFAULT_REGION:-us-east-1}
    
    # Update kubeconfig
    aws eks update-kubeconfig --name "$cluster_name" --region "$region"
    
    # Verify connection
    kubectl get nodes
    
    print_info "✓ kubectl configured successfully"
}

install_cluster_addons() {
    print_info "Installing cluster addons..."
    
    # Add Helm repositories
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo add cert-manager https://charts.jetstack.io
    helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    
    # Install metrics-server
    helm upgrade --install metrics-server metrics-server/metrics-server \
        --namespace kube-system \
        --set args='{--kubelet-insecure-tls}'
    
    # Install cert-manager
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.crds.yaml
    
    helm upgrade --install cert-manager cert-manager/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --set installCRDs=false \
        --set global.leaderElection.namespace=cert-manager
    
    # Install ingress-nginx
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.type=LoadBalancer \
        --set controller.metrics.enabled=true \
        --set controller.podAnnotations."prometheus\\.io/scrape"=true \
        --set controller.podAnnotations."prometheus\\.io/port"="10254"
    
    print_info "✓ Cluster addons installed successfully"
}

create_namespaces() {
    print_info "Creating application namespaces..."
    
    kubectl create namespace claude-platform --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace database --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace cache --dry-run=client -o yaml | kubectl apply -f -
    
    print_info "✓ Namespaces created successfully"
}

output_summary() {
    print_info "Infrastructure setup completed!"
    echo ""
    echo "=== Summary ==="
    
    cd "$INFRA_DIR"
    
    echo "Cluster Endpoint: $(terraform output -raw cluster_endpoint)"
    echo "Cluster Name: $(terraform output -raw cluster_name)"
    echo "Database Endpoint: $(terraform output -raw database_endpoint)"
    echo "Redis Endpoint: $(terraform output -raw redis_endpoint)"
    echo ""
    echo "Next steps:"
    echo "1. Review the infrastructure outputs above"
    echo "2. Configure your application secrets in AWS Secrets Manager"
    echo "3. Deploy the application using: claude-platform deploy production"
}

# Main execution
main() {
    print_info "Starting Claude Platform infrastructure setup..."
    
    check_prerequisites
    setup_backend
    initialize_terraform
    validate_configuration
    plan_infrastructure
    
    # Ask for confirmation before applying
    if [ "${CI:-false}" != "true" ]; then
        read -p "Do you want to apply the infrastructure changes? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
            print_warn "Infrastructure deployment cancelled"
            exit 0
        fi
    fi
    
    apply_infrastructure
    configure_kubectl
    install_cluster_addons
    create_namespaces
    output_summary
}

# Run main function
main "$@"