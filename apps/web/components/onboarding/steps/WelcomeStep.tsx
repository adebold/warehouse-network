import { 
  Package, 
  Shield, 
  Zap, 
  Clock, 
  CheckCircle,
  Sparkles,
  ArrowRight,
  Users
} from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WelcomeStepProps {
  onComplete: () => void;
  onSkip?: () => void;
  isRequired: boolean;
  flowId: string;
  stepId: string;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({
  onComplete,
  onSkip,
  isRequired
}) => {
  const benefits = [
    {
      icon: Package,
      title: 'Pay Only for What You Use',
      description: 'Book by the pallet position, not the whole warehouse'
    },
    {
      icon: Zap,
      title: 'Instant Booking',
      description: 'Find and reserve space in minutes, not weeks'
    },
    {
      icon: Shield,
      title: 'Vetted Partners',
      description: 'Connect with verified warehouse operators'
    },
    {
      icon: Clock,
      title: 'Complete Flexibility',
      description: 'Scale up or down as your business needs change'
    }
  ];

  const steps = [
    'Complete your business profile',
    'Set your space preferences',
    'Find and book your first space',
    'Start storing inventory'
  ];

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        
        <h2 className="text-3xl font-bold">
          Welcome to SkidSpace! 🎉
        </h2>
        
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          The flexible warehouse marketplace that lets you rent space by the pallet. 
          Let's get you set up in just a few minutes.
        </p>
      </div>

      {/* Benefits grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {benefits.map((benefit, index) => (
          <Card key={index} className="border-0 bg-muted/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <benefit.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground">{benefit.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* What's next */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            What's Next?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            We'll guide you through these steps to get you started:
          </p>
          
          <div className="grid gap-3">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  {index + 1}
                </div>
                <span className="text-sm">{step}</span>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mt-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              </div>
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Need help? We're here for you!
                </p>
                <p className="text-blue-700 dark:text-blue-300">
                  Our support team is available 24/7 to help you get started. 
                  You can also book a free consultation call.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="text-center space-y-4">
        <Button 
          onClick={onComplete}
          size="lg" 
          className="px-8 gap-2"
        >
          Get Started
          <ArrowRight className="h-4 w-4" />
        </Button>
        
        <p className="text-xs text-muted-foreground">
          This should only take about 5 minutes to complete
        </p>
      </div>
    </div>
  );
};

export default WelcomeStep;