# Security Quick Start Guide

## For Frontend Developers

### 1. Making Secure API Calls

Always use the `fetchWithCSRF` helper for state-changing requests:

```tsx
import { useCSRFToken, fetchWithCSRF } from '@/hooks/useCSRFToken';

function MyComponent() {
  const { csrfToken } = useCSRFToken();

  const handleSubmit = async (data: any) => {
    try {
      const response = await fetchWithCSRF('/api/my-endpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }, csrfToken);

      if (!response.ok) {
        // Handle error
      }
    } catch (error) {
      // Handle network error
    }
  };
}
```

### 2. Form Submissions

Include the CSRF token in form data:

```tsx
<form onSubmit={handleSubmit}>
  <input type="hidden" name="_csrf" value={csrfToken} />
  {/* Other form fields */}
</form>
```

## For Backend Developers

### 1. Protecting API Routes

Apply appropriate security middleware:

```typescript
// For authentication endpoints (strict rate limiting)
import { withAuthSecurity } from '@/lib/middleware/security';
import { withCSRFProtection } from '@/lib/middleware/csrf';

export default withCSRFProtection(withAuthSecurity(handler));

// For general API endpoints
import { withApiSecurity } from '@/lib/middleware/security';

export default withCSRFProtection(withApiSecurity(handler));
```

### 2. Password Validation

Always validate passwords against the security policy:

```typescript
import { validatePassword } from '@/lib/config/security';

const passwordValidation = validatePassword(password);
if (!passwordValidation.valid) {
  return res.status(400).json({
    message: 'Password does not meet requirements',
    errors: passwordValidation.errors,
  });
}
```

### 3. Secure Password Hashing

Use the configured bcrypt rounds:

```typescript
import { securityConfig } from '@/lib/config/security';
import bcrypt from 'bcryptjs';

const hashedPassword = await bcrypt.hash(password, securityConfig.auth.bcryptRounds);
```

## Common Patterns

### Protected Page Component

```tsx
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function ProtectedPage({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
  }, [session, status]);

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  return session ? <>{children}</> : null;
}
```

### API Route with Authentication Check

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Your protected logic here
}
```

## Testing Security

Run the security test script:

```bash
npm run test:security
```

Or manually:

```bash
node scripts/test-security.js
```

## Checklist for New Features

- [ ] Apply rate limiting to new endpoints
- [ ] Add CSRF protection to state-changing operations
- [ ] Validate all user inputs
- [ ] Use parameterized queries for database operations
- [ ] Hash sensitive data before storing
- [ ] Add appropriate authentication checks
- [ ] Log security-relevant events
- [ ] Test with the security test script

## Environment Variables

Minimum required for development:

```env
NEXTAUTH_SECRET=dev-secret-change-in-production
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@localhost:5432/db
```

See `.env.example` for all available options.