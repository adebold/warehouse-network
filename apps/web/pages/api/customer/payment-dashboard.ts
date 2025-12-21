import type { Customer } from '@warehouse/types';
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.customerId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      // Get customer payment information
      const customer = await prisma.customer.findUnique({
        where: { id: session.user.customerId },
        select: {
          id: true,
          name: true,
          accountStatus: true,
          paymentStatus: true,
          lockReason: true,
          overdueAmount: true,
          totalOutstanding: true,
          paymentDueDate: true,
        },
      });

      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' });
      }

      // Mock data for invoices and payments
      // In a real implementation, these would come from Invoice and Payment models
      const invoices = [
        {
          id: '1',
          invoiceNumber: 'INV-2024-001',
          amount: 1250.0,
          dueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          status: customer.overdueAmount > 0 ? 'OVERDUE' : 'PAID',
          createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '2',
          invoiceNumber: 'INV-2024-002',
          amount: 2100.0,
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'PENDING',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];

      const recentPayments =
        customer.overdueAmount === 0
          ? [
              {
                id: '1',
                amount: 1250.0,
                paymentDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                paymentMethod: 'CREDIT_CARD',
                reference: 'PAY-2024-001',
                status: 'COMPLETED',
              },
            ]
          : [];

      return res.status(200).json({
        customer,
        invoices,
        recentPayments,
      });
    } catch (error) {
      console.error('Error fetching payment dashboard:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
