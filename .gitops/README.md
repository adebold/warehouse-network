# GitOps Configuration

This directory contains the GitOps configuration for the Warehouse application using Kustomize and ArgoCD.

## Directory Structure

```
.gitops/
├── argocd/              # ArgoCD application definitions
│   ├── app-of-apps.yaml # Parent application managing all environments
│   └── apps/           # Individual environment applications
├── base/               # Base Kubernetes manifests
│   ├── configmap.yaml
│   ├── deployment.yaml
│   ├── hpa.yaml
│   ├── ingress.yaml
│   ├── namespace.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/           # Environment-specific configurations
    ├── dev/
    ├── staging/
    └── prod/
```

## Environments

### Development
- Namespace: `warehouse-dev`
- URL: https://dev.warehouse.example.com
- Auto-sync: Enabled
- Replicas: 1

### Staging
- Namespace: `warehouse-staging`
- URL: https://staging.warehouse.example.com
- Auto-sync: Enabled
- Replicas: 2

### Production
- Namespace: `warehouse-prod`
- URL: https://warehouse.com
- Auto-sync: Disabled (manual approval required)
- Replicas: 3 (auto-scaling to 20)

## Deployment Process

### Development
1. Push to `develop` branch
2. GitHub Actions builds and pushes image
3. ArgoCD automatically syncs changes

### Staging
1. Push to `staging` branch
2. GitHub Actions builds and pushes image
3. Security scanning performed
4. ArgoCD automatically syncs changes

### Production
1. Create version tag (e.g., `v1.0.0`)
2. GitHub Actions builds and pushes image
3. Security scanning with strict requirements
4. Creates PR for manual review
5. Manual merge triggers ArgoCD sync

## ArgoCD Setup

1. Install ArgoCD:
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

2. Apply app-of-apps:
```bash
kubectl apply -f .gitops/argocd/app-of-apps.yaml
```

## Local Development

Test Kustomize builds locally:

```bash
# Build dev overlay
kustomize build .gitops/overlays/dev

# Build staging overlay
kustomize build .gitops/overlays/staging

# Build prod overlay
kustomize build .gitops/overlays/prod
```

## Image Updates

Images are automatically updated in kustomization.yaml files by CI/CD pipeline:

```bash
cd .gitops/overlays/dev
kustomize edit set image gcr.io/PROJECT_ID/warehouse-frontend=gcr.io/PROJECT_ID/warehouse-frontend:new-tag
```