import type { Operator } from '@prisma/client';
import type { NextPage, GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

import prisma from '../../lib/prisma';
import { authOptions } from '../api/auth/[...nextauth]';
import { logger } from '@/lib/client-logger';

interface OperatorDashboardProps {
  operator: Operator;
}

const OperatorDashboard: NextPage<OperatorDashboardProps> = ({ operator }) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') {return;}
    if (!session) {router.push('/login');}
    if (session?.user?.role !== 'OPERATOR_ADMIN') {router.push('/unauthorized');}
  }, [session, status, router]);

  const handleStripeConnect = async () => {
    try {
      const response = await fetch('/api/operator/stripe/connect-onboarding', {
        method: 'POST',
      });
      const { url } = await response.json();
      router.push(url);
    } catch (error) {
      logger.error('An error occurred:', error);
      alert('An error occurred while connecting to Stripe.');
    }
  };

  if (status === 'loading' || !session || session.user.role !== 'OPERATOR_ADMIN') {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Operator Dashboard</h1>
      {!operator.stripeOnboardingComplete && (
        <div>
          <p>Please connect your Stripe account to start receiving payments.</p>
          <button onClick={handleStripeConnect}>Connect to Stripe</button>
        </div>
      )}
      <p>Welcome to your dashboard. More features coming soon!</p>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email ?? '' },
    include: { operatorUser: { include: { operator: true } } },
  });

  if (!user?.operatorUser) {
    return { notFound: true };
  }

  return {
    props: {
      operator: JSON.parse(JSON.stringify(user.operatorUser.operator)),
    },
  };
};

export default OperatorDashboard;
