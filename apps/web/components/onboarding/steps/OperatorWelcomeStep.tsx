import { 
  DollarSign, 
  Users, 
  BarChart3, 
  Shield,
  CheckCircle,
  Building,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Clock
} from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OperatorWelcomeStepProps {
  onComplete: () => void;
  onSkip?: () => void;
  isRequired: boolean;
  flowId: string;
  stepId: string;
}

export const OperatorWelcomeStep: React.FC<OperatorWelcomeStepProps> = ({
  onComplete,
  onSkip,
  isRequired
}) => {
  const benefits = [
    {
      icon: DollarSign,
      title: 'Maximize Revenue',
      description: 'Monetize every pallet position in your warehouse',
      highlight: 'Up to 30% increase in revenue'
    },
    {
      icon: Users,
      title: 'Zero Management Hassle',
      description: 'We handle tenant screening and operations',
      highlight: 'Full-service management'
    },
    {
      icon: BarChart3,
      title: 'Dynamic Pricing',
      description: 'Set rates based on demand and seasonality',
      highlight: 'AI-powered optimization'
    },
    {
      icon: Shield,
      title: 'Secure Platform',
      description: 'Verified renters and secure transactions',
      highlight: '100% payment protection'
    }
  ];

  const steps = [
    {
      title: 'Verify your business',
      description: 'Complete business registration and insurance verification',
      time: '5 minutes'
    },
    {
      title: 'Add your warehouse',
      description: 'Upload photos, set capacity, and list features',
      time: '10 minutes'
    },
    {
      title: 'Configure pricing',
      description: 'Set competitive rates for your services',
      time: '5 minutes'
    },
    {
      title: 'Setup payouts',
      description: 'Connect Stripe for automatic payments',
      time: '3 minutes'
    },
    {
      title: 'Invite your team',
      description: 'Add warehouse staff and assign permissions',
      time: '2 minutes'
    }
  ];

  const stats = [
    {
      value: '500+',
      label: 'Warehouse Partners',
      icon: Building
    },
    {
      value: '$2.5M+',
      label: 'Revenue Generated',
      icon: DollarSign
    },
    {
      value: '95%',
      label: 'Average Occupancy',
      icon: TrendingUp
    },
    {
      value: '24/7',
      label: 'Support Available',
      icon: Clock
    }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
          <Sparkles className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        
        <h2 className="text-3xl font-bold">
          Turn Your Space Into Revenue! 💰
        </h2>
        
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Join hundreds of warehouse owners who are maximizing their revenue with SkidSpace. 
          Let's get your warehouse listed and start earning in minutes.
        </p>
      </div>

      {/* Platform stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index} className="text-center border-0 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10">
            <CardContent className="p-6">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/20 mb-3">
                <stat.icon className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">{stat.value}</div>
              <div className="text-sm text-green-600 dark:text-green-400">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Benefits grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {benefits.map((benefit, index) => (
          <Card key={index} className="border-0 bg-muted/30 hover:bg-muted/50 transition-colors">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <benefit.icon className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{benefit.description}</p>
                  <div className="inline-block px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-medium rounded-full">
                    {benefit.highlight}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Setup process */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Quick Setup Process
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Get your warehouse listed and start earning in under 30 minutes:
          </p>
          
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={index} className="flex items-start gap-4 p-4 rounded-lg bg-muted/30">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center text-sm font-bold text-green-600 dark:text-green-400">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">{step.title}</h4>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
                <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  {step.time}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mt-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              </div>
              <div className="text-sm">
                <p className="font-medium text-green-900 dark:text-green-100 mb-1">
                  Start earning immediately!
                </p>
                <p className="text-green-700 dark:text-green-300">
                  Once approved, your warehouse will be visible to customers and you can start 
                  accepting bookings right away. Average first booking happens within 48 hours.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Success stories */}
      <Card className="border-dashed border-2">
        <CardContent className="p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Success Story</h3>
          <blockquote className="text-muted-foreground italic mb-3">
            "We listed our warehouse on SkidSpace and within a month increased our revenue by 35%. 
            The platform handles everything - we just provide the space."
          </blockquote>
          <cite className="text-sm font-medium">- Sarah M., Warehouse Owner in Dallas</cite>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="text-center space-y-4">
        <Button 
          onClick={onComplete}
          size="lg" 
          className="px-8 gap-2 bg-green-600 hover:bg-green-700"
        >
          Start Setup Process
          <ArrowRight className="h-4 w-4" />
        </Button>
        
        <p className="text-xs text-muted-foreground">
          Total setup time: ~25 minutes • Start earning within 24-48 hours
        </p>
      </div>
    </div>
  );
};

export default OperatorWelcomeStep;