import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test data setup
const testData = {
  operators: [
    {
      name: 'Premium Logistics Inc.',
      warehouses: [
        {
          name: 'Toronto Distribution Hub',
          size: 50000,
          features: ['24/7 Access', 'Climate Control', 'Security'],
          price: 18.5,
          location: 'Toronto, ON',
        },
        {
          name: 'Mississauga Storage',
          size: 25000,
          features: ['Loading Docks', 'Office Space'],
          price: 12.0,
          location: 'Mississauga, ON',
        },
      ],
    },
  ],
  customers: [
    {
      company: 'E-Commerce Giant Corp',
      budget: 50000,
      requirements: {
        size: 30000,
        features: ['24/7 Access', 'Climate Control'],
        duration: 6, // months
      },
    },
  ],
};

test.describe('Complete User Journey Tests', () => {
  test.beforeAll(async () => {
    // Seed test data
    console.log('Setting up test data...');
    // Add seed logic here
  });

  test.afterAll(async () => {
    // Cleanup
    await prisma.$disconnect();
  });

  test.describe('Customer Journey: Finding and Booking Warehouse Space', () => {
    test('New customer can search, compare, and book warehouse space', async ({ page }) => {
      // 1. Discovery Phase
      await test.step('Homepage exploration', async () => {
        await page.goto('/');

        // Verify hero content
        await expect(page.locator('h1')).toContainText('Find Your Perfect Warehouse Space');

        // Check key value propositions are visible
        await expect(page.locator('text=Prime Locations')).toBeVisible();
        await expect(page.locator('text=Fast & Easy')).toBeVisible();
        await expect(page.locator('text=Verified Listings')).toBeVisible();

        // Take screenshot for visual reference
        await page.screenshot({
          path: 'screenshots/customer-journey-homepage.png',
          fullPage: true,
        });
      });

      // 2. Search Phase
      await test.step('Search for warehouses', async () => {
        // Enter search criteria
        await page.fill(
          '[placeholder="Type of space, size, or features..."]',
          'climate control storage'
        );
        await page.fill('[placeholder="City or postal code"]', 'Toronto');
        await page.click('button:has-text("Search")');

        await page.waitForURL('**/search**');

        // Verify search results
        await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
        await expect(page.locator('[data-testid="warehouse-card"]')).toHaveCount(1, {
          timeout: 10000,
        });

        // Apply filters
        await page.click('[data-testid="filter-size"]');
        await page.fill('[data-testid="size-min"]', '25000');
        await page.fill('[data-testid="size-max"]', '60000');

        await page.click('[data-testid="filter-features"]');
        await page.check('text=24/7 Access');
        await page.check('text=Climate Control');

        await page.click('[data-testid="apply-filters"]');

        // Verify filtered results
        await expect(page.locator('[data-testid="warehouse-card"]')).toHaveCount(1);
      });

      // 3. Evaluation Phase
      await test.step('Compare warehouse options', async () => {
        // Open comparison view
        const firstWarehouse = page.locator('[data-testid="warehouse-card"]').first();
        await firstWarehouse.locator('[data-testid="add-to-compare"]').click();

        const secondWarehouse = page.locator('[data-testid="warehouse-card"]').nth(1);
        if (await secondWarehouse.isVisible()) {
          await secondWarehouse.locator('[data-testid="add-to-compare"]').click();
          await page.click('[data-testid="compare-button"]');

          // Verify comparison table
          await expect(page.locator('[data-testid="comparison-table"]')).toBeVisible();
          await expect(page.locator('[data-testid="comparison-row-size"]')).toBeVisible();
          await expect(page.locator('[data-testid="comparison-row-price"]')).toBeVisible();
          await expect(page.locator('[data-testid="comparison-row-features"]')).toBeVisible();
        }
      });

      // 4. Detail View Phase
      await test.step('View warehouse details', async () => {
        await page.click('[data-testid="warehouse-card"]:first-child [data-testid="view-details"]');

        await page.waitForURL('**/warehouse/**');

        // Verify all critical information is present
        await expect(page.locator('[data-testid="warehouse-name"]')).toBeVisible();
        await expect(page.locator('[data-testid="warehouse-price"]')).toBeVisible();
        await expect(page.locator('[data-testid="warehouse-size"]')).toBeVisible();
        await expect(page.locator('[data-testid="feature-list"]')).toBeVisible();
        await expect(page.locator('[data-testid="availability-calendar"]')).toBeVisible();

        // Check image gallery
        await expect(page.locator('[data-testid="image-gallery"]')).toBeVisible();
        await page.click('[data-testid="image-thumbnail"]').first();
        await expect(page.locator('[data-testid="image-modal"]')).toBeVisible();
        await page.keyboard.press('Escape');

        // Calculate costs
        await page.click('[data-testid="calculate-cost"]');
        await page.fill('[data-testid="start-date"]', '2025-01-01');
        await page.fill('[data-testid="end-date"]', '2025-06-30');
        await page.click('[data-testid="calculate-button"]');

        await expect(page.locator('[data-testid="cost-breakdown"]')).toBeVisible();
        await expect(page.locator('[data-testid="total-cost"]')).toContainText('$');
      });

      // 5. Booking Phase
      await test.step('Create account and book warehouse', async () => {
        await page.click('[data-testid="book-now"]');

        // Redirect to login/register
        await expect(page).toHaveURL('**/register**');

        // Fill registration form
        await page.fill('[data-testid="company-name"]', 'Test Company Ltd');
        await page.fill('[data-testid="contact-name"]', 'John Doe');
        await page.fill('[data-testid="email"]', 'john@testcompany.com');
        await page.fill('[data-testid="password"]', 'SecurePass123!');
        await page.fill('[data-testid="confirm-password"]', 'SecurePass123!');
        await page.check('[data-testid="terms-checkbox"]');

        await page.click('[data-testid="register-button"]');

        // Should redirect to booking flow
        await page.waitForURL('**/booking/**');

        // Complete booking details
        await page.fill(
          '[data-testid="storage-requirements"]',
          'Need space for e-commerce inventory'
        );
        await page.selectOption('[data-testid="goods-category"]', 'general-merchandise');
        await page.check('[data-testid="insurance-confirmation"]');

        // Payment information
        await page.fill('[data-testid="card-number"]', '4242 4242 4242 4242');
        await page.fill('[data-testid="card-expiry"]', '12/25');
        await page.fill('[data-testid="card-cvc"]', '123');
        await page.fill('[data-testid="billing-postal"]', 'M5V 3A8');

        // Review and confirm
        await page.click('[data-testid="review-booking"]');
        await expect(page.locator('[data-testid="booking-summary"]')).toBeVisible();
        await page.click('[data-testid="confirm-booking"]');

        // Booking confirmation
        await page.waitForURL('**/booking/confirmation**');
        await expect(page.locator('[data-testid="booking-reference"]')).toBeVisible();
        await expect(page.locator('[data-testid="confirmation-message"]')).toContainText(
          'successfully booked'
        );

        // Download confirmation PDF
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.click('[data-testid="download-confirmation"]'),
        ]);

        expect(download.suggestedFilename()).toContain('booking-confirmation');
      });
    });

    test('Existing customer can quickly book additional space', async ({ page }) => {
      // Login
      await page.goto('/login');
      await page.fill('[data-testid="email"]', 'existing@customer.com');
      await page.fill('[data-testid="password"]', 'password123');
      await page.click('[data-testid="login-button"]');

      // Quick search from dashboard
      await page.waitForURL('**/dashboard');
      await page.click('[data-testid="quick-search"]');

      // Use saved preferences
      await expect(page.locator('[data-testid="saved-preferences"]')).toBeVisible();
      await page.click('[data-testid="use-saved-preferences"]');

      // Results should be pre-filtered
      await expect(page.locator('[data-testid="warehouse-card"]')).toHaveCount(2, {
        timeout: 5000,
      });

      // Quick book from search results
      await page.click('[data-testid="quick-book"]:first-child');

      // Verify express checkout
      await expect(page.locator('[data-testid="express-checkout"]')).toBeVisible();
      await expect(page.locator('[data-testid="saved-payment"]')).toBeChecked();

      await page.click('[data-testid="confirm-express-booking"]');

      // Instant confirmation
      await expect(page.locator('[data-testid="instant-confirmation"]')).toBeVisible({
        timeout: 3000,
      });
    });
  });

  test.describe('Operator Journey: Onboarding and Management', () => {
    test('New operator can register and list warehouses', async ({ page }) => {
      await test.step('Operator registration', async () => {
        await page.goto('/become-a-partner');

        // Verify value proposition
        await expect(page.locator('h1')).toContainText('List Your Warehouse');
        await expect(page.locator('text=Increase occupancy')).toBeVisible();

        // Start registration
        await page.click('[data-testid="get-started"]');

        // Company information
        await page.fill('[data-testid="legal-name"]', 'Logistics Solutions Inc');
        await page.fill('[data-testid="business-number"]', '123456789');
        await page.fill('[data-testid="primary-contact"]', 'Jane Smith');
        await page.fill('[data-testid="email"]', 'jane@logistics.com');
        await page.fill('[data-testid="phone"]', '+1 416-555-0123');

        // Operating details
        await page.selectOption('[data-testid="regions"]', ['ontario', 'quebec']);
        await page.fill('[data-testid="warehouse-count"]', '3');

        await page.click('[data-testid="next-step"]');
      });

      await test.step('Add first warehouse', async () => {
        // Warehouse basic info
        await page.fill('[data-testid="warehouse-name"]', 'Downtown Toronto Facility');
        await page.fill('[data-testid="address"]', '123 King St W');
        await page.fill('[data-testid="city"]', 'Toronto');
        await page.fill('[data-testid="postal"]', 'M5H 1A1');

        // Specifications
        await page.fill('[data-testid="total-size"]', '35000');
        await page.fill('[data-testid="ceiling-height"]', '30');
        await page.fill('[data-testid="loading-docks"]', '4');

        // Features
        await page.check('text=24/7 Access');
        await page.check('text=Climate Control');
        await page.check('text=Security System');
        await page.check('text=Office Space');

        // Upload images
        await page.setInputFiles('[data-testid="warehouse-images"]', [
          'test-assets/warehouse-exterior.jpg',
          'test-assets/warehouse-interior.jpg',
          'test-assets/loading-dock.jpg',
        ]);

        // Pricing
        await page.fill('[data-testid="base-price"]', '15.00');
        await page.selectOption('[data-testid="pricing-model"]', 'per-sqft-monthly');

        await page.click('[data-testid="save-warehouse"]');

        // Verify warehouse saved
        await expect(page.locator('[data-testid="warehouse-saved"]')).toBeVisible();
      });

      await test.step('Complete compliance requirements', async () => {
        // Insurance
        await page.click('[data-testid="upload-insurance"]');
        await page.setInputFiles('[data-testid="insurance-doc"]', 'test-assets/insurance.pdf');

        // Business license
        await page.setInputFiles('[data-testid="business-license"]', 'test-assets/license.pdf');

        // Banking
        await page.fill('[data-testid="bank-name"]', 'TD Bank');
        await page.fill('[data-testid="account-number"]', '1234567890');
        await page.fill('[data-testid="transit-number"]', '00123');

        // Terms
        await page.check('[data-testid="platform-terms"]');
        await page.check('[data-testid="insurance-acknowledgment"]');

        await page.click('[data-testid="submit-for-review"]');

        // Confirmation
        await expect(page.locator('[data-testid="submission-success"]')).toBeVisible();
        await expect(page.locator('text=under review')).toBeVisible();
      });
    });
  });

  test.describe('Warehouse Staff Journey: Daily Operations', () => {
    test('Staff member can manage check-ins and check-outs', async ({ page, browserName }) => {
      // Mobile-first test for warehouse staff
      if (browserName === 'chromium') {
        await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
      }

      await test.step('Login and view daily schedule', async () => {
        await page.goto('/login');
        await page.fill('[data-testid="email"]', 'staff@warehouse.com');
        await page.fill('[data-testid="password"]', 'staffpass123');
        await page.click('[data-testid="login-button"]');

        await page.waitForURL('**/staff/dashboard');

        // Verify mobile-optimized layout
        await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();

        // Today's schedule
        await expect(page.locator('[data-testid="todays-schedule"]')).toBeVisible();
        await expect(page.locator('[data-testid="check-in-count"]')).toContainText('3');
        await expect(page.locator('[data-testid="check-out-count"]')).toContainText('2');
      });

      await test.step('Process check-in', async () => {
        await page.click('[data-testid="pending-checkins"]');

        const firstCheckIn = page.locator('[data-testid="checkin-item"]').first();
        await firstCheckIn.click();

        // Verify booking details
        await expect(page.locator('[data-testid="customer-name"]')).toBeVisible();
        await expect(page.locator('[data-testid="booking-reference"]')).toBeVisible();
        await expect(page.locator('[data-testid="space-allocation"]')).toBeVisible();

        // Start check-in process
        await page.click('[data-testid="start-checkin"]');

        // Verify documents
        await page.check('[data-testid="id-verified"]');
        await page.check('[data-testid="insurance-verified"]');

        // Take arrival photos
        await page.click('[data-testid="take-photo"]');
        // Simulate camera (in real test, would use file upload)
        await page.setInputFiles('[data-testid="photo-upload"]', 'test-assets/arrival-photo.jpg');

        // Assign space
        await page.selectOption('[data-testid="assign-bay"]', 'Bay A-12');

        // Complete check-in
        await page.click('[data-testid="complete-checkin"]');

        // Confirmation
        await expect(page.locator('[data-testid="checkin-success"]')).toBeVisible();

        // Send notification to customer
        await page.click('[data-testid="notify-customer"]');
      });

      await test.step('Report an issue', async () => {
        await page.click('[data-testid="report-issue"]');

        await page.selectOption('[data-testid="issue-type"]', 'damage');
        await page.fill('[data-testid="issue-description"]', 'Minor damage to loading dock door');
        await page.setInputFiles('[data-testid="issue-photo"]', 'test-assets/damage-photo.jpg');
        await page.selectOption('[data-testid="severity"]', 'medium');

        await page.click('[data-testid="submit-issue"]');

        await expect(page.locator('[data-testid="issue-submitted"]')).toBeVisible();
        await expect(page.locator('[data-testid="issue-reference"]')).toBeVisible();
      });
    });
  });

  test.describe('Cross-Persona Interaction: Dispute Resolution', () => {
    test('Customer and operator can resolve a dispute', async ({ context }) => {
      // Open two pages for different users
      const customerPage = await context.newPage();
      const operatorPage = await context.newPage();

      await test.step('Customer reports damage', async () => {
        await customerPage.goto('/login');
        await customerPage.fill('[data-testid="email"]', 'customer@test.com');
        await customerPage.fill('[data-testid="password"]', 'customerpass');
        await customerPage.click('[data-testid="login-button"]');

        await customerPage.goto('/bookings/12345');
        await customerPage.click('[data-testid="report-issue"]');

        await customerPage.selectOption('[data-testid="issue-type"]', 'damage-claim');
        await customerPage.fill(
          '[data-testid="damage-description"]',
          'Damaged inventory during storage'
        );
        await customerPage.fill('[data-testid="estimated-value"]', '2500');
        await customerPage.setInputFiles('[data-testid="evidence-photos"]', [
          'test-assets/damage1.jpg',
          'test-assets/damage2.jpg',
        ]);

        await customerPage.click('[data-testid="submit-claim"]');

        await expect(customerPage.locator('[data-testid="claim-submitted"]')).toBeVisible();
      });

      await test.step('Operator responds to dispute', async () => {
        await operatorPage.goto('/login');
        await operatorPage.fill('[data-testid="email"]', 'operator@test.com');
        await operatorPage.fill('[data-testid="password"]', 'operatorpass');
        await operatorPage.click('[data-testid="login-button"]');

        // Check notification
        await expect(operatorPage.locator('[data-testid="dispute-notification"]')).toBeVisible();
        await operatorPage.click('[data-testid="view-dispute"]');

        // Review claim
        await expect(operatorPage.locator('[data-testid="claim-details"]')).toBeVisible();
        await operatorPage.click('[data-testid="view-evidence"]');

        // Respond
        await operatorPage.fill(
          '[data-testid="operator-response"]',
          'We acknowledge the issue and are investigating'
        );
        await operatorPage.click('[data-testid="request-inspection"]');

        await expect(operatorPage.locator('[data-testid="inspection-scheduled"]')).toBeVisible();
      });

      await test.step('Platform mediates resolution', async () => {
        // Super admin view
        const adminPage = await context.newPage();
        await adminPage.goto('/admin/disputes/pending');

        // Would continue with mediation flow...
      });
    });
  });
});

