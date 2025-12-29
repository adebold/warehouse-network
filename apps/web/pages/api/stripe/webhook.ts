import type { NextApiRequest, NextApiResponse } from 'next';
import getRawBody from 'raw-body';
import type { Stripe } from 'stripe';

import prisma from '../../../lib/prisma';
import { stripe } from '../../../lib/stripe';
import { logger } from './utils/logger';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    if (account.charges_enabled) {
      // TODO: Add stripeAccountId and stripeOnboardingComplete fields to Operator model
      // await prisma.operator.update({
      //   where: { stripeAccountId: account.id },
      //   data: { stripeOnboardingComplete: true },
      // })
      logger.info('Stripe account updated:', account.id);
    }
  } else if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { quoteId, customerId } = session.metadata as { quoteId: string; customerId: string };

    // Retrieve the quote to get its currency and amount
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
    });

    if (!quote) {
      logger.error(`Quote with ID ${quoteId} not found for completed checkout session.`);
      return res.status(400).send('Quote not found.');
    }

    // TODO: Add Deposit model to schema
    // await prisma.deposit.create({
    //   data: {
    //     customerId,
    //     quoteId,
    //     amount: session.amount_total! / 100, // Amount in cents, convert to dollars
    //     currency: session.currency!,
    //     stripeChargeId: session.payment_intent as string,
    //     status: session.payment_status,
    //   },
    // })
    logger.info('Checkout session completed:', session.id);

    // Update quote status to DEPOSIT_PAID
    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: 'DEPOSIT_PAID' },
    });
  }

  res.status(200).json({ received: true });
}
