# Fixing TypeScript & ESLint Errors in AI-Generated Code

## Why AI-Generated Code Has Type Errors

### Common Issues

1. **Missing Imports** - Shows code without full import statements
2. **Undefined Types** - References types not in scope
3. **Wrong Library Versions** - Code from different versions
4. **Incomplete Context** - Snippets without full file structure
5. **No Type Definitions** - Missing `.d.ts` files

## 🚀 Quick Fix (Automated)

```bash
# Run the auto-fix script
pnpm fix:all

# This will:
# 1. Auto-fix ESLint errors
# 2. Remove unused imports
# 3. Organize imports
# 4. Add missing type annotations
# 5. Format with Prettier
# 6. Run type check
```

## 🔧 Manual Fixes for Common Errors

### Error 1: "Cannot find name/module"

**Problem:**

```typescript
import { JWTService } from './jwt'; // ❌ Cannot find module
```

**Fix:**

```typescript
// 1. Check if file exists
// 2. Use correct path alias
import { JWTService } from '@varai/auth'; // ✅

// Or install missing package
// pnpm add jsonwebtoken
// pnpm add -D @types/jsonwebtoken
```

### Error 2: "Type 'X' is not assignable to type 'Y'"

**Problem:**

```typescript
const user: User = await prisma.user.findUnique({
  where: { id },
}); // ❌ Type 'User | null' is not assignable
```

**Fix:**

```typescript
// Option 1: Handle null case
const user = await prisma.user.findUnique({ where: { id } });
if (!user) {
  throw new Error('User not found');
}
// user is now User, not User | null ✅

// Option 2: Use non-null assertion (if you're sure)
const user = await prisma.user.findUnique({ where: { id } })!; // ✅

// Option 3: Use optional type
const user: User | null = await prisma.user.findUnique({ where: { id } }); // ✅
```

### Error 3: "Argument of type 'X' is not assignable"

**Problem:**

```typescript
function getUser(id: string) {}
getUser(123); // ❌ Argument of type 'number' is not assignable
```

**Fix:**

```typescript
// Option 1: Fix the type
getUser(String(123)); // ✅
getUser('123'); // ✅

// Option 2: Change function signature
function getUser(id: string | number) {
  // ✅
  const userId = String(id);
  // ...
}
```

### Error 4: "Property 'X' does not exist on type 'Y'"

**Problem:**

```typescript
req.user.id; // ❌ Property 'user' does not exist on Request
```

**Fix:**

```typescript
// Add type extension (already in packages/types/src/index.ts)
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

// Now this works:
req.user?.id; // ✅
```

### Error 5: "Object is possibly 'null' or 'undefined'"

**Problem:**

```typescript
const email = user.email; // ❌ Object is possibly 'undefined'
```

**Fix:**

```typescript
// Option 1: Optional chaining
const email = user?.email; // ✅

// Option 2: Nullish coalescing
const email = user?.email ?? 'default@example.com'; // ✅

// Option 3: Guard clause
if (!user) {
  throw new Error('User is required');
}
const email = user.email; // ✅ TypeScript knows user is defined
```

### Error 6: "Unsafe assignment of an `any` value"

**Problem:**

```typescript
const data: any = JSON.parse(input);
const userId = data.userId; // ❌ Unsafe assignment
```

**Fix:**

```typescript
// Option 1: Use validation (Zod)
import { z } from 'zod';

const DataSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
});

const data = DataSchema.parse(JSON.parse(input)); // ✅ Typed!
const userId = data.userId; // ✅ string

// Option 2: Type assertion with validation
interface Data {
  userId: string;
  email: string;
}

const data = JSON.parse(input) as Data;
// Validate manually
if (!data.userId || typeof data.userId !== 'string') {
  throw new Error('Invalid data');
}
const userId = data.userId; // ✅
```

### Error 7: "Missing return statement"

**Problem:**

```typescript
function getUser(id: string): User {
  if (cache.has(id)) {
    return cache.get(id);
  }
  // ❌ Not all code paths return a value
}
```

