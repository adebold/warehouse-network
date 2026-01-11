import type { Dispute, Skid } from '@prisma/client';
import type { NextPage, GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import prisma from '../../../lib/prisma';
import { authOptions } from '../../api/auth/[...nextauth]';
import { logger } from '@/lib/client-logger';

interface OperatorDisputeDetailsProps {
  dispute: Dispute & { skids: { skid: Skid }[] };
}

const OperatorDisputeDetails: NextPage<OperatorDisputeDetailsProps> = ({ dispute }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [resolution, setResolution] = useState(dispute.resolution || '');
  const [disputeStatus, setDisputeStatus] = useState(dispute.status);

  useEffect(() => {
    if (status === 'loading') {return;}
    if (!session) {router.push('/login');}
    if (session?.user?.role !== 'OPERATOR_ADMIN') {router.push('/unauthorized');}
  }, [session, status, router]);

  const handleSubmitResolution = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await fetch(`/api/operator/disputes/${dispute.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resolution, status: disputeStatus }),
      });

      if (response.ok) {
        router.replace(router.asPath);
      } else {
        const errorData = await response.json();
        logger.error('Failed to update dispute', errorData);
        alert('Failed to update dispute');
      }
    } catch (error) {
      logger.error('An error occurred:', error);
      alert('An error occurred while updating the dispute.');
    }
  };

  if (status === 'loading' || !session || session.user.role !== 'OPERATOR_ADMIN') {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Dispute Details: {dispute.id}</h1>
      <p>Type: {dispute.type}</p>
      <p>Status: {dispute.status}</p>
      <p>Description: {dispute.description}</p>
      <p>Submitted At: {new Date(dispute.submittedAt).toLocaleString()}</p>
      {dispute.evidence && <p>Evidence: {JSON.stringify(dispute.evidence)}</p>}

      <h2>Affected Skids</h2>
      <ul>
        {dispute.skids.map(s => (
          <li key={s.skid.id}>{s.skid.skidCode}</li>
        ))}
      </ul>

      <h2>Resolve Dispute</h2>
      <form onSubmit={handleSubmitResolution}>
        <div>
          <label htmlFor="resolution">Resolution Details</label>
          <textarea
            id="resolution"
            name="resolution"
            value={resolution}
            onChange={e => setResolution(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="disputeStatus">Status</label>
          <select
            id="disputeStatus"
            name="disputeStatus"
            value={disputeStatus}
            onChange={e => setDisputeStatus(e.target.value)}
          >
            <option value="IN_REVIEW">In Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="ESCALATED">Escalated</option>
          </select>
        </div>
        <button type="submit">Submit Resolution</button>
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

  const dispute = await prisma.dispute.findUnique({
    where: { id: String(id) },
    include: {
      skids: { include: { skid: true } },
    },
  });

  if (!dispute || dispute.operatorId !== session.user.operatorId) {
    return { notFound: true };
  }

  return {
    props: {
      dispute: JSON.parse(JSON.stringify(dispute)),
    },
  };
};

export default OperatorDisputeDetails;
