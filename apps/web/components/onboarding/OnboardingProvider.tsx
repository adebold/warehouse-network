import { useSession } from 'next-auth/react';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { logger } from './utils/logger';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: string; // Component name as string for easier serialization
  isComplete: boolean;
  isRequired: boolean;
  order: number;
}

export interface OnboardingFlow {
  id: string;
  name: string;
  userRole: string;
  steps: OnboardingStep[];
  currentStepIndex: number;
  isComplete: boolean;
  progress: number;
}

interface OnboardingContextType {
  flows: Record<string, OnboardingFlow>;
  currentFlow: OnboardingFlow | null;
  isOnboardingActive: boolean;
  startOnboarding: (flowId: string) => void;
  completeStep: (stepId: string) => void;
  skipStep: (stepId: string) => void;
  nextStep: () => void;
  previousStep: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

// Onboarding flow definitions
const ONBOARDING_FLOWS: Record<string, Omit<OnboardingFlow, 'currentStepIndex' | 'isComplete' | 'progress'>> = {
  customer: {
    id: 'customer',
    name: 'Customer Onboarding',
    userRole: 'CUSTOMER_USER',
    steps: [
      {
        id: 'welcome',
        title: 'Welcome to SkidSpace',
        description: 'Get started with your warehouse space journey',
        component: 'WelcomeStep',
        isComplete: false,
        isRequired: true,
        order: 1
      },
      {
        id: 'profile-setup',
        title: 'Complete Your Profile',
        description: 'Tell us about your business needs',
        component: 'ProfileSetupStep',
        isComplete: false,
        isRequired: true,
        order: 2
      },
      {
        id: 'preferences',
        title: 'Set Your Preferences',
        description: 'Customize your experience',
        component: 'PreferencesStep',
        isComplete: false,
        isRequired: false,
        order: 3
      },
      {
        id: 'first-search',
        title: 'Find Your First Space',
        description: 'Discover available warehouse spaces',
        component: 'FirstSearchStep',
        isComplete: false,
        isRequired: true,
        order: 4
      },
      {
        id: 'payment-setup',
        title: 'Setup Payment',
        description: 'Add your payment method for bookings',
        component: 'PaymentSetupStep',
        isComplete: false,
        isRequired: false,
        order: 5
      }
    ]
  },
  operator: {
    id: 'operator',
    name: 'Operator Onboarding',
    userRole: 'OPERATOR_ADMIN',
    steps: [
      {
        id: 'welcome',
        title: 'Welcome to SkidSpace',
        description: 'Start monetizing your warehouse space',
        component: 'OperatorWelcomeStep',
        isComplete: false,
        isRequired: true,
        order: 1
      },
      {
        id: 'business-verification',
        title: 'Verify Your Business',
        description: 'Complete business and insurance verification',
        component: 'BusinessVerificationStep',
        isComplete: false,
        isRequired: true,
        order: 2
      },
      {
        id: 'warehouse-setup',
        title: 'Add Your Warehouse',
        description: 'List your warehouse details and capacity',
        component: 'WarehouseSetupStep',
        isComplete: false,
        isRequired: true,
        order: 3
      },
      {
        id: 'pricing-setup',
        title: 'Set Your Pricing',
        description: 'Configure pricing for your services',
        component: 'PricingSetupStep',
        isComplete: false,
        isRequired: true,
        order: 4
      },
      {
        id: 'team-setup',
        title: 'Invite Your Team',
        description: 'Add team members and assign roles',
        component: 'TeamSetupStep',
        isComplete: false,
        isRequired: false,
        order: 5
      },
      {
        id: 'payment-setup',
        title: 'Setup Payouts',
        description: 'Configure Stripe for receiving payments',
        component: 'PayoutSetupStep',
        isComplete: false,
        isRequired: true,
        order: 6
      }
    ]
  },
  admin: {
    id: 'admin',
    name: 'Admin Onboarding',
    userRole: 'SUPER_ADMIN',
    steps: [
      {
        id: 'welcome',
        title: 'Welcome Admin',
        description: 'Get familiar with admin capabilities',
        component: 'AdminWelcomeStep',
        isComplete: false,
        isRequired: true,
        order: 1
      },
      {
        id: 'platform-overview',
        title: 'Platform Overview',
        description: 'Understand the platform architecture',
        component: 'PlatformOverviewStep',
        isComplete: false,
        isRequired: true,
        order: 2
      },
      {
        id: 'user-management',
        title: 'User Management',
        description: 'Learn user and operator management',
        component: 'UserManagementStep',
        isComplete: false,
        isRequired: true,
        order: 3
      },
      {
        id: 'monitoring-setup',
        title: 'Setup Monitoring',
        description: 'Configure alerts and monitoring',
        component: 'MonitoringSetupStep',
        isComplete: false,
        isRequired: false,
        order: 4
      }
    ]
  }
};

interface OnboardingProviderProps {
  children: ReactNode;
}

export const OnboardingProvider: React.FC<OnboardingProviderProps> = ({ children }) => {
  const { data: session } = useSession();
  const [flows, setFlows] = useState<Record<string, OnboardingFlow>>({});
  const [currentFlow, setCurrentFlow] = useState<OnboardingFlow | null>(null);
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);

