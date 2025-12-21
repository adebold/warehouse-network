# Deploy to Cloud Run

Since authentication cannot be automated due to org policies, 
please run these commands locally or in Cloud Shell:

```bash
cd apps/web
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project easyreno-demo-20251219144606
```

This will:
1. Build the container in Cloud Build (linux/amd64)
2. Deploy to Cloud Run
3. Return the service URL
