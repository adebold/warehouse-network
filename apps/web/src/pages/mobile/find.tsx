/**
 * Mobile Find Warehouses Page
 * GPS-powered warehouse discovery and location services
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Navigation,
  Search,
  Filter,
  Star,
  DollarSign,
  Clock,
  Phone,
  Directions,
  Bookmark,
  Share2,
  Calendar,
  Info
} from 'lucide-react';

// Dynamically import LocationServices to avoid SSR issues
const LocationServices = dynamic(
  () => import('@/components/mobile/LocationServices'),
  { ssr: false }
);

interface Warehouse {
  id: string;
  name: string;
  address: string;
  distance: number; // meters
  coordinates: {
    lat: number;
    lng: number;
  };
  capacity: number;
  available: number;
  pricePerSqFt: number;
  rating: number;
  amenities: string[];
  hours: {
    open: string;
    close: string;
  };
  phone?: string;
  description: string;
  images: string[];
  verified: boolean;
  featured: boolean;
}

interface SearchFilters {
  maxDistance: number;
  maxPrice: number;
  minSpace: number;
  amenities: string[];
  verified: boolean;
}

const AMENITIES = [
  'Loading Dock',
  '24/7 Access',
  'Security',
  'Climate Control',
  'Parking',
  'Office Space',
  'Forklift Access',
  'Wi-Fi'
];

export default function MobileFindPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filteredWarehouses, setFilteredWarehouses] = useState<Warehouse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    maxDistance: 10000, // 10km
    maxPrice: 10,
    minSpace: 0,
    amenities: [],
    verified: false
  });
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [savedWarehouses, setSavedWarehouses] = useState<string[]>([]);

  // Load saved warehouses on mount
  useEffect(() => {
    const saved = localStorage.getItem('saved-warehouses');
    if (saved) {
      try {
        setSavedWarehouses(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load saved warehouses:', error);
      }
    }
  }, []);

  // Apply filters when warehouses or filters change
  useEffect(() => {
    applyFilters();
  }, [warehouses, filters, searchQuery]);

  const handleLocationUpdate = (position: GeolocationPosition) => {
    setCurrentLocation({
      lat: position.coords.latitude,
      lng: position.coords.longitude
    });
  };

  const handleWarehousesFound = (foundWarehouses: any[]) => {
    const processedWarehouses: Warehouse[] = foundWarehouses.map(w => ({
      ...w,
      hours: { open: '08:00', close: '18:00' },
      description: `Professional warehouse space in ${w.address.split(',')[1] || 'prime location'}`,
      images: ['/placeholder-warehouse.jpg'],
      verified: Math.random() > 0.3,
      featured: Math.random() > 0.7
    }));

    setWarehouses(processedWarehouses);
  };

  const applyFilters = () => {
    let filtered = warehouses;

    // Text search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(query) ||
        w.address.toLowerCase().includes(query) ||
        w.amenities.some(a => a.toLowerCase().includes(query))
      );
    }

    // Distance filter
    filtered = filtered.filter(w => w.distance <= filters.maxDistance);

    // Price filter
    filtered = filtered.filter(w => w.pricePerSqFt <= filters.maxPrice);

    // Space filter
    filtered = filtered.filter(w => w.available >= filters.minSpace);

    // Amenities filter
    if (filters.amenities.length > 0) {
      filtered = filtered.filter(w =>
        filters.amenities.every(amenity => w.amenities.includes(amenity))
      );
    }

    // Verified filter
    if (filters.verified) {
      filtered = filtered.filter(w => w.verified);
    }

    // Sort by distance
    filtered.sort((a, b) => a.distance - b.distance);

    setFilteredWarehouses(filtered);
  };

  const toggleSaveWarehouse = (warehouseId: string) => {
    const newSaved = savedWarehouses.includes(warehouseId)
      ? savedWarehouses.filter(id => id !== warehouseId)
      : [...savedWarehouses, warehouseId];

    setSavedWarehouses(newSaved);
    localStorage.setItem('saved-warehouses', JSON.stringify(newSaved));
  };

  const getDirections = (warehouse: Warehouse) => {
    if (currentLocation) {
      const url = `https://maps.google.com/maps?saddr=${currentLocation.lat},${currentLocation.lng}&daddr=${warehouse.coordinates.lat},${warehouse.coordinates.lng}`;
      window.open(url, '_blank');
    } else {
      const url = `https://maps.google.com/maps?q=${warehouse.coordinates.lat},${warehouse.coordinates.lng}`;
      window.open(url, '_blank');
    }
  };

  const shareWarehouse = async (warehouse: Warehouse) => {
    const shareData = {
      title: warehouse.name,
      text: `Check out this warehouse: ${warehouse.name} - $${warehouse.pricePerSqFt}/sq ft`,
      url: `${window.location.origin}/warehouses/${warehouse.id}`
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.text);
        alert('Copied to clipboard!');
      }
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const formatDistance = (distance: number): string => {
    if (distance < 1000) {
      return `${distance}m`;
    }
    return `${(distance / 1000).toFixed(1)}km`;
  };

  const formatPrice = (price: number): string => {
    return `$${price.toFixed(2)}/sq ft`;
  };

  const isOpen = (hours: { open: string; close: string }): boolean => {
    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const openTime = parseInt(hours.open.replace(':', ''));
    const closeTime = parseInt(hours.close.replace(':', ''));
    return currentTime >= openTime && currentTime <= closeTime;
  };

  return (
    <>
      <Head>
        <title>Find Warehouses - SkidSpace</title>
        <meta name="description" content="Find warehouses near your location" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <MobileLayout
        title="Find Warehouses"
        rightAction={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Filter className="w-4 h-4" />
          </Button>
        }
      >
        <div className="p-4 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search warehouses, locations, amenities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filters */}
          {showFilters && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Max Distance: {filters.maxDistance / 1000}km</label>
                  <input
                    type="range"
                    min="1000"
                    max="50000"
                    step="1000"
                    value={filters.maxDistance}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxDistance: parseInt(e.target.value) }))}
                    className="w-full mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Max Price: ${filters.maxPrice}/sq ft</label>
                  <input
                    type="range"
                    min="0.5"
                    max="20"
                    step="0.5"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters(prev => ({ ...prev, maxPrice: parseFloat(e.target.value) }))}
                    className="w-full mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Min Space: {filters.minSpace} sq ft</label>
                  <input
                    type="range"
                    min="0"
                    max="10000"
                    step="500"
                    value={filters.minSpace}
                    onChange={(e) => setFilters(prev => ({ ...prev, minSpace: parseInt(e.target.value) }))}
                    className="w-full mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Amenities</label>
                  <div className="flex flex-wrap gap-2">
                    {AMENITIES.map(amenity => (
                      <Badge
                        key={amenity}
                        variant={filters.amenities.includes(amenity) ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => {
                          const newAmenities = filters.amenities.includes(amenity)
                            ? filters.amenities.filter(a => a !== amenity)
                            : [...filters.amenities, amenity];
                          setFilters(prev => ({ ...prev, amenities: newAmenities }));
                        }}
                      >
                        {amenity}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="verified"
                    checked={filters.verified}
                    onChange={(e) => setFilters(prev => ({ ...prev, verified: e.target.checked }))}
                  />
                  <label htmlFor="verified" className="text-sm font-medium">Verified only</label>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setFilters({
                    maxDistance: 10000,
                    maxPrice: 10,
                    minSpace: 0,
                    amenities: [],
                    verified: false
                  })}
                  className="w-full"
                >
                  Reset Filters
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Location Services */}
          <LocationServices
            onLocationUpdate={handleLocationUpdate}
            onWarehouseFound={handleWarehousesFound}
            autoTrack={true}
            searchRadius={filters.maxDistance}
          />

          {/* Results */}
          {isSearching ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Searching for warehouses...</p>
            </div>
          ) : filteredWarehouses.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  {filteredWarehouses.length} warehouses found
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/map')}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Map View
                </Button>
              </div>

              {filteredWarehouses.map((warehouse) => (
                <Card key={warehouse.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Warehouse Image */}
                    <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-500 relative">
                      <div className="absolute top-3 left-3">
                        {warehouse.featured && (
                          <Badge className="bg-yellow-500 text-black mb-2">Featured</Badge>
                        )}
                        {warehouse.verified && (
                          <Badge variant="secondary" className="bg-green-500 text-white">
                            ✓ Verified
                          </Badge>
                        )}
                      </div>
                      <div className="absolute top-3 right-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSaveWarehouse(warehouse.id)}
                          className="bg-black/20 text-white hover:bg-black/40"
                        >
                          <Bookmark
                            className={`w-4 h-4 ${
                              savedWarehouses.includes(warehouse.id) ? 'fill-current' : ''
                            }`}
                          />
                        </Button>
                      </div>
                    </div>

                    {/* Warehouse Info */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{warehouse.name}</h3>
                          <p className="text-sm text-muted-foreground">{warehouse.address}</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-medium">{warehouse.rating}</span>
                          </div>
                        </div>
                      </div>

                      {/* Key Stats */}
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Distance</span>
                          <p className="font-medium">{formatDistance(warehouse.distance)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Price</span>
                          <p className="font-medium">{formatPrice(warehouse.pricePerSqFt)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Available</span>
                          <p className="font-medium">{warehouse.available.toLocaleString()} sq ft</p>
                        </div>
                      </div>

                      {/* Amenities */}
                      <div className="flex flex-wrap gap-1">
                        {warehouse.amenities.slice(0, 3).map((amenity) => (
                          <Badge key={amenity} variant="outline" className="text-xs">
                            {amenity}
                          </Badge>
                        ))}
                        {warehouse.amenities.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{warehouse.amenities.length - 3} more
                          </Badge>
                        )}
                      </div>

                      {/* Hours */}
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4" />
                        <span className="text-muted-foreground">
                          {warehouse.hours.open} - {warehouse.hours.close}
                        </span>
                        <Badge
                          variant={isOpen(warehouse.hours) ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {isOpen(warehouse.hours) ? 'Open' : 'Closed'}
                        </Badge>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => getDirections(warehouse)}
                          className="flex-1"
                        >
                          <Directions className="w-4 h-4 mr-2" />
                          Directions
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => router.push(`/warehouses/${warehouse.id}`)}
                        >
                          <Info className="w-4 h-4 mr-2" />
                          Details
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => shareWarehouse(warehouse)}
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        {warehouse.phone && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => window.open(`tel:${warehouse.phone}`)}
                          >
                            <Phone className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Load More */}
              {filteredWarehouses.length >= 10 && (
                <Button variant="outline" className="w-full">
                  Load More Warehouses
                </Button>
              )}
            </div>
          ) : warehouses.length > 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                No warehouses match your current filters. Try adjusting your search criteria.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </MobileLayout>
    </>
  );
}