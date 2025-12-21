# Payment Control System Documentation

## Overview

The Warehouse Network platform now includes a comprehensive payment control system that allows warehouse operators to manage customer accounts based on payment status. This system prevents customers with overdue payments from performing certain operations while maintaining visibility and control.

## Key Features

### 1. Account Status Management

#### Account Status Types:

- **ACTIVE**: Normal operations allowed
- **SUSPENDED**: Limited operations, warnings displayed
- **LOCKED**: No new inventory receipts or releases allowed

#### Payment Status Types:

- **CURRENT**: Payments up to date
- **OVERDUE**: Payment past due date
- **DELINQUENT**: Severely overdue, automatic restrictions

### 2. Customer Management Dashboard

Located at `/admin/customers`, this dashboard provides:

- **Overview Cards**:
  - Total customers
  - Locked accounts count
  - Overdue accounts
  - Total outstanding amount

- **Customer Table**:
  - Account status badges
  - Payment status indicators
  - Outstanding amounts
  - Quick lock/unlock actions
  - Direct access to customer details

### 3. Account Locking Features

#### Manual Lock/Unlock:

- Operators can manually lock/unlock accounts
- Required to provide reason for audit trail
- Admin users can add override reasons
- All actions are logged with timestamp and performer

#### Lock History:

- Complete audit trail of all lock/unlock actions
- Shows who performed the action and when
- Includes reasons and override notes
- Accessible from customer detail page

### 4. Operation Restrictions

When an account is **LOCKED**:

- ❌ Cannot receive new inventory
- ❌ Cannot create release requests
- ❌ Cannot create new RFQs
- ❌ Cannot place new orders
- ✅ Can view existing inventory
- ✅ Can view account status
- ✅ Can make payments

When payment status is **DELINQUENT**:

- ❌ Cannot receive new inventory
- ⚠️ Warning displayed on all operations
- ✅ Can release existing inventory (to allow clearing warehouse)

### 5. UI Indicators

#### Account Lock Warning Component:

- Prominent alert displayed on affected pages
- Shows lock reason if available
- Provides context-appropriate messaging
- Option to show "Manage Account" button for admins

#### Inline Status Indicators:

- Lock icon for locked accounts
- Warning triangle for overdue payments
- Color-coded badges (red for locked, yellow for warning)

### 6. API Protection

All sensitive operations are protected by middleware that:

- Checks account status before allowing operation
- Returns appropriate error messages
- Logs attempted operations on locked accounts
- Provides detailed error context for UI

## Implementation Details

### Database Schema

```prisma
model Customer {
  accountStatus    CustomerAccountStatus @default(ACTIVE)
  paymentStatus    CustomerPaymentStatus @default(CURRENT)
  lockReason       String?
  lockedAt         DateTime?
  lockedBy         String?
  lockHistory      AccountLockHistory[]
  paymentDueDate   DateTime?
  overdueAmount    Float @default(0)
  totalOutstanding Float @default(0)
}

model AccountLockHistory {
  action         LockAction
  reason         String?
  performedBy    User
  timestamp      DateTime @default(now())
  overrideReason String?
  metadata       Json?
}
```

### Key API Endpoints

1. **Customer Management**:
   - `GET /api/admin/customers` - List all customers
   - `GET /api/admin/customers/[id]` - Get customer details
   - `POST /api/admin/customers/[id]/lock` - Lock/unlock account

2. **Customer Operations** (with lock checks):
   - `POST /api/customer/release-request` - Create release request
   - `POST /api/warehouse/receive` - Receive new inventory
   - `POST /api/customer/rfq` - Create new RFQ

### Middleware Usage

```typescript
import { withAccountLockCheck } from '@/lib/middleware/accountLock';

// Protect an API endpoint
export default withAccountLockCheck(handler, 'RELEASE');
```

### UI Component Usage

```tsx
import { AccountLockWarning } from '@/components/ui/account-lock-warning';

// Display warning when appropriate
<AccountLockWarning
  customer={customer}
  operation="create release requests"
  showManageButton={true}
/>;
```

## User Workflows

### For Warehouse Operators:

1. **Monitor Payment Status**:
   - Check customer dashboard regularly
   - Review overdue accounts
   - Track total outstanding amounts

2. **Lock Account for Non-Payment**:
   - Navigate to customer detail page
   - Click "Lock Account" button
   - Enter reason (e.g., "30 days overdue")
   - Confirm action

3. **Unlock After Payment**:
   - Verify payment received
   - Navigate to customer detail page
   - Click "Unlock Account" button
   - Enter reason (e.g., "Payment received - Invoice #1234")
   - Confirm action

### For Customers:

1. **Locked Account Experience**:
   - See prominent warning on dashboard
   - Understand why account is locked
   - View existing inventory (read-only)
   - Contact support for resolution

2. **Making Payments**:
   - Can still access payment pages
   - Submit payment through normal channels
   - Request unlock after payment

## Best Practices

1. **Communication**:
   - Always provide clear lock reasons
   - Notify customers before locking accounts
   - Document payment arrangements

2. **Escalation Path**:
   - Start with warnings (OVERDUE status)
   - Progress to DELINQUENT for automatic restrictions
   - Use manual LOCK as last resort

3. **Regular Review**:
   - Check locked accounts weekly
   - Review payment arrangements
   - Unlock promptly after payment

4. **Documentation**:
   - Keep detailed notes in lock reasons
   - Use override reasons for exceptions
   - Maintain communication logs

## Security Considerations

- Only admin and operator roles can lock/unlock accounts
- All actions are logged with user information
- API endpoints are protected by authentication
- Middleware prevents bypassing UI restrictions
- Lock history cannot be deleted or modified

## Future Enhancements

1. **Automated Locking**:
   - Set rules for automatic account locking
   - Configure grace periods
   - Scheduled payment status checks

2. **Notifications**:
   - Email alerts for lock/unlock events
   - SMS notifications for urgent matters
   - In-app notifications for customers

3. **Payment Integration**:
   - Direct payment links in lock notices
   - Automatic unlock on payment receipt
   - Payment plan management

4. **Reporting**:
   - Overdue aging reports
   - Lock/unlock activity reports
   - Payment recovery metrics
