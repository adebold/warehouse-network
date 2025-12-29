import { Package, Truck, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

import { AppLayout } from '@/components/layouts/AppLayout';
import { AccountLockWarning } from '@/components/ui/account-lock-warning';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';


interface SkidData {
  id: string;
  skidCode: string;
  trackingNumber: string;
  status: string;
  weight: number;
  location: {
    name: string;
  };
}

interface CustomerData {
  id: string;
  name: string;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  paymentStatus: 'CURRENT' | 'OVERDUE' | 'DELINQUENT';
  lockReason?: string;
}

export default function ReleaseRequestPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [skids, setSkids] = useState<SkidData[]>([]);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [selectedSkids, setSelectedSkids] = useState<string[]>([]);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.customerId) {
      fetchData();
    }
  }, [session]);

  const fetchData = async () => {
    try {
      const [skidsRes, customerRes] = await Promise.all([
        fetch('/api/customer/skids'),
        fetch('/api/customer/account'),
      ]);

      if (skidsRes.ok && customerRes.ok) {
        const skidsData = await skidsRes.json();
        const customerData = await customerRes.json();

        setSkids(skidsData.filter((s: SkidData) => s.status === 'STORED'));
        setCustomer(customerData);
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (selectedSkids.length === 0 || !deliveryAddress) {
      setError('Please select at least one skid and provide a delivery address');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/customer/release-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skidIds: selectedSkids,
          deliveryAddress,
          customerId: session?.user?.customerId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'ACCOUNT_LOCKED') {
          setError(data.message);
        } else {
          setError(data.message || 'Failed to create release request');
        }
      } else {
        router.push('/app/release-requests');
      }
    } catch (err) {
      setError('An error occurred while creating the release request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-96" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const canCreateRelease = customer?.accountStatus !== 'LOCKED';

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Release Request</h1>
          <p className="text-muted-foreground mt-2">
            Select skids to release from inventory for delivery
          </p>
        </div>

        {/* Account Lock Warning */}
        {customer && !canCreateRelease && (
          <AccountLockWarning
            customer={customer}
            operation="create release requests"
            showManageButton={false}
          />
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Available Skids</CardTitle>
            <CardDescription>Select the skids you want to release from inventory</CardDescription>
          </CardHeader>
          <CardContent>
            {skids.length === 0 ? (
              <div className="py-8 text-center">
                <Package className="text-muted-foreground mx-auto h-12 w-12" />
                <p className="text-muted-foreground mt-4 text-sm">No skids available for release</p>
              </div>
            ) : (
              <div className="space-y-4">
                {skids.map(skid => (
                  <div
                    key={skid.id}
                    className={`flex items-center space-x-4 rounded-lg border p-4 ${
                      selectedSkids.includes(skid.id) ? 'bg-accent' : ''
                    } ${!canCreateRelease ? 'opacity-50' : 'hover:bg-accent/50 cursor-pointer'}`}
                    onClick={() => {
                      if (!canCreateRelease) {return;}
                      setSelectedSkids(prev =>
                        prev.includes(skid.id)
                          ? prev.filter(id => id !== skid.id)
                          : [...prev, skid.id]
                      );
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSkids.includes(skid.id)}
                      disabled={!canCreateRelease}
                      onChange={() => {}}
                      className="h-4 w-4"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium">{skid.skidCode}</p>
                        <Badge variant="outline">{skid.trackingNumber}</Badge>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {skid.weight} kg • Location: {skid.location.name}
                      </p>
                    </div>
                    <Badge variant="default">Available</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery Details</CardTitle>
            <CardDescription>Provide the delivery address for the selected skids</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">Delivery Address</Label>
                <Input
                  id="address"
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder="Enter the complete delivery address"
                  disabled={!canCreateRelease}
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-muted-foreground text-sm">
                    Selected skids: {selectedSkids.length}
                  </p>
                </div>
                <div className="space-x-2">
                  <Button variant="outline" onClick={() => router.push('/app/inventory')}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      !canCreateRelease ||
                      selectedSkids.length === 0 ||
                      !deliveryAddress ||
                      submitting
                    }
                  >
                    {submitting ? (
                      'Creating...'
                    ) : (
                      <>
                        <Truck className="mr-2 h-4 w-4" />
                        Create Release Request
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
