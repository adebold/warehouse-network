import type { NextPage, GetServerSideProps } from 'next';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import type { ReleaseRequest } from '@prisma/client';
import prisma from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]';

interface OperatorReleasesProps {
  releaseRequests: ReleaseRequest[];
}

const OperatorReleases: NextPage<OperatorReleasesProps> = ({ releaseRequests }) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) router.push('/login');
    if (session?.user?.role !== 'OPERATOR_ADMIN') router.push('/unauthorized');
  }, [session, status, router]);

  const handleUpdateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const response = await fetch(`/api/operator/releases/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        router.replace(router.asPath);
      } else {
        const errorData = await response.json();
        console.error('Failed to update release request status', errorData);
        alert('Failed to update release request status');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while updating the release request status.');
    }
  };

  if (status === 'loading' || !session) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Release Requests</h1>
      <table>
        <thead>
          <tr>
            <th>Requested At</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {releaseRequests.map(req => (
            <tr key={req.id}>
              <td>{new Date(req.requestedAt).toLocaleString()}</td>
              <td>{req.customerId}</td>
              <td>{req.status}</td>
              <td>
                <button onClick={() => handleUpdateStatus(req.id, 'APPROVED')}>Approve</button>
                <button onClick={() => handleUpdateStatus(req.id, 'REJECTED')}>Reject</button>
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

  const releaseRequests = await prisma.releaseRequest.findMany({
    where: { warehouse: { operatorId: user.operatorUser.operatorId } },
  });

  return {
    props: {
      releaseRequests: JSON.parse(JSON.stringify(releaseRequests)),
    },
  };
};

export default OperatorReleases;
