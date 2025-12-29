import { NextRequest, NextResponse } from 'next/server';

import { trackHttpRequest } from '@/lib/metrics';

export async function metricsMiddleware(request: NextRequest) {
  const startTime = Date.now();
  const method = request.method;
  const path = request.nextUrl.pathname;
  
  // Clone the response to read status
  let response: NextResponse;
  let status = 200;
  
  try {
    // Let the request proceed
    response = NextResponse.next();
    
    // Track the request after getting response
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    
    // Log metrics after response
    if (response) {
      status = response.status || 200;
    }
    
    // Track HTTP metrics
    trackHttpRequest(method, path, status, duration);
    
    return response;
  } catch (error) {
    // Track error metrics
    const duration = (Date.now() - startTime) / 1000;
    status = 500;
    trackHttpRequest(method, path, status, duration);
    throw error;
  }
}

// Helper to extract path pattern (removes dynamic segments)
function getPathPattern(path: string): string {
  // Replace UUID patterns
  path = path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
  
  // Replace numeric IDs
  path = path.replace(/\/\d+/g, '/:id');
  
  // Common patterns
  const patterns = [
    { regex: /\/warehouses\/[^\/]+/, replacement: '/warehouses/:id' },
    { regex: /\/users\/[^\/]+/, replacement: '/users/:id' },
    { regex: /\/orders\/[^\/]+/, replacement: '/orders/:id' },
    { regex: /\/api\/[^\/]+\/[^\/]+/, replacement: '/api/:resource/:id' },
  ];
  
  patterns.forEach(({ regex, replacement }) => {
    path = path.replace(regex, replacement);
  });
  
  return path;
}