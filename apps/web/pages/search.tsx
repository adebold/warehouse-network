import type { NextPage, GetServerSideProps } from 'next'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import prisma from '../lib/prisma'
import type { Warehouse } from '@prisma/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Building2, MapPin, Package, Filter, Search, ChevronLeft, Star, Loader2 } from 'lucide-react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { trackEcommerce, trackProductImpressions } from '@/lib/analytics'

interface SearchResultsProps {
  warehouses: Warehouse[]
}

const SearchResults: NextPage<SearchResultsProps> = ({ warehouses }) => {
  const router = useRouter()
  const { location, skidCount } = router.query
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy] = useState('relevance')
  const [isLoading, setIsLoading] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/" className="flex items-center">
                <ChevronLeft className="h-5 w-5 mr-1" />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <Building2 className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">Search Results</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center"
              >
                <Filter className="h-4 w-4 mr-2" />
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
      <div className="border-b bg-muted/50">
        <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h1 className="text-2xl font-bold">
                {warehouses.length} Warehouse{warehouses.length !== 1 ? 's' : ''} Found
              </h1>
              <p className="text-sm text-muted-foreground">
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
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Price Range</label>
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
                <label className="text-sm font-medium mb-1 block">Size</label>
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
                <label className="text-sm font-medium mb-1 block">Features</label>
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
                <label className="text-sm font-medium mb-1 block">Availability</label>
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
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        {!isLoading && (
        <div className="grid gap-6 lg:grid-cols-2">
          {warehouses.length === 0 ? (
            <div className="lg:col-span-2 text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No warehouses found</h2>
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
                className="hover:shadow-lg transition-shadow cursor-pointer"
                data-testid="warehouse-card"
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{warehouse.name}</CardTitle>
                      <CardDescription className="flex items-center mt-1">
                        <MapPin className="h-4 w-4 mr-1" />
                        {warehouse.address}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center text-warning">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="ml-1 text-sm">4.5</span>
                      </div>
                      <p className="text-xs text-muted-foreground">(23 reviews)</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Capacity</span>
                      <span className="font-medium">{warehouse.capacity} pallets</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Available</span>
                      <span className="font-medium text-success">
                        {Math.floor(warehouse.capacity * 0.4)} pallets
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Price</span>
                      <span className="font-medium">$12.50/pallet/month</span>
                    </div>
                    <div className="pt-2">
                      <p className="text-sm text-muted-foreground mb-2">Supported Goods:</p>
                      <div className="flex flex-wrap gap-1">
                        {warehouse.supportedGoods?.split(',').map((good, idx) => (
                          <span 
                            key={idx}
                            className="px-2 py-1 bg-muted text-xs rounded-full"
                          >
                            {good.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Link href={`/warehouse/${warehouse.id}`} className="flex-1">
                        <Button 
                          className="w-full" 
                          data-testid="view-details"
                        >
                          View Details
                        </Button>
                      </Link>
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        data-testid="add-to-compare"
                      >
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
          <div className="flex justify-center mt-8 space-x-2">
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
      <footer className="border-t mt-16">
        <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-muted-foreground">
            © 2025 Warehouse Network. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { location, skidCount } = context.query

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
  })

  // TODO: Implement advanced matching heuristics (price, proximity, SLA, etc.)

  return {
    props: {
      warehouses: JSON.parse(JSON.stringify(warehouses)),
    },
  }
}

export default SearchResults
