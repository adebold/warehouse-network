/**
 * Location Services Component
 * Provides GPS location services for warehouse discovery and tracking
 */
'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapPin, Navigation, Locate, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface LocationServicesProps {
  onLocationUpdate?: (position: GeolocationPosition) => void;
  onWarehouseFound?: (warehouses: NearbyWarehouse[]) => void;
  autoTrack?: boolean;
  searchRadius?: number; // meters
  className?: string;
}

interface NearbyWarehouse {
  id: string;
  name: string;
  address: string;
  distance: number; // meters
  capacity: number;
  available: number;
  coordinates: {
    lat: number;
    lng: number;
  };
  amenities: string[];
  pricePerSqFt: number;
  rating: number;
}

interface LocationState {
  position: GeolocationPosition | null;
  accuracy: number;
  isTracking: boolean;
  error: string | null;
  lastUpdate: Date | null;
  permissionStatus: PermissionState | 'unknown';
}

const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 30000 // 30 seconds
};

export function LocationServices({
  onLocationUpdate,
  onWarehouseFound,
  autoTrack = false,
  searchRadius = 5000,
  className
}: LocationServicesProps) {
  const [location, setLocation] = useState<LocationState>({
    position: null,
    accuracy: 0,
    isTracking: false,
    error: null,
    lastUpdate: null,
    permissionStatus: 'unknown'
  });

  const [nearbyWarehouses, setNearbyWarehouses] = useState<NearbyWarehouse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check location permission status
  useEffect(() => {
    checkPermissionStatus();
  }, []);

  // Auto-track if enabled
  useEffect(() => {
    if (autoTrack && !location.isTracking) {
      startTracking();
    }

    return () => {
      stopTracking();
    };
  }, [autoTrack]);

  // Search for warehouses when location updates
  useEffect(() => {
    if (location.position && onWarehouseFound) {
      searchNearbyWarehouses(location.position);
    }
  }, [location.position, onWarehouseFound]);

  const checkPermissionStatus = async () => {
    try {
      if ('permissions' in navigator) {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setLocation(prev => ({ ...prev, permissionStatus: result.state }));

        // Listen for permission changes
        result.addEventListener('change', () => {
          setLocation(prev => ({ ...prev, permissionStatus: result.state }));
        });
      }
    } catch (error) {
      console.error('Permission check failed:', error);
    }
  };

  const getCurrentLocation = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        LOCATION_OPTIONS
      );
    });
  }, []);

  const startTracking = async () => {
    try {
      setLocation(prev => ({ ...prev, error: null, isTracking: true }));

      // Get initial position
      const position = await getCurrentLocation();
      handleLocationUpdate(position);

      // Start watching position
      if ('geolocation' in navigator) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          handleLocationUpdate,
          handleLocationError,
          LOCATION_OPTIONS
        );
      }

    } catch (error) {
      handleLocationError(error as GeolocationPositionError);
    }
  };

  const stopTracking = () => {
    setLocation(prev => ({ ...prev, isTracking: false }));

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  };

  const handleLocationUpdate = (position: GeolocationPosition) => {
    setLocation(prev => ({
      ...prev,
      position,
      accuracy: position.coords.accuracy,
      lastUpdate: new Date(),
      error: null
    }));

    onLocationUpdate?.(position);
  };

  const handleLocationError = (error: GeolocationPositionError | Error) => {
    const errorMessage = error instanceof GeolocationPositionError
      ? getGeolocationErrorMessage(error)
      : error.message;

    setLocation(prev => ({
      ...prev,
      error: errorMessage,
      isTracking: false
    }));

    stopTracking();
  };

  const getGeolocationErrorMessage = (error: GeolocationPositionError): string => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Location access denied. Please enable location permissions.';
      case error.POSITION_UNAVAILABLE:
        return 'Location information unavailable.';
      case error.TIMEOUT:
        return 'Location request timed out.';
      default:
        return 'An unknown location error occurred.';
    }
  };

  const searchNearbyWarehouses = useCallback(async (position: GeolocationPosition) => {
    if (isSearching) return;

    setIsSearching(true);

    try {
      const { latitude, longitude } = position.coords;

      // Simulate API call to find nearby warehouses
      // In production, this would call your backend API
      const response = await fetch('/api/warehouses/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: latitude,
          lng: longitude,
          radius: searchRadius
        })
      });

      if (response.ok) {
        const warehouses = await response.json();
        setNearbyWarehouses(warehouses);
        onWarehouseFound?.(warehouses);
      } else {
        // Fallback: generate mock warehouses for demo
        const mockWarehouses = generateMockWarehouses(latitude, longitude);
        setNearbyWarehouses(mockWarehouses);
        onWarehouseFound?.(mockWarehouses);
      }

    } catch (error) {
      console.error('Warehouse search failed:', error);

      // Generate mock data on error
      const mockWarehouses = generateMockWarehouses(
        position.coords.latitude,
        position.coords.longitude
      );
      setNearbyWarehouses(mockWarehouses);
      onWarehouseFound?.(mockWarehouses);
    } finally {
      setIsSearching(false);
    }
  }, [isSearching, searchRadius, onWarehouseFound]);

  const generateMockWarehouses = (lat: number, lng: number): NearbyWarehouse[] => {
    const warehouses: NearbyWarehouse[] = [];
    const count = Math.floor(Math.random() * 5) + 3; // 3-7 warehouses

    for (let i = 0; i < count; i++) {
      const distance = Math.random() * searchRadius;
      const angle = Math.random() * 2 * Math.PI;

      // Calculate offset coordinates
      const offsetLat = lat + (distance / 111000) * Math.cos(angle);
      const offsetLng = lng + (distance / 111000) * Math.sin(angle) / Math.cos(lat * Math.PI / 180);

      warehouses.push({
        id: `warehouse-${i + 1}`,
        name: `Warehouse ${String.fromCharCode(65 + i)}`,
        address: `${100 + i * 50} Industrial Blvd, City`,
        distance: Math.round(distance),
        capacity: 10000 + Math.random() * 40000,
        available: Math.random() * 5000,
        coordinates: { lat: offsetLat, lng: offsetLng },
        amenities: ['Loading Dock', '24/7 Access', 'Security', 'Climate Control'].slice(0, Math.floor(Math.random() * 4) + 1),
        pricePerSqFt: Math.round((0.5 + Math.random() * 2) * 100) / 100,
        rating: Math.round((3 + Math.random() * 2) * 10) / 10
      });
    }

    return warehouses.sort((a, b) => a.distance - b.distance);
  };

  const formatDistance = (distance: number): string => {
    if (distance < 1000) {
      return `${distance}m`;
    }
    return `${(distance / 1000).toFixed(1)}km`;
  };

  const formatAccuracy = (accuracy: number): string => {
    if (accuracy < 10) return 'High';
    if (accuracy < 50) return 'Medium';
    return 'Low';
  };

  const getLocationAge = (lastUpdate: Date): string => {
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);

    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Location Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Location Services
            </div>
            <Button
              variant={location.isTracking ? "destructive" : "default"}
              size="sm"
              onClick={location.isTracking ? stopTracking : startTracking}
              disabled={location.permissionStatus === 'denied'}
            >
              {location.isTracking ? (
                <>
                  <Navigation className="w-4 h-4 mr-2" />
                  Stop
                </>
              ) : (
                <>
                  <Locate className="w-4 h-4 mr-2" />
                  Start
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {location.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{location.error}</AlertDescription>
            </Alert>
          )}

          {location.position && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Coordinates:</span>
                <span className="font-mono">
                  {location.position.coords.latitude.toFixed(6)}, {location.position.coords.longitude.toFixed(6)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Accuracy:</span>
                <Badge variant={location.accuracy < 10 ? "default" : location.accuracy < 50 ? "secondary" : "destructive"}>
                  {formatAccuracy(location.accuracy)} ({Math.round(location.accuracy)}m)
                </Badge>
              </div>

              {location.lastUpdate && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Update:</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {getLocationAge(location.lastUpdate)}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Nearby Warehouses */}
      {nearbyWarehouses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-lg">
              <span>Nearby Warehouses</span>
              <Badge variant="secondary">
                {nearbyWarehouses.length} found
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {isSearching ? (
                <div className="text-center py-4">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Searching for warehouses...</p>
                </div>
              ) : (
                nearbyWarehouses.map((warehouse) => (
                  <Card key={warehouse.id} className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm">{warehouse.name}</h4>
                        <p className="text-xs text-muted-foreground mb-2">{warehouse.address}</p>

                        <div className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {formatDistance(warehouse.distance)}
                          </span>
                          <span>${warehouse.pricePerSqFt}/sq ft</span>
                          <span>⭐ {warehouse.rating}</span>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {warehouse.amenities.slice(0, 3).map((amenity) => (
                            <Badge key={amenity} variant="outline" className="text-xs px-1 py-0">
                              {amenity}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="text-right text-xs">
                        <div className="text-muted-foreground">Available</div>
                        <div className="font-semibold">
                          {Math.round(warehouse.available).toLocaleString()} sq ft
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Permission Help */}
      {location.permissionStatus === 'denied' && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Location access is required to find nearby warehouses. Please enable location permissions in your browser settings.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default LocationServices;