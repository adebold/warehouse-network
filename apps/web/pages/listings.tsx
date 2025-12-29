import {
  MapPin,
  Package,
  Clock,
  Filter,
  Search,
  ChevronRight,
  Shield,
  Loader2,
} from 'lucide-react';
import { GetServerSideProps, NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState } from 'react';

import prisma from '../lib/prisma';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ListingsPageProps {
  warehouses: Array<{
    id: string;
    name: string;
    location: string | null;
    address: string;
    city: string | null;
    province: string | null;
    capacity: number;
    operatingHours: string;
    supportedGoods: string;
    status: string;
    operator: {
      id: string;
      legalName: string;
    };
    pricingRules: Array<{
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
  }>;
  totalCount: number;
}

const ListingsPage: NextPage<ListingsPageProps> = ({ warehouses, totalCount }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [capacityFilter, setCapacityFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    router.push({
      pathname: '/listings',
      query: {
        search: searchQuery,
        city: cityFilter !== 'all' ? cityFilter : undefined,
        capacity: capacityFilter !== 'all' ? capacityFilter : undefined,
      },
    });
  };

  const getStoragePrice = (pricingRules: typeof warehouses[0]['pricingRules']) => {
    const storageRule = pricingRules.find(rule => rule.chargeCategory === 'STORAGE');
    return storageRule ? `$${storageRule.price}/pallet/month` : 'Contact for pricing';
  };

  const uniqueCities = [...new Set(warehouses.map(w => w.city).filter(Boolean))];

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
              <Link href="/listings" className="text-primary text-sm font-medium">
                Browse Listings
              </Link>
              {session ? (
                <>
                  <Link href="/dashboard" className="hover:text-primary text-sm font-medium transition-colors">
                    Dashboard
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => router.push('/account')}>
                    My Account
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="outline" size="sm">Sign In</Button>
                  </Link>
                  <Link href="/register">
                    <Button size="sm">Get Started</Button>
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Search Section */}
      <section className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900/20 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              Find Your Perfect Warehouse Space
            </h1>
            <p className="text-lg text-muted-foreground">
              Browse {totalCount} verified warehouse locations across the country
            </p>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search by location, name, or features..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Cities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {uniqueCities.map(city => (
                      <SelectItem key={city} value={city!}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={capacityFilter} onValueChange={setCapacityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Capacity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Capacity</SelectItem>
                    <SelectItem value="small">Small (1-100 pallets)</SelectItem>
                    <SelectItem value="medium">Medium (100-500 pallets)</SelectItem>
                    <SelectItem value="large">Large (500+ pallets)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Filter className="mr-2 h-4 w-4" />
                  )}
                  Apply Filters
                </Button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* Listings Grid */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {warehouses.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No warehouses found</h3>
              <p className="text-muted-foreground mb-6">
                Try adjusting your search filters or browse all available spaces.
              </p>
              <Button onClick={() => router.push('/listings')}>
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {warehouses.map((warehouse) => (
                <Card key={warehouse.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  {/* Warehouse Image */}
                  {warehouse.images.length > 0 && (
                    <div className="relative h-48 bg-muted">
                      <img
                        src={warehouse.images[0].url}
                        alt={warehouse.images[0].alt || warehouse.name}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute top-2 right-2 bg-black/75 text-white px-2 py-1 rounded text-xs">
                        {warehouse.capacity} pallets
                      </div>
                    </div>
                  )}
                  
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">{warehouse.name}</CardTitle>
                        <CardDescription className="flex items-center mt-1">
                          <MapPin className="mr-1 h-3 w-3" />
                          {warehouse.city}, {warehouse.province}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-primary">
                          {getStoragePrice(warehouse.pricingRules)}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-3">
                      {/* Operating Hours */}
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Clock className="mr-2 h-4 w-4" />
                        {warehouse.operatingHours}
                      </div>
                      
                      {/* Supported Goods */}
                      <div className="flex items-start text-sm text-muted-foreground">
                        <Package className="mr-2 h-4 w-4 mt-0.5" />
                        <span className="line-clamp-2">{warehouse.supportedGoods}</span>
                      </div>
                      
                      {/* Features */}
                      {warehouse.features.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {warehouse.features.slice(0, 3).map((feature) => (
                            <span
                              key={feature.id}
                              className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-300"
                            >
                              {feature.name}
                            </span>
                          ))}
                          {warehouse.features.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{warehouse.features.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Trust Badge */}
                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Shield className="mr-1 h-4 w-4 text-green-600" />
                          Verified
                        </div>
                        <Link href={`/booking?warehouse=${warehouse.id}`}>
                          <Button size="sm">
                            View Details
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {/* Pagination would go here */}
          {totalCount > 12 && (
            <div className="mt-8 flex justify-center">
              <p className="text-sm text-muted-foreground">
                Showing {warehouses.length} of {totalCount} warehouses
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { search, city, capacity } = context.query;

  try {
    // Build where clause based on filters
    const where: any = {
      status: 'ACTIVE',
    };

    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { supportedGoods: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (city && city !== 'all') {
      where.city = city;
    }

    if (capacity && capacity !== 'all') {
      switch (capacity) {
        case 'small':
          where.capacity = { lte: 100 };
          break;
        case 'medium':
          where.capacity = { gte: 100, lte: 500 };
          break;
        case 'large':
          where.capacity = { gte: 500 };
          break;
      }
    }

    const [warehouses, totalCount] = await Promise.all([
      prisma.warehouse.findMany({
        where,
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
            take: 1,
          },
        },
        take: 12,
      }),
      prisma.warehouse.count({ where }),
    ]);

    return {
      props: {
        warehouses: JSON.parse(JSON.stringify(warehouses)),
        totalCount,
      },
    };
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return {
      props: {
        warehouses: [],
        totalCount: 0,
      },
    };
  }
};

export default ListingsPage;