# 🏭 Suntown Testing Guide - Production Setup

## Overview
This guide provides step-by-step instructions for setting up Suntown's warehouse network profile in production with 1 owner, 1 business admin, and 3 warehouses.

## Production Environment
- **URL**: https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app
- **Database**: Cloud SQL PostgreSQL (Production)
- **Cache**: Redis Memorystore (Production)

## 🚀 Phase 1: Initial Account Setup

### Step 1: Owner Registration
1. Navigate to https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app/register
2. Register the owner account:
   - **Company**: Suntown
   - **Name**: [Owner Name]
   - **Email**: owner@suntown.com
   - **Password**: [Secure Password]
   - **Role**: Select "Owner"
3. Click "Register"
4. Save credentials in password manager

### Step 2: Owner Initial Login
1. Go to https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app/login
2. Login with owner credentials
3. You should see the owner dashboard
4. Take screenshot of initial dashboard

## 🏢 Phase 2: Company Configuration

### Step 3: Complete Company Profile
1. Navigate to Settings > Company Profile
2. Fill in company details:
   ```
   Company Name: Suntown
   Industry: [Your Industry]
   Address: [Company Address]
   Phone: [Company Phone]
   Tax ID: [Tax ID if applicable]
   ```
3. Upload company logo (optional)
4. Click "Save Profile"

### Step 4: Configure Billing Information
1. Go to Settings > Billing
2. Add payment method
3. Set billing address
4. Configure invoice preferences

## 👥 Phase 3: User Management

### Step 5: Invite Business Administrator
1. Navigate to Team > Invite Members
2. Send invitation:
   - **Email**: admin@suntown.com
   - **Role**: Business Administrator
   - **Name**: [Admin Name]
3. Click "Send Invitation"
4. Admin should receive email invitation

### Step 6: Business Admin Account Setup
1. Admin clicks invitation link in email
2. Sets up password
3. Completes profile
4. Logs in to verify access

## 🏭 Phase 4: Warehouse Setup

### Step 7: Create Warehouse #1
1. As Owner, go to Warehouses > Add Warehouse
2. Enter details:
   ```
   Warehouse Name: Suntown Main Distribution Center
   Code: STN-001
   Type: Distribution Center
   Address: [Warehouse 1 Address]
   Manager: [Manager Name]
   Contact: [Phone/Email]
   Operating Hours: Mon-Fri 8AM-6PM
   ```
3. Set capacity limits:
   - Storage Capacity: [Square Feet]
   - Loading Docks: [Number]
   - Staff Count: [Number]
4. Click "Create Warehouse"

### Step 8: Create Warehouse #2
1. Repeat process for second warehouse:
   ```
   Warehouse Name: Suntown Regional Hub
   Code: STN-002
   Type: Regional Storage
   Address: [Warehouse 2 Address]
   ```
2. Configure specific settings

### Step 9: Create Warehouse #3
1. Add third warehouse:
   ```
   Warehouse Name: Suntown Express Facility
   Code: STN-003
   Type: Express Shipping
   Address: [Warehouse 3 Address]
   ```
2. Set express shipping parameters

## 📋 Phase 5: Operational Configuration

### Step 10: Configure Inventory Categories
1. Go to Settings > Inventory
2. Create product categories relevant to Suntown
3. Set up SKU formatting rules
4. Configure reorder points

### Step 11: Set Up Shipping Partners
1. Navigate to Settings > Shipping
2. Add carriers (FedEx, UPS, etc.)
3. Enter account numbers
4. Configure shipping rules

### Step 12: Configure Notifications
1. Go to Settings > Notifications
2. Set up alerts for:
   - Low inventory
   - Order processing
   - Shipment updates
   - System maintenance

## ✅ Phase 6: Validation Testing

### Test Case 1: Owner Permissions
1. As Owner, verify you can:
   - [ ] Access all warehouses
   - [ ] Modify company settings
   - [ ] Add/remove users
   - [ ] View all reports
   - [ ] Access billing

