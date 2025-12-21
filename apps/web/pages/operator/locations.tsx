import type { NextPage, GetServerSideProps } from 'next';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { Location, Warehouse } from '@prisma/client';
import prisma from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]';

interface LocationsProps {
  locations: (Location & { warehouse: Warehouse })[];
  warehouses: Warehouse[];
}

const Locations: NextPage<LocationsProps> = ({ locations, warehouses }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    warehouseId: warehouses[0]?.id || '',
  });

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    if (session?.user?.role !== 'OPERATOR_ADMIN') router.push('/unauthorized');
  }, [session, status, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/operator/locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.replace(router.asPath);
      } else {
        const errorData = await response.json();
        console.error('Failed to create location', errorData);
        alert('Failed to create location');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while creating the location.');
    }
  };

  if (status === 'loading' || !session || session.user.role !== 'OPERATOR_ADMIN') {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Manage Locations</h1>

      <h2>Existing Locations</h2>
      <ul>
        {locations.map(location => (
          <li key={location.id}>
            {location.name} ({location.warehouse.name})
          </li>
        ))}
      </ul>

      <h2>Create New Location</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="name"
          placeholder="Location Name (e.g., A1-R1-S1)"
          value={formData.name}
          onChange={handleChange}
        />
        <select name="warehouseId" value={formData.warehouseId} onChange={handleChange}>
          {warehouses.map(wh => (
            <option key={wh.id} value={wh.id}>
              {wh.name}
            </option>
          ))}
        </select>
        <button type="submit">Create Location</button>
      </form>
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
    include: { operatorUser: true },
  });

  if (!user?.operatorUser) {
    return { notFound: true };
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { operatorId: user.operatorUser.operatorId },
  });

  const locations = await prisma.location.findMany({
    where: { warehouse: { operatorId: user.operatorUser.operatorId } },
    include: { warehouse: true },
  });

  return {
    props: {
      locations: JSON.parse(JSON.stringify(locations)),
      warehouses: JSON.parse(JSON.stringify(warehouses)),
    },
  };
};

export default Locations;
