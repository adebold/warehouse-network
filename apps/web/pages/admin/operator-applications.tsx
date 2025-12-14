import type { NextPage, GetServerSideProps } from 'next'
import prisma from '../../lib/prisma'
import type { Operator } from '@prisma/client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

interface AdminOperatorApplicationsProps {
  applications: Operator[]
}

const AdminOperatorApplications: NextPage<AdminOperatorApplicationsProps> = ({ applications }) => {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return // Do nothing while loading
    if (!session) router.push('/login') // If not authenticated, redirect
    if (session?.user?.role !== 'SUPER_ADMIN') router.push('/unauthorized') // If not a super admin, redirect
  }, [session, status, router])

  const handleUpdateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const response = await fetch(`/api/admin/operator-applications/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        // Refresh the page to show the updated status
        window.location.reload();
      } else {
        console.error('Failed to update status');
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      alert('An error occurred while updating the status.');
    }
  };

  if (status === 'loading' || !session || session.user.role !== 'SUPER_ADMIN') {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Operator Applications</h1>
      <table>
        <thead>
          <tr>
            <th>Legal Name</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {applications.map(app => (
            <tr key={app.id}>
              <td>{app.legalName}</td>
              <td>{app.status}</td>
              <td>
                <button onClick={() => handleUpdateStatus(app.id, 'APPROVED')}>Approve</button>
                <button onClick={() => handleUpdateStatus(app.id, 'REJECTED')}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  const applications = await prisma.operator.findMany()
  return {
    props: {
      applications: JSON.parse(JSON.stringify(applications)), // Serialize date objects
    },
  }
}

export default AdminOperatorApplications

