import { 
import { logger } from '@/lib/client-logger';
  Search, 
  MapPin, 
  Package,
  Filter,
  CheckCircle,
  Eye,
  Star,
  ArrowRight
} from 'lucide-react';
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FirstSearchStepProps {
  onComplete: () => void;
  onSkip?: () => void;
  isRequired: boolean;
  flowId: string;
  stepId: string;
}

export const FirstSearchStep: React.FC<FirstSearchStepProps> = ({
  onComplete,
  onSkip,
  isRequired
}) => {
  const [searchCriteria, setSearchCriteria] = useState({
    location: '',
    palletCount: '',
    priceRange: '',
    features: [] as string[],
    startDate: '',
    duration: ''
  });

  const [searchResults] = useState([
    {
      id: '1',
      name: 'Downtown Distribution Center',
      location: 'Chicago, IL',
      distance: 5.2,
      pricePerPallet: 45,
      availability: 150,
      rating: 4.8,
      features: ['Climate Controlled', '24/7 Access', 'Loading Docks'],
      image: '/warehouse-1.jpg',
      verified: true
    },
    {
      id: '2',
      name: 'Westside Storage Hub',
      location: 'Chicago, IL',
      distance: 8.7,
      pricePerPallet: 38,
      availability: 85,
      rating: 4.6,
      features: ['Security Cameras', 'Forklift Service', 'Pick & Pack'],
      image: '/warehouse-2.jpg',
      verified: true
    },
    {
      id: '3',
      name: 'Industrial Park Facility',
      location: 'Schaumburg, IL',
      distance: 12.3,
      pricePerPallet: 32,
      availability: 200,
      rating: 4.4,
      features: ['Cross-Docking', 'Inventory Management', 'Returns Processing'],
      image: '/warehouse-3.jpg',
      verified: true
    }
  ]);

  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const features = [
    'Climate Controlled',
    '24/7 Access',
    'Security Cameras',
    'Loading Docks',
    'Forklift Service',
    'Pick & Pack',
    'Cross-Docking',
    'Inventory Management',
    'Returns Processing',
    'Hazmat Certified'
  ];

  const handleFeatureToggle = (feature: string, checked: boolean) => {
    setSearchCriteria(prev => ({
      ...prev,
      features: checked
        ? [...prev.features, feature]
        : prev.features.filter(f => f !== feature)
    }));
  };

  const handleWarehouseSelect = (warehouseId: string) => {
    setSelectedWarehouse(warehouseId);
  };

  const handleViewDetails = (warehouseId: string) => {
    // In a real app, this would navigate to warehouse details
    logger.info('View details for warehouse:', warehouseId);
  };

  const handleCompleteSearch = () => {
    // Track successful search completion
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'first_search_completed', {
        location: searchCriteria.location,
        pallet_count: searchCriteria.palletCount,
        selected_warehouse: selectedWarehouse
      });
    }
    
    onComplete();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 mb-4">
          <Search className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold">Find Your Perfect Warehouse Space</h2>
        <p className="text-muted-foreground">
          Let's help you find warehouse space that meets your needs
        </p>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Criteria
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              {showFilters ? 'Hide' : 'Show'} Filters
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="location"
                  placeholder="City, State or ZIP"
                  value={searchCriteria.location}
                  onChange={(e) => setSearchCriteria(prev => ({ ...prev, location: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="palletCount">Pallet Positions Needed</Label>
              <Select 
                value={searchCriteria.palletCount}
                onValueChange={(value) => setSearchCriteria(prev => ({ ...prev, palletCount: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1-10 pallets</SelectItem>
                  <SelectItem value="11-50">11-50 pallets</SelectItem>
                  <SelectItem value="51-100">51-100 pallets</SelectItem>
                  <SelectItem value="101-500">101-500 pallets</SelectItem>
                  <SelectItem value="500+">500+ pallets</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priceRange">Price Range (per pallet/month)</Label>
              <Select 
                value={searchCriteria.priceRange}
                onValueChange={(value) => setSearchCriteria(prev => ({ ...prev, priceRange: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0-30">$0 - $30</SelectItem>
                  <SelectItem value="31-50">$31 - $50</SelectItem>
                  <SelectItem value="51-75">$51 - $75</SelectItem>
                  <SelectItem value="76-100">$76 - $100</SelectItem>
                  <SelectItem value="100+">$100+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {showFilters && (
            <div className="space-y-4 pt-4 border-t">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={searchCriteria.startDate}
                    onChange={(e) => setSearchCriteria(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Select 
                    value={searchCriteria.duration}
                    onValueChange={(value) => setSearchCriteria(prev => ({ ...prev, duration: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-month">1 month</SelectItem>
                      <SelectItem value="3-months">3 months</SelectItem>
                      <SelectItem value="6-months">6 months</SelectItem>
                      <SelectItem value="1-year">1 year</SelectItem>
                      <SelectItem value="ongoing">Ongoing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Required Features</Label>
                <div className="grid gap-3 md:grid-cols-3">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-center space-x-2">
                      <Checkbox
                        id={feature}
                        checked={searchCriteria.features.includes(feature)}
                        onCheckedChange={(checked) => 
                          handleFeatureToggle(feature, checked as boolean)
                        }
                      />
                      <Label htmlFor={feature} className="text-sm">
                        {feature}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Available Warehouse Spaces</h3>
          <Badge variant="secondary">
            {searchResults.length} results found
          </Badge>
        </div>

        <div className="grid gap-4">
          {searchResults.map((warehouse) => (
            <Card 
              key={warehouse.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedWarehouse === warehouse.id 
                  ? 'ring-2 ring-primary bg-primary/5' 
                  : ''
              }`}
              onClick={() => handleWarehouseSelect(warehouse.id)}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  {/* Placeholder for warehouse image */}
                  <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{warehouse.name}</h4>
                          {warehouse.verified && (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                              Verified
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <MapPin className="h-4 w-4" />
                          {warehouse.location} • {warehouse.distance} miles away
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600 dark:text-green-400">
                          ${warehouse.pricePerPallet}/month
                        </div>
                        <div className="text-sm text-muted-foreground">per pallet</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-400 fill-current" />
                        <span className="text-sm font-medium">{warehouse.rating}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {warehouse.availability} pallet positions available
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {warehouse.features.slice(0, 3).map((feature) => (
                          <Badge key={feature} variant="outline" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                        {warehouse.features.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{warehouse.features.length - 3} more
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(warehouse.id);
                          }}
                          className="gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          View Details
                        </Button>
                        {selectedWarehouse === warehouse.id && (
                          <div className="flex items-center gap-1 text-primary">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm font-medium">Selected</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4 pt-6">
        {!isRequired && onSkip && (
          <Button onClick={onSkip} variant="outline" size="lg">
            Skip for Now
          </Button>
        )}
        
        <Button 
          onClick={handleCompleteSearch}
          disabled={!selectedWarehouse}
          size="lg"
          className="px-8 gap-2"
        >
          <CheckCircle className="h-4 w-4" />
          Great! I Found Options
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Help Text */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Don't worry - you can always search again and modify your criteria later.
          This helps us understand what you're looking for.
        </p>
      </div>
    </div>
  );
};

export default FirstSearchStep;