  // Initialize flows with completion state
  useEffect(() => {
    const initializeFlows = () => {
      const initializedFlows: Record<string, OnboardingFlow> = {};
      
      Object.entries(ONBOARDING_FLOWS).forEach(([flowId, flowDef]) => {
        initializedFlows[flowId] = {
          ...flowDef,
          currentStepIndex: 0,
          isComplete: false,
          progress: 0
        };
      });
      
      setFlows(initializedFlows);
    };

    initializeFlows();
  }, []);

  // Load user's onboarding state from localStorage or API
  useEffect(() => {
    if (session?.user?.id) {
      loadOnboardingState();
    }
  }, [session]);

  const loadOnboardingState = async () => {
    try {
      // First check localStorage for quick loading
      const savedState = localStorage.getItem(`onboarding_${session?.user?.id}`);
      if (savedState) {
        const state = JSON.parse(savedState);
        setFlows(state.flows);
        setCurrentFlow(state.currentFlow);
        setIsOnboardingActive(state.isOnboardingActive);
      }

      // Then fetch from API for authoritative state
      const response = await fetch('/api/user/onboarding-state');
      if (response.ok) {
        const state = await response.json();
        setFlows(state.flows || flows);
        setCurrentFlow(state.currentFlow || null);
        setIsOnboardingActive(state.isOnboardingActive || false);
      }
    } catch (error) {
      logger.error('Failed to load onboarding state:', error);
    }
  };

