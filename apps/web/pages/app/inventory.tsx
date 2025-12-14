import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import type { Skid } from '@prisma/client'
import prisma from '@warehouse-network/db/src/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]'

interface InventoryProps {
  skids: Skid[]
}

const Inventory: NextPage<InventoryProps> = ({ skids }) => {
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
      <h1>Your Inventory</h1>
      <table>
        <thead>
          <tr>
            <th>Skid Code</th>
            <th>Status</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {skids.map(skid => (
            <tr key={skid.id}>
              <td>{skid.skidCode}</td>
              <td>{skid.status}</td>
              <td>{skid.location?.name || 'N/A'}</td>
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
    return { props: { skids: [] } } // Or handle this case differently
  }

  const skids = await prisma.skid.findMany({
    where: { customerId: session.user.customerId },
    include: { location: true },
  })

  return {
    props: {
      skids: JSON.parse(JSON.stringify(skids)),
    },
  }
}

export default Inventory
