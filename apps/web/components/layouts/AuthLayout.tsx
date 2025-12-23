import type { Warehouse } from '@warehouse/types';

import React from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="from-primary/10 via-primary/5 to-background flex min-h-screen flex-col bg-gradient-to-br">
      {/* Header */}
      <header className="p-4 sm:p-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <img 
              src="/brand/logo-icon.svg" 
              alt="SkidSpace" 
              className="h-8 w-8" 
            />
            <span className="text-xl font-semibold" style={{color: '#0B1220'}}>SkidSpace</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>

      {/* Footer */}
      <footer className="p-4 sm:p-6">
        <div className="text-muted-foreground mx-auto max-w-7xl text-center text-sm">
          <p>© 2025 SkidSpace. All rights reserved.</p>
          <div className="mt-2 space-x-4">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
