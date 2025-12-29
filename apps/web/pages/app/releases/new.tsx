import type { Skid } from '@prisma/client';
import type { NextPage, GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import prisma from '../../../lib/prisma';
import { authOptions } from '../../api/auth/[...nextauth]';
import { logger } from './utils/logger';

interface NewReleaseProps {
  skids: Skid[];
}

const NewRelease: NextPage<NewReleaseProps> = ({ skids }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    requestedAt: '',
    carrierDetails: '',
    skidIds: [] as string[],
  });

  useEffect(() => {
    if (status === 'loading') {return;}
    if (!session) {router.push('/login');}
    if (session?.user?.role !== 'CUSTOMER_ADMIN') {router.push('/unauthorized');}
  }, [session, status, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleSkidSelection = (skidId: string) => {
    setFormData(prevState => {
      const skidIds = prevState.skidIds.includes(skidId)
        ? prevState.skidIds.filter(id => id !== skidId)
        : [...prevState.skidIds, skidId];
      return { ...prevState, skidIds };
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/app/releases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/app/releases');
      } else {
        const errorData = await response.json();
        logger.error('Failed to create release request', errorData);
        alert('Failed to create release request');
      }
    } catch (error) {
      logger.error('An error occurred:', error);
      alert('An error occurred while creating the release request.');
    }
  };

  if (status === 'loading' || !session) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Request a New Pickup</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="requestedAt">Requested Pickup Date</label>
          <input
            type="datetime-local"
            id="requestedAt"
            name="requestedAt"
            value={formData.requestedAt}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="carrierDetails">Carrier or Self-Pickup Details</label>
          <textarea
            id="carrierDetails"
            name="carrierDetails"
            value={formData.carrierDetails}
            onChange={handleChange}
          />
        </div>
        <div>
          <h3>Select Skids to Release</h3>
          {skids.map(skid => (
            <div key={skid.id}>
              <input
                type="checkbox"
                id={skid.id}
                checked={formData.skidIds.includes(skid.id)}
                onChange={() => handleSkidSelection(skid.id)}
              />
              <label htmlFor={skid.id}>{skid.skidCode}</label>
            </div>
          ))}
        </div>
        <button type="submit">Submit Request</button>
      </form>{' '}
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session || session.user?.role !== 'CUSTOMER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  if (!session.user.customerId) {
    return { props: { skids: [] } };
  }

  const skids = await prisma.skid.findMany({
    where: {
      customerId: session.user.customerId,
      status: 'STORED',
    },
  });

  return {
    props: {
      skids: JSON.parse(JSON.stringify(skids)),
    },
  };
};

export default NewRelease;
