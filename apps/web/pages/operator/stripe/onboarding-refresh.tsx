import type { NextPage } from 'next';
import { useRouter } from 'next/router';

const OnboardingRefresh: NextPage = () => {
  const router = useRouter();

  const handleStripeConnect = async () => {
    try {
      const response = await fetch('/api/operator/stripe/connect-onboarding', {
        method: 'POST',
      });
      const { url } = await response.json();
      router.push(url);
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while connecting to Stripe.');
    }
  };

  return (
    <div>
      <h1>Stripe Onboarding</h1>
      <p>Your onboarding session has expired. Please try again.</p>
      <button onClick={handleStripeConnect}>Connect to Stripe</button>
    </div>
  );
};

export default OnboardingRefresh;
