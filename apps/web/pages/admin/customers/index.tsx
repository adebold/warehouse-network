import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { DashboardLayout } from '@/components/layouts/DashboardLayout'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Search,
  MoreVertical,
  Lock,
  Unlock,
  AlertTriangle,
  DollarSign,
  Calendar,
  Ban,
  CheckCircle,
  XCircle,
  History,
  FileText,
  Users,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Customer {
  id: string
  name: string
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED'
  paymentStatus: 'CURRENT' | 'OVERDUE' | 'DELINQUENT'
  lockReason?: string
  lockedAt?: string
  lockedBy?: string
  paymentDueDate?: string
  overdueAmount: number
  totalOutstanding: number
  _count: {
    skids: number
    rfqs: number
  }
}

export default function CustomersPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([])
  const [showBulkDialog, setShowBulkDialog] = useState(false)
  const [bulkAction, setBulkAction] = useState<'lock' | 'unlock'>('lock')
  const [bulkReason, setBulkReason] = useState('')
  const [bulkProcessing, setBulkProcessing] = useState(false)

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/admin/customers')
      if (response.ok) {
        const data = await response.json()
        setCustomers(data)
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLockAccount = async (customerId: string, action: 'lock' | 'unlock', reason?: string) => {
    try {
      const response = await fetch(`/api/admin/customers/${customerId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      
      if (response.ok) {
        fetchCustomers()
      }
    } catch (error) {
      console.error('Error updating account lock:', error)
    }
  }

  const handleBulkOperation = async () => {
    setBulkProcessing(true)
    try {
      const response = await fetch('/api/admin/customers/bulk-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerIds: selectedCustomers,
          action: bulkAction,
          reason: bulkReason
        })
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Successfully ${bulkAction}ed ${data.updated} accounts`)
        setSelectedCustomers([])
        setShowBulkDialog(false)
        setBulkReason('')
        fetchCustomers()
      }
    } catch (error) {
      console.error('Error performing bulk operation:', error)
      alert('Failed to perform bulk operation')
    } finally {
      setBulkProcessing(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedCustomers.length === filteredCustomers.length) {
      setSelectedCustomers([])
    } else {
      setSelectedCustomers(filteredCustomers.map(c => c.id))
    }
  }

  const toggleSelectCustomer = (customerId: string) => {
    setSelectedCustomers(prev =>
      prev.includes(customerId)
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    )
  }

  const getAccountStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>
      case 'SUSPENDED':
        return <Badge variant="warning">Suspended</Badge>
      case 'LOCKED':
        return <Badge variant="destructive">Locked</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'CURRENT':
        return <Badge variant="success">Current</Badge>
      case 'OVERDUE':
        return <Badge variant="warning">Overdue</Badge>
      case 'DELINQUENT':
        return <Badge variant="destructive">Delinquent</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const columns = [
    {
      id: 'select',
      header: ({ table }: any) => (
        <Checkbox
          checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
          onCheckedChange={toggleSelectAll}
          aria-label="Select all"
        />
      ),
      cell: ({ row }: any) => (
        <Checkbox
          checked={selectedCustomers.includes(row.original.id)}
          onCheckedChange={() => toggleSelectCustomer(row.original.id)}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: 'name',
      header: 'Customer Name',
      cell: ({ row }: any) => (
        <div className="flex items-center space-x-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.accountStatus === 'LOCKED' && (
            <Lock className="h-4 w-4 text-destructive" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'accountStatus',
      header: 'Account Status',
      cell: ({ row }: any) => getAccountStatusBadge(row.original.accountStatus),
    },
    {
      accessorKey: 'paymentStatus',
      header: 'Payment Status',
      cell: ({ row }: any) => getPaymentStatusBadge(row.original.paymentStatus),
    },
    {
      accessorKey: 'totalOutstanding',
      header: 'Outstanding',
      cell: ({ row }: any) => (
        <span className={row.original.totalOutstanding > 0 ? 'text-destructive font-medium' : ''}>
          ${row.original.totalOutstanding.toFixed(2)}
        </span>
      ),
    },
    {
      accessorKey: 'paymentDueDate',
      header: 'Due Date',
      cell: ({ row }: any) => {
        if (!row.original.paymentDueDate) return '-'
        const dueDate = new Date(row.original.paymentDueDate)
        const isOverdue = dueDate < new Date()
        return (
          <span className={isOverdue ? 'text-destructive' : ''}>
            {dueDate.toLocaleDateString()}
          </span>
        )
      },
    },
    {
      accessorKey: '_count.skids',
      header: 'Active Skids',
      cell: ({ row }: any) => row.original._count.skids,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: any) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push(`/admin/customers/${row.original.id}`)}
            >
              <FileText className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push(`/admin/customers/${row.original.id}/history`)}
            >
              <History className="mr-2 h-4 w-4" />
              Lock History
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {row.original.accountStatus !== 'LOCKED' ? (
              <DropdownMenuItem
                onClick={() => handleLockAccount(row.original.id, 'lock', 'Late payment')}
                className="text-destructive"
              >
                <Lock className="mr-2 h-4 w-4" />
                Lock Account
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => handleLockAccount(row.original.id, 'unlock', 'Payment received')}
                className="text-success"
              >
                <Unlock className="mr-2 h-4 w-4" />
                Unlock Account
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate summary stats
  const stats = {
    total: customers.length,
    active: customers.filter(c => c.accountStatus === 'ACTIVE').length,
    locked: customers.filter(c => c.accountStatus === 'LOCKED').length,
    overdue: customers.filter(c => c.paymentStatus === 'OVERDUE' || c.paymentStatus === 'DELINQUENT').length,
    totalOutstanding: customers.reduce((sum, c) => sum + c.totalOutstanding, 0),
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-3 w-32 mt-1" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-96 w-full" />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Customer Management</h1>
          <div className="flex space-x-2">
            {selectedCustomers.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkAction('lock')
                    setShowBulkDialog(true)
                  }}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Lock Selected ({selectedCustomers.length})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkAction('unlock')
                    setShowBulkDialog(true)
                  }}
                >
                  <Unlock className="mr-2 h-4 w-4" />
                  Unlock Selected ({selectedCustomers.length})
                </Button>
              </>
            )}
            <Button onClick={() => router.push('/admin/reports/overdue')}>
              <FileText className="mr-2 h-4 w-4" />
              Overdue Report
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                {stats.active} active accounts
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Locked Accounts</CardTitle>
              <Lock className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.locked}</div>
              <p className="text-xs text-muted-foreground">
                Restricted from operations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue Accounts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.overdue}</div>
              <p className="text-xs text-muted-foreground">
                Require payment attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalOutstanding.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Across all customers
              </p>
            </CardContent>
          </Card>
        </div>

        {stats.locked > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>{stats.locked} customer account{stats.locked > 1 ? 's are' : ' is'} currently locked.</strong> These customers cannot receive new inventory or release existing skids until their accounts are unlocked.
            </AlertDescription>
          </Alert>
        )}

        {/* Customer Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Customers</CardTitle>
            <CardDescription>
              Manage customer accounts, payment status, and access controls
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                startIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <DataTable
              columns={columns}
              data={filteredCustomers}
              searchKey="name"
            />
          </CardContent>
        </Card>

        {/* Bulk Operations Dialog */}
        <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Bulk {bulkAction === 'lock' ? 'Lock' : 'Unlock'} Accounts
              </DialogTitle>
              <DialogDescription>
                You are about to {bulkAction} {selectedCustomers.length} customer account{selectedCustomers.length > 1 ? 's' : ''}.
                {bulkAction === 'lock' 
                  ? ' This will prevent these customers from receiving new inventory or releasing existing skids.'
                  : ' This will restore full access to warehouse operations for these customers.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-reason">
                  Reason for {bulkAction === 'lock' ? 'locking' : 'unlocking'}
                </Label>
                <Input
                  id="bulk-reason"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder={
                    bulkAction === 'lock'
                      ? 'e.g., Overdue payments, Policy violation'
                      : 'e.g., Payments received, Issue resolved'
                  }
                />
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Selected customers:</strong>
                  <ul className="mt-2 max-h-32 overflow-y-auto text-sm">
                    {selectedCustomers.map(id => {
                      const customer = customers.find(c => c.id === id)
                      return customer ? (
                        <li key={id} className="flex items-center justify-between py-1">
                          <span>{customer.name}</span>
                          <Badge variant="outline" className="text-xs">
                            ${customer.totalOutstanding.toFixed(2)}
                          </Badge>
                        </li>
                      ) : null
                    })}
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowBulkDialog(false)}
                disabled={bulkProcessing}
              >
                Cancel
              </Button>
              <Button
                variant={bulkAction === 'lock' ? 'destructive' : 'default'}
                onClick={handleBulkOperation}
                disabled={!bulkReason || bulkProcessing}
              >
                {bulkProcessing 
                  ? 'Processing...' 
                  : `${bulkAction === 'lock' ? 'Lock' : 'Unlock'} ${selectedCustomers.length} Account${selectedCustomers.length > 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}