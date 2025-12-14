import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import type { RFQ } from '@prisma/client'
import prisma from '@warehouse-network/db/src/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]'
import Link from 'next/link'

interface AdminRFQsProps {
  rfqs: RFQ[]
}

const AdminRFQs: NextPage<AdminRFQsProps> = ({ rfqs }) => {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
    if (session?.user?.role !== 'SUPER_ADMIN') router.push('/unauthorized')
  }, [session, status, router])

  if (status === 'loading' || !session || session.user.role !== 'SUPER_ADMIN') {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>RFQs for Review</h1>
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Estimated Skids</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rfqs.map(rfq => (
            <tr key={rfq.id}>
              <td>{rfq.customerId}</td>
              <td>{rfq.estimatedSkidCount}</td>
              <td>{rfq.status}</td>
              <td>
                <Link href={`/admin/quotes/new?rfqId=${rfq.id}`}>Create Quote</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } }
  }

  const rfqs = await prisma.rFQ.findMany({
    where: { status: 'PENDING' },
  })

  return {
    props: {
      rfqs: JSON.parse(JSON.stringify(rfqs)),
    },
  }
}

export default AdminRFQs
