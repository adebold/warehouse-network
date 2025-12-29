import { ChargeCategory, SkidStatus } from '@prisma/client';

import prisma from '../../db/src/client';
import { logger } from '../../../../../../utils/logger';

export async function runDailyAccrual() {
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: 'DailyAccrual',
      status: 'RUNNING',
    },
  });

  try {
    const activeSkids = await prisma.skid.findMany({
      where: {
        status: SkidStatus.STORED,
      },
      include: {
        warehouse: {
          include: {
            pricingRules: {
              where: { chargeCategory: ChargeCategory.STORAGE },
            },
          },
        },
      },
    });

    const chargeLines = [];
    for (const skid of activeSkids) {
      if (!skid.warehouse || skid.warehouse.pricingRules.length === 0) {
        logger.warn(`Skid ${skid.id} has no warehouse or no storage pricing rule. Skipping.`);
        continue;
      }

      const storageRule = skid.warehouse.pricingRules[0]; // Assuming one storage rule per warehouse

      // Calculate daily storage charge
      const amount = storageRule.price; // Price is per skid per day
      const currency = 'USD'; // TODO: Get currency from warehouse/platform settings

      const chargeLine = await prisma.chargeLine.create({
        data: {
          skidId: skid.id,
          chargeCategory: ChargeCategory.STORAGE,
          amount,
          currency,
        },
      });
      chargeLines.push(chargeLine);
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        details: { processedSkids: activeSkids.length, createdChargeLines: chargeLines.length },
      },
    });

    logger.info(
      `Daily accrual completed. Processed ${activeSkids.length} skids, created ${chargeLines.length} charge lines.`
    );
  } catch (error: any) {
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: 'FAILED', finishedAt: new Date(), details: { error: error.message } },
    });
    logger.error('Daily accrual failed:', error);
    throw error;
  }
}
