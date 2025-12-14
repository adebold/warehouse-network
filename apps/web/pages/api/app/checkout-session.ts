import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import prisma from '@warehouse-network/db/src/client'
import { stripe } from '@warehouse-network/integrations/src/stripe'
import { z } from 'zod'

const checkoutSessionSchema = z.object({
  quoteId: z.string().min(1, 'Quote ID is required'),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || session.user?.role !== 'CUSTOMER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    if (!session.user.customerId) {
      return res.status(400).json({ message: 'You are not associated with a customer.'})
    }

    try {
      const validation = checkoutSessionSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const { quoteId } = validation.data

      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: { rfq: true },
      })

      if (!quote || quote.rfq.customerId !== session.user.customerId) {
        return res.status(404).json({ message: 'Quote not found.' })
      }

      if (quote.status !== 'PENDING') {
        return res.status(400).json({ message: 'Quote is not pending acceptance.' })
      }
      
      const lineItems = [{
        price_data: {
          currency: quote.currency.toLowerCase(),
          product_data: {
            name: `Deposit for Quote ${quote.id}`,
          },
          unit_amount: Math.round(quote.depositAmount * 100), // Amount in cents
        },
        quantity: 1,
      }]

      const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${process.env.NEXTAUTH_URL}/app/quotes/${quote.id}?success=true`,
        cancel_url: `${process.env.NEXTAUTH_URL}/app/quotes/${quote.id}?canceled=true`,
        metadata: {
          quoteId: quote.id,
          customerId: session.user.customerId,
        },
      })

      res.status(200).json({ url: checkoutSession.url })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
