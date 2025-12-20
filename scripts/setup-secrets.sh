#!/bin/bash
set -euo pipefail

# Script to set up GitHub secrets for GitOps

REPO_OWNER="warehouse-network"
REPO_NAME="warehouse-network"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Setting up GitHub Secrets for GitOps${NC}"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}GitHub CLI (gh) is not installed. Please install it first.${NC}"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Not authenticated with GitHub. Please run 'gh auth login' first.${NC}"
    exit 1
fi

# Function to set secret
set_secret() {
    local name=$1
    local value=$2
    local env=$3
    
    echo -e "${YELLOW}Setting secret: $name for environment: $env${NC}"
    echo "$value" | gh secret set "$name" --env "$env" --repo "$REPO_OWNER/$REPO_NAME"
}

# Set repository secrets
echo -e "${GREEN}Setting repository-wide secrets...${NC}"

# AWS Credentials
read -sp "Enter AWS_ACCESS_KEY_ID: " AWS_ACCESS_KEY_ID
echo
echo "$AWS_ACCESS_KEY_ID" | gh secret set AWS_ACCESS_KEY_ID --repo "$REPO_OWNER/$REPO_NAME"

read -sp "Enter AWS_SECRET_ACCESS_KEY: " AWS_SECRET_ACCESS_KEY
echo
echo "$AWS_SECRET_ACCESS_KEY" | gh secret set AWS_SECRET_ACCESS_KEY --repo "$REPO_OWNER/$REPO_NAME"

# Production AWS Credentials (if different)
read -sp "Enter PROD_AWS_ACCESS_KEY_ID (press enter to use same as above): " PROD_AWS_ACCESS_KEY_ID
echo
if [[ -n "$PROD_AWS_ACCESS_KEY_ID" ]]; then
    echo "$PROD_AWS_ACCESS_KEY_ID" | gh secret set PROD_AWS_ACCESS_KEY_ID --repo "$REPO_OWNER/$REPO_NAME"
else
    echo "$AWS_ACCESS_KEY_ID" | gh secret set PROD_AWS_ACCESS_KEY_ID --repo "$REPO_OWNER/$REPO_NAME"
fi

read -sp "Enter PROD_AWS_SECRET_ACCESS_KEY (press enter to use same as above): " PROD_AWS_SECRET_ACCESS_KEY
echo
if [[ -n "$PROD_AWS_SECRET_ACCESS_KEY" ]]; then
    echo "$PROD_AWS_SECRET_ACCESS_KEY" | gh secret set PROD_AWS_SECRET_ACCESS_KEY --repo "$REPO_OWNER/$REPO_NAME"
else
    echo "$AWS_SECRET_ACCESS_KEY" | gh secret set PROD_AWS_SECRET_ACCESS_KEY --repo "$REPO_OWNER/$REPO_NAME"
fi

# Slack Webhook
read -sp "Enter SLACK_WEBHOOK URL: " SLACK_WEBHOOK
echo
echo "$SLACK_WEBHOOK" | gh secret set SLACK_WEBHOOK --repo "$REPO_OWNER/$REPO_NAME"

# SonarQube (optional)
read -p "Do you have SonarQube configured? (y/n): " HAS_SONAR
if [[ "$HAS_SONAR" == "y" ]]; then
    read -sp "Enter SONAR_TOKEN: " SONAR_TOKEN
    echo
    echo "$SONAR_TOKEN" | gh secret set SONAR_TOKEN --repo "$REPO_OWNER/$REPO_NAME"
    
    read -p "Enter SONAR_HOST_URL: " SONAR_HOST_URL
    echo "$SONAR_HOST_URL" | gh secret set SONAR_HOST_URL --repo "$REPO_OWNER/$REPO_NAME"
fi

# Status Page Token (optional)
read -p "Do you have a status page configured? (y/n): " HAS_STATUS_PAGE
if [[ "$HAS_STATUS_PAGE" == "y" ]]; then
    read -sp "Enter STATUS_PAGE_TOKEN: " STATUS_PAGE_TOKEN
    echo
    echo "$STATUS_PAGE_TOKEN" | gh secret set STATUS_PAGE_TOKEN --repo "$REPO_OWNER/$REPO_NAME"
fi

# Internal API Token
read -sp "Enter INTERNAL_API_TOKEN (for internal endpoints): " INTERNAL_API_TOKEN
echo
echo "$INTERNAL_API_TOKEN" | gh secret set INTERNAL_API_TOKEN --repo "$REPO_OWNER/$REPO_NAME"

# Grafana API Key (optional)
read -p "Do you have Grafana configured? (y/n): " HAS_GRAFANA
if [[ "$HAS_GRAFANA" == "y" ]]; then
    read -sp "Enter GRAFANA_API_KEY: " GRAFANA_API_KEY
    echo
    echo "$GRAFANA_API_KEY" | gh secret set GRAFANA_API_KEY --repo "$REPO_OWNER/$REPO_NAME"
fi

echo -e "${GREEN}✅ All secrets have been set successfully!${NC}"

# Create environments if they don't exist
echo -e "${GREEN}Setting up environments...${NC}"

gh api --method PUT "repos/$REPO_OWNER/$REPO_NAME/environments/staging" \
    --field wait_timer=0 \
    --field deployment_branch_policy='{"protected_branches":false,"custom_branch_policies":true}' || true

gh api --method PUT "repos/$REPO_OWNER/$REPO_NAME/environments/production" \
    --field wait_timer=30 \
    --field reviewers='[]' \
    --field deployment_branch_policy='{"protected_branches":true,"custom_branch_policies":false}' || true

gh api --method PUT "repos/$REPO_OWNER/$REPO_NAME/environments/production-approval" \
    --field wait_timer=0 \
    --field reviewers='[]' || true

echo -e "${GREEN}✅ Environments configured successfully!${NC}"

# Set up branch protection
echo -e "${GREEN}Setting up branch protection...${NC}"

# Main branch protection
gh api --method PUT "repos/$REPO_OWNER/$REPO_NAME/branches/main/protection" \
    --field required_status_checks='{"strict":true,"contexts":["quality-gates","test / Test Suite (unit)","security-scan","docker-build"]}' \
    --field enforce_admins=false \
    --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":true,"required_approving_review_count":1}' \
    --field restrictions=null \
    --field allow_force_pushes=false \
    --field allow_deletions=false || true

# Develop branch protection
gh api --method PUT "repos/$REPO_OWNER/$REPO_NAME/branches/develop/protection" \
    --field required_status_checks='{"strict":true,"contexts":["quality-gates","test / Test Suite (unit)"]}' \
    --field enforce_admins=false \
    --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":1}' \
    --field restrictions=null \
    --field allow_force_pushes=false \
    --field allow_deletions=false || true

echo -e "${GREEN}✅ Branch protection configured successfully!${NC}"

echo -e "${GREEN}✨ GitOps setup complete!${NC}"