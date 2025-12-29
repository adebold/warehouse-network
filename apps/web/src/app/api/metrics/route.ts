import { NextRequest, NextResponse } from 'next/server';

import { register } from '@/lib/metrics';

export async function GET(request: NextRequest) {
  try {
    // Optional: Add authentication check here
    // const authHeader = request.headers.get('authorization');
    // if (!isValidPrometheusAuth(authHeader)) {
    //   return new NextResponse('Unauthorized', { status: 401 });
    // }
    
    // Get metrics from Prometheus register
    const metrics = await register.metrics();
    
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': register.contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error generating metrics:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}