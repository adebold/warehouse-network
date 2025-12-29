// Main onboarding components
export { OnboardingProvider, useOnboarding } from './OnboardingProvider';
export { default as OnboardingModal } from './OnboardingModal';
export { default as OnboardingTrigger } from './OnboardingTrigger';
export { default as ProgressTracker } from './ProgressTracker';
export { default as InteractiveTooltips, useTooltipTour, TourTrigger } from './InteractiveTooltips';

// Step components
export { default as WelcomeStep } from './steps/WelcomeStep';
export { default as ProfileSetupStep } from './steps/ProfileSetupStep';
export { default as PreferencesStep } from './steps/PreferencesStep';
export { default as FirstSearchStep } from './steps/FirstSearchStep';
export { default as PaymentSetupStep } from './steps/PaymentSetupStep';
export { default as OperatorWelcomeStep } from './steps/OperatorWelcomeStep';
export { default as BusinessVerificationStep } from './steps/BusinessVerificationStep';
export { default as WarehouseSetupStep } from './steps/WarehouseSetupStep';
export { default as PricingSetupStep } from './steps/PricingSetupStep';
export { default as TeamSetupStep } from './steps/TeamSetupStep';
export { default as PayoutSetupStep } from './steps/PayoutSetupStep';
export { default as AdminWelcomeStep } from './steps/AdminWelcomeStep';
export { default as PlatformOverviewStep } from './steps/PlatformOverviewStep';
export { default as UserManagementStep } from './steps/UserManagementStep';
export { default as MonitoringSetupStep } from './steps/MonitoringSetupStep';

// Email service
export { EmailService } from './EmailTemplates';

// Types
export type {
  OnboardingStep,
  OnboardingFlow
} from './OnboardingProvider';