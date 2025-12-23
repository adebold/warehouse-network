# Step-by-Step Domain Mapping Guide for SkidSpace

## 📍 Step 1: Open Cloud Run Domain Mappings

Click this link: https://console.cloud.google.com/run/domains?project=aindustries-warehouse

OR navigate manually:
1. Go to Google Cloud Console
2. Select your project: `aindustries-warehouse`
3. In the left menu, find "Cloud Run"
4. Click on "Domain mappings"

## 📍 Step 2: Click "ADD MAPPING"

You'll see a button at the top of the page labeled **"ADD MAPPING"** - click it.

## 📍 Step 3: Fill in the Form

You'll see a form with these fields:

### Service Selection:
- **Service**: Click the dropdown and select `warehouse-platform-v2`
- **Region**: Select `us-central1`

### Domain Configuration:
- **Domain**: Type `skidspace.com` (without https:// or www)

### Verification:
- If it says "Domain not verified", click the "Verify domain" link
- Since you already verified in Search Console, it might just need you to confirm

## 📍 Step 4: Click "SUBMIT"

After filling in all fields, click the blue **"SUBMIT"** button.

## 📍 Step 5: Wait for Processing

You'll see the domain mapping in "Processing" state. This means:
- Google is verifying DNS is pointing correctly (✅ already done)
- SSL certificates are being created (takes 15-20 minutes)
- Domain routing is being configured

## 📍 Step 6: Check Status

The domain mapping will show one of these states:
- **Processing**: Setting up (wait 15-20 mins)
- **Active**: Ready to use! 
- **Error**: Check DNS configuration

## 🎯 What Happens Next

Once status is "Active":
- ✅ https://skidspace.com will work
- ✅ https://www.skidspace.com will work
- ✅ SSL certificates active
- ✅ HTTP redirects to HTTPS automatically

## 🚨 Troubleshooting

### "Domain not verified" error:
1. Click "Verify domain" 
2. Choose "Use existing property" if you see skidspace.com listed
3. Or add TXT record if needed

### "DNS not configured" error:
- DNS is already correct (pointing to ghs.googlehosted.com)
- Wait 5-10 minutes for propagation

### Still not working?
- The DNS is configured correctly
- Current service URL: https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app
- Check domain mapping status in Cloud Console

## 📞 Quick Reference

- **Service**: warehouse-platform-v2
- **Region**: us-central1  
- **Domain**: skidspace.com
- **DNS**: Already configured to ghs.googlehosted.com