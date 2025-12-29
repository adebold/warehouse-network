import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    // Basic health check without complex logging
    const startTime = Date.now();
    
    // Simple health check response
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - startTime}ms`,
      environment: process.env.NODE_ENV || 'development',
    };

    // Test database connection if available
    if (process.env.DATABASE_URL) {
      try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        await prisma.$queryRaw`SELECT 1`;
        await prisma.$disconnect();
        healthData.database = 'connected';
      } catch (dbError) {
        healthData.database = 'error';
      }
    }

    return NextResponse.json(healthData, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}