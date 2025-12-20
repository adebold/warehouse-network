import type { NextPage, GetServerSideProps } from 'next'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import type { Quote, RFQ, QuoteItem, ChargeCategory } from '@prisma/client'
import prisma from '../../../lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../api/auth/[...nextauth]'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, DollarSign, Calendar, Package, CreditCard, FileText } from 'lucide-react'
import Link from 'next/link'

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
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/rfqs" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to RFQs
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Quote Details</h1>
              <p className="text-muted-foreground mt-2">
                Quote #{quote.id}
              </p>
            </div>
            <Badge variant={quote.status === 'DRAFT' ? 'secondary' : 'default'}>
              {quote.status}
            </Badge>
          </div>
        </div>

        {/* Quote Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Quote Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-sm font-medium text-gray-500">RFQ ID</p>
                <p className="mt-1 text-lg">{quote.rfqId}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Warehouse</p>
                <p className="mt-1 text-lg">{quote.warehouse.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Currency</p>
                <p className="mt-1 text-lg">{quote.currency}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Deposit Amount</p>
                <p className="mt-1 text-lg flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  {quote.depositAmount.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Accrual Start Rule</p>
                <p className="mt-1">{quote.accrualStartRule}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Expiry Date</p>
                <p className="mt-1 flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  {quote.expiryDate ? new Date(quote.expiryDate).toLocaleDateString() : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Payment Method</p>
                <p className="mt-1 flex items-center">
                  <CreditCard className="h-4 w-4 mr-1" />
                  {quote.paymentMethod ? quote.paymentMethod.replace('_', ' ') : 'INVOICE'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Payment Terms</p>
                <p className="mt-1">{quote.paymentTerms || 'NET30'}</p>
              </div>
              {quote.paymentMethod === 'PO' && quote.poNumber && (
                <div>
                  <p className="text-sm font-medium text-gray-500">PO Number</p>
                  <p className="mt-1 flex items-center">
                    <FileText className="h-4 w-4 mr-1" />
                    {quote.poNumber}
                  </p>
                </div>
              )}
            </div>
            {quote.assumptions && (
              <div className="mt-6">
                <p className="text-sm font-medium text-gray-500 mb-2">Assumptions</p>
                <p className="text-gray-700 whitespace-pre-wrap">{quote.assumptions}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Details Card - Only show if payment method is set */}
        {quote.paymentMethod && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                <CardTitle>Payment Details</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-500 mb-1">Payment Method</p>
                  <p className="text-lg font-semibold">
                    {quote.paymentMethod.replace('_', ' ')}
                  </p>
                </div>
                {quote.paymentTerms && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-500 mb-1">Payment Terms</p>
                    <p className="text-lg font-semibold">
                      {quote.paymentTerms.replace('_', ' ')}
                    </p>
                  </div>
                )}
                {quote.paymentMethod === 'PO' && quote.poNumber && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-700 mb-1">PO Number</p>
                    <p className="text-lg font-semibold text-blue-900">
                      {quote.poNumber}
                    </p>
                  </div>
                )}
              </div>
              {quote.paymentMethod === 'WIRE' && (
                <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-800">
                    <strong>Wire Transfer Instructions:</strong> Will be provided upon quote acceptance.
                  </p>
                </div>
              )}
              {quote.paymentMethod === 'ACH' && (
                <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-800">
                    <strong>ACH Transfer:</strong> Bank details will be provided upon quote acceptance.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quote Items */}
        <Card>
          <CardHeader>
            <CardTitle>Quote Items</CardTitle>
            <CardDescription>
              Detailed breakdown of all charges
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quote.items.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">No items in this quote</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Category</th>
                      <th className="text-right py-3 px-4">Unit Price</th>
                      <th className="text-center py-3 px-4">Quantity</th>
                      <th className="text-right py-3 px-4">Total</th>
                      <th className="text-left py-3 px-4">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.items.map((item) => {
                      const total = item.unitPrice * item.quantity;
                      return (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <span className="font-medium">{item.chargeCategory.name}</span>
                          </td>
                          <td className="text-right py-3 px-4">
                            ${item.unitPrice.toFixed(2)}
                          </td>
                          <td className="text-center py-3 px-4">
                            {item.quantity}
                          </td>
                          <td className="text-right py-3 px-4 font-medium">
                            ${total.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {item.description || '-'}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="py-3 px-4 font-semibold text-right">
                        Total:
                      </td>
                      <td className="py-3 px-4 font-semibold text-right">
                        ${quote.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0).toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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