**Fix:**

```typescript
function getUser(id: string): User | null {
  if (cache.has(id)) {
    return cache.get(id);
  }
  return null; // ✅
}

// Or throw an error
function getUser(id: string): User {
  if (cache.has(id)) {
    return cache.get(id);
  }
  throw new Error('User not found'); // ✅
}
```

## 🎯 Best Practices to Prevent Errors

### 1. Always Use Strict Mode

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### 2. Define All Types

```typescript
// ❌ Bad
export function processData(data) {
  return data.map((item) => item.value);
}

// ✅ Good
export function processData<T extends { value: number }>(data: T[]): number[] {
  return data.map((item) => item.value);
}
```

### 3. Use Type Guards

```typescript
function isUser(obj: unknown): obj is User {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'email' in obj;
}

// Usage
if (isUser(data)) {
  console.log(data.email); // ✅ TypeScript knows it's User
}
```

### 4. Leverage Zod for Runtime Validation

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
});

type User = z.infer<typeof UserSchema>; // ✅ Type from schema

// Validate at runtime
const user = UserSchema.parse(data); // Throws if invalid
```

### 5. Use Branded Types for Type Safety

```typescript
// Already in packages/types/src/index.ts
type UserId = Brand<string, 'UserId'>;
type Email = Brand<string, 'Email'>;

function sendEmail(to: Email, subject: string) {}

const email = 'user@example.com' as Email;
sendEmail(email, 'Hello'); // ✅

const userId = '123' as UserId;
sendEmail(userId, 'Hello'); // ❌ Type error!
```

### 6. Use Result Types for Error Handling

```typescript
import { Result, Ok, Err } from '@varai/types';

async function getUser(id: string): AsyncResult<User, Error> {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return Err(new Error('User not found'));
    }
    return Ok(user);
  } catch (error) {
    return Err(error as Error);
  }
}

// Usage
const result = await getUser('123');
if (result.success) {
  console.log(result.value.email); // ✅ Typed!
} else {
  console.error(result.error.message);
}
```

## 🛠️ Tools & Scripts

### Auto-fix Everything

```bash
pnpm fix:all
```

### Individual Fixes

```bash
# Fix ESLint errors
pnpm lint:fix

# Fix imports
pnpm fix:imports

# Format code
pnpm format

# Type check
pnpm type-check
```

### Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
pnpm lint
pnpm type-check
```

## 📚 Configuration Files

All configuration files are included:

- `tsconfig.base.json` - Strict TypeScript config
- `.eslintrc.json` - Comprehensive ESLint rules
- `packages/types/src/index.ts` - Shared type definitions

## 🔍 VSCode Integration

### Recommended Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss"
  ]
}
```

### Settings

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

## 🚨 Common Mistakes to Avoid

### 1. Don't Use `any`

```typescript
// ❌ Bad
function process(data: any) {}

// ✅ Good
function process<T>(data: T) {}
function process(data: unknown) {}
```

### 2. Don't Ignore Type Errors

```typescript
// ❌ Bad
// @ts-ignore
const result = someFunction();

// ✅ Good - Fix the actual issue
const result: ExpectedType = someFunction();
```

### 3. Don't Skip Return Types on Public APIs

```typescript
// ❌ Bad
export function getUser(id) {
  return prisma.user.findUnique({ where: { id } });
}

// ✅ Good
export async function getUser(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}
```

## 💡 Pro Tips

1. **Use Type Inference**: Let TypeScript infer types when obvious
2. **Explicit Over Implicit**: Be explicit in public APIs
3. **Validate at Boundaries**: Use Zod at API boundaries
4. **Branded Types**: Use for domain-specific strings
5. **Result Types**: Better than try/catch for expected errors

## 📖 Further Reading

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [Zod Documentation](https://zod.dev/)
- [Type-safe Error Handling](https://github.com/supermacro/neverthrow)

---

**Remember**: The goal isn't zero `any` types, it's **safe, maintainable code**. Use `unknown` and type guards instead of `any` whenever possible.