  const saveOnboardingState = async (newState: {
    flows: Record<string, OnboardingFlow>;
    currentFlow: OnboardingFlow | null;
    isOnboardingActive: boolean;
  }) => {
    // Save to localStorage immediately
    localStorage.setItem(`onboarding_${session?.user?.id}`, JSON.stringify(newState));

    // Save to API
    try {
      await fetch('/api/user/onboarding-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newState)
      });
    } catch (error) {
      logger.error('Failed to save onboarding state:', error);
    }
  };

  const calculateProgress = (flow: OnboardingFlow): number => {
    const completedSteps = flow.steps.filter(step => step.isComplete).length;
    return Math.round((completedSteps / flow.steps.length) * 100);
  };

  const startOnboarding = (flowId: string) => {
    const flow = flows[flowId];
    if (!flow) {return;}

    const newFlow = { ...flow, currentStepIndex: 0 };
    setCurrentFlow(newFlow);
    setIsOnboardingActive(true);

    const newState = {
      flows,
      currentFlow: newFlow,
      isOnboardingActive: true
    };
    saveOnboardingState(newState);
  };

  const completeStep = (stepId: string) => {
    if (!currentFlow) {return;}

    const updatedSteps = currentFlow.steps.map(step =>
      step.id === stepId ? { ...step, isComplete: true } : step
    );

    const updatedFlow = {
      ...currentFlow,
      steps: updatedSteps,
      progress: calculateProgress({ ...currentFlow, steps: updatedSteps })
    };

    // Check if all required steps are complete
    const allRequiredComplete = updatedSteps
      .filter(step => step.isRequired)
      .every(step => step.isComplete);

    if (allRequiredComplete) {
      updatedFlow.isComplete = true;
    }

    setCurrentFlow(updatedFlow);
    
    const updatedFlows = { ...flows, [currentFlow.id]: updatedFlow };
    setFlows(updatedFlows);

    const newState = {
      flows: updatedFlows,
      currentFlow: updatedFlow,
      isOnboardingActive
    };
    saveOnboardingState(newState);

    // Track completion for analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'onboarding_step_completed', {
        flow_id: currentFlow.id,
        step_id: stepId,
        step_order: updatedSteps.find(s => s.id === stepId)?.order || 0
      });
    }
  };

  const skipStep = (stepId: string) => {
    if (!currentFlow) {return;}

    const step = currentFlow.steps.find(s => s.id === stepId);
    if (step?.isRequired) {return;} // Can't skip required steps

    completeStep(stepId); // Mark as complete but track as skipped
    
    // Track skip for analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'onboarding_step_skipped', {
        flow_id: currentFlow.id,
        step_id: stepId,
        step_order: step?.order || 0
      });
    }
  };

  const nextStep = () => {
    if (!currentFlow) {return;}

    if (currentFlow.currentStepIndex < currentFlow.steps.length - 1) {
      const updatedFlow = {
        ...currentFlow,
        currentStepIndex: currentFlow.currentStepIndex + 1
      };
      
      setCurrentFlow(updatedFlow);
      
      const updatedFlows = { ...flows, [currentFlow.id]: updatedFlow };
      setFlows(updatedFlows);
      
      const newState = {
        flows: updatedFlows,
        currentFlow: updatedFlow,
        isOnboardingActive
      };
      saveOnboardingState(newState);
    }
  };

  const previousStep = () => {
    if (!currentFlow) {return;}

    if (currentFlow.currentStepIndex > 0) {
      const updatedFlow = {
        ...currentFlow,
        currentStepIndex: currentFlow.currentStepIndex - 1
      };
      
      setCurrentFlow(updatedFlow);
      
      const updatedFlows = { ...flows, [currentFlow.id]: updatedFlow };
      setFlows(updatedFlows);
      
      const newState = {
        flows: updatedFlows,
        currentFlow: updatedFlow,
        isOnboardingActive
      };
      saveOnboardingState(newState);
    }
  };

  const completeOnboarding = () => {
    setIsOnboardingActive(false);
    setCurrentFlow(null);

    const newState = {
      flows,
      currentFlow: null,
      isOnboardingActive: false
    };
    saveOnboardingState(newState);

    // Track completion for analytics
    if (typeof window !== 'undefined' && window.gtag && currentFlow) {
      window.gtag('event', 'onboarding_completed', {
        flow_id: currentFlow.id,
        flow_name: currentFlow.name,
        total_steps: currentFlow.steps.length,
        completed_steps: currentFlow.steps.filter(s => s.isComplete).length
      });
    }
  };

  const resetOnboarding = () => {
    const resetFlows: Record<string, OnboardingFlow> = {};
    
    Object.entries(ONBOARDING_FLOWS).forEach(([flowId, flowDef]) => {
      resetFlows[flowId] = {
        ...flowDef,
        currentStepIndex: 0,
        isComplete: false,
        progress: 0,
        steps: flowDef.steps.map(step => ({ ...step, isComplete: false }))
      };
    });
    
    setFlows(resetFlows);
    setCurrentFlow(null);
    setIsOnboardingActive(false);

    const newState = {
      flows: resetFlows,
      currentFlow: null,
      isOnboardingActive: false
    };
    saveOnboardingState(newState);
  };

  const value: OnboardingContextType = {
    flows,
    currentFlow,
    isOnboardingActive,
    startOnboarding,
    completeStep,
    skipStep,
    nextStep,
    previousStep,
    completeOnboarding,
    resetOnboarding
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};

export default OnboardingProvider;