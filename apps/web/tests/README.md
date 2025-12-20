# Payment Control System Test Suite

This directory contains comprehensive tests for the payment control system in the warehouse-network application.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── middleware/         # Middleware tests
│   ├── services/          # Service layer tests
│   └── components/        # React component tests
├── integration/           # Integration tests
│   ├── api/              # API endpoint tests
│   └── pages/            # Page component integration tests
├── e2e/                  # End-to-end tests
│   ├── accountLocking.spec.ts
│   ├── paymentSubmission.spec.ts
│   └── bulkOperations.spec.ts
├── __mocks__/           # Mock implementations
├── factories/           # Test data factories
└── setup.ts            # Test configuration
```

## Running Tests

### All Tests
```bash
npm run test:all
```

### Unit Tests
```bash
npm run test              # Run once
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e         # Headless
npm run test:e2e:ui      # With UI
```

## Test Coverage

### Unit Tests Cover:

1. **Account Lock Middleware**
   - Authentication validation
   - Admin access bypass
   - Customer lock status checks
   - Error handling

2. **Notification Service**
   - Email sending (account lock/unlock)
   - Payment reminders
   - Bulk notifications
   - Notification history

3. **UI Components**
   - AccountLockWarning component
   - Payment forms
   - Status indicators

### Integration Tests Cover:

1. **Customer Lock/Unlock API**
   - Authentication/authorization
   - Lock/unlock operations
   - Validation
   - Error scenarios

2. **Bulk Operations API**
   - Bulk lock/unlock
   - Bulk reminders
   - Transaction handling
   - Partial failures

3. **Payment Dashboard API**
   - Statistics aggregation
   - Date filtering
   - Performance optimization

4. **Page Components**
   - Customer management
   - Payment dashboard
   - Overdue report

### E2E Tests Cover:

1. **Account Locking Flow**
   - Admin locks customer
   - Customer sees warning
   - Access restrictions
   - Real-time updates

2. **Payment Submission**
   - Payment form validation
   - Successful payments
   - Failed payments
   - Account unlock after payment

3. **Bulk Operations**
   - Selection and filtering
   - Bulk actions
   - CSV import/export
   - Audit trails

## Test Data

Test data is managed through:
- Mock factories for consistent test data
- Database seeding for integration tests
- Test user accounts for E2E tests

## Mocking Strategy

- **External Services**: SendGrid, Stripe mocked in unit tests
- **Database**: In-memory for unit tests, test DB for integration
- **Authentication**: Mocked sessions for faster tests
- **Network**: Playwright route interception for E2E

## CI/CD Integration

Tests run automatically on:
- Pull requests (unit + integration)
- Pre-deployment (full suite)
- Nightly builds (E2E suite)

## Best Practices

1. **Isolation**: Each test is independent
2. **Clarity**: Descriptive test names
3. **Coverage**: Edge cases and error paths
4. **Performance**: Parallel execution where possible
5. **Maintenance**: Regular updates with feature changes

## Troubleshooting

### Common Issues:

1. **Port conflicts**: Ensure ports 3000, 5432 are free
2. **Database state**: Run migrations before integration tests
3. **Flaky E2E**: Check for proper wait conditions
4. **Mock failures**: Verify mock implementations match API

### Debug Mode:

```bash
# Unit tests
DEBUG=* npm run test

# E2E tests
PWDEBUG=1 npm run test:e2e
```