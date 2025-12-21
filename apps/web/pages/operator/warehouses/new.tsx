import type { Warehouse } from '@warehouse/types';
import type { NextPage } from 'next';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const NewWarehouse: NextPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    operatingHours: '',
    capacity: 0,
    supportedGoods: '',
    dockAccessInstructions: '',
  });

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    if (session?.user?.role !== 'OPERATOR_ADMIN') router.push('/unauthorized');
  }, [session, status, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: name === 'capacity' ? parseInt(value, 10) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/operator/warehouses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/operator/warehouses');
      } else {
        const errorData = await response.json();
        console.error('Failed to create warehouse', errorData);
        alert('Failed to create warehouse');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while creating the warehouse.');
    }
  };

  if (status === 'loading' || !session || session.user.role !== 'OPERATOR_ADMIN') {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Register New Warehouse</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">Warehouse Name</label>
          <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} />
        </div>
        <div>
          <label htmlFor="address">Address</label>
          <input
            type="text"
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="operatingHours">Operating Hours</label>
          <input
            type="text"
            id="operatingHours"
            name="operatingHours"
            value={formData.operatingHours}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="capacity">Capacity (Pallet Positions)</label>
          <input
            type="number"
            id="capacity"
            name="capacity"
            value={formData.capacity}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="supportedGoods">Supported Goods Categories</label>
          <textarea
            id="supportedGoods"
            name="supportedGoods"
            value={formData.supportedGoods}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="dockAccessInstructions">Dock Access & Instructions</label>
          <textarea
            id="dockAccessInstructions"
            name="dockAccessInstructions"
            value={formData.dockAccessInstructions}
            onChange={handleChange}
          />
        </div>
        <button type="submit">Register Warehouse</button>
      </form>{' '}
    </div>
  );
};

export default NewWarehouse;
