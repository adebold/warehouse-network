import type { Warehouse } from '@prisma/client';
import type { Warehouse } from '@warehouse/types';
import type { NextPage, GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import prisma from '../../../lib/prisma';
import { authOptions } from '../../api/auth/[...nextauth]';
import { logger } from '@/lib/client-logger';

interface NewRFQProps {
  warehouses: Warehouse[];
}

const NewRFQ: NextPage<NewRFQProps> = ({ warehouses }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    preferredWarehouseIds: [] as string[],
    estimatedSkidCount: 0,
    footprintType: 'STANDARD',
    expectedInboundDate: '',
    expectedDuration: '',
    specialHandlingNotes: '',
  });

  useEffect(() => {
    if (status === 'loading') {return;}
    if (!session) {router.push('/login');}
    if (session?.user?.role !== 'CUSTOMER_ADMIN') {router.push('/unauthorized');}
  }, [session, status, router]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: name === 'estimatedSkidCount' ? parseInt(value, 10) : value,
    }));
  };

  const handleWarehouseSelection = (warehouseId: string) => {
    setFormData(prevState => {
      const preferredWarehouseIds = prevState.preferredWarehouseIds.includes(warehouseId)
        ? prevState.preferredWarehouseIds.filter(id => id !== warehouseId)
        : [...prevState.preferredWarehouseIds, warehouseId];
      return { ...prevState, preferredWarehouseIds };
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/app/rfqs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/app/quotes');
      } else {
        const errorData = await response.json();
        logger.error('Failed to create RFQ', errorData);
        alert('Failed to create RFQ');
      }
    } catch (error) {
      logger.error('An error occurred:', error);
      alert('An error occurred while creating the RFQ.');
    }
  };

  if (status === 'loading' || !session) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Request a New Quote</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <h3>Preferred Warehouses</h3>
          {warehouses.map(warehouse => (
            <div key={warehouse.id}>
              <input
                type="checkbox"
                id={warehouse.id}
                checked={formData.preferredWarehouseIds.includes(warehouse.id)}
                onChange={() => handleWarehouseSelection(warehouse.id)}
              />
              <label htmlFor={warehouse.id}>{warehouse.name}</label>
            </div>
          ))}
        </div>
        <div>
          <label htmlFor="estimatedSkidCount">Estimated Skid Count</label>
          <input
            type="number"
            id="estimatedSkidCount"
            name="estimatedSkidCount"
            value={formData.estimatedSkidCount}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="footprintType">Footprint Type</label>
          <select name="footprintType" value={formData.footprintType} onChange={handleChange}>
            <option value="STANDARD">Standard</option>
            <option value="OVERSIZED">Oversized</option>
          </select>
        </div>
        <div>
          <label htmlFor="expectedInboundDate">Expected Inbound Date</label>
          <input
            type="date"
            id="expectedInboundDate"
            name="expectedInboundDate"
            value={formData.expectedInboundDate}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="expectedDuration">Expected Duration</label>
          <input
            type="text"
            id="expectedDuration"
            name="expectedDuration"
            value={formData.expectedDuration}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="specialHandlingNotes">Special Handling Notes</label>
          <textarea
            id="specialHandlingNotes"
            name="specialHandlingNotes"
            value={formData.specialHandlingNotes}
            onChange={handleChange}
          />
        </div>
        <button type="submit">Submit RFQ</button>
      </form>{' '}
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session || session.user?.role !== 'CUSTOMER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { status: 'READY_FOR_MARKETPLACE' }, // Only show warehouses ready for marketplace
  });

  return {
    props: {
      warehouses: JSON.parse(JSON.stringify(warehouses)),
    },
  };
};

export default NewRFQ;
