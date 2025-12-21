# Warehouse Network Style Guide

## Overview

This style guide documents the design system implementation for the Warehouse Network application. The design system ensures consistency, accessibility, and maintainability across all UI components and pages.

## Design System Architecture

### Core Files

- **Design Tokens**: `/lib/design-system/tokens.ts`
- **Theme System**: `/lib/design-system/theme.ts`
- **Global Styles**: `/styles/globals.css`
- **Tailwind Config**: `/tailwind.config.js`
- **Components**: `/components/ui/`

## Color System

### Brand Colors

```typescript
primary: {
  50: '#E0F2FE',   // Lightest blue
  100: '#BAE6FD',
  200: '#7DD3FC',
  300: '#38BDF8',
  400: '#0EA5E9',
  500: '#0284C7',   // Primary brand color
  600: '#0369A1',
  700: '#075985',
  800: '#0C4A6E',
  900: '#164E63',   // Darkest blue
}
```

### Semantic Colors

- **Success**: Green tones for positive actions/states
- **Warning**: Amber tones for cautionary states
- **Error**: Red tones for errors/destructive actions
- **Info**: Blue tones for informational content

### Theme Variables

All colors are defined as HSL values in CSS variables for easy theme switching:

```css
--background: 0 0% 100%; /* White in light mode */
--foreground: 220 90% 10%; /* Near black text */
--card: 0 0% 100%; /* White cards */
--muted: 210 40% 96%; /* Light gray backgrounds */
--primary: 200 98% 39%; /* Brand blue */
```

## Typography

### Font Families

- **Primary**: Inter (sans-serif) - Used for all UI text
- **Monospace**: JetBrains Mono - Used for code and data

### Font Sizes

```typescript
text-xs: 0.75rem;     // 12px
text-sm: 0.875rem;    // 14px
text-base: 1rem;      // 16px
text-lg: 1.125rem;    // 18px
text-xl: 1.25rem;     // 20px
text-2xl: 1.5rem;     // 24px
text-3xl: 1.875rem;   // 30px
text-4xl: 2.25rem;    // 36px
```

### Font Weights

- **Regular**: 400 - Body text
- **Medium**: 500 - Emphasized text
- **Semibold**: 600 - Headings
- **Bold**: 700 - Strong emphasis

## Spacing System

Based on a 4px grid system:

```typescript
0: 0
1: 0.25rem  // 4px
2: 0.5rem   // 8px
3: 0.75rem  // 12px
4: 1rem     // 16px
6: 1.5rem   // 24px
8: 2rem     // 32px
12: 3rem    // 48px
16: 4rem    // 64px
```

## Component Guidelines

### Buttons

```tsx
// Primary action
<Button>Save Changes</Button>

// Secondary action
<Button variant="secondary">Cancel</Button>

// Destructive action
<Button variant="destructive">Delete</Button>

// Ghost button (no background)
<Button variant="ghost">View More</Button>

// With icon
<Button>
  <Settings className="w-4 h-4 mr-2" />
  Settings
</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

### Forms

#### Input Fields

```tsx
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    placeholder="john@example.com"
    startIcon={<Mail className="h-4 w-4" />}
  />
</div>
```

#### Select Dropdowns

```tsx
<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Choose an option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

### Cards

```tsx
<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Brief description</CardDescription>
  </CardHeader>
  <CardContent>{/* Card content */}</CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Tables

```tsx
<DataTable columns={columns} data={data} searchKey="name" filters={filters} />
```

### Dialogs/Modals

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description text</DialogDescription>
    </DialogHeader>
    {/* Dialog content */}
    <DialogFooter>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Layout Components

### AppLayout (Customer Pages)

```tsx
<AppLayout>
  <div className="space-y-6">{/* Page content */}</div>
</AppLayout>
```

### DashboardLayout (Admin Pages)

```tsx
<DashboardLayout>
  <div className="space-y-6">{/* Admin content */}</div>
</DashboardLayout>
```

### AuthLayout (Login/Register)

```tsx
<AuthLayout title="Welcome back" subtitle="Sign in to your account">
  {/* Auth form */}
