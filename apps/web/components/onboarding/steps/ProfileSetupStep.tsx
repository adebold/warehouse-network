import { 
  Building, 
  Package,
  TrendingUp,
  Loader2,
  CheckCircle
} from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface ProfileSetupStepProps {
  onComplete: () => void;
  onSkip?: () => void;
  isRequired: boolean;
  flowId: string;
  stepId: string;
}

export const ProfileSetupStep: React.FC<ProfileSetupStepProps> = ({
  onComplete,
  onSkip,
  isRequired
}) => {
  const [formData, setFormData] = useState({
    companyName: '',
    industry: '',
    companySize: '',
    primaryLocation: '',
    businessType: '',
    storageNeeds: {
      estimatedPallets: '',
      goodsTypes: [] as string[],
      specialRequirements: '',
    },
    businessGoals: [] as string[],
    monthlyVolume: '',
    description: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const industries = [
    'E-commerce/Retail',
    'Manufacturing',
    'Food & Beverage',
    'Automotive',
    'Healthcare/Pharmaceuticals',
    'Electronics',
    'Textiles/Apparel',
    'Home & Garden',
    'Industrial Equipment',
    'Other'
  ];

  const companySizes = [
    'Startup (1-10 employees)',
    'Small (11-50 employees)',
    'Medium (51-200 employees)',
    'Large (201-1000 employees)',
    'Enterprise (1000+ employees)'
  ];

  const businessTypes = [
    'Direct-to-Consumer (D2C)',
    'Business-to-Business (B2B)',
    'Wholesale/Distribution',
    'Manufacturing',
    'Import/Export',
    'Third-Party Logistics (3PL)',
    'Other'
  ];

  const goodsTypes = [
    'General Merchandise',
    'Electronics',
    'Clothing/Textiles',
    'Food & Beverage',
    'Hazardous Materials',
    'Automotive Parts',
    'Medical/Pharmaceutical',
    'Chemicals',
    'Raw Materials',
    'Heavy Machinery'
  ];

  const businessGoals = [
    'Expand into new markets',
    'Reduce storage costs',
    'Improve delivery times',
    'Scale operations',
    'Test new locations',
    'Seasonal storage needs',
    'Backup storage solution',
    'Fulfillment optimization'
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleStorageNeedChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      storageNeeds: {
        ...prev.storageNeeds,
        [field]: value
      }
    }));
  };

  const handleCheckboxChange = (field: 'goodsTypes' | 'businessGoals', value: string, checked: boolean) => {
    setFormData(prev => {
      const currentArray = field === 'goodsTypes' 
        ? prev.storageNeeds.goodsTypes 
        : prev.businessGoals;
      
      const updatedArray = checked
        ? [...currentArray, value]
        : currentArray.filter(item => item !== value);

      if (field === 'goodsTypes') {
        return {
          ...prev,
          storageNeeds: {
            ...prev.storageNeeds,
            goodsTypes: updatedArray
          }
        };
      } else {
        return {
          ...prev,
          businessGoals: updatedArray
        };
      }
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.companyName.trim()) {
      newErrors.companyName = 'Company name is required';
    }

    if (!formData.industry) {
      newErrors.industry = 'Please select your industry';
    }

    if (!formData.companySize) {
      newErrors.companySize = 'Please select your company size';
    }

    if (!formData.primaryLocation.trim()) {
      newErrors.primaryLocation = 'Primary location is required';
    }

    if (!formData.businessType) {
      newErrors.businessType = 'Please select your business type';
    }

    if (!formData.storageNeeds.estimatedPallets) {
      newErrors.estimatedPallets = 'Please estimate your pallet needs';
    }

    if (formData.storageNeeds.goodsTypes.length === 0) {
      newErrors.goodsTypes = 'Please select at least one goods type';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {return;}

    setIsLoading(true);
    
    try {
      // Save profile data
      const response = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        onComplete();
      } else {
        setErrors({ submit: 'Failed to save profile. Please try again.' });
      }
    } catch (error) {
      setErrors({ submit: 'An error occurred. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
          <Building className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Tell us about your business</h2>
        <p className="text-muted-foreground">
          This helps us recommend the best warehouse spaces for your needs
        </p>
      </div>

      {/* Form */}
      <div className="space-y-6">
        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                  placeholder="Your Company Inc."
                  className={errors.companyName ? 'border-red-500' : ''}
                />
                {errors.companyName && (
                  <p className="text-sm text-red-500">{errors.companyName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Industry *</Label>
                <Select value={formData.industry} onValueChange={(value) => handleInputChange('industry', value)}>
                  <SelectTrigger className={errors.industry ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {industries.map((industry) => (
                      <SelectItem key={industry} value={industry}>
                        {industry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.industry && (
                  <p className="text-sm text-red-500">{errors.industry}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companySize">Company Size *</Label>
                <Select value={formData.companySize} onValueChange={(value) => handleInputChange('companySize', value)}>
                  <SelectTrigger className={errors.companySize ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent>
                    {companySizes.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.companySize && (
                  <p className="text-sm text-red-500">{errors.companySize}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="primaryLocation">Primary Location *</Label>
                <Input
                  id="primaryLocation"
                  value={formData.primaryLocation}
                  onChange={(e) => handleInputChange('primaryLocation', e.target.value)}
                  placeholder="City, State/Province"
                  className={errors.primaryLocation ? 'border-red-500' : ''}
                />
                {errors.primaryLocation && (
                  <p className="text-sm text-red-500">{errors.primaryLocation}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessType">Business Type *</Label>
              <Select value={formData.businessType} onValueChange={(value) => handleInputChange('businessType', value)}>
                <SelectTrigger className={errors.businessType ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select your business type" />
                </SelectTrigger>
                <SelectContent>
                  {businessTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.businessType && (
                <p className="text-sm text-red-500">{errors.businessType}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Storage Needs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Storage Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="estimatedPallets">Estimated Pallet Positions *</Label>
                <Select 
                  value={formData.storageNeeds.estimatedPallets} 
                  onValueChange={(value) => handleStorageNeedChange('estimatedPallets', value)}
                >
                  <SelectTrigger className={errors.estimatedPallets ? 'border-red-500' : ''}>
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
                {errors.estimatedPallets && (
                  <p className="text-sm text-red-500">{errors.estimatedPallets}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthlyVolume">Monthly Volume</Label>
                <Input
                  id="monthlyVolume"
                  value={formData.monthlyVolume}
                  onChange={(e) => handleInputChange('monthlyVolume', e.target.value)}
                  placeholder="e.g., 100 shipments/month"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Types of Goods *</Label>
              <div className="grid gap-3 md:grid-cols-2">
                {goodsTypes.map((type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={type}
                      checked={formData.storageNeeds.goodsTypes.includes(type)}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange('goodsTypes', type, checked as boolean)
                      }
                    />
                    <Label htmlFor={type} className="text-sm">
                      {type}
                    </Label>
                  </div>
                ))}
              </div>
              {errors.goodsTypes && (
                <p className="text-sm text-red-500">{errors.goodsTypes}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialRequirements">Special Requirements</Label>
              <Textarea
                id="specialRequirements"
                value={formData.storageNeeds.specialRequirements}
                onChange={(e) => handleStorageNeedChange('specialRequirements', e.target.value)}
                placeholder="Temperature control, security requirements, etc."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Business Goals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Business Goals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>What are your main goals with warehouse space? (Select all that apply)</Label>
              <div className="grid gap-3 md:grid-cols-2">
                {businessGoals.map((goal) => (
                  <div key={goal} className="flex items-center space-x-2">
                    <Checkbox
                      id={goal}
                      checked={formData.businessGoals.includes(goal)}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange('businessGoals', goal, checked as boolean)
                      }
                    />
                    <Label htmlFor={goal} className="text-sm">
                      {goal}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Additional Information</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Tell us more about your business and storage needs..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Error message */}
        {errors.submit && (
          <div className="text-center text-red-500 text-sm">
            {errors.submit}
          </div>
        )}

        {/* Submit button */}
        <div className="flex justify-center">
          <Button 
            onClick={handleSubmit}
            disabled={isLoading}
            size="lg"
            className="px-8 gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving Profile...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Save & Continue
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetupStep;