import { test, expect, Page, BrowserContext } from '@playwright/test'
import { AuthE2EHelper } from '../utils/e2e-auth-helper'

test.describe('Business Workflows End-to-End', () => {
  let authHelper: AuthE2EHelper
  let context: BrowserContext
  let page: Page

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    })
    page = await context.newPage()
    authHelper = new AuthE2EHelper(page)

    // Setup test environment
    await authHelper.setupTestEnvironment()
  })

  test.afterEach(async () => {
    await context.close()
  })

  test.describe('Complete Business Customer Journey', () => {
    test('should complete end-to-end e-bike business workflow', async () => {
      // 1. Business Registration
      await page.goto('/register/business')

      await page.fill('[data-testid="company-name"]', 'Urban E-Bikes Inc')
      await page.fill('[data-testid="company-email"]', 'operations@urbanebikes.com')
      await page.fill('[data-testid="contact-name"]', 'Maria Rodriguez')
      await page.fill('[data-testid="contact-email"]', 'maria@urbanebikes.com')
      await page.fill('[data-testid="business-phone"]', '+1-555-0123')

      await page.selectOption('[data-testid="business-type"]', 'e-bike-retailer')
      await page.fill('[data-testid="monthly-volume"]', '150')
      await page.selectOption('[data-testid="storage-requirements"]', ['ebikes', 'accessories'])

      await page.fill('[data-testid="password"]', 'BusinessSecure123!')
      await page.fill('[data-testid="confirm-password"]', 'BusinessSecure123!')

      await page.check('[data-testid="terms-agreement"]')
      await page.click('[data-testid="submit-registration"]')

      // 2. Admin Approval (simulate)
      await expect(page.locator('[data-testid="pending-approval"]')).toBeVisible()
      await authHelper.approveBusinessRegistration('maria@urbanebikes.com')

      // 3. Complete Profile Setup
      const approvalToken = await authHelper.getApprovalToken('maria@urbanebikes.com')
      await page.goto(`/complete-setup?token=${approvalToken}`)

      await page.fill('[data-testid="billing-address"]', '456 Business Ave, Commerce City, CC 54321')
      await page.fill('[data-testid="tax-id"]', 'TAX-123456789')
      await page.selectOption('[data-testid="subscription-plan"]', 'professional')

      // Payment Information
      await page.fill('[data-testid="card-number"]', '4242424242424242')
      await page.fill('[data-testid="expiry-date"]', '12/25')
      await page.fill('[data-testid="cvv"]', '123')
      await page.fill('[data-testid="cardholder-name"]', 'Maria Rodriguez')

      await page.click('[data-testid="complete-setup"]')

      // 4. Dashboard Access
      await expect(page).toHaveURL(/\/dashboard\/business/)
      await expect(page.locator('[data-testid="welcome-message"]')).toContainText(
        'Welcome to Skidspace, Maria'
      )

      // 5. Browse Available Warehouses
      await page.click('[data-testid="find-warehouses"]')
      await expect(page).toHaveURL(/\/warehouses\/search/)

      // Set search criteria
      await page.fill('[data-testid="location-search"]', 'Los Angeles, CA')
      await page.selectOption('[data-testid="storage-type"]', 'ebikes')
      await page.fill('[data-testid="capacity-needed"]', '50')
      await page.click('[data-testid="search-warehouses"]')

      // Select a warehouse
      await expect(page.locator('[data-testid="warehouse-results"]')).toBeVisible()
      await page.click('[data-testid="warehouse-card"]:first-child')

      await expect(page.locator('[data-testid="warehouse-details"]')).toBeVisible()
      await page.click('[data-testid="request-quote"]')

      // 6. Submit Storage Request
      await page.fill('[data-testid="storage-duration"]', '6') // months
      await page.fill('[data-testid="expected-inventory"]', '75')
      await page.fill('[data-testid="special-requirements"]', 'Climate controlled storage for lithium batteries')
      await page.selectOption('[data-testid="move-in-date"]', '2024-04-01')

      await page.click('[data-testid="submit-request"]')

      await expect(page.locator('[data-testid="request-submitted"]')).toContainText(
        'Storage request submitted successfully'
      )

      // 7. Negotiate Terms (simulate warehouse response)
      await authHelper.createWarehouseQuoteResponse({
        businessEmail: 'maria@urbanebikes.com',
        warehouseId: 'warehouse-001',
        monthlyRate: 2500,
        setupFee: 500,
        terms: '6-month minimum, climate controlled',
      })

      // Check notifications
      await page.click('[data-testid="notifications"]')
      await expect(page.locator('[data-testid="quote-notification"]')).toContainText(
        'New quote received from Premium Storage Solutions'
      )

      // Review quote
      await page.click('[data-testid="view-quote"]')
      await expect(page.locator('[data-testid="quote-details"]')).toBeVisible()
      await expect(page.locator('[data-testid="monthly-rate"]')).toContainText('$2,500')

      await page.click('[data-testid="accept-quote"]')

      // 8. Contract Signing
      await expect(page).toHaveURL(/\/contracts\/sign/)
      await page.check('[data-testid="terms-acceptance"]')
      await page.fill('[data-testid="electronic-signature"]', 'Maria Rodriguez')
      await page.click('[data-testid="sign-contract"]')

      await expect(page.locator('[data-testid="contract-signed"]')).toContainText(
        'Contract signed successfully'
      )

      // 9. Setup Inventory Management
      await page.goto('/inventory/setup')

      // Add product catalog
      await page.click('[data-testid="add-product"]')
      await page.fill('[data-testid="product-name"]', 'Urban Commuter E-Bike')
      await page.fill('[data-testid="product-sku"]', 'UCE-2024-001')
      await page.fill('[data-testid="product-price"]', '1899')
      await page.fill('[data-testid="product-weight"]', '25')
      await page.selectOption('[data-testid="product-category"]', 'ebikes')
      await page.click('[data-testid="save-product"]')

      await page.click('[data-testid="add-product"]')
      await page.fill('[data-testid="product-name"]', 'E-Bike Battery Pack')
      await page.fill('[data-testid="product-sku"]', 'EBP-2024-001')
      await page.fill('[data-testid="product-price"]', '299')
      await page.fill('[data-testid="product-weight"]', '3')
      await page.selectOption('[data-testid="product-category"]', 'accessories')
      await page.click('[data-testid="save-product"]')

      // 10. First Inventory Delivery
      await page.goto('/inventory/inbound')
      await page.click('[data-testid="create-delivery"]')

      await page.fill('[data-testid="delivery-name"]', 'Initial Stock Delivery')
      await page.selectOption('[data-testid="delivery-type"]', 'standard')
      await page.fill('[data-testid="expected-date"]', '2024-04-15')

      // Add items to delivery
      await page.click('[data-testid="add-delivery-item"]')
      await page.selectOption('[data-testid="product-select"]', 'UCE-2024-001')
      await page.fill('[data-testid="quantity"]', '25')
      await page.click('[data-testid="confirm-item"]')

      await page.click('[data-testid="add-delivery-item"]')
      await page.selectOption('[data-testid="product-select"]', 'EBP-2024-001')
      await page.fill('[data-testid="quantity"]', '50')
      await page.click('[data-testid="confirm-item"]')

      await page.click('[data-testid="schedule-delivery"]')

      await expect(page.locator('[data-testid="delivery-scheduled"]')).toContainText(
        'Delivery scheduled successfully'
      )

      // 11. Track Delivery
      const deliveryId = await authHelper.getLatestDeliveryId('maria@urbanebikes.com')
      await page.goto(`/deliveries/${deliveryId}`)

      await expect(page.locator('[data-testid="delivery-status"]')).toContainText('Scheduled')
      await expect(page.locator('[data-testid="tracking-timeline"]')).toBeVisible()

      // Simulate delivery progress
      await authHelper.updateDeliveryStatus(deliveryId, 'in-transit')
      await page.reload()
      await expect(page.locator('[data-testid="delivery-status"]')).toContainText('In Transit')

      await authHelper.updateDeliveryStatus(deliveryId, 'delivered')
      await page.reload()
      await expect(page.locator('[data-testid="delivery-status"]')).toContainText('Delivered')

      // 12. Inventory Management
      await page.goto('/inventory/current')

      await expect(page.locator('[data-testid="inventory-item-UCE-2024-001"]')).toContainText('25')
      await expect(page.locator('[data-testid="inventory-item-EBP-2024-001"]')).toContainText('50')

      // Create outbound order
      await page.click('[data-testid="create-outbound-order"]')
      await page.fill('[data-testid="order-reference"]', 'ORD-001-2024')
      await page.fill('[data-testid="customer-name"]', 'Green Transit Solutions')
      await page.fill('[data-testid="shipping-address"]', '789 Delivery St, Ship City, SC 67890')

      await page.click('[data-testid="add-order-item"]')
      await page.selectOption('[data-testid="product-select"]', 'UCE-2024-001')
      await page.fill('[data-testid="order-quantity"]', '5')
      await page.click('[data-testid="confirm-order-item"]')

      await page.click('[data-testid="submit-order"]')

      await expect(page.locator('[data-testid="order-created"]')).toContainText(
        'Outbound order created successfully'
      )

      // 13. Analytics and Reporting
      await page.goto('/analytics/overview')

      await expect(page.locator('[data-testid="total-inventory-value"]')).toBeVisible()
      await expect(page.locator('[data-testid="monthly-storage-cost"]')).toContainText('$2,500')
      await expect(page.locator('[data-testid="inventory-turnover"]')).toBeVisible()

      // Generate report
      await page.click('[data-testid="generate-report"]')
      await page.selectOption('[data-testid="report-type"]', 'inventory-summary')
      await page.selectOption('[data-testid="report-period"]', 'monthly')
      await page.click('[data-testid="create-report"]')

      await expect(page.locator('[data-testid="report-generated"]')).toContainText(
        'Report generated successfully'
      )

      // 14. Billing and Payments
      await page.goto('/billing/overview')

      await expect(page.locator('[data-testid="current-balance"]')).toBeVisible()
      await expect(page.locator('[data-testid="next-payment-date"]')).toBeVisible()

      // View invoice
      await page.click('[data-testid="view-latest-invoice"]')
      await expect(page.locator('[data-testid="invoice-details"]')).toBeVisible()
      await expect(page.locator('[data-testid="storage-charges"]')).toContainText('$2,500.00')

      // 15. Support and Communication
      await page.goto('/support')

      // Create support ticket
      await page.click('[data-testid="create-ticket"]')
      await page.fill('[data-testid="ticket-subject"]', 'Question about climate control settings')
      await page.fill('[data-testid="ticket-description"]', 'I need to adjust the temperature settings for optimal battery storage.')
      await page.selectOption('[data-testid="ticket-priority"]', 'medium')
      await page.click('[data-testid="submit-ticket"]')

      await expect(page.locator('[data-testid="ticket-created"]')).toContainText(
        'Support ticket created successfully'
      )

      // Verify complete business workflow
      const businessStatus = await authHelper.getBusinessStatus('maria@urbanebikes.com')
      expect(businessStatus).toMatchObject({
        registrationStatus: 'APPROVED',
        subscriptionStatus: 'ACTIVE',
        contractsSigned: 1,
        activeWarehouses: 1,
        totalInventoryValue: expect.any(Number),
        monthlyStorageCosts: 2500,
      })
    })
  })

  test.describe('Warehouse Operator Workflow', () => {
    test('should complete warehouse management workflow', async () => {
      // Setup warehouse admin
      const warehouseAdmin = await authHelper.createTestUser({
        email: 'admin@premiumstorage.com',
        role: 'WAREHOUSE_ADMIN',
        organizationName: 'Premium Storage Solutions',
      })

      await authHelper.loginUser(warehouseAdmin.email, 'TestPassword123!')

      // 1. Dashboard Overview
      await page.goto('/dashboard/warehouse')
      await expect(page.locator('[data-testid="warehouse-dashboard"]')).toBeVisible()
      await expect(page.locator('[data-testid="occupancy-overview"]')).toBeVisible()

      // 2. Manage Incoming Business Requests
      await page.goto('/requests/pending')

      // Simulate incoming request
      await authHelper.createStorageRequest({
        businessName: 'Urban E-Bikes Inc',
        contactEmail: 'maria@urbanebikes.com',
        storageType: 'ebikes',
        capacity: 50,
        duration: 6,
      })

      await page.reload()
      await expect(page.locator('[data-testid="pending-request"]')).toBeVisible()

      // Review request details
      await page.click('[data-testid="review-request"]:first-child')
      await expect(page.locator('[data-testid="request-details"]')).toBeVisible()

      // Create quote
      await page.click('[data-testid="create-quote"]')
      await page.fill('[data-testid="monthly-rate"]', '2500')
      await page.fill('[data-testid="setup-fee"]', '500')
      await page.fill('[data-testid="minimum-term"]', '6')
      await page.fill('[data-testid="availability-date"]', '2024-04-01')

      await page.selectOption('[data-testid="storage-zone"]', 'climate-controlled-a')
      await page.check('[data-testid="includes-insurance"]')
      await page.check('[data-testid="includes-security"]')

      await page.fill('[data-testid="special-terms"]', 'Climate controlled environment for battery storage')
      await page.click('[data-testid="send-quote"]')

      await expect(page.locator('[data-testid="quote-sent"]')).toContainText('Quote sent successfully')

      // 3. Contract Management
      await authHelper.simulateQuoteAcceptance('maria@urbanebikes.com')

      await page.goto('/contracts/active')
      await expect(page.locator('[data-testid="active-contract"]')).toBeVisible()

      await page.click('[data-testid="view-contract"]:first-child')
      await expect(page.locator('[data-testid="contract-details"]')).toBeVisible()
      await expect(page.locator('[data-testid="contract-status-active"]')).toBeVisible()

      // 4. Facility Management
      await page.goto('/facility/layout')

      // Configure storage zones
      await page.click('[data-testid="configure-zone"]')
      await page.fill('[data-testid="zone-name"]', 'E-Bike Storage Zone A')
      await page.selectOption('[data-testid="zone-type"]', 'climate-controlled')
      await page.fill('[data-testid="zone-capacity"]', '100')
      await page.fill('[data-testid="temperature-range"]', '18-22°C')
      await page.fill('[data-testid="humidity-range"]', '45-55%')
      await page.click('[data-testid="save-zone-config"]')

      // 5. Inventory Receiving
      await page.goto('/operations/receiving')

      // Process incoming delivery
      await authHelper.scheduleDelivery({
        businessEmail: 'maria@urbanebikes.com',
        expectedDate: '2024-04-15',
        items: [
          { sku: 'UCE-2024-001', quantity: 25, description: 'Urban Commuter E-Bike' },
          { sku: 'EBP-2024-001', quantity: 50, description: 'E-Bike Battery Pack' }
        ]
      })

      await page.reload()
      await expect(page.locator('[data-testid="scheduled-delivery"]')).toBeVisible()

      // Check in delivery
      await page.click('[data-testid="check-in-delivery"]')
      await expect(page.locator('[data-testid="delivery-checkin"]')).toBeVisible()

      // Verify items
      await page.click('[data-testid="verify-item-UCE-2024-001"]')
      await page.fill('[data-testid="received-quantity"]', '25')
      await page.selectOption('[data-testid="condition"]', 'excellent')
      await page.fill('[data-testid="storage-location"]', 'Zone-A-R1-S1')
      await page.click('[data-testid="confirm-item"]')

      await page.click('[data-testid="verify-item-EBP-2024-001"]')
      await page.fill('[data-testid="received-quantity"]', '50')
      await page.selectOption('[data-testid="condition"]', 'excellent')
      await page.fill('[data-testid="storage-location"]', 'Zone-A-R2-S1')
      await page.click('[data-testid="confirm-item"]')

      await page.click('[data-testid="complete-checkin"]')

      await expect(page.locator('[data-testid="checkin-complete"]')).toContainText(
        'Delivery checked in successfully'
      )

      // 6. Inventory Management
      await page.goto('/inventory/current')

      await expect(page.locator('[data-testid="inventory-summary"]')).toBeVisible()
      await expect(page.locator('[data-testid="item-UCE-2024-001"]')).toContainText('25 units')
      await expect(page.locator('[data-testid="item-EBP-2024-001"]')).toContainText('50 units')

      // Update inventory location
      await page.click('[data-testid="edit-location-UCE-2024-001"]')
      await page.fill('[data-testid="new-location"]', 'Zone-A-R1-S2')
      await page.fill('[data-testid="move-reason"]', 'Optimizing storage layout')
      await page.click('[data-testid="update-location"]')

      // 7. Order Fulfillment
      await authHelper.createOutboundOrder({
        businessEmail: 'maria@urbanebikes.com',
        items: [
          { sku: 'UCE-2024-001', quantity: 5 }
        ],
        customerInfo: {
          name: 'Green Transit Solutions',
          address: '789 Delivery St, Ship City, SC 67890'
        }
      })

      await page.goto('/operations/fulfillment')
      await expect(page.locator('[data-testid="pending-order"]')).toBeVisible()

      // Process order
      await page.click('[data-testid="process-order"]:first-child')
      await expect(page.locator('[data-testid="pick-list"]')).toBeVisible()

      // Pick items
      await page.click('[data-testid="start-picking"]')
      await page.fill('[data-testid="picked-quantity"]', '5')
      await page.selectOption('[data-testid="picker-id"]', 'john-smith')
      await page.click('[data-testid="confirm-pick"]')

      // Package and ship
      await page.click('[data-testid="package-order"]')
      await page.fill('[data-testid="package-weight"]', '125')
      await page.selectOption('[data-testid="shipping-carrier"]', 'fedex')
      await page.fill('[data-testid="tracking-number"]', '1234567890')
      await page.click('[data-testid="ship-order"]')

      await expect(page.locator('[data-testid="order-shipped"]')).toContainText(
        'Order shipped successfully'
      )

      // 8. Financial Management
      await page.goto('/billing/invoicing')

      // Generate monthly invoice
      await page.click('[data-testid="generate-invoice"]')
      await page.selectOption('[data-testid="billing-period"]', 'april-2024')
      await page.selectOption('[data-testid="customer"]', 'Urban E-Bikes Inc')
      await page.click('[data-testid="create-invoice"]')

      await expect(page.locator('[data-testid="invoice-created"]')).toContainText(
        'Invoice generated successfully'
      )

      // Review invoice
      await page.click('[data-testid="view-invoice"]')
      await expect(page.locator('[data-testid="invoice-details"]')).toBeVisible()
      await expect(page.locator('[data-testid="storage-charges"]')).toContainText('$2,500.00')

      // 9. Analytics and Reporting
      await page.goto('/analytics/warehouse')

      await expect(page.locator('[data-testid="occupancy-rate"]')).toBeVisible()
      await expect(page.locator('[data-testid="revenue-summary"]')).toBeVisible()
      await expect(page.locator('[data-testid="customer-count"]')).toBeVisible()

      // 10. Maintenance and Compliance
      await page.goto('/maintenance/schedule')

      // Schedule equipment maintenance
      await page.click('[data-testid="schedule-maintenance"]')
      await page.selectOption('[data-testid="equipment-type"]', 'climate-control')
      await page.fill('[data-testid="maintenance-date"]', '2024-04-20')
      await page.selectOption('[data-testid="maintenance-type"]', 'preventive')
      await page.fill('[data-testid="technician"]', 'HVAC Specialists Inc')
      await page.click('[data-testid="schedule"]')

      await expect(page.locator('[data-testid="maintenance-scheduled"]')).toContainText(
        'Maintenance scheduled successfully'
      )

      // Verify complete warehouse operations
      const warehouseStatus = await authHelper.getWarehouseStatus(warehouseAdmin.email)
      expect(warehouseStatus).toMatchObject({
        occupancyRate: expect.any(Number),
        activeContracts: 1,
        monthlyRevenue: 2500,
        totalCustomers: 1,
        maintenanceScheduled: 1,
      })
    })
  })

  test.describe('Super Admin Platform Management', () => {
    test('should manage platform operations and users', async () => {
      const superAdmin = await authHelper.createTestUser({
        email: 'admin@skidspace.com',
        role: 'SUPER_ADMIN',
      })

      await authHelper.loginUser(superAdmin.email, 'AdminPassword123!')

      // 1. Platform Dashboard
      await page.goto('/admin/dashboard')
      await expect(page.locator('[data-testid="admin-dashboard"]')).toBeVisible()
      await expect(page.locator('[data-testid="platform-metrics"]')).toBeVisible()

      // 2. User Management
      await page.goto('/admin/users')

      // Search and filter users
      await page.fill('[data-testid="user-search"]', 'maria@urbanebikes.com')
      await page.click('[data-testid="search-users"]')

      await expect(page.locator('[data-testid="user-result"]')).toContainText('maria@urbanebikes.com')

      // View user details
      await page.click('[data-testid="view-user"]')
      await expect(page.locator('[data-testid="user-profile"]')).toBeVisible()
      await expect(page.locator('[data-testid="user-activity"]')).toBeVisible()

      // Modify user permissions
      await page.click('[data-testid="edit-permissions"]')
      await page.check('[data-testid="permission-advanced-analytics"]')
      await page.click('[data-testid="save-permissions"]')

      // 3. Organization Management
      await page.goto('/admin/organizations')

      await expect(page.locator('[data-testid="organization-list"]')).toBeVisible()

      // Approve pending organization
      await page.click('[data-testid="pending-approvals"]')
      await page.click('[data-testid="approve-organization"]:first-child')
      await page.fill('[data-testid="approval-notes"]', 'Verified business credentials and insurance')
      await page.click('[data-testid="confirm-approval"]')

      // 4. Financial Overview
      await page.goto('/admin/financials')

      await expect(page.locator('[data-testid="platform-revenue"]')).toBeVisible()
      await expect(page.locator('[data-testid="commission-summary"]')).toBeVisible()

      // Process payouts
      await page.click('[data-testid="process-payouts"]')
      await page.selectOption('[data-testid="payout-period"]', 'march-2024')
      await page.click('[data-testid="calculate-payouts"]')

      await expect(page.locator('[data-testid="payout-summary"]')).toBeVisible()
      await page.click('[data-testid="approve-payouts"]')

      // 5. System Configuration
      await page.goto('/admin/settings')

      // Update platform settings
      await page.fill('[data-testid="platform-commission"]', '5.5')
      await page.check('[data-testid="enable-auto-approvals"]')
      await page.selectOption('[data-testid="default-currency"]', 'USD')
      await page.click('[data-testid="save-settings"]')

      // 6. Security and Compliance
      await page.goto('/admin/security')

      await expect(page.locator('[data-testid="security-alerts"]')).toBeVisible()
      await expect(page.locator('[data-testid="audit-log"]')).toBeVisible()

      // Review audit logs
      await page.click('[data-testid="view-audit-logs"]')
      await page.selectOption('[data-testid="log-filter"]', 'security-events')
      await page.click('[data-testid="filter-logs"]')

      await expect(page.locator('[data-testid="audit-entries"]')).toBeVisible()

      // Verify platform management capabilities
      const platformStatus = await authHelper.getPlatformStatus()
      expect(platformStatus).toMatchObject({
        totalUsers: expect.any(Number),
        totalOrganizations: expect.any(Number),
        platformRevenue: expect.any(Number),
        systemHealth: 'operational',
      })
    })
  })
})