import prisma from '../../db/src/client';
import { OperatorLedgerEntryType, PayoutStatus } from '@prisma/client';
import { stripe } from '../../integrations/src/stripe';

const PLATFORM_TAKE_RATE = 0.1; // 10%

export async function processPayouts() {
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'ProcessPayouts',
      status: 'RUNNING',
    },
  });

  try {
    const operators = await prisma.operator.findMany({
      where: {
        stripeAccountId: { not: null },
        stripeOnboardingComplete: true,
      },
      include: {
        ledger: true,
      },
    });

    const payouts = [];
    for (const operator of operators) {
      const balanceByCurrency: { [currency: string]: number } = {};

      // Calculate current balance for each currency
      for (const entry of operator.ledger) {
        if (!balanceByCurrency[entry.currency]) {
          balanceByCurrency[entry.currency] = 0;
        }
        if (entry.type === OperatorLedgerEntryType.CHARGE) {
          balanceByCurrency[entry.currency] += entry.amount;
        } else if (entry.type === OperatorLedgerEntryType.PAYOUT) {
          balanceByCurrency[entry.currency] -= entry.amount;
        } else if (entry.type === OperatorLedgerEntryType.ADJUSTMENT) {
          balanceByCurrency[entry.currency] += entry.amount;
        }
      }

      for (const currency in balanceByCurrency) {
        let payableAmount = balanceByCurrency[currency];
        if (payableAmount <= 0) continue;

        // Apply platform take rate (if needed, this depends on how charge lines are created)
        // For simplicity, assuming charge lines are gross and platform takes a cut from operator's share
        // This logic needs careful consideration based on exact business model
        const platformCut = payableAmount * PLATFORM_TAKE_RATE;
        payableAmount -= platformCut;

        if (payableAmount <= 0) continue;

        // Create a new payout record
        const payout = await prisma.payout.create({
          data: {
            operatorId: operator.id,
            amount: payableAmount,
            currency: currency,
            status: PayoutStatus.PENDING,
          },
        });

        // Record payout in operator's ledger
        await prisma.operatorLedgerEntry.create({
          data: {
            operatorId: operator.id,
            type: OperatorLedgerEntryType.PAYOUT,
            amount: payableAmount,
            currency: currency,
            description: `Payout for ${currency} balance`,
          },
        });

        // Send payout via Stripe
        // This requires operator's Stripe Connect Account ID
        if (operator.stripeAccountId) {
          try {
            const transfer = await stripe.transfers.create({
              amount: Math.round(payableAmount * 100), // Amount in cents
              currency: currency.toLowerCase(),
              destination: operator.stripeAccountId,
              metadata: {
                payoutId: payout.id,
                operatorId: operator.id,
              },
            });

            await prisma.payout.update({
              where: { id: payout.id },
              data: {
                status: PayoutStatus.PAID,
                stripePayoutId: transfer.id,
                processedAt: new Date(),
              },
            });
          } catch (stripeError: any) {
            console.error(`Stripe payout failed for operator ${operator.id}:`, stripeError);
            await prisma.payout.update({
              where: { id: payout.id },
              data: { status: PayoutStatus.FAILED, processedAt: new Date() },
            });
          }
        }
        payouts.push(payout);
      }
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        details: { processedOperators: operators.length, createdPayouts: payouts.length },
      },
    });

    console.log(
      `Payout processing completed. Processed ${operators.length} operators, created ${payouts.length} payouts.`
    );
  } catch (error: any) {
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: 'FAILED', finishedAt: new Date(), details: { error: error.message } },
    });
    console.error('Payout processing failed:', error);
    throw error;
  }
}
