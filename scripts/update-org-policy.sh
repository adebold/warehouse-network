#!/bin/bash

# Script to update organization policies for public access
# Requires Organization Administrator permissions

ORG_ID="266590371030"
PROJECT_ID="warehouse-network-20251220"

echo "🔧 Updating Organization Policies..."
echo "=================================="
echo ""

# Option 1: Disable the policy at project level (if you have permissions)
echo "Option 1: Trying to disable policy at project level..."
gcloud resource-manager org-policies disable-enforce \
  constraints/iam.allowedPolicyMemberDomains \
  --project=$PROJECT_ID

# Option 2: Update the organization policy (requires org admin)
echo ""
echo "Option 2: If you have Organization Admin permissions:"
echo "Run this command:"
echo ""
echo "gcloud resource-manager org-policies set-policy allow-public-access-policy.yaml \\"
echo "  --organization=$ORG_ID"
echo ""

# Option 3: Create exception for specific project
echo "Option 3: Create project-specific exception:"
cat > project-policy.yaml << EOF
constraint: constraints/iam.allowedPolicyMemberDomains
listPolicy:
  allValues: ALL_VALUES_ALLOWED
EOF

echo "gcloud resource-manager org-policies set-policy project-policy.yaml \\"
echo "  --project=$PROJECT_ID"
echo ""

# Check current permissions
echo "Your current roles:"
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:alex@alexdebold.com" \
  --format="value(bindings.role)"