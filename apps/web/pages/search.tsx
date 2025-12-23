import type { Warehouse } from '@warehouse/types';
import type { NextPage, GetServerSideProps } from 'next';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import prisma from '../lib/prisma';
import type { Warehouse } from '@prisma/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  MapPin,
  Package,
  Filter,
  Search,
  ChevronLeft,
  Star,
  Loader2,
} from 'lucide-react';


interface SearchResultsProps {
  warehouses: Warehouse[];
}

const SearchResults: NextPage<SearchResultsProps> = ({ warehouses }) => {
  const router = useRouter();
  const { location, skidCount } = router.query;
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/" className="flex items-center">
                <ChevronLeft className="mr-1 h-5 w-5" />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <Building2 className="text-primary h-8 w-8" />
              <span className="text-xl font-bold">Search Results</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center"
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </Button>
              <Link href="/">
                <Button size="sm">New Search</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Search Summary */}
      <div className="bg-muted/50 border-b">
        <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold">
                {warehouses.length} Warehouse{warehouses.length !== 1 ? 's' : ''} Found
              </h1>
              <p className="text-muted-foreground text-sm">
                {location && `Near ${location}`}
                {location && skidCount && ' • '}
                {skidCount && `${skidCount}+ pallet capacity`}
              </p>
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Most Relevant</SelectItem>
                <SelectItem value="price">Price: Low to High</SelectItem>
                <SelectItem value="distance">Distance: Nearest</SelectItem>
                <SelectItem value="rating">Rating: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Filters Sidebar (Mobile/Desktop responsive) */}
      {showFilters && (
        <div className="bg-muted/30 border-b">
          <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Price Range</label>
                <Select defaultValue="any">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Price</SelectItem>
                    <SelectItem value="0-10">$0-10/sqft</SelectItem>
                    <SelectItem value="10-20">$10-20/sqft</SelectItem>
                    <SelectItem value="20+">$20+/sqft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Size</label>
                <Select defaultValue="any">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Size</SelectItem>
                    <SelectItem value="small">Under 10,000 sqft</SelectItem>
                    <SelectItem value="medium">10,000-50,000 sqft</SelectItem>
                    <SelectItem value="large">50,000+ sqft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Features</label>
                <Select defaultValue="any">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Features</SelectItem>
                    <SelectItem value="climate">Climate Control</SelectItem>
                    <SelectItem value="access">24/7 Access</SelectItem>
                    <SelectItem value="docks">Loading Docks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Availability</label>
                <Select defaultValue="any">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Time</SelectItem>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="30">Within 30 days</SelectItem>
                    <SelectItem value="90">Within 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-primary h-8 w-8 animate-spin" />
          </div>
        )}
        {!isLoading && (
          <div className="grid gap-6 lg:grid-cols-2">
            {warehouses.length === 0 ? (
              <div className="py-12 text-center lg:col-span-2">
                <Package className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                <h2 className="mb-2 text-xl font-semibold">No warehouses found</h2>
                <p className="text-muted-foreground mb-6">
                  Try adjusting your search criteria or browse all available warehouses.
                </p>
                <Link href="/">
                  <Button>Start New Search</Button>
                </Link>
              </div>
            ) : (
              warehouses.map(warehouse => (
                <Card
                  key={warehouse.id}
                  className="cursor-pointer transition-shadow hover:shadow-lg"
                  data-testid="warehouse-card"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">{warehouse.name}</CardTitle>
                        <CardDescription className="mt-1 flex items-center">
                          <MapPin className="mr-1 h-4 w-4" />
                          {warehouse.address}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-warning flex items-center">
                          <Star className="h-4 w-4 fill-current" />
                          <span className="ml-1 text-sm">4.5</span>
                        </div>
                        <p className="text-muted-foreground text-xs">(23 reviews)</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Capacity</span>
                        <span className="font-medium">{warehouse.capacity} pallets</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Available</span>
                        <span className="text-success font-medium">
                          {Math.floor(warehouse.capacity * 0.4)} pallets
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Price</span>
                        <span className="font-medium">$12.50/pallet/month</span>
                      </div>
                      <div className="pt-2">
                        <p className="text-muted-foreground mb-2 text-sm">Supported Goods:</p>
                        <div className="flex flex-wrap gap-1">
                          {warehouse.supportedGoods?.split(',').map((good, idx) => (
                            <span key={idx} className="bg-muted rounded-full px-2 py-1 text-xs">
                              {good.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Link href={`/warehouse/${warehouse.id}`} className="flex-1">
                          <Button className="w-full" data-testid="view-details">
                            View Details
                          </Button>
                        </Link>
                        <Button variant="outline" className="flex-1" data-testid="add-to-compare">
                          Compare
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Pagination */}
        {warehouses.length > 0 && (
          <div className="mt-8 flex justify-center space-x-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm" className="bg-primary text-primary-foreground">
              1
            </Button>
            <Button variant="outline" size="sm">
              2
            </Button>
            <Button variant="outline" size="sm">
              3
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t">
        <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="text-muted-foreground text-center text-sm">
            © 2025 SkidSpace. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const { location, skidCount } = context.query;

  const warehouses = await prisma.warehouse.findMany({
    where: {
      status: 'READY_FOR_MARKETPLACE',
      // Basic location filter (can be improved with geo-spatial search)
      address: {
        contains: String(location),
        mode: 'insensitive',
      },
      capacity: {
        gte: parseInt(String(skidCount), 10) || 0,
      },
    },
  });

  // TODO: Implement advanced matching heuristics (price, proximity, SLA, etc.)

  return {
    props: {
      warehouses: JSON.parse(JSON.stringify(warehouses)),
    },
  };
};

export default SearchResults;
