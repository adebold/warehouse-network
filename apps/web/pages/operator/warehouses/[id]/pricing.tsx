import type { Warehouse, PricingRule } from '@prisma/client';
import type { Warehouse } from '@warehouse/types';
import type { NextPage, GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import prisma from '../../../../lib/prisma';
import { authOptions } from '../../../api/auth/[...nextauth]';

interface PricingProps {
  warehouse: Warehouse & { pricingRules: PricingRule[] };
}

const Pricing: NextPage<PricingProps> = ({ warehouse }) => {
  const { data: session, status } = useSession();

  const router = useRouter();

  const [prices, setPrices] = useState(() => {
    const initialPrices: { [key: string]: number } = {};

    for (const rule of warehouse.pricingRules) {
      initialPrices[rule.chargeCategory] = rule.price;
    }

    return initialPrices;
  });

  useEffect(() => {
    if (status === 'loading') {return;}

    if (!session) {router.push('/login');}

    if (session?.user?.role !== 'OPERATOR_ADMIN') {router.push('/unauthorized');}
  }, [session, status, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setPrices(prevPrices => ({
      ...prevPrices,

      [name]: parseFloat(value),
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch(`/api/operator/warehouses/${warehouse.id}/pricing`, {
        method: 'PUT',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify(prices),
      });

      if (response.ok) {
        alert('Pricing updated successfully');
      } else {
        const errorData = await response.json();

        console.error('Failed to update pricing', errorData);

        alert('Failed to update pricing');
      }
    } catch (error) {
      console.error('An error occurred:', error);

      alert('An error occurred while updating the pricing.');
    }
  };

  if (status === 'loading' || !session || session.user.role !== 'OPERATOR_ADMIN') {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Pricing for {warehouse.name}</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="RECEIVING">Receiving (per skid)</label>

          <input
            type="number"
            id="RECEIVING"
            name="RECEIVING"
            value={prices.RECEIVING || ''}
            onChange={handleChange}
          />
        </div>

        <div>
          <label htmlFor="STORAGE">Storage (per skid per day)</label>

          <input
            type="number"
            id="STORAGE"
            name="STORAGE"
            value={prices.STORAGE || ''}
            onChange={handleChange}
          />
        </div>

        <div>
          <label htmlFor="PICKING">Picking (per skid or per line)</label>

          <input
            type="number"
            id="PICKING"
            name="PICKING"
            value={prices.PICKING || ''}
            onChange={handleChange}
          />
        </div>

        <div>
          <label htmlFor="PICKUP_RELEASE">Pickup / Release (per event)</label>

          <input
            type="number"
            id="PICKUP_RELEASE"
            name="PICKUP_RELEASE"
            value={prices.PICKUP_RELEASE || ''}
            onChange={handleChange}
          />
        </div>

        <button type="submit">Save Pricing</button>
      </form>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);
  const { id } = context.params || {};

  if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: String(id) },
    include: { pricingRules: true },
  });

  if (!warehouse) {
    return { notFound: true };
  }

  return {
    props: {
      warehouse: JSON.parse(JSON.stringify(warehouse)),
    },
  };
};

export default Pricing;
