/**
 * GOAP Dashboard Component - Real-time monitoring of autonomous agents
 */

import { 
  Activity, 
  Bot, 
  Target, 
  PlayCircle, 
  AlertTriangle,
  CheckCircle2,
  Clock,
  Brain
} from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import log from '@/lib/logger';

interface Agent {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  priority: number;
  capabilities: string[];
  location?: string;
  currentPlan?: {
    id: string;
    goal: {
      name: string;
      description: string;
    };
    status: string;
    actions: unknown[];
    progress?: number;
  };
}

interface SystemStatus {
  initialized: boolean;
  activeAgents: number;
  runningPlans: number;
  completedPlans: number;
  systemUptime: number;
}

interface Goal {
  id: string;
  name: string;
  description: string;
  priority: number;
  targetState: Record<string, { operator: string; value: number }>;
}

export const GOAPDashboard: React.FC = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch system status
  const fetchSystemStatus = async () => {
    try {
      const response = await fetch('/api/goap/system/status');
      const data = await response.json();
      
      if (data.success) {
        setSystemStatus(data.data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to fetch system status');
      log.error('System status error', err as Error);
    }
  };

  // Fetch agents
  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/goap/agents');
      const data = await response.json();
      
      if (data.success) {
        setAgents(data.data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to fetch agents');
      log.error('Agents fetch error', err as Error);
    }
  };

  // Create warehouse team
  const createWarehouseTeam = async () => {
    try {
      const response = await fetch('/api/goap/teams/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId: 'warehouse-001' })
      });
      
      if (response.ok) {
        await fetchAgents();
      }
    } catch (err) {
      log.error('Failed to create warehouse team', err as Error);
    }
  };

  // Assign test goal
  const assignTestGoal = async () => {
    const testGoal: Goal = {
      id: `test-goal-${Date.now()}`,
      name: 'Process Test Orders',
      description: 'Test goal for demonstration',
      priority: 7,
      targetState: {
        orders_in_queue: { operator: '<', value: 5 }
      }
    };

    try {
      const response = await fetch('/api/goap/goals/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          goal: testGoal,
          warehouseId: 'warehouse-001' 
        })
      });
      
      if (response.ok) {
        await fetchAgents();
      }
    } catch (err) {
      log.error('Failed to assign goal', err as Error);
    }
  };

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      await Promise.all([
        fetchSystemStatus(),
        fetchAgents()
      ]);
      setLoading(false);
    };

    loadDashboard();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchSystemStatus();
      fetchAgents();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Brain className="animate-spin h-6 w-6" />
            <span>Loading GOAP System...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline" 
              className="mt-4"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center p-6">
            <Activity className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">System Status</p>
              <div className="flex items-center">
                <div 
                  className={`w-2 h-2 rounded-full mr-2 ${
                    systemStatus?.initialized ? 'bg-green-500' : 'bg-red-500'
                  }`} 
                />
                <p className="text-2xl font-bold">
                  {systemStatus?.initialized ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <Bot className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Agents</p>
              <p className="text-2xl font-bold">{systemStatus?.activeAgents || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <PlayCircle className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Running Plans</p>
              <p className="text-2xl font-bold">{systemStatus?.runningPlans || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-6">
            <CheckCircle2 className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Completed Plans</p>
              <p className="text-2xl font-bold">{systemStatus?.completedPlans || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="plans">Active Plans</TabsTrigger>
          <TabsTrigger value="control">Control</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="mr-2 h-5 w-5" />
                System Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">System Uptime</p>
                  <p className="text-lg font-semibold">
                    {systemStatus?.systemUptime ? 
                      Math.round(systemStatus.systemUptime / 1000) + 's' : 
                      'N/A'
                    }
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Agents</p>
                  <p className="text-lg font-semibold">{agents.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Bot className="mr-2 h-5 w-5" />
                  Autonomous Agents ({agents.length})
                </div>
                <Button onClick={createWarehouseTeam} size="sm">
                  Create Team
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map((agent) => (
                  <Card key={agent.id} className="border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">{agent.name}</h3>
                        <Badge 
                          variant={agent.isActive ? "default" : "secondary"}
                          className={agent.isActive ? "bg-green-100 text-green-800" : ""}
                        >
                          {agent.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <p><span className="font-medium">Type:</span> {agent.type}</p>
                        <p><span className="font-medium">Priority:</span> {agent.priority}</p>
                        <p><span className="font-medium">Location:</span> {agent.location || 'Unknown'}</p>
                        
                        {agent.currentPlan && (
                          <div className="mt-3 p-2 bg-blue-50 rounded">
                            <p className="font-medium text-blue-800">Current Plan:</p>
                            <p className="text-blue-600">{agent.currentPlan.goal.name}</p>
                            <Badge className="mt-1" variant="outline">
                              {agent.currentPlan.status}
                            </Badge>
                          </div>
                        )}
                        
                        <div className="mt-3">
                          <p className="font-medium">Capabilities:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {agent.capabilities.slice(0, 3).map((cap) => (
                              <Badge key={cap} variant="outline" className="text-xs">
                                {cap}
                              </Badge>
                            ))}
                            {agent.capabilities.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{agent.capabilities.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {agents.length === 0 && (
                  <div className="col-span-full text-center py-8">
                    <Bot className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">No agents configured</p>
                    <Button onClick={createWarehouseTeam} className="mt-4">
                      Create Warehouse Team
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="mr-2 h-5 w-5" />
                Active Plans
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Active plans will be displayed here when agents are executing goals.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="control" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <PlayCircle className="mr-2 h-5 w-5" />
                System Control
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button onClick={createWarehouseTeam} className="w-full">
                  <Bot className="mr-2 h-4 w-4" />
                  Create Warehouse Team
                </Button>
                
                <Button onClick={assignTestGoal} variant="outline" className="w-full">
                  <Target className="mr-2 h-4 w-4" />
                  Assign Test Goal
                </Button>
              </div>
              
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">Quick Actions</h3>
                <ul className="text-sm space-y-1 text-gray-600">
                  <li>• Create agents to handle warehouse operations</li>
                  <li>• Assign goals for autonomous execution</li>
                  <li>• Monitor real-time agent activities</li>
                  <li>• View system performance metrics</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};