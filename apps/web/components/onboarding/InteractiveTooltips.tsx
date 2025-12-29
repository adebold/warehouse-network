import {
import { logger } from './utils/logger';
  X,
  ChevronRight,
  ChevronLeft,
  Target,
  Zap,
  CheckCircle,
  Sparkles
} from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface TooltipStep {
  id: string;
  target: string; // CSS selector for the target element
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  action?: {
    label: string;
    onClick: () => void;
  };
  highlight?: boolean;
  optional?: boolean;
}

interface TooltipTour {
  id: string;
  name: string;
  description: string;
  steps: TooltipStep[];
  category: 'onboarding' | 'feature-discovery' | 'tips';
}

interface InteractiveTooltipsProps {
  tours?: TooltipTour[];
  autoStart?: boolean;
  tourId?: string;
  onComplete?: (tourId: string) => void;
  onSkip?: (tourId: string) => void;
}

const DEFAULT_TOURS: TooltipTour[] = [
  {
    id: 'customer-onboarding',
    name: 'Customer Dashboard Tour',
    description: 'Learn how to navigate your customer dashboard',
    category: 'onboarding',
    steps: [
      {
        id: 'welcome',
        target: '[data-tour="dashboard-welcome"]',
        title: 'Welcome to Your Dashboard! 👋',
        description: 'This is your central hub for managing warehouse bookings and tracking your inventory.',
        placement: 'bottom',
        highlight: true
      },
      {
        id: 'search',
        target: '[data-tour="search-warehouses"]',
        title: 'Find Warehouse Space',
        description: 'Use this search to find available warehouse spaces in your preferred locations.',
        placement: 'bottom',
        action: {
          label: 'Try Search',
          onClick: () => logger.info('Navigate to search')
        }
      },
      {
        id: 'bookings',
        target: '[data-tour="my-bookings"]',
        title: 'Manage Your Bookings',
        description: 'View and manage all your current and past warehouse bookings here.',
        placement: 'right'
      },
      {
        id: 'inventory',
        target: '[data-tour="inventory-overview"]',
        title: 'Track Your Inventory',
        description: 'Monitor your stored inventory across all warehouse locations in real-time.',
        placement: 'left'
      },
      {
        id: 'support',
        target: '[data-tour="support-chat"]',
        title: 'Get Help Anytime',
        description: 'Our AI assistant and support team are here to help 24/7.',
        placement: 'top'
      }
    ]
  },
  {
    id: 'operator-onboarding',
    name: 'Operator Dashboard Tour',
    description: 'Learn how to manage your warehouse operations',
    category: 'onboarding',
    steps: [
      {
        id: 'overview',
        target: '[data-tour="operator-overview"]',
        title: 'Your Warehouse Overview',
        description: 'Monitor occupancy, revenue, and performance metrics for all your warehouses.',
        placement: 'bottom',
        highlight: true
      },
      {
        id: 'bookings-management',
        target: '[data-tour="booking-requests"]',
        title: 'Manage Booking Requests',
        description: 'Review and approve booking requests from customers.',
        placement: 'right'
      },
      {
        id: 'pricing',
        target: '[data-tour="pricing-controls"]',
        title: 'Dynamic Pricing',
        description: 'Adjust your pricing based on demand and seasonality to maximize revenue.',
        placement: 'bottom'
      },
      {
        id: 'team',
        target: '[data-tour="team-management"]',
        title: 'Team Management',
        description: 'Invite team members and assign roles for warehouse operations.',
        placement: 'left'
      },
      {
        id: 'reports',
        target: '[data-tour="performance-reports"]',
        title: 'Performance Reports',
        description: 'Access detailed analytics and reports on your warehouse performance.',
        placement: 'top'
      }
    ]
  },
  {
    id: 'advanced-features',
    name: 'Advanced Features',
    description: 'Discover powerful features to optimize your experience',
    category: 'feature-discovery',
    steps: [
      {
        id: 'ai-recommendations',
        target: '[data-tour="ai-recommendations"]',
        title: 'AI-Powered Recommendations',
        description: 'Get personalized warehouse recommendations based on your preferences and history.',
        placement: 'right',
        highlight: true
      },
      {
        id: 'bulk-operations',
        target: '[data-tour="bulk-actions"]',
        title: 'Bulk Operations',
        description: 'Save time by performing actions on multiple items at once.',
        placement: 'bottom'
      },
      {
        id: 'api-access',
        target: '[data-tour="api-settings"]',
        title: 'API Integration',
        description: 'Integrate SkidSpace with your existing systems using our REST API.',
        placement: 'left',
        optional: true
      },
      {
        id: 'automation',
        target: '[data-tour="automation-rules"]',
        title: 'Automation Rules',
        description: 'Set up automated workflows to streamline your operations.',
        placement: 'top'
      }
    ]
  }
];

