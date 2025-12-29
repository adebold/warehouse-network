import { useSession } from 'next-auth/react';
import React, { useEffect } from 'react';

import OnboardingModal from './OnboardingModal';
import { useOnboarding } from './OnboardingProvider';

interface OnboardingTriggerProps {
  children?: React.ReactNode;
  forceStart?: boolean;
  flowId?: string;
}

export const OnboardingTrigger: React.FC<OnboardingTriggerProps> = ({
  children,
  forceStart = false,
  flowId
}) => {
  const { data: session, status } = useSession();
  const { flows, currentFlow, isOnboardingActive, startOnboarding } = useOnboarding();

  useEffect(() => {
    if (status === 'loading') {return;} // Wait for session to load
    
    const shouldStartOnboarding = () => {
      // Force start if requested
      if (forceStart && flowId) {
        startOnboarding(flowId);
        return;
      }

      // Don't start if already in progress
      if (isOnboardingActive) {return;}

      // Don't start if no user
      if (!session?.user) {return;}

      // Determine appropriate flow based on user role
      const userRole = session.user.role || 'CUSTOMER_USER';
      let targetFlowId = 'customer';

      switch (userRole) {
        case 'OPERATOR_ADMIN':
          targetFlowId = 'operator';
          break;
        case 'SUPER_ADMIN':
          targetFlowId = 'admin';
          break;
        default:
          targetFlowId = 'customer';
          break;
      }

      // Check if user has completed onboarding for their role
      const targetFlow = flows[targetFlowId];
      if (targetFlow && !targetFlow.isComplete) {
        // Check if this is a new user (created in the last 24 hours)
        const userCreatedAt = new Date(session.user.createdAt || '');
        const now = new Date();
        const hoursSinceCreation = (now.getTime() - userCreatedAt.getTime()) / (1000 * 60 * 60);

        // Start onboarding for new users or if explicitly requested
        if (hoursSinceCreation < 24 || forceStart) {
          startOnboarding(targetFlowId);
        }
      }
    };

    // Small delay to ensure all providers are ready
    const timer = setTimeout(shouldStartOnboarding, 100);
    return () => clearTimeout(timer);
  }, [session, status, flows, isOnboardingActive, forceStart, flowId, startOnboarding]);

  return (
    <>
      {children}
      <OnboardingModal />
    </>
  );
};

export default OnboardingTrigger;