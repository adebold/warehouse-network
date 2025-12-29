import { getServerSession } from 'next-auth/next';

import prisma from '../../../../../lib/prisma';
import { pricingRulesSchema } from '../../../../../lib/schemas';
import { authOptions } from '../../../auth/[...nextauth]';
import { logger } from './utils/logger';
// TODO: Implement SEO city page creation when core package is available
async function createOrUpdateCityPageForWarehouse(warehouseId: string) {
  logger.info(`SEO: Creating city page for warehouse ${warehouseId}`);
  // Placeholder for SEO functionality
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const session = await getServerSession(req, res, authOptions);

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    try {
      const validation = pricingRulesSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      // TODO: This needs to be updated when proper User-Operator relationship is established
      // For now, we'll find an operator based on the user's email
      const operators = await prisma.operator.findMany({
        where: { primaryContact: session.user.email ?? '' },
      });

      if (operators.length === 0) {
        return res.status(404).json({ message: 'Operator not found for this user.' });
      }

      const warehouse = await prisma.warehouse.findFirst({
        where: { id: String(id), operatorId: operators[0].id },
      });

      if (!warehouse) {
        return res.status(404).json({ message: 'Warehouse not found.' });
      }

      await prisma.pricingRule.deleteMany({
        where: { warehouseId: String(id) },
      });

      const newPricingRules = await prisma.pricingRule.createMany({
        data: validation.data.rules.map(rule => ({
          warehouseId: String(id),
          chargeCategoryId: rule.chargeCategoryId,
          price: rule.price,
          currency: rule.currency,
        })),
      });

      // Also update warehouse status to READY_FOR_MARKETPLACE
      await prisma.warehouse.update({
        where: { id: String(id) },
        data: { status: 'READY_FOR_MARKETPLACE' },
      });

      await createOrUpdateCityPageForWarehouse(String(id));

      res.status(200).json(newPricingRules);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
