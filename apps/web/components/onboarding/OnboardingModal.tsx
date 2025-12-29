import { Check, X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import React from 'react';

import { useOnboarding } from './OnboardingProvider';
import BusinessVerificationStep from './steps/BusinessVerificationStep';
import FirstSearchStep from './steps/FirstSearchStep';
import PreferencesStep from './steps/PreferencesStep';
import ProfileSetupStep from './steps/ProfileSetupStep';
import WelcomeStep from './steps/WelcomeStep';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// Import onboarding step components
import PaymentSetupStep from './steps/PaymentSetupStep';
import OperatorWelcomeStep from './steps/OperatorWelcomeStep';
import WarehouseSetupStep from './steps/WarehouseSetupStep';
import PricingSetupStep from './steps/PricingSetupStep';
import TeamSetupStep from './steps/TeamSetupStep';
import PayoutSetupStep from './steps/PayoutSetupStep';
import AdminWelcomeStep from './steps/AdminWelcomeStep';
import PlatformOverviewStep from './steps/PlatformOverviewStep';
import UserManagementStep from './steps/UserManagementStep';
import MonitoringSetupStep from './steps/MonitoringSetupStep';

// Component map for dynamic rendering
const STEP_COMPONENTS = {
  WelcomeStep,
  ProfileSetupStep,
  PreferencesStep,
  FirstSearchStep,
  PaymentSetupStep,
  OperatorWelcomeStep,
  BusinessVerificationStep,
  WarehouseSetupStep,
  PricingSetupStep,
  TeamSetupStep,
  PayoutSetupStep,
  AdminWelcomeStep,
  PlatformOverviewStep,
  UserManagementStep,
  MonitoringSetupStep
};

interface OnboardingModalProps {
  open?: boolean;
  onClose?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  open,
  onClose
}) => {
  const {
    currentFlow,
    isOnboardingActive,
    completeStep,
    skipStep,
    nextStep,
    previousStep,
    completeOnboarding
  } = useOnboarding();

  const isOpen = open !== undefined ? open : isOnboardingActive;

  if (!currentFlow || !isOpen) {return null;}

  const currentStep = currentFlow.steps[currentFlow.currentStepIndex];
  const isLastStep = currentFlow.currentStepIndex === currentFlow.steps.length - 1;
  const isFirstStep = currentFlow.currentStepIndex === 0;

  // Get the component for the current step
  const StepComponent = STEP_COMPONENTS[currentStep.component as keyof typeof STEP_COMPONENTS];

  const handleStepComplete = () => {
    completeStep(currentStep.id);
    
    if (isLastStep) {
      // Check if all required steps are complete
      const allRequiredComplete = currentFlow.steps
        .filter(step => step.isRequired)
        .every(step => step.isComplete || step.id === currentStep.id);
      
      if (allRequiredComplete) {
        completeOnboarding();
        onClose?.();
      }
    } else {
      nextStep();
    }
  };

  const handleSkipStep = () => {
    if (!currentStep.isRequired) {
      skipStep(currentStep.id);
      
      if (isLastStep) {
        completeOnboarding();
        onClose?.();
      } else {
        nextStep();
      }
    }
  };

  const handleClose = () => {
    onClose?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header with progress */}
        <DialogHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold">
              {currentFlow.name}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Progress indicators */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Step {currentFlow.currentStepIndex + 1} of {currentFlow.steps.length}
              </span>
              <span className="font-medium">
                {currentFlow.progress}% Complete
              </span>
            </div>
            
            <Progress value={currentFlow.progress} className="h-2" />
            
            {/* Step indicators */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {currentFlow.steps.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                    index === currentFlow.currentStepIndex
                      ? "bg-primary text-primary-foreground"
                      : step.isComplete
                      ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {step.isComplete ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="h-3 w-3 rounded-full border-2 border-current" />
                  )}
                  {step.title}
                  {step.isRequired && (
                    <Badge variant="secondary" className="text-xs">
                      Required
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogHeader>

        {/* Current step content */}
        <div className="flex-1 space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">{currentStep.title}</h3>
            <p className="text-muted-foreground">{currentStep.description}</p>
          </div>

          {/* Render the step component */}
          <div className="min-h-[300px]">
            {StepComponent ? (
              <StepComponent
                onComplete={handleStepComplete}
                onSkip={currentStep.isRequired ? undefined : handleSkipStep}
                isRequired={currentStep.isRequired}
                flowId={currentFlow.id}
                stepId={currentStep.id}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p>Step component not found: {currentStep.component}</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between pt-6 border-t">
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <Button
                variant="outline"
                onClick={previousStep}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!currentStep.isRequired && (
              <Button
                variant="ghost"
                onClick={handleSkipStep}
                className="gap-2"
              >
                <SkipForward className="h-4 w-4" />
                Skip
              </Button>
            )}
            
            <Button
              onClick={handleStepComplete}
              className="gap-2"
            >
              {isLastStep ? 'Complete Setup' : 'Continue'}
              {!isLastStep && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingModal;