import { NextRequest, NextResponse } from 'next/server';
import { ClaudeMemoryManager } from 'claude-db-integrity';

// Claude DB Integrity Middleware for Next.js
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip middleware for static assets and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  try {
    // Initialize Claude Memory Manager for request tracking
    const memoryManager = new ClaudeMemoryManager({
      claude: {
        enabled: true,
        namespace: 'nextjs-requests',
        ttl: 3600,
        syncInterval: 300
      },
      cache: {
        provider: 'memory',
        options: {}
      }
    });

    // Track page visits for integrity monitoring
    await memoryManager.store(`page-visits/${pathname}`, {
      timestamp: new Date(),
      userAgent: request.headers.get('user-agent'),
      ip: request.ip || 'unknown',
      referrer: request.headers.get('referer')
    }, {
      tags: ['page-visit', 'monitoring'],
      namespace: 'analytics'
    });

    // Check for database integrity before serving pages
    if (process.env.NODE_ENV === 'production') {
      const lastCheck = await memoryManager.retrieve('last-integrity-check', 'system');
      const now = Date.now();
      const checkInterval = 5 * 60 * 1000; // 5 minutes

      if (!lastCheck || (now - lastCheck.timestamp) > checkInterval) {
        // Run quick integrity check
        const integrityResult = await memoryManager.retrieve('quick-check-result', 'system');
        
        if (integrityResult && !integrityResult.passed) {
          // Redirect to maintenance page if critical issues found
          const url = request.nextUrl.clone();
          url.pathname = '/maintenance';
          return NextResponse.redirect(url);
        }

        // Store check timestamp
        await memoryManager.store('last-integrity-check', {
          timestamp: now,
          path: pathname
        }, { namespace: 'system' });
      }
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Claude DB Integrity middleware error:', error);
    
    // Don't block requests on middleware errors
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};