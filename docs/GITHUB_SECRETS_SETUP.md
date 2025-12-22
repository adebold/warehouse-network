# GitHub Secrets Setup Guide

## Required GitHub Repository Secrets

For the warehouse platform to deploy correctly, you need to configure the following secrets in your GitHub repository:

### 1. Google Analytics
- **Secret Name**: `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- **Value**: Your Google Analytics 4 Measurement ID (e.g., `G-XXXXXXXXXX`)
- **Used By**: Both old and new deployment workflows

### 2. Database Configuration (Old Workflow Only)
These are used by the deprecated workflow but should still be maintained:

- **Secret Name**: `DATABASE_URL`
- **Value**: Full PostgreSQL connection string
- **Example**: `postgresql://user:password@host:5432/database`

- **Secret Name**: `DIRECT_URL`
- **Value**: Direct database URL for migrations
- **Example**: Same as DATABASE_URL

- **Secret Name**: `REDIS_URL`
- **Value**: Redis connection string
- **Example**: `redis://localhost:6379`

- **Secret Name**: `NEXTAUTH_SECRET`
- **Value**: Random 32-character hex string
- **Generate**: `openssl rand -hex 32`

## Setting Up Secrets

### Via GitHub UI:
1. Go to your repository on GitHub
2. Click on Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret with its name and value

### Via GitHub CLI:
```bash
# Install GitHub CLI if needed
brew install gh

# Authenticate
gh auth login

# Add secrets
gh secret set NEXT_PUBLIC_GA_MEASUREMENT_ID -b "G-XXXXXXXXXX"
gh secret set DATABASE_URL -b "postgresql://..."
gh secret set DIRECT_URL -b "postgresql://..."
gh secret set REDIS_URL -b "redis://..."
gh secret set NEXTAUTH_SECRET -b "$(openssl rand -hex 32)"
```

## Google Secret Manager (GitOps Workflow)

The new GitOps workflow uses Google Secret Manager instead of GitHub secrets for sensitive data. Only the GA measurement ID is still read from GitHub secrets.

To set up Google Secret Manager, run:
```bash
./scripts/setup-google-secrets.sh
```

## Verifying Secrets

### GitHub Secrets:
```bash
gh secret list
```

### Google Secret Manager:
```bash
gcloud secrets list --project=aindustries-warehouse
```

## Important Notes

1. **GitHub Secrets as Source of Truth**: The `NEXT_PUBLIC_GA_MEASUREMENT_ID` should always be set in GitHub secrets as it's the source of truth for analytics configuration.

2. **Migration Path**: We're moving from GitHub secrets to Google Secret Manager for better security and integration with Google Cloud services.

3. **Cloud SQL Proxy**: The GitOps workflow uses Cloud SQL Auth Proxy for secure database connections without exposing credentials.

4. **Service Account**: The `warehouse-app@aindustries-warehouse.iam.gserviceaccount.com` service account needs access to all secrets in Google Secret Manager.