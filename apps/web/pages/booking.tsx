import { format, differenceInDays, addDays } from 'date-fns';
import {
  MapPin,
  Package,
  DollarSign,
  Clock,
  Shield,
  ChevronLeft,
  Info,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

import prisma from '../lib/prisma';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

interface BookingPageProps {
  warehouse: {
    id: string;
    name: string;
    location: string | null;
    address: string;
    city: string | null;
    province: string | null;
    capacity: number;
    operatingHours: string;
    supportedGoods: string;
    dockAccessInstructions: string;
    operator: {
      id: string;
      legalName: string;
    };
    pricingRules: Array<{
      id: string;
      chargeCategory: string;
      price: number;
      currency: string;
    }>;
    features: Array<{
      id: string;
      name: string;
      description: string | null;
    }>;
    images: Array<{
      id: string;
      url: string;
      alt: string | null;
    }>;
  } | null;
}

const BookingPage: NextPage<BookingPageProps> = ({ warehouse }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [palletCount, setPalletCount] = useState('');
  const [notes, setNotes] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [totalPrice, setTotalPrice] = useState(0);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/login?redirect=/booking${warehouse ? `?warehouse=${warehouse.id}` : ''}`);
    }
  }, [status, router, warehouse]);

  useEffect(() => {
    // Calculate total price when dates and pallet count change
    if (startDate && endDate && palletCount && warehouse) {
      const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
      const storageRule = warehouse.pricingRules.find(rule => rule.chargeCategory === 'STORAGE');
      const receivingRule = warehouse.pricingRules.find(rule => rule.chargeCategory === 'RECEIVING');
      
      if (storageRule && days > 0) {
        const dailyRate = storageRule.price / 30; // Convert monthly to daily
        const storageTotal = dailyRate * days * parseInt(palletCount);
        const receivingTotal = receivingRule ? receivingRule.price * parseInt(palletCount) : 0;
        setTotalPrice(storageTotal + receivingTotal);
      }
    }
  }, [startDate, endDate, palletCount, warehouse]);

  if (!warehouse) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Warehouse Not Found</CardTitle>
            <CardDescription>
              The warehouse you&apos;re looking for doesn&apos;t exist or is no longer available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/listings">
              <Button className="w-full">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Browse Available Warehouses
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          warehouseId: warehouse.id,
          startDate,
          endDate,
          palletCount: parseInt(palletCount),
          notes,
          specialRequirements,
          totalPrice,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create booking');
      }

      const booking = await response.json();
      router.push(`/customer/bookings/${booking.id}?success=true`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStoragePrice = () => {
    const storageRule = warehouse.pricingRules.find(rule => rule.chargeCategory === 'STORAGE');
    return storageRule ? storageRule.price : 0;
  };

  const getReceivingPrice = () => {
    const receivingRule = warehouse.pricingRules.find(rule => rule.chargeCategory === 'RECEIVING');
    return receivingRule ? receivingRule.price : 0;
  };

  const minDate = format(addDays(new Date(), 1), 'yyyy-MM-dd'); // Start from tomorrow

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center">
              <img src="/brand/logo-icon.svg" alt="SkidSpace" className="h-8 w-8" />
              <span className="ml-2 text-xl font-semibold" style={{color: '#0B1220'}}>SkidSpace</span>
            </Link>
            <nav className="hidden items-center space-x-6 md:flex">
              <Link href="/listings" className="hover:text-primary text-sm font-medium transition-colors">
                Browse Listings
              </Link>
              {session && (
                <Link href="/dashboard" className="hover:text-primary text-sm font-medium transition-colors">
                  Dashboard
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/listings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Listings
        </Link>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Booking Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Book Warehouse Space</CardTitle>
                <CardDescription>
                  Reserve pallet positions at {warehouse.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Date Selection */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        min={minDate}
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        min={startDate || minDate}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Pallet Count */}
                  <div className="space-y-2">
                    <Label htmlFor="palletCount">Number of Pallets</Label>
                    <Input
                      id="palletCount"
                      type="number"
                      min="1"
                      max={warehouse.capacity}
                      placeholder="Enter number of pallets"
                      value={palletCount}
                      onChange={(e) => setPalletCount(e.target.value)}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Maximum available: {warehouse.capacity} pallets
                    </p>
                  </div>

                  {/* Special Requirements */}
                  <div className="space-y-2">
                    <Label htmlFor="specialRequirements">Special Requirements (Optional)</Label>
                    <Textarea
                      id="specialRequirements"
                      placeholder="Temperature control, fragile goods, hazmat certification, etc."
                      value={specialRequirements}
                      onChange={(e) => setSpecialRequirements(e.target.value)}
                      rows={3}
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any other information you'd like to share"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  </div>

                  {/* Price Summary */}
                  {startDate && endDate && palletCount && (
                    <div className="rounded-lg bg-muted p-4 space-y-2">
                      <h3 className="font-semibold flex items-center">
                        <DollarSign className="mr-2 h-4 w-4" />
                        Price Estimate
                      </h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Storage ({differenceInDays(new Date(endDate), new Date(startDate)) + 1} days × {palletCount} pallets)</span>
                          <span>${(totalPrice - getReceivingPrice() * parseInt(palletCount)).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Receiving ({palletCount} pallets)</span>
                          <span>${(getReceivingPrice() * parseInt(palletCount)).toFixed(2)}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex justify-between font-semibold">
                          <span>Total Estimate</span>
                          <span className="text-primary">${totalPrice.toFixed(2)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        * Final charges may vary based on actual services used
                      </p>
                    </div>
                  )}

                  {/* Error Alert */}
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isSubmitting || !session}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Booking...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Confirm Booking
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Warehouse Summary */}
          <div className="space-y-6">
            {/* Warehouse Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{warehouse.name}</CardTitle>
                <CardDescription className="flex items-center">
                  <MapPin className="mr-1 h-3 w-3" />
                  {warehouse.city}, {warehouse.province}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Image */}
                {warehouse.images.length > 0 && (
                  <img
                    src={warehouse.images[0].url}
                    alt={warehouse.images[0].alt || warehouse.name}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                )}

                {/* Key Details */}
                <div className="space-y-3">
                  <div className="flex items-center text-sm">
                    <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{warehouse.operatingHours}</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{warehouse.capacity} pallet capacity</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Shield className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>Operated by {warehouse.operator.legalName}</span>
                  </div>
                </div>

                {/* Pricing */}
                <Separator />
                <div>
                  <h4 className="font-medium mb-2">Pricing</h4>
                  <div className="space-y-1 text-sm">
                    {warehouse.pricingRules.map((rule) => (
                      <div key={rule.id} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {rule.chargeCategory.replace('_', ' ').toLowerCase()}
                        </span>
                        <span>${rule.price}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Features */}
                {warehouse.features.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Features</h4>
                      <div className="flex flex-wrap gap-2">
                        {warehouse.features.map((feature) => (
                          <span
                            key={feature.id}
                            className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-300"
                          >
                            {feature.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Help Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <Info className="mr-2 h-4 w-4" />
                  Need Help?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>Our support team is available 24/7 to assist with your booking.</p>
                <Button variant="link" className="p-0 h-auto mt-2">
                  Contact Support →
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { warehouse: warehouseId } = context.query;

  if (!warehouseId || typeof warehouseId !== 'string') {
    return {
      props: { warehouse: null },
    };
  }

  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: {
        id: warehouseId,
        status: 'ACTIVE',
      },
      include: {
        operator: {
          select: {
            id: true,
            legalName: true,
          },
        },
        pricingRules: true,
        features: true,
        images: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          take: 5,
        },
      },
    });

    return {
      props: {
        warehouse: warehouse ? JSON.parse(JSON.stringify(warehouse)) : null,
      },
    };
  } catch (error) {
    logger.error('Error fetching warehouse:', error);
    return {
      props: { warehouse: null },
    };
  }
};

export default BookingPage;