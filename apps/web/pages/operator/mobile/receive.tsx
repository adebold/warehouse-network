import type { NextPage } from 'next';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const Receive: NextPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    customerId: '',
    carrier: '',
    expectedSkidCount: 0,
    notes: '',
  });

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    if (session?.user?.role !== 'OPERATOR_ADMIN' && session?.user?.role !== 'WAREHOUSE_STAFF') {
      router.push('/unauthorized');
    }
  }, [session, status, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: name === 'expectedSkidCount' ? parseInt(value, 10) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/operator/receiving-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const newOrder = await response.json();
        router.push(`/operator/mobile/receiving-orders/${newOrder.id}`);
      } else {
        const errorData = await response.json();
        console.error('Failed to create receiving order', errorData);
        alert('Failed to create receiving order');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while creating the receiving order.');
    }
  };

  if (status === 'loading' || !session) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Receive Skids</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="customerId">Customer ID</label>
          <input
            type="text"
            id="customerId"
            name="customerId"
            value={formData.customerId}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="carrier">Carrier</label>
          <input
            type="text"
            id="carrier"
            name="carrier"
            value={formData.carrier}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="expectedSkidCount">Expected Skid Count</label>
          <input
            type="number"
            id="expectedSkidCount"
            name="expectedSkidCount"
            value={formData.expectedSkidCount}
            onChange={handleChange}
          />
        </div>
        <div>
          <label htmlFor="notes">Notes (damage, exceptions)</label>
          <textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} />
        </div>
        <button type="submit">Create Receiving Order</button>
      </form>{' '}
    </div>
  );
};

export default Receive;
