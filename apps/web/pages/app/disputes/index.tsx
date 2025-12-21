import type { NextPage, GetServerSideProps } from 'next';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import type { Dispute } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]';
import Link from 'next/link';

interface DisputesProps {
  disputes: Dispute[];
}

const Disputes: NextPage<DisputesProps> = ({ disputes }) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    if (session?.user?.role !== 'CUSTOMER_ADMIN' && session?.user?.role !== 'CUSTOMER_USER') {
      router.push('/unauthorized');
    }
  }, [session, status, router]);

  if (status === 'loading' || !session) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Your Disputes</h1>
      <Link href="/app/disputes/new">Submit New Dispute</Link>

      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Status</th>
            <th>Submitted At</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {disputes.map(dispute => (
            <tr key={dispute.id}>
              <td>{dispute.type}</td>
              <td>{dispute.status}</td>
              <td>{new Date(dispute.submittedAt).toLocaleDateString()}</td>
              <td>
                <Link href={`/app/disputes/${dispute.id}`}>View Details</Link>
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
    return { props: { disputes: [] } };
  }

  const disputes = await prisma.dispute.findMany({
    where: { customerId: session.user.customerId },
  });

  return {
    props: {
      disputes: JSON.parse(JSON.stringify(disputes)),
    },
  };
};

export default Disputes;
