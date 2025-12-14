import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import type { Warehouse } from '@prisma/client'
import prisma from '@warehouse-network/db/src/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../api/auth/[...nextauth]'
import Link from 'next/link'

interface WarehousesProps {
  warehouses: Warehouse[]
}

const Warehouses: NextPage<WarehousesProps> = ({ warehouses }) => {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
    if (session?.user?.role !== 'OPERATOR_ADMIN') router.push('/unauthorized')
  }, [session, status, router])

  if (status === 'loading' || !session || session.user.role !== 'OPERATOR_ADMIN') {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Your Warehouses</h1>
      <Link href="/operator/warehouses/new">Register New Warehouse</Link>
      
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {warehouses.map(warehouse => (
            <tr key={warehouse.id}>
              <td>{warehouse.name}</td>
              <td>{warehouse.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
    return {
      redirect: {
        destination: '/unauthorized',
        permanent: false,
      },
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email ?? '' },
    include: { operatorUser: true },
  })

  if (!user?.operatorUser) {
    return {
      notFound: true,
    }
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { operatorId: user.operatorUser.operatorId },
  })

  return {
    props: {
      warehouses: JSON.parse(JSON.stringify(warehouses)),
    },
  }
}

export default Warehouses
