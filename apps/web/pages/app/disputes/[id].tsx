import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import type { Dispute, Skid } from '@prisma/client'
import prisma from '../../../lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../api/auth/[...nextauth]'

interface DisputeDetailsProps {
  dispute: Dispute & { skids: { skid: Skid }[] }
}

const DisputeDetails: NextPage<DisputeDetailsProps> = ({ dispute }) => {
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
      <h1>Dispute Details: {dispute.id}</h1>
      <p>Type: {dispute.type}</p>
      <p>Status: {dispute.status}</p>
      <p>Description: {dispute.description}</p>
      <p>Submitted At: {new Date(dispute.submittedAt).toLocaleString()}</p>
      {dispute.resolvedAt && <p>Resolved At: {new Date(dispute.resolvedAt).toLocaleString()}</p>}
      {dispute.resolution && <p>Resolution: {dispute.resolution}</p>}
      {dispute.evidence && <p>Evidence: {JSON.stringify(dispute.evidence)}</p>}

      <h2>Affected Skids</h2>
      <ul>
        {dispute.skids.map(s => (
          <li key={s.skid.id}>{s.skid.skidCode}</li>
        ))}
      </ul>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)
  const { id } = context.params || {}

  if (!session || (session.user?.role !== 'CUSTOMER_ADMIN' && session.user?.role !== 'CUSTOMER_USER')) {
    return { redirect: { destination: '/unauthorized', permanent: false } }
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id: String(id) },
    include: {
      skids: { include: { skid: true } },
    },
  })

  if (!dispute || dispute.customerId !== session.user.customerId) {
    return { notFound: true }
  }

  return {
    props: {
      dispute: JSON.parse(JSON.stringify(dispute)),
    },
  }
}

export default DisputeDetails
