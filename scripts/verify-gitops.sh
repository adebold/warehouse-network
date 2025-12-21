#!/bin/bash

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}GitOps Configuration Verification${NC}"
echo "=================================="

# Check directory structure
check_directories() {
    echo -e "\n${YELLOW}Checking directory structure...${NC}"
    
    local dirs=(
        ".gitops/base"
        ".gitops/overlays/dev"
        ".gitops/overlays/staging"
        ".gitops/overlays/prod"
        ".gitops/argocd"
        ".gitops/environments"
        ".github/workflows"
        "docker/dev"
        "docker/staging"
        "docker/prod"
    )
    
    local missing=0
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ]; then
            echo -e "${GREEN}✓${NC} $dir"
        else
            echo -e "${RED}✗${NC} $dir"
            missing=$((missing + 1))
        fi
    done
    
    return $missing
}

# Check required files
check_files() {
    echo -e "\n${YELLOW}Checking required files...${NC}"
    
    local files=(
        ".gitops/base/namespace.yaml"
        ".gitops/base/deployment.yaml"
        ".gitops/base/service.yaml"
        ".gitops/base/kustomization.yaml"
        ".gitops/argocd/app-of-apps.yaml"
        ".github/workflows/gitops-dev.yml"
        ".github/workflows/gitops-staging.yml"
        ".github/workflows/gitops-prod.yml"
        "docker/dev/Dockerfile"
        "docker/staging/Dockerfile"
        "docker/prod/Dockerfile"
    )
    
    local missing=0
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            echo -e "${GREEN}✓${NC} $file"
        else
            echo -e "${RED}✗${NC} $file"
            missing=$((missing + 1))
        fi
    done
    
    return $missing
}

# Validate Kustomize builds
validate_kustomize() {
    echo -e "\n${YELLOW}Validating Kustomize builds...${NC}"
    
    if ! command -v kustomize &> /dev/null; then
        echo -e "${RED}✗ kustomize not installed${NC}"
        return 1
    fi
    
    local envs=("dev" "staging" "prod")
    local failed=0
    
    for env in "${envs[@]}"; do
        echo -n "Building $env overlay... "
        if kustomize build ".gitops/overlays/$env" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗${NC}"
            failed=$((failed + 1))
        fi
    done
    
    return $failed
}

# Check YAML syntax
check_yaml_syntax() {
    echo -e "\n${YELLOW}Checking YAML syntax...${NC}"
    
    if ! command -v yamllint &> /dev/null; then
        echo -e "${YELLOW}⚠ yamllint not installed, skipping syntax check${NC}"
        return 0
    fi
    
    local failed=0
    find .gitops -name "*.yaml" -o -name "*.yml" | while read -r file; do
        if yamllint -d relaxed "$file" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $file"
        else
            echo -e "${RED}✗${NC} $file"
            failed=$((failed + 1))
        fi
    done
    
    return $failed
}

# Main verification
main() {
    local total_errors=0
    
    # Run checks
    check_directories || total_errors=$((total_errors + $?))
    check_files || total_errors=$((total_errors + $?))
    validate_kustomize || total_errors=$((total_errors + $?))
    check_yaml_syntax || total_errors=$((total_errors + $?))
    
    # Summary
    echo -e "\n${BLUE}Summary${NC}"
    echo "======="
    
    if [ $total_errors -eq 0 ]; then
        echo -e "${GREEN}✓ All checks passed!${NC}"
        echo -e "\nYour GitOps configuration is ready for deployment."
        echo -e "Run ${YELLOW}./scripts/setup-gitops.sh${NC} to deploy to your cluster."
    else
        echo -e "${RED}✗ Found $total_errors errors${NC}"
        echo -e "\nPlease fix the errors above before proceeding."
        exit 1
    fi
}

# Run verification
main