// Performance monitoring during tests
test.describe('Performance Metrics Collection', () => {
  test('Collect Core Web Vitals during user journey', async ({ page }) => {
    await page.goto('/');

    // Inject web vitals collection
    await page.addInitScript(() => {
      window.vitals = {
        lcp: [],
        fid: [],
        cls: [],
        fcp: [],
        ttfb: [],
      };

      // Observe LCP
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.vitals.lcp.push(entry.startTime);
        }
      }).observe({ entryTypes: ['largest-contentful-paint'] });

      // Observe FID
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.vitals.fid.push(entry.processingStart - entry.startTime);
        }
      }).observe({ entryTypes: ['first-input'] });

      // Observe CLS
      let clsScore = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsScore += entry.value;
            window.vitals.cls.push(clsScore);
          }
        }
      }).observe({ entryTypes: ['layout-shift'] });
    });

    // Navigate through critical user flow
    await page.fill('[placeholder="Type of space, size, or features..."]', 'warehouse');
    await page.click('button:has-text("Search")');
    await page.waitForURL('**/search**');

    // Collect metrics
    const metrics = await page.evaluate(() => window.vitals);

    // Assert performance thresholds
    const lastLCP = metrics.lcp[metrics.lcp.length - 1];
    expect(lastLCP).toBeLessThan(2500); // Good LCP

    const lastCLS = metrics.cls[metrics.cls.length - 1];
    expect(lastCLS).toBeLessThan(0.1); // Good CLS

    // Log metrics for monitoring
    console.log('Performance Metrics:', {
      LCP: lastLCP,
      CLS: lastCLS,
      vitals: metrics,
    });
  });
});