### Test Case 2: Business Admin Permissions
1. As Business Admin, verify you can:
   - [ ] Access all warehouses
   - [ ] Create inventory items
   - [ ] Process orders
   - [ ] Generate reports
   - [ ] Cannot modify billing

### Test Case 3: Warehouse Operations
1. For each warehouse, test:
   - [ ] Add inventory item
   - [ ] Create inbound shipment
   - [ ] Process outbound order
   - [ ] Transfer between warehouses
   - [ ] Generate warehouse report

### Test Case 4: Cross-Warehouse Operations
1. Test multi-warehouse scenarios:
   - [ ] Transfer inventory from STN-001 to STN-002
   - [ ] Split order across multiple warehouses
   - [ ] Consolidate shipments
   - [ ] View network-wide inventory

## 📊 Phase 7: Reporting Validation

### Step 13: Generate Test Reports
1. Navigate to Reports section
2. Generate and verify:
   - [ ] Inventory Summary (All Warehouses)
   - [ ] Daily Operations Report
   - [ ] User Activity Log
   - [ ] Financial Summary
   - [ ] Shipping Performance

### Step 14: Export Data
1. Test export functionality:
   - [ ] Export inventory list (CSV)
   - [ ] Export order history (Excel)
   - [ ] Export financial data (PDF)

## 🔧 Phase 8: Integration Testing

### Step 15: API Access (Optional)
1. Go to Settings > API
2. Generate API keys
3. Test basic API calls:
   ```bash
   # Get warehouse list
   curl -X GET https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app/api/warehouses \
     -H "Authorization: Bearer YOUR_API_KEY"
   ```

### Step 16: Webhook Configuration (Optional)
1. Set up webhooks for:
   - Order created
   - Inventory low
   - Shipment dispatched

## 🚨 Troubleshooting

### Common Issues

1. **Login Problems**
   - Clear browser cache
   - Check password requirements
   - Verify email is correct

2. **Permission Errors**
   - Confirm user role assignment
   - Log out and back in
   - Contact owner for access

3. **Warehouse Creation Fails**
   - Check all required fields
   - Verify unique warehouse codes
   - Ensure valid addresses

### Support Contacts
- Technical Issues: support@warehouse-network.com
- Account Issues: accounts@warehouse-network.com
- Emergency: +1-800-WAREHOUSE

## 📝 Testing Checklist Summary

### Account Setup
- [ ] Owner account created
- [ ] Business admin invited and activated
- [ ] Both users can log in

### Warehouse Configuration  
- [ ] 3 warehouses created (STN-001, STN-002, STN-003)
- [ ] Each warehouse has unique settings
- [ ] All warehouses appear in dashboard

### Operations Testing
- [ ] Inventory can be added to each warehouse
- [ ] Orders can be processed
- [ ] Transfers work between warehouses
- [ ] Reports generate correctly

### Performance Validation
- [ ] Page load times < 3 seconds
- [ ] Search returns results quickly
- [ ] Bulk operations complete successfully

## 📸 Required Screenshots

Please capture screenshots of:
1. Owner dashboard after setup
2. Business admin dashboard
3. All three warehouses in list view
4. Sample inventory in each warehouse
5. Successful order processing
6. Generated reports

## 🎯 Success Criteria

Setup is complete when:
- ✅ All users can access their authorized areas
- ✅ All 3 warehouses are operational
- ✅ Sample inventory exists in each location
- ✅ At least one test order processed successfully
- ✅ Reports show accurate data
- ✅ No critical errors in 30 minutes of testing

## Next Steps

After successful setup:
1. Document any issues encountered
2. Share feedback on user experience
3. Plan employee training sessions
4. Schedule go-live date
5. Set up regular data backups

---

**Test Duration**: Approximately 2-3 hours
**Required Testers**: 2 (Owner + Business Admin roles)
**Environment**: Production
**Date**: _____________
**Tested By**: _____________