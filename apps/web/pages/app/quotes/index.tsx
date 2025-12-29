import type { RFQ } from '@prisma/client';
import type { NextPage, GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

import prisma from '../../../lib/prisma';
import { authOptions } from '../../api/auth/[...nextauth]';


interface RFQsProps {
  rfqs: RFQ[];
}

const RFQs: NextPage<RFQsProps> = ({ rfqs }) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') {return;}
    if (!session) {router.push('/login');}
    if (session?.user?.role !== 'CUSTOMER_ADMIN' && session?.user?.role !== 'CUSTOMER_USER') {
      router.push('/unauthorized');
    }
  }, [session, status, router]);

  if (status === 'loading' || !session) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Your RFQs</h1>
      <Link href="/app/quotes/new">Request New Quote</Link>

      <table>
        <thead>
          <tr>
            <th>Estimated Skids</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rfqs.map(rfq => (
            <tr key={rfq.id}>
              <td>{rfq.estimatedSkidCount}</td>
              <td>{rfq.status}</td>
              <td>
                <Link href={`/app/quotes/${rfq.id}`}>View Details</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async context => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (
    !session ||
    (session.user?.role !== 'CUSTOMER_ADMIN' && session.user?.role !== 'CUSTOMER_USER')
  ) {
    return { redirect: { destination: '/unauthorized', permanent: false } };
  }

  if (!session.user.customerId) {
    return { props: { rfqs: [] } };
  }

  const rfqs = await prisma.rFQ.findMany({
    where: { customerId: session.user.customerId },
  });

  return {
    props: {
      rfqs: JSON.parse(JSON.stringify(rfqs)),
    },
  };
};

export default RFQs;
