# 🚀 Quick Access Guide - Skidspace Platform

## ❌ ISSUE IDENTIFIED
The domain `https://admin.skidspace.com` doesn't exist yet - we need to set up proper access!

## ✅ IMMEDIATE ACCESS OPTIONS

### **Option 1: Local Development Access (FASTEST)**
```bash
# 1. Start local server
cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web
npm install
npm run dev

# 2. Access platform locally
# Main App: http://localhost:3000
# Admin Portal: http://localhost:3000/admin/setup
# Super Admin Setup: http://localhost:3000/api/admin/super/setup
```

### **Option 2: Deploy to Custom Domain**
```bash
# 1. Set up domain (GoDaddy, Cloudflare, etc.)
# 2. Configure DNS to point to your server
# 3. Deploy using our production scripts
./scripts/deploy-production-security.sh
```

### **Option 3: Deploy to GCP with Custom Domain**
```bash
# 1. Reserve static IP in GCP
gcloud compute addresses create skidspace-ip --global

# 2. Configure domain mapping
gcloud app domain-mappings create skidspace.com --certificate-management=automatic

# 3. Deploy application
gcloud app deploy
```

## 🔐 **WORKING LOGIN CREDENTIALS**

Once you have access (local or deployed), use:

**Super Admin Setup:**
- **URL**: `http://localhost:3000/admin/setup` (local)
- **Email**: `admin@skidspace.com`
- **Password**: `l7@Z1fp,8Z!bt0*>Q17WrNt;XKUf]_qj`
- **Security Code**: `4BFAB786F42FD602`

## 🚀 **RECOMMENDED: Start Local First**

The fastest way to access your platform right now:

1. **Start Development Server**:
   ```bash
   cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web
   npm run dev
   ```

2. **Access Admin Panel**: http://localhost:3000/admin/setup

3. **Complete Setup**: Use the credentials above

4. **Test All Features**: Payments, analytics, inventory, etc.

## 📋 **DOMAIN SETUP CHECKLIST**

When ready to deploy to production domain:

- [ ] Purchase domain (skidspace.com)
- [ ] Configure DNS records
- [ ] Set up SSL certificates
- [ ] Deploy to GCP App Engine
- [ ] Update environment variables
- [ ] Test production deployment

## 🔧 **TROUBLESHOOTING**

**If localhost:3000 doesn't work:**
```bash
# Check if port is in use
lsof -ti:3000

# Kill any process using port 3000
kill -9 $(lsof -ti:3000)

# Restart development server
npm run dev
```

**If npm install fails:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📞 **IMMEDIATE SUPPORT**

The platform is fully built and ready - you just need to access it locally first, then deploy to your chosen domain when ready!