</AuthLayout>
```

## Dark Mode

The application supports automatic dark mode based on system preferences and manual toggle:

### Using Dark Mode Classes

```tsx
// Text that changes color
<p className="text-foreground">Adapts to theme</p>

// Background that changes
<div className="bg-card">Card background</div>

// Border that adapts
<div className="border border-border">With border</div>
```

### Theme Toggle Component

The theme toggle is automatically included in all layouts. For custom implementations:

```tsx
import { ThemeToggle } from '@/components/ui/theme-toggle';

<ThemeToggle />;
```

## Responsive Design

### Breakpoints

```typescript
sm: 640px   // Mobile landscape
md: 768px   // Tablet
lg: 1024px  // Desktop
xl: 1280px  // Large desktop
2xl: 1536px // Extra large
```

### Responsive Utilities

```tsx
// Hide on mobile
<div className="hidden md:block">Desktop only</div>

// Stack on mobile, row on desktop
<div className="flex flex-col md:flex-row">

// Responsive padding
<div className="p-4 md:p-6 lg:p-8">

// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

## Loading States

### Skeleton Components

```tsx
// Card skeleton
<SkeletonCard />

// Table skeleton
<SkeletonTable rows={5} />

// Custom skeleton
<Skeleton className="h-4 w-[200px]" />
```

### Spinner

```tsx
// Default spinner
<Spinner />

// With size
<Spinner size="sm" />
<Spinner size="lg" />

// Loading overlay
<LoadingOverlay message="Loading data..." />
```

## Accessibility

### Focus States

All interactive elements have visible focus states:

```css
focus:outline-none
focus:ring-2
focus:ring-ring
focus:ring-offset-2
```

### ARIA Labels

Always provide proper ARIA labels:

```tsx
<Button aria-label="Close dialog">
  <X className="h-4 w-4" />
</Button>
```

### Keyboard Navigation

- All components support keyboard navigation
- Tab order follows visual hierarchy
- Escape key closes modals/dropdowns

## Best Practices

### 1. Use Semantic Colors

```tsx
// ✅ Good
<div className="bg-destructive text-destructive-foreground">

// ❌ Bad
<div className="bg-red-500 text-white">
```

### 2. Consistent Spacing

```tsx
// ✅ Good - uses spacing scale
<div className="p-4 space-y-4">

// ❌ Bad - arbitrary values
<div className="p-[18px] space-y-[22px]">
```

### 3. Component Composition

```tsx
// ✅ Good - composed with existing components
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    <Button>Action</Button>
  </CardContent>
</Card>

// ❌ Bad - recreating styles
<div className="rounded-lg border bg-card p-6">
  <h3 className="text-lg font-semibold">Title</h3>
  <button className="px-4 py-2 bg-primary text-white rounded">
    Action
  </button>
</div>
```

### 4. Responsive First

```tsx
// ✅ Good - mobile first
<div className="text-sm md:text-base lg:text-lg">

// ❌ Bad - desktop first
<div className="text-lg max-md:text-base max-sm:text-sm">
```

## Migration Guide

### Replacing Hard-coded Colors

```tsx
// Before
<div className="bg-gray-50 text-gray-900">
<div className="hover:bg-gray-100">

// After
<div className="bg-muted text-foreground">
<div className="hover:bg-muted/80">
```

### Updating Buttons

```tsx
// Before
<button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">

// After
<Button>Click me</Button>
```

### Using Layouts

```tsx
// Before
export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav>{/* Custom nav */}</nav>
      <main>{/* Content */}</main>
    </div>
  );
}

// After
export default function AdminPage() {
  return <DashboardLayout>{/* Content */}</DashboardLayout>;
}
```

## Testing Checklist

- [ ] All text is readable in both light and dark modes
- [ ] Interactive elements have visible focus states
- [ ] Forms are properly labeled
- [ ] Loading states are implemented
- [ ] Error states are clearly communicated
- [ ] Mobile experience is optimized
- [ ] Keyboard navigation works throughout
- [ ] Color contrast meets WCAG AA standards

## Support

For questions or issues with the design system:

1. Check the component documentation in `/docs/DESIGN_SYSTEM.md`
2. Review the example implementations in existing pages
3. Refer to the design tokens in `/lib/design-system/tokens.ts`