export const InteractiveTooltips: React.FC<InteractiveTooltipsProps> = ({
  tours = DEFAULT_TOURS,
  autoStart = false,
  tourId,
  onComplete,
  onSkip
}) => {
  const [activeTour, setActiveTour] = useState<TooltipTour | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoStart && tourId) {
      const tour = tours.find(t => t.id === tourId);
      if (tour) {
        startTour(tour);
      }
    }
  }, [autoStart, tourId, tours]);

  useEffect(() => {
    if (activeTour && activeTour.steps[currentStepIndex]) {
      positionTooltip();
    }
  }, [activeTour, currentStepIndex]);

  useEffect(() => {
    const handleResize = () => {
      if (activeTour) {
        positionTooltip();
      }
    };

    const handleScroll = () => {
      if (activeTour) {
        positionTooltip();
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [activeTour]);

  const startTour = (tour: TooltipTour) => {
    setActiveTour(tour);
    setCurrentStepIndex(0);
    setTooltipVisible(true);
    
    // Track tour start
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'tooltip_tour_started', {
        tour_id: tour.id,
        tour_name: tour.name
      });
    }
  };

  const positionTooltip = () => {
    if (!activeTour) {return;}

    const currentStep = activeTour.steps[currentStepIndex];
    const targetElement = document.querySelector(currentStep.target) as HTMLElement;

    if (!targetElement || !tooltipRef.current) {
      return;
    }

    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = 0;
    let y = 0;

    // Calculate position based on placement
    switch (currentStep.placement) {
      case 'top':
        x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        y = targetRect.top - tooltipRect.height - 10;
        break;
      case 'bottom':
        x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        y = targetRect.bottom + 10;
        break;
      case 'left':
        x = targetRect.left - tooltipRect.width - 10;
        y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'right':
        x = targetRect.right + 10;
        y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'auto':
      default:
        // Auto-position based on available space
        if (targetRect.bottom + tooltipRect.height + 10 <= viewportHeight) {
          // Place below
          x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
          y = targetRect.bottom + 10;
        } else if (targetRect.top - tooltipRect.height - 10 >= 0) {
          // Place above
          x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
          y = targetRect.top - tooltipRect.height - 10;
        } else if (targetRect.right + tooltipRect.width + 10 <= viewportWidth) {
          // Place right
          x = targetRect.right + 10;
          y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        } else {
          // Place left
          x = targetRect.left - tooltipRect.width - 10;
          y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        }
        break;
    }

    // Ensure tooltip stays within viewport
    x = Math.max(10, Math.min(x, viewportWidth - tooltipRect.width - 10));
    y = Math.max(10, Math.min(y, viewportHeight - tooltipRect.height - 10));

    setTooltipPosition({ x, y });

    // Highlight target element
    targetElement.style.position = 'relative';
    targetElement.style.zIndex = '9999';
    targetElement.style.outline = currentStep.highlight ? '3px solid #3b82f6' : 'none';
    targetElement.style.outlineOffset = '2px';
    targetElement.style.borderRadius = '8px';

    // Scroll to element if needed
    const elementTop = targetRect.top + window.pageYOffset;
    const elementBottom = elementTop + targetRect.height;
    const viewportTop = window.pageYOffset;
    const viewportBottom = viewportTop + window.innerHeight;

    if (elementTop < viewportTop || elementBottom > viewportBottom) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const clearHighlight = () => {
    if (!activeTour) {return;}

    const currentStep = activeTour.steps[currentStepIndex];
    const targetElement = document.querySelector(currentStep.target) as HTMLElement;

    if (targetElement) {
      targetElement.style.position = '';
      targetElement.style.zIndex = '';
      targetElement.style.outline = '';
      targetElement.style.outlineOffset = '';
      targetElement.style.borderRadius = '';
    }
  };

  const nextStep = () => {
    if (!activeTour) {return;}

    clearHighlight();

    if (currentStepIndex < activeTour.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      
      // Track step completion
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'tooltip_step_completed', {
          tour_id: activeTour.id,
          step_id: activeTour.steps[currentStepIndex].id,
          step_index: currentStepIndex
        });
      }
    } else {
      completeTour();
    }
  };

  const previousStep = () => {
    if (!activeTour || currentStepIndex === 0) {return;}

    clearHighlight();
    setCurrentStepIndex(currentStepIndex - 1);
  };

  const skipTour = () => {
    if (!activeTour) {return;}

    clearHighlight();
    
    // Track skip
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'tooltip_tour_skipped', {
        tour_id: activeTour.id,
        step_index: currentStepIndex,
        total_steps: activeTour.steps.length
      });
    }

    onSkip?.(activeTour.id);
    closeTour();
  };

  const completeTour = () => {
    if (!activeTour) {return;}

    clearHighlight();
    
    // Track completion
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'tooltip_tour_completed', {
        tour_id: activeTour.id,
        total_steps: activeTour.steps.length
      });
    }

    onComplete?.(activeTour.id);
    closeTour();
  };

  const closeTour = () => {
    clearHighlight();
    setActiveTour(null);
    setCurrentStepIndex(0);
    setTooltipVisible(false);
  };

  if (!activeTour || !tooltipVisible) {
    return null;
  }

  const currentStep = activeTour.steps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / activeTour.steps.length) * 100;

  return createPortal(
    <>
      {/* Overlay */}
      <div 
        ref={overlayRef}
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9998]"
        onClick={skipTour}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-[9999] w-80"
        style={{
          left: tooltipPosition.x,
          top: tooltipPosition.y
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="shadow-xl border-2">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {currentStep.highlight ? (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Target className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className="flex-1">
                  <CardTitle className="text-base leading-tight">
                    {currentStep.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {currentStepIndex + 1} of {activeTour.steps.length}
                    </Badge>
                    {currentStep.optional && (
                      <Badge variant="outline" className="text-xs">
                        Optional
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={skipTour}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Progress */}
            <div className="space-y-1">
              <Progress value={progress} className="h-1" />
              <p className="text-xs text-muted-foreground text-center">
                {Math.round(progress)}% complete
              </p>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {currentStep.description}
            </p>

            {/* Action Button */}
            {currentStep.action && (
              <Button
                onClick={currentStep.action.onClick}
                variant="outline"
                size="sm"
                className="w-full gap-2"
              >
                <Zap className="h-4 w-4" />
                {currentStep.action.label}
              </Button>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Button
                  onClick={previousStep}
                  disabled={currentStepIndex === 0}
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={skipTour}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  Skip Tour
                </Button>
              </div>

              <Button
                onClick={nextStep}
                size="sm"
                className="gap-1"
              >
                {currentStepIndex === activeTour.steps.length - 1 ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Finish
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>,
    document.body
  );
};

// Hook for easy tour management
export const useTooltipTour = () => {
  const [activeTourId, setActiveTourId] = useState<string | null>(null);

  const startTour = (tourId: string) => {
    setActiveTourId(tourId);
  };

  const stopTour = () => {
    setActiveTourId(null);
  };

  return {
    activeTourId,
    startTour,
    stopTour
  };
};

// Component for triggering tours
interface TourTriggerProps {
  tourId: string;
  children: React.ReactNode;
  className?: string;
}

export const TourTrigger: React.FC<TourTriggerProps> = ({
  tourId,
  children,
  className
}) => {
  const { startTour } = useTooltipTour();

  return (
    <div
      className={cn("cursor-pointer", className)}
      onClick={() => startTour(tourId)}
    >
      {children}
    </div>
  );
};

export default InteractiveTooltips;