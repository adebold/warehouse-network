import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import type { Quote, RFQ, QuoteItem, ChargeCategory } from '@prisma/client'
import prisma from '../../../lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../api/auth/[...nextauth]'

interface QuoteDetailsProps {
  quote: Quote & { 
    rfq: RFQ; 
    warehouse: { name: string }; 
    items: (QuoteItem & { chargeCategory: ChargeCategory })[] 
  }
}

const QuoteDetails: NextPage<QuoteDetailsProps> = ({ quote }) => {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
    if (session?.user?.role !== 'SUPER_ADMIN') router.push('/unauthorized')
  }, [session, status, router])

  if (status === 'loading' || !session) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1>Quote Details: {quote.id}</h1>
      <p>RFQ ID: {quote.rfqId}</p>
      <p>Warehouse: {quote.warehouse.name}</p>
      <p>Currency: {quote.currency}</p>
      <p>Deposit Amount: {quote.depositAmount}</p>
      <p>Status: {quote.status}</p>

      <h2>Quote Items</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Unit Price</th>
            <th>Quantity</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map(item => (
            <tr key={item.id}>
              <td>{item.chargeCategory.name}</td>
              <td>{item.unitPrice}</td>
              <td>{item.quantity}</td>
              <td>{item.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions)
  const { id } = context.params || {}

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return { redirect: { destination: '/unauthorized', permanent: false } }
  }

  const quote = await prisma.quote.findUnique({
    where: { id: String(id) },
    include: {
      rfq: true,
      warehouse: { select: { name: true } },
      items: {
        include: {
          chargeCategory: true,
        },
      },
    },
  })

  if (!quote) {
    return { notFound: true }
  }

  return {
    props: {
      quote: JSON.parse(JSON.stringify(quote)),
    },
  }
}

export default QuoteDetails
