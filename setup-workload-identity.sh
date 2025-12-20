#\!/bin/bash
# Setup Workload Identity Federation for GitHub Actions

PROJECT_ID="warehouse-network-20251220"
PROJECT_NUMBER="467296114824"
SERVICE_ACCOUNT="github-actions@${PROJECT_ID}.iam.gserviceaccount.com"

# Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project="${PROJECT_ID}"

# Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project="${PROJECT_ID}"

# Grant service account permissions
gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/adebold/warehouse-network" \
  --project="${PROJECT_ID}"

echo "Workload Identity Federation setup complete\!"
echo "Provider: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
