
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { logger } from '@/lib/client-logger';

const WelcomeOperator: NextPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') {return;}
    if (!session) {router.push('/login');}
    if (session?.user?.role !== 'OPERATOR_ADMIN') {router.push('/unauthorized');}
  }, [session, status, router]);

  const handleAccept = async () => {
    try {
      const response = await fetch('/api/operator/accept-terms', {
        method: 'PUT',
      });

      if (response.ok) {
        router.push('/operator/dashboard');
      } else {
        logger.error('Failed to accept terms');
        alert('Failed to accept terms');
      }
    } catch (error) {
      logger.error('An error occurred:', error);
      alert('An error occurred while accepting the terms.');
    }
  };

  if (status === 'loading' || !session || session.user.role !== 'OPERATOR_ADMIN') {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Welcome, Operator!</h1>
      <p>Please review and accept our terms and conditions to continue.</p>
      <div
        style={{
          border: '1px solid #ccc',
          padding: '1rem',
          margin: '1rem 0',
          height: '300px',
          overflowY: 'scroll',
        }}
      >
        <h2>Terms & Conditions</h2>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. ...</p>
      </div>
      <button onClick={handleAccept}>Accept Terms & Conditions</button>
    </div>
  );
};

export default WelcomeOperator;
