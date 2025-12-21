import type { Order, Customer } from '@warehouse/types';
import type { NextPage, GetServerSideProps } from 'next';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import type { ReceivingOrder, Skid } from '@prisma/client';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../api/auth/[...nextauth]';
// import { PDFDownloadLink } from '@react-pdf/renderer';
import dynamic from 'next/dynamic';

// const SkidLabel = dynamic(() => import('../../../../components/SkidLabel'), { ssr: false });

interface ReceivingOrderDetailsProps {
  order: ReceivingOrder & {
    skids: Skid[];
    warehouse: { name: string };
    customer: { name: string };
  };
}

const ReceivingOrderDetails: NextPage<ReceivingOrderDetailsProps> = ({ order }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [numberOfSkids, setNumberOfSkids] = useState(order.expectedSkidCount || 1);
  const [skids, setSkids] = useState(order.skids);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
  }, [session, status, router]);

  const handleGenerateSkids = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const response = await fetch(`/api/operator/receiving-orders/${order.id}/generate-skids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberOfSkids }),
      });

      if (response.ok) {
        const newSkids = await response.json();
        setSkids(prevSkids => [...prevSkids, ...newSkids]);
      } else {
        alert('Failed to generate skids');
      }
    } catch (error) {
      alert('An error occurred while generating skids.');
    }
  };

  if (status === 'loading' || !session) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Receiving Order: {order.reference}</h1>
      <p>Customer ID: {order.customerId}</p>
      <p>Expected Skids: {order.expectedSkidCount}</p>

      <form onSubmit={handleGenerateSkids}>
        <input
          type="number"
          value={numberOfSkids}
          onChange={e => setNumberOfSkids(parseInt(e.target.value, 10))}
        />
        <button type="submit">Generate Skids</button>
      </form>

      <h2>Generated Skids</h2>
      {skids.length > 0 && (
        <PDFDownloadLink
          document={
            <SkidLabel
              skids={skids}
              warehouseName={order.warehouse.name}
              customerName={order.customer.name}
              date={new Date().toLocaleDateString()}
            />
          }
          fileName="skid-labels.pdf"
        >
          {({ blob, url, loading, error }) =>
            loading ? 'Loading document...' : 'Print All Labels'
          }
        </PDFDownloadLink>
      )}
      <ul>
        {skids.map(skid => (
          <li key={skid.id}>{skid.skidCode}</li>
        ))}
      </ul>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);
  const { id } = context.params || {};

  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const order = await prisma.receivingOrder.findUnique({
    where: { id: String(id) },
    include: {
      skids: true,
      warehouse: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });

  if (!order) {
    return { notFound: true };
  }

  return {
    props: {
      order: JSON.parse(JSON.stringify(order)),
    },
  };
};

export default ReceivingOrderDetails;
