import {
  Users,
  Search,
  Eye,
  UserPlus,
  Mail,
  Building,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  RefreshCw
} from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import log from '@/lib/client-logger';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  lastLogin?: string;
  onboardingProgress: number;
  onboardingComplete: boolean;
  customer?: {
    id: string;
    name: string;
    accountStatus: string;
  };
  operatorUser?: {
    operator: {
      id: string;
      legalName: string;
      status: string;
    };
  };
}

interface OnboardingStats {
  totalUsers: number;
  onboardingInProgress: number;
  onboardingComplete: number;
  averageCompletionTime: number;
  dropOffPoints: Array<{
    stepName: string;
    dropOffRate: number;
  }>;
}

// Move helper functions outside component to make them available to modal
const getStatusBadge = (status: string) => {
  const variants = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
    ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    SUSPENDED: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
    APPLIED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
    APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
  };
  
  return (
    <Badge className={variants[status as keyof typeof variants] || variants.inactive}>
      {status}
    </Badge>
  );
};

export const UserManagementDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [onboardingStats, setOnboardingStats] = useState<OnboardingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [_selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [usersResponse, statsResponse] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/onboarding-stats')
      ]);

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData);
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setOnboardingStats(statsData);
      }
    } catch (error) {
      log.error('Failed to load data', error as Error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.operatorUser?.operator?.legalName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // getStatusBadge function moved outside component

  const getRoleBadge = (role: string) => {
    const variants = {
      SUPER_ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      OPERATOR_ADMIN: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      WAREHOUSE_STAFF: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
      CUSTOMER_ADMIN: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      CUSTOMER_USER: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
    };
    
    return (
      <Badge className={variants[role as keyof typeof variants] || variants.CUSTOMER_USER}>
        {role.replace('_', ' ')}
      </Badge>
    );
  };

  const handleStartOnboarding = async (userId: string, flowId: string) => {
    try {
      await fetch('/api/admin/start-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, flowId })
      });
      
      loadData(); // Refresh data
    } catch (error) {
      log.error('Failed to start onboarding', error as Error);
    }
  };

  const handleResetOnboarding = async (userId: string) => {
    try {
      await fetch('/api/admin/reset-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      loadData(); // Refresh data
    } catch (error) {
      log.error('Failed to reset onboarding', error as Error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage users and onboarding flows</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {onboardingStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onboardingStats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                Active platform users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Onboarding In Progress</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onboardingStats.onboardingInProgress}</div>
              <p className="text-xs text-muted-foreground">
                Users currently onboarding
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Onboarding</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onboardingStats.onboardingComplete}</div>
              <p className="text-xs text-muted-foreground">
                {Math.round((onboardingStats.onboardingComplete / onboardingStats.totalUsers) * 100)}% completion rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Completion Time</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onboardingStats.averageCompletionTime}min</div>
              <p className="text-xs text-muted-foreground">
                Average time to complete
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="OPERATOR_ADMIN">Operator Admin</SelectItem>
                  <SelectItem value="WAREHOUSE_STAFF">Warehouse Staff</SelectItem>
                  <SelectItem value="CUSTOMER_ADMIN">Customer Admin</SelectItem>
                  <SelectItem value="CUSTOMER_USER">Customer User</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Users ({filteredUsers.length})
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>{getStatusBadge(user.status)}</TableCell>
                  <TableCell>
                    {user.customer?.name || user.operatorUser?.operator?.legalName || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Progress value={user.onboardingProgress} className="h-2" />
                      <div className="text-xs text-muted-foreground">
                        {user.onboardingProgress}% complete
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedUser(user)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl">
                        <DialogHeader>
                          <DialogTitle>User Details: {user.name}</DialogTitle>
                        </DialogHeader>
                        <UserDetailsModal user={user} onStartOnboarding={handleStartOnboarding} onResetOnboarding={handleResetOnboarding} />
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Drop-off Analysis */}
      {onboardingStats?.dropOffPoints && onboardingStats.dropOffPoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Onboarding Drop-off Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {onboardingStats.dropOffPoints.map((point, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">{point.stepName}</h4>
                    <p className="text-sm text-muted-foreground">
                      High drop-off rate detected
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-red-600">
                      {Math.round(point.dropOffRate)}%
                    </div>
                    <div className="text-sm text-muted-foreground">drop-off rate</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

interface UserDetailsModalProps {
  user: User;
  onStartOnboarding: (userId: string, flowId: string) => void;
  onResetOnboarding: (userId: string) => void;
}

const UserDetailsModal: React.FC<UserDetailsModalProps> = ({
  user,
  onStartOnboarding,
  onResetOnboarding
}) => {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="actions">Actions</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{user.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {user.customer && (
                <>
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span>{user.customer.name}</span>
                  </div>
                  <div>Status: {getStatusBadge(user.customer.accountStatus)}</div>
                </>
              )}
              {user.operatorUser && (
                <>
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span>{user.operatorUser.operator.legalName}</span>
                  </div>
                  <div>Status: {getStatusBadge(user.operatorUser.operator.status)}</div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="onboarding" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Onboarding Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Overall Progress</span>
                <span>{user.onboardingProgress}%</span>
              </div>
              <Progress value={user.onboardingProgress} />
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Status</h4>
              <div className="flex items-center gap-2">
                {user.onboardingComplete ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <Clock className="h-4 w-4 text-yellow-600" />
                )}
                <span>
                  {user.onboardingComplete ? 'Complete' : 'In Progress'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="activity" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Activity timeline would go here...
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="actions" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Onboarding Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Button 
                onClick={() => onStartOnboarding(user.id, 'customer')}
                variant="outline"
              >
                Start Customer Onboarding
              </Button>
              <Button 
                onClick={() => onStartOnboarding(user.id, 'operator')}
                variant="outline"
              >
                Start Operator Onboarding
              </Button>
              <Button 
                onClick={() => onResetOnboarding(user.id)}
                variant="destructive"
              >
                Reset Onboarding
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default UserManagementDashboard;