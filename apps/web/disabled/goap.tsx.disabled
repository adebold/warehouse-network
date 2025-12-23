/**
 * GOAP Dashboard Page
 * Autonomous Agent Management Interface
 */

import { useState } from 'react';
import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import Head from 'next/head';
import DashboardLayout from '../../components/layouts/DashboardLayout';
import { GOAPDashboard } from '../../components/goap/GoAPDashboard';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Brain, Bot, Zap, Target } from 'lucide-react';

interface GoAPPageProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

export default function GoAPPage({ user }: GoAPPageProps) {
  return (
    <>
      <Head>
        <title>GOAP System - Autonomous Agents | SkidSpace</title>
        <meta name="description" content="Goal-Oriented Action Planning system for autonomous warehouse operations" />
      </Head>

      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center">
                <Brain className="mr-3 h-8 w-8 text-blue-600" />
                GOAP System
                <Badge variant="secondary" className="ml-3 bg-green-100 text-green-800">
                  Autonomous AI
                </Badge>
              </h1>
              <p className="text-gray-600 mt-2">
                Goal-Oriented Action Planning for intelligent warehouse operations
              </p>
            </div>
          </div>

          {/* Introduction Card */}
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center text-blue-900">
                <Zap className="mr-2 h-5 w-5" />
                Autonomous Intelligence
              </CardTitle>
              <CardDescription className="text-blue-700">
                AI agents that automatically plan and execute warehouse operations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start space-x-3">
                  <Bot className="h-6 w-6 text-blue-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-blue-900">Intelligent Agents</h3>
                    <p className="text-sm text-blue-700">
                      Specialized AI agents for different warehouse roles
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <Target className="h-6 w-6 text-blue-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-blue-900">Goal-Oriented</h3>
                    <p className="text-sm text-blue-700">
                      Agents automatically plan optimal action sequences
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <Brain className="h-6 w-6 text-blue-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-blue-900">Autonomous</h3>
                    <p className="text-sm text-blue-700">
                      Self-managing warehouse operations with minimal human intervention
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Dashboard */}
          <GOAPDashboard />

          {/* System Information */}
          <Card>
            <CardHeader>
              <CardTitle>System Architecture</CardTitle>
              <CardDescription>
                Understanding the GOAP autonomous agent system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-3">Agent Types</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">Manager</Badge>
                      <span>Overall coordination and optimization</span>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">Inventory</Badge>
                      <span>Stock management and receiving</span>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">Shipping</Badge>
                      <span>Order fulfillment and logistics</span>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">Quality</Badge>
                      <span>Quality control and inspection</span>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">Robot</Badge>
                      <span>Autonomous material handling</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Core Features</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                      <span>Real-time planning with A* algorithm</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                      <span>Multi-agent coordination</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                      <span>Error recovery and adaptation</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                      <span>Performance monitoring</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
                      <span>Autonomous decision making</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  return {
    props: {
      user: {
        name: session.user?.name || null,
        email: session.user?.email || null,
        role: (session.user as any)?.role || 'user',
      },
    },
  };
};