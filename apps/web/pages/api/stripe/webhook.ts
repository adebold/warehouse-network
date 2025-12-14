import type { NextApiRequest, NextApiResponse } from 'next'
import { stripe } from '@warehouse-network/integrations/src/stripe'
import prisma from '@warehouse-network/db/src/client'
import getRawBody from 'raw-body'
import type { Stripe } from 'stripe'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const rawBody = await getRawBody(req)
  const sig = req.headers['stripe-signature'] as string

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    if (account.charges_enabled) {
      await prisma.operator.update({
        where: { stripeAccountId: account.id },
        data: { stripeOnboardingComplete: true },
      })
    }
  } else if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { quoteId, customerId } = session.metadata as { quoteId: string; customerId: string }

    // Retrieve the quote to get its currency and amount
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
    })

    if (!quote) {
      console.error(`Quote with ID ${quoteId} not found for completed checkout session.`)
      return res.status(400).send('Quote not found.')
    }

    await prisma.deposit.create({
      data: {
        customerId,
        quoteId,
        amount: session.amount_total! / 100, // Amount in cents, convert to dollars
        currency: session.currency!,
        stripeChargeId: session.payment_intent as string,
        status: session.payment_status,
      },
    })

    // Update quote status to DEPOSIT_PAID
    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'DEPOSIT_PAID' },
    })
  }

  res.status(200).json({ received: true })
}
