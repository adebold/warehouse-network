-- Database Integrity Test Queries
-- Run this script to test critical database functionality

-- 1. Test Platform-Operator-Warehouse hierarchy
SELECT 'Testing Platform-Operator-Warehouse hierarchy' as test_name;
SELECT 
    p.name as platform_name,
    COUNT(DISTINCT o.id) as operator_count,
    COUNT(DISTINCT w.id) as warehouse_count
FROM "Platform" p
LEFT JOIN "Operator" o ON o."platformId" = p.id
LEFT JOIN "Warehouse" w ON w."operatorId" = o.id
GROUP BY p.id, p.name;

-- 2. Test User authentication structure
SELECT 'Testing User authentication structure' as test_name;
SELECT 
    u.role,
    COUNT(u.id) as user_count,
    COUNT(a.id) as account_count,
    COUNT(s.id) as session_count
FROM "User" u
LEFT JOIN "Account" a ON a."userId" = u.id
LEFT JOIN "Session" s ON s."userId" = u.id
GROUP BY u.role
ORDER BY u.role;

-- 3. Test Warehouse inventory management
SELECT 'Testing Warehouse inventory management' as test_name;
SELECT 
    w.name as warehouse_name,
    w.status as warehouse_status,
    COUNT(DISTINCT s.id) as skid_count,
    COUNT(DISTINCT l.id) as location_count,
    COUNT(DISTINCT pr.id) as pricing_rule_count
FROM "Warehouse" w
LEFT JOIN "Skid" s ON s."warehouseId" = w.id
LEFT JOIN "Location" l ON l."warehouseId" = w.id
LEFT JOIN "PricingRule" pr ON pr."warehouseId" = w.id
GROUP BY w.id, w.name, w.status
ORDER BY w.name;

-- 4. Test Customer-Skid relationships
SELECT 'Testing Customer-Skid relationships' as test_name;
SELECT 
    c.name as customer_name,
    c."accountStatus",
    c."paymentStatus",
    COUNT(DISTINCT s.id) as total_skids,
    COUNT(DISTINCT CASE WHEN s.status = 'STORED' THEN s.id END) as stored_skids,
    COUNT(DISTINCT rr.id) as release_requests
FROM "Customer" c
LEFT JOIN "Skid" s ON s."customerId" = c.id
LEFT JOIN "ReleaseRequest" rr ON rr."customerId" = c.id
GROUP BY c.id, c.name, c."accountStatus", c."paymentStatus"
ORDER BY c.name;

-- 5. Test RFQ-Quote workflow
SELECT 'Testing RFQ-Quote workflow' as test_name;
SELECT 
    rfq.status as rfq_status,
    COUNT(DISTINCT rfq.id) as rfq_count,
    COUNT(DISTINCT q.id) as quote_count,
    AVG(q."depositAmount") as avg_deposit_amount
FROM "RFQ" rfq
LEFT JOIN "Quote" q ON q."rfqId" = rfq.id
GROUP BY rfq.status;

-- 6. Test financial tracking
SELECT 'Testing financial tracking' as test_name;
SELECT 
    'Operator Ledger' as financial_type,
    COUNT(*) as entry_count,
    SUM(CASE WHEN type = 'CHARGE' THEN amount ELSE 0 END) as total_charges,
    SUM(CASE WHEN type = 'PAYOUT' THEN amount ELSE 0 END) as total_payouts
FROM "OperatorLedgerEntry"
UNION ALL
SELECT 
    'Customer Deposits',
    COUNT(*),
    SUM(amount),
    0
FROM "Deposit"
WHERE status = 'succeeded';

-- 7. Test referral system
SELECT 'Testing referral system' as test_name;
SELECT 
    "referralType",
    status,
    COUNT(*) as count
FROM "Referral"
GROUP BY "referralType", status
ORDER BY "referralType", status;

-- 8. Test dispute tracking
SELECT 'Testing dispute tracking' as test_name;
SELECT 
    type as dispute_type,
    status as dispute_status,
    COUNT(*) as dispute_count
FROM "Dispute"
GROUP BY type, status
ORDER BY type, status;

-- 9. Verify all enum values are valid
SELECT 'Testing enum value integrity' as test_name;
SELECT 
    'UserRole' as enum_type,
    role as value,
    COUNT(*) as usage_count
FROM "User"
GROUP BY role
UNION ALL
SELECT 
    'WarehouseStatus',
    status,
    COUNT(*)
FROM "Warehouse"
GROUP BY status
UNION ALL
SELECT 
    'SkidStatus',
    status,
    COUNT(*)
FROM "Skid"
GROUP BY status;

-- 10. Check for any constraint violations
SELECT 'Checking for constraint violations' as test_name;
SELECT 
    'Operators without Platform' as check_type,
    COUNT(*) as violation_count
FROM "Operator" o
LEFT JOIN "Platform" p ON o."platformId" = p.id
WHERE p.id IS NULL
UNION ALL
SELECT 
    'Users without valid role',
    COUNT(*)
FROM "User"
WHERE role NOT IN ('SUPER_ADMIN', 'WAREHOUSE_STAFF', 'FINANCE_ADMIN', 'CUSTOMER_ADMIN', 'CUSTOMER_USER', 'OPERATOR_ADMIN')
UNION ALL
SELECT 
    'Warehouses without Operator',
    COUNT(*)
FROM "Warehouse" w
LEFT JOIN "Operator" o ON w."operatorId" = o.id
WHERE o.id IS NULL;

-- Summary
SELECT '==================== TEST SUMMARY ====================' as summary;
SELECT 
    'Total tests run: 10' as info
UNION ALL
SELECT 
    'Check the results above for any anomalies or issues';