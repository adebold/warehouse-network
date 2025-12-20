# Warehouse Network Design System

## Overview

The Warehouse Network design system is a comprehensive collection of design tokens, components, and patterns that ensure consistency across the application. It provides full support for light and dark themes, accessibility features, and responsive design.

## Design Tokens

### Colors

Our color system is built on semantic naming and includes:

- **Brand Colors**: Primary brand identity colors
- **Semantic Colors**: Success, warning, error, and info states
- **Neutral Colors**: Grayscale palette for backgrounds and text

### Typography

- **Font Family**: Inter for body text, JetBrains Mono for code
- **Font Sizes**: From `xs` (12px) to `9xl` (128px)
- **Font Weights**: From thin (100) to black (900)
- **Line Heights**: From none (1) to loose (2)

### Spacing

Consistent spacing scale from `0` to `96` (24rem), including:
- Fractional values: `0.5`, `1.5`, `2.5`, `3.5`
- Standard increments: `4`, `8`, `12`, `16`, `20`, etc.

### Shadows

Multiple shadow levels from `sm` to `2xl` for depth and hierarchy.

## Theme System

### Light Theme
```javascript
import { lightTheme, applyTheme } from '@/lib/design-system/theme'

// Apply light theme
applyTheme(lightTheme)
```

### Dark Theme
```javascript
import { darkTheme, applyTheme } from '@/lib/design-system/theme'

// Apply dark theme
applyTheme(darkTheme)
```

### Theme Switching
```javascript
import { getThemeFromLocalStorage } from '@/lib/design-system/theme'

// Get user's theme preference
const theme = getThemeFromLocalStorage()
```

## Components

### Button

Versatile button component with multiple variants and sizes.

```tsx
import { Button } from '@/components/ui'

// Variants
<Button variant="default">Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
<Button variant="destructive">Destructive</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
<Button size="icon"><IconName /></Button>
```

### Input

Flexible input component with icon support and states.

```tsx
import { Input } from '@/components/ui'
import { Search, Mail } from 'lucide-react'

// Basic input
<Input placeholder="Enter text..." />

// With icons
<Input 
  placeholder="Search..." 
  startIcon={<Search className="h-4 w-4" />} 
/>

// Different states
<Input state="error" />
<Input state="success" />

// Variants
<Input variant="filled" />
<Input variant="ghost" />
```

### Select

Accessible select component with custom styling.

```tsx
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui'

<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select an option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
    <SelectItem value="option3">Option 3</SelectItem>
  </SelectContent>
</Select>
```

### Table

Comprehensive table system with built-in DataTable component.

```tsx
import { DataTable } from '@/components/ui'

const columns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'status', header: 'Status' },
]

const data = [
  { id: 1, name: 'Item 1', status: 'Active' },
  { id: 2, name: 'Item 2', status: 'Inactive' },
]

<DataTable 
  columns={columns} 
  data={data}
  onRowClick={(item) => console.log(item)}
/>
```

### Dialog/Modal

Accessible modal dialogs for user interactions.

```tsx
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui'

<Dialog>
  <DialogTrigger>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>
        Dialog description goes here.
      </DialogDescription>
    </DialogHeader>
    {/* Dialog content */}
  </DialogContent>
</Dialog>
```

### Loading States

Various loading components for different use cases.

```tsx
import { 
  Skeleton, 
  SkeletonCard, 
  Spinner, 
  LoadingOverlay 
} from '@/components/ui'

// Basic skeleton
<Skeleton className="h-4 w-[200px]" />

// Pre-built patterns
<SkeletonCard />
<SkeletonTable rows={5} columns={4} />

// Spinner
<Spinner size="lg" />

// Full page loading
<LoadingOverlay text="Loading..." />
```

### Navigation

Comprehensive navigation components.

```tsx
import { 
  NavigationMenu, 
  Breadcrumb, 
  TabNavigation, 
  Sidebar 
} from '@/components/ui'

// Navigation menu
const navItems = [
  { title: 'Home', href: '/' },
  { title: 'About', href: '/about' },
  { title: 'Contact', href: '/contact' },
]

<NavigationMenu items={navItems} />

// Breadcrumb
const breadcrumbs = [
  { title: 'Home', href: '/' },
  { title: 'Products', href: '/products' },
  { title: 'Details' },
]

<Breadcrumb items={breadcrumbs} />

// Tab navigation
const tabs = [
  { title: 'Tab 1', value: 'tab1' },
  { title: 'Tab 2', value: 'tab2' },
]

<TabNavigation 
  items={tabs} 
  value={activeTab} 
  onValueChange={setActiveTab} 
/>
```

## Utility Classes

### Container
```html
<div className="container">
  <!-- Centered content with responsive padding -->
</div>
```

### Card Hover Effect
```html
<div className="card-hover">
  <!-- Card with hover animation -->
</div>
```

### Links
```html
<a href="#" className="link">Styled link</a>
```

### Badges
```html
<span className="badge bg-primary text-primary-foreground">
  New
</span>
```

## Accessibility

All components are built with accessibility in mind:

- Proper ARIA labels and roles
- Keyboard navigation support
- Focus management
- Screen reader compatibility
- High contrast mode support

## Responsive Design

The design system is mobile-first with breakpoints:

- `sm`: 640px
- `md`: 768px  
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

## Best Practices

1. **Use semantic color names** - Prefer `text-foreground` over `text-gray-900`
2. **Leverage design tokens** - Import and use tokens for consistency
3. **Compose components** - Build complex UIs by combining simple components
4. **Maintain accessibility** - Always include proper labels and keyboard support
5. **Test in both themes** - Ensure components work in light and dark modes

## Extending the System

### Adding New Colors
```javascript
// In tokens.ts
export const tokens = {
  colors: {
    custom: {
      DEFAULT: '#custom-color',
      // Add shades...
    }
  }
}
```

### Creating Custom Components
```tsx
import { cn } from '@/lib/utils'
import { tokens } from '@/lib/design-system/tokens'

export function CustomComponent({ className, ...props }) {
  return (
    <div 
      className={cn(
        "rounded-md bg-card p-4",
        className
      )}
      {...props}
    />
  )
}
```

## Migration Guide

To integrate the design system into existing components:

1. Replace hardcoded colors with semantic variables
2. Update spacing to use the spacing scale
3. Replace custom buttons with the Button component
4. Use the provided form components
5. Apply consistent typography classes

## Resources

- Design Tokens: `/lib/design-system/tokens.ts`
- Theme Configuration: `/lib/design-system/theme.ts`
- Component Library: `/components/ui/`
- Utility Functions: `/lib/utils.ts`