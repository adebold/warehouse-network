#!/bin/bash

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-}"
CLUSTER_NAME="${CLUSTER_NAME:-warehouse-cluster}"
REGION="${REGION:-us-central1}"
GITHUB_REPO="${GITHUB_REPO:-https://github.com/adebold/warehouse-network}"

echo -e "${GREEN}🚀 Warehouse GitOps Setup Script${NC}"
echo "================================"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    local missing=()
    
    command -v kubectl >/dev/null 2>&1 || missing+=("kubectl")
    command -v kustomize >/dev/null 2>&1 || missing+=("kustomize")
    command -v gcloud >/dev/null 2>&1 || missing+=("gcloud")
    
    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}Missing required tools: ${missing[*]}${NC}"
        echo "Please install the missing tools and try again."
        exit 1
    fi
    
    if [ -z "$PROJECT_ID" ]; then
        echo -e "${RED}GCP_PROJECT_ID environment variable is not set${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ All prerequisites met${NC}"
}

# Install ArgoCD
install_argocd() {
    echo -e "${YELLOW}Installing ArgoCD...${NC}"
    
    # Create namespace
    kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
    
    # Install ArgoCD
    kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
    
    # Wait for ArgoCD to be ready
    echo "Waiting for ArgoCD to be ready..."
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=300s
    
    echo -e "${GREEN}✓ ArgoCD installed${NC}"
}

# Configure ArgoCD
configure_argocd() {
    echo -e "${YELLOW}Configuring ArgoCD...${NC}"
    
    # Apply project configuration
    kubectl apply -f .gitops/argocd/project.yaml
    
    # Get ArgoCD password
    ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)
    echo -e "${GREEN}ArgoCD admin password: ${ARGOCD_PASSWORD}${NC}"
    echo -e "${YELLOW}Save this password securely!${NC}"
    
    # Apply app-of-apps
    kubectl apply -f .gitops/argocd/app-of-apps.yaml
    
    echo -e "${GREEN}✓ ArgoCD configured${NC}"
}

# Setup image registry
setup_registry() {
    echo -e "${YELLOW}Setting up Google Artifact Registry...${NC}"
    
    # Enable APIs
    gcloud services enable artifactregistry.googleapis.com
    
    # Create repository if not exists
    gcloud artifacts repositories create warehouse \
        --repository-format=docker \
        --location=$REGION \
        --description="Warehouse application images" \
        || echo "Repository already exists"
    
    # Configure docker auth
    gcloud auth configure-docker ${REGION}-docker.pkg.dev
    
    echo -e "${GREEN}✓ Registry configured${NC}"
}

# Update kustomization files with project ID
update_project_references() {
    echo -e "${YELLOW}Updating project references...${NC}"
    
    # Find and replace PROJECT_ID in all yaml files
    find .gitops -name "*.yaml" -type f -exec sed -i.bak "s/PROJECT_ID/${PROJECT_ID}/g" {} \;
    find .github/workflows -name "*.yml" -type f -exec sed -i.bak "s/PROJECT_ID/${PROJECT_ID}/g" {} \;
    
    # Clean up backup files
    find . -name "*.bak" -type f -delete
    
    echo -e "${GREEN}✓ Project references updated${NC}"
}

# Create namespaces
create_namespaces() {
    echo -e "${YELLOW}Creating namespaces...${NC}"
    
    kubectl apply -f .gitops/base/namespace.yaml
    kubectl create namespace warehouse-dev --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace warehouse-staging --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace warehouse-prod --dry-run=client -o yaml | kubectl apply -f -
    
    echo -e "${GREEN}✓ Namespaces created${NC}"
}

# Main execution
main() {
    check_prerequisites
    
    # Connect to cluster
    echo -e "${YELLOW}Connecting to GKE cluster...${NC}"
    gcloud container clusters get-credentials $CLUSTER_NAME --region $REGION --project $PROJECT_ID
    
    # Run setup steps
    install_argocd
    setup_registry
    update_project_references
    create_namespaces
    configure_argocd
    
    echo -e "${GREEN}🎉 GitOps setup complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Port forward to ArgoCD: kubectl port-forward svc/argocd-server -n argocd 8080:443"
    echo "2. Access ArgoCD UI: https://localhost:8080"
    echo "3. Login with username: admin"
    echo "4. Configure GitHub webhook for automatic sync"
    echo ""
    echo "To deploy an environment:"
    echo "- Dev: Push to 'develop' branch"
    echo "- Staging: Push to 'staging' branch"
    echo "- Production: Create a version tag (e.g., v1.0.0)"
}

# Run main function
main