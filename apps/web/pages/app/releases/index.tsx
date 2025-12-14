import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import type { ReleaseRequest } from '@prisma/client'
import prisma from '../../../lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../api/auth/[...nextauth]'
import Link from 'next/link'

interface ReleasesProps {
  releaseRequests: ReleaseRequest[]
}

const Releases: NextPage<ReleasesProps> = ({ releaseRequests }) => {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
    if (session?.user?.role !== 'CUSTOMER_ADMIN' && session?.user?.role !== 'CUSTOMER_USER') {
      router.push('/unauthorized')
    }
  }, [session, status, router])

  if (status === 'loading' || !session) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Your Release Requests</h1>
      <Link href="/app/releases/new">Request New Pickup</Link>

      <table>
        <thead>
          <tr>
            <th>Requested At</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {releaseRequests.map(req => (
            <tr key={req.id}>
              <td>{new Date(req.requestedAt).toLocaleString()}</td>
              <td>{req.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session || (session.user?.role !== 'CUSTOMER_ADMIN' && session.user?.role !== 'CUSTOMER_USER')) {
    return { redirect: { destination: '/unauthorized', permanent: false } }
  }

  if (!session.user.customerId) {
    return { props: { releaseRequests: [] } }
  }

  const releaseRequests = await prisma.releaseRequest.findMany({
    where: { customerId: session.user.customerId },
  })

  return {
    props: {
      releaseRequests: JSON.parse(JSON.stringify(releaseRequests)),
    },
  }
}

export default Releases
