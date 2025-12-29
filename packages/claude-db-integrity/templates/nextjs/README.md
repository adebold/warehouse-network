# Next.js Template for Claude DB Integrity

This template provides a ready-to-use integration of Claude DB Integrity with Next.js applications.

## Prerequisites

Before using this template, ensure you have:

1. A Next.js project set up
2. TypeScript configured
3. Tailwind CSS installed
4. shadcn/ui components library set up

## Installation

1. **Copy template files to your Next.js project**:
   ```bash
   # Copy the components
   cp -r components/* /path/to/your/nextjs/app/components/

   # Copy the API routes
   cp -r pages/api/* /path/to/your/nextjs/app/pages/api/

   # Copy the middleware
   cp middleware.ts /path/to/your/nextjs/app/

   # Copy the config file
   cp claude-db-integrity.config.js /path/to/your/nextjs/app/
   ```

2. **Install required dependencies**:
   ```bash
   npm install lucide-react @claude-ai-platform/db-integrity
   ```

3. **Install shadcn/ui components**:
   ```bash
   npx shadcn-ui@latest add badge
   npx shadcn-ui@latest add button
   npx shadcn-ui@latest add card
   ```

4. **Configure TypeScript path mappings** in your `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"],
         "@/components/*": ["./src/components/*"],
         "@/lib/*": ["./src/lib/*"],
         "@/hooks/*": ["./src/hooks/*"],
         "@/types/*": ["./src/types/*"]
       }
     }
   }
   ```

## Usage

1. Import and use the `IntegrityDashboard` component in your pages:
   ```tsx
   import { IntegrityDashboard } from '@/components/IntegrityDashboard';

   export default function AdminPage() {
     return (
       <div className="container mx-auto p-6">
         <IntegrityDashboard />
       </div>
     );
   }
   ```

2. The API endpoints will be automatically available at:
   - `/api/integrity/check` - Check database integrity
   - `/api/integrity/check?fix=true` - Auto-fix issues

3. Configure the middleware by updating `claude-db-integrity.config.js` with your database settings.

## Features

- Real-time database integrity monitoring
- Automatic issue detection and fixing
- Visual dashboard with status indicators
- Auto-refresh capability
- Claude Flow integration for memory sync
- Comprehensive integrity checks

## Customization

- Modify `IntegrityDashboard.tsx` to customize the UI
- Update API routes to add custom checks
- Configure middleware for specific routes
- Adjust the config file for your database schema

## Note

This template uses Next.js-specific imports (`@/components/*`) that require proper TypeScript configuration. These imports will not work outside of a properly configured Next.js project.