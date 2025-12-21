# Enable Public Access for AI Industries Projects

## 🏢 AI Industries Organization Setup

**Organization**: aindustries.co (ID: 178614569132)
**Your Role**: Organization Administrator
**Current Issue**: Organization policy blocking public access ("allUsers")

## 🔓 How to Enable Public Access

### Option 1: Update via Console (Recommended)

1. **Open AI Industries Org Policy Console**:

   ```
   https://console.cloud.google.com/iam-admin/orgpolicies/iam-allowedPolicyMemberDomains?organizationId=178614569132
   ```

2. **Grant Yourself Policy Admin Role** (if needed):
   - Go to: https://console.cloud.google.com/iam-admin/iam?organizationId=178614569132
   - Find your account: alexdebold@aindustries.co
   - Click "Edit" (pencil icon)
   - Add role: "Organization Policy Administrator"
   - Save

3. **Update the Domain Policy**:
   - Return to the org policy page
   - Click "MANAGE POLICY"
   - Click "Edit Policy"
   - Under "Policy values":
     - Keep existing: C01enhfk3
     - Add: Click "Add value" and enter "allUsers"
   - Click "Save"

### Option 2: Grant Policy Admin via CLI

```bash
# Grant yourself org policy admin
gcloud organizations add-iam-policy-binding 178614569132 \
  --member="user:alexdebold@aindustries.co" \
  --role="roles/orgpolicy.policyAdmin"

# Then update the policy
gcloud resource-manager org-policies set-policy ai-industries-policy.yaml \
  --organization=178614569132
```

## 🚀 After Policy Update

Once the policy is updated, deploy your apps with public access:

### Warehouse App

```bash
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project aindustries-warehouse
```

### Future Projects (EasyReno, etc.)

Same process - all projects under AI Industries will be able to have public endpoints.

## 📊 Benefits

1. **All AI Industries projects** can have public-facing services
2. **Separate P&L** for each project
3. **Centralized control** under AI Industries
4. **No per-project policy changes** needed

## 🔍 Verify Success

After updating:

```bash
# Check the policy
gcloud resource-manager org-policies describe \
  iam.allowedPolicyMemberDomains \
  --organization=178614569132

# Should show:
# allowedValues:
# - C01enhfk3
# - allUsers
```
