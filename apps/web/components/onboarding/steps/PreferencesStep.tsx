import { 
  MapPin, 
  Bell, 
  Mail, 
  DollarSign,
  Package,
  Settings,
  CheckCircle,
  Loader2
} from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

interface PreferencesStepProps {
  onComplete: () => void;
  onSkip?: () => void;
  isRequired: boolean;
  flowId: string;
  stepId: string;
}

export const PreferencesStep: React.FC<PreferencesStepProps> = ({
  onComplete,
  onSkip,
  isRequired
}) => {
  const [preferences, setPreferences] = useState({
    // Location preferences
    preferredLocations: [] as string[],
    searchRadius: [50],
    
    // Notification preferences
    emailNotifications: {
      newListings: true,
      priceUpdates: true,
      bookingReminders: true,
      marketingEmails: false
    },
    smsNotifications: {
      urgentAlerts: true,
      bookingConfirmations: true
    },
    pushNotifications: {
      enabled: true,
      quietHours: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00'
    },
    
    // Search preferences
    defaultFilters: {
      priceRange: [0, 100] as [number, number],
      warehouseFeatures: [] as string[],
      palletTypes: [] as string[],
      serviceLevel: 'standard'
    },
    
    // Business preferences
    autoApprove: false,
    requireInsurance: true,
    preferredPaymentMethods: [] as string[],
    
    // Display preferences
    currency: 'USD',
    timeZone: 'America/New_York',
    language: 'en',
    theme: 'system'
  });

  const [isLoading, setIsLoading] = useState(false);

  const locations = [
    'New York, NY',
    'Los Angeles, CA',
    'Chicago, IL',
    'Houston, TX',
    'Phoenix, AZ',
    'Philadelphia, PA',
    'San Antonio, TX',
    'San Diego, CA',
    'Dallas, TX',
    'San Jose, CA',
    'Austin, TX',
    'Jacksonville, FL',
    'Fort Worth, TX',
    'Columbus, OH',
    'Charlotte, NC'
  ];

  const warehouseFeatures = [
    'Climate Controlled',
    '24/7 Access',
    'Security Cameras',
    'Loading Docks',
    'Forklift Service',
    'Inventory Management',
    'Cross-Docking',
    'Pick & Pack',
    'Returns Processing',
    'Hazmat Certified'
  ];

  const palletTypes = [
    'Standard (40" x 48")',
    'Euro (31.5" x 47.2")',
    'Block Pallets',
    'Stringer Pallets',
    'Custom Sizes'
  ];

  const paymentMethods = [
    'Credit Card',
    'Bank Transfer/ACH',
    'Wire Transfer',
    'Invoice/Net Terms',
    'Purchase Order'
  ];

  const handleLocationToggle = (location: string, checked: boolean) => {
    setPreferences(prev => ({
      ...prev,
      preferredLocations: checked
        ? [...prev.preferredLocations, location]
        : prev.preferredLocations.filter(l => l !== location)
    }));
  };

  const handleFeatureToggle = (feature: string, checked: boolean) => {
    setPreferences(prev => ({
      ...prev,
      defaultFilters: {
        ...prev.defaultFilters,
        warehouseFeatures: checked
          ? [...prev.defaultFilters.warehouseFeatures, feature]
          : prev.defaultFilters.warehouseFeatures.filter(f => f !== feature)
      }
    }));
  };

  const handlePaymentMethodToggle = (method: string, checked: boolean) => {
    setPreferences(prev => ({
      ...prev,
      preferredPaymentMethods: checked
        ? [...prev.preferredPaymentMethods, method]
        : prev.preferredPaymentMethods.filter(m => m !== method)
    }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    
    try {
      // Save preferences
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences)
      });

      if (response.ok) {
        onComplete();
      } else {
        console.error('Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Customize Your Experience</h2>
        <p className="text-muted-foreground">
          Set your preferences to get personalized recommendations and notifications
        </p>
      </div>

      <div className="space-y-6">
        {/* Location Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>Preferred Locations</Label>
              <div className="grid gap-3 md:grid-cols-3">
                {locations.map((location) => (
                  <div key={location} className="flex items-center space-x-2">
                    <Checkbox
                      id={location}
                      checked={preferences.preferredLocations.includes(location)}
                      onCheckedChange={(checked) => 
                        handleLocationToggle(location, checked as boolean)
                      }
                    />
                    <Label htmlFor={location} className="text-sm">
                      {location}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Search Radius: {preferences.searchRadius[0]} miles</Label>
              <Slider
                value={preferences.searchRadius}
                onValueChange={(value: number[]) => setPreferences(prev => ({ ...prev, searchRadius: value }))}
                max={200}
                min={10}
                step={5}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email Notifications */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <Label className="text-base font-medium">Email Notifications</Label>
              </div>
              <div className="grid gap-3 ml-6">
                {Object.entries({
                  newListings: 'New warehouse listings',
                  priceUpdates: 'Price updates',
                  bookingReminders: 'Booking reminders',
                  marketingEmails: 'Marketing and promotional emails'
                }).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label htmlFor={`email-${key}`} className="text-sm">{label}</Label>
                    <Switch
                      id={`email-${key}`}
                      checked={preferences.emailNotifications[key as keyof typeof preferences.emailNotifications]}
                      onCheckedChange={(checked: boolean) =>
                        setPreferences(prev => ({
                          ...prev,
                          emailNotifications: {
                            ...prev.emailNotifications,
                            [key]: checked
                          }
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Push Notifications */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                <Label className="text-base font-medium">Push Notifications</Label>
              </div>
              <div className="grid gap-3 ml-6">
                <div className="flex items-center justify-between">
                  <Label htmlFor="push-enabled" className="text-sm">Enable push notifications</Label>
                  <Switch
                    id="push-enabled"
                    checked={preferences.pushNotifications.enabled}
                    onCheckedChange={(checked: boolean) =>
                      setPreferences(prev => ({
                        ...prev,
                        pushNotifications: {
                          ...prev.pushNotifications,
                          enabled: checked
                        }
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="quiet-hours" className="text-sm">Quiet hours (10 PM - 8 AM)</Label>
                  <Switch
                    id="quiet-hours"
                    checked={preferences.pushNotifications.quietHours}
                    onCheckedChange={(checked) =>
                      setPreferences(prev => ({
                        ...prev,
                        pushNotifications: {
                          ...prev.pushNotifications,
                          quietHours: checked
                        }
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search & Filter Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Search & Filter Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>Preferred Warehouse Features</Label>
              <div className="grid gap-3 md:grid-cols-2">
                {warehouseFeatures.map((feature) => (
                  <div key={feature} className="flex items-center space-x-2">
                    <Checkbox
                      id={feature}
                      checked={preferences.defaultFilters.warehouseFeatures.includes(feature)}
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

            <div className="space-y-3">
              <Label>Default Price Range: ${preferences.defaultFilters.priceRange[0]} - ${preferences.defaultFilters.priceRange[1]} per pallet/month</Label>
              <div className="px-2">
                <Slider
                  value={preferences.defaultFilters.priceRange}
                  onValueChange={(value: number[]) => setPreferences(prev => ({
                    ...prev,
                    defaultFilters: {
                      ...prev.defaultFilters,
                      priceRange: value as [number, number]
                    }
                  }))}
                  max={500}
                  min={0}
                  step={10}
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Service Level</Label>
              <Select 
                value={preferences.defaultFilters.serviceLevel}
                onValueChange={(value) => setPreferences(prev => ({
                  ...prev,
                  defaultFilters: {
                    ...prev.defaultFilters,
                    serviceLevel: value
                  }
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic Storage</SelectItem>
                  <SelectItem value="standard">Standard Service</SelectItem>
                  <SelectItem value="premium">Premium Service</SelectItem>
                  <SelectItem value="white-glove">White Glove Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Payment Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Payment Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>Preferred Payment Methods</Label>
              <div className="grid gap-3 md:grid-cols-2">
                {paymentMethods.map((method) => (
                  <div key={method} className="flex items-center space-x-2">
                    <Checkbox
                      id={method}
                      checked={preferences.preferredPaymentMethods.includes(method)}
                      onCheckedChange={(checked) => 
                        handlePaymentMethodToggle(method, checked as boolean)
                      }
                    />
                    <Label htmlFor={method} className="text-sm">
                      {method}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select 
                  value={preferences.currency}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, currency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Time Zone</Label>
                <Select 
                  value={preferences.timeZone}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, timeZone: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    <SelectItem value="America/Toronto">Toronto</SelectItem>
                    <SelectItem value="America/Vancouver">Vancouver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-center gap-4">
          {!isRequired && onSkip && (
            <Button onClick={onSkip} variant="outline" size="lg">
              Skip for Now
            </Button>
          )}
          
          <Button 
            onClick={handleSubmit}
            disabled={isLoading}
            size="lg"
            className="px-8 gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving Preferences...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Save Preferences
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PreferencesStep;