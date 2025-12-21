import type { Order } from '@warehouse/types';

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import prisma from '../../../../lib/prisma';
import { z } from 'zod';

// Schema for updating quote
const updateQuoteSchema = z.object({
  currency: z.string().optional(),
  assumptions: z.string().optional(),
  guaranteedCharges: z.boolean().optional(),
  depositAmount: z.number().min(0).optional(),
  accrualStartRule: z.enum(['ON_RECEIPT', 'FIXED_DATE']).optional(),
  expiryDate: z.string().optional(),
  paymentMethod: z.enum(['INVOICE', 'CREDIT_CARD', 'ACH', 'WIRE', 'PO']).optional(),
  paymentTerms: z.string().optional(),
  poNumber: z.string().optional(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'DEPOSIT_PAID']).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const session = await getServerSession(req, res, authOptions);

  if (!session || session.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  if (req.method === 'GET') {
    try {
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
      });

      if (!quote) {
        return res.status(404).json({ message: 'Quote not found' });
      }

      res.status(200).json(quote);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const validation = updateQuoteSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const updateData: any = { ...validation.data };

      // Convert expiryDate string to Date if provided
      if (updateData.expiryDate) {
        updateData.expiryDate = new Date(updateData.expiryDate);
      }

      // Validate PO number is provided when payment method is PO
      if (updateData.paymentMethod === 'PO' && !updateData.poNumber) {
        return res
          .status(400)
          .json({ message: 'PO number is required for Purchase Order payment method' });
      }

      const quote = await prisma.quote.update({
        where: { id: String(id) },
        data: updateData,
        include: {
          items: {
            include: {
              chargeCategory: true,
            },
          },
        },
      });

      res.status(200).json(quote);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else if (req.method === 'DELETE') {
    try {
      // Delete quote items first due to foreign key constraints
      await prisma.quoteItem.deleteMany({
        where: { quoteId: String(id) },
      });

      await prisma.quote.delete({
        where: { id: String(id) },
      });

      res.status(204).end();
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'PATCH', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
