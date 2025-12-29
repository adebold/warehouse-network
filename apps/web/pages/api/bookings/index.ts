import { nanoid } from 'nanoid';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';

import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req });

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    try {
      const {
        warehouseId,
        startDate,
        endDate,
        palletCount,
        notes,
        specialRequirements,
        totalPrice,
      } = req.body;

      // Validate required fields
      if (!warehouseId || !startDate || !endDate || !palletCount || !totalPrice) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if user has a customer account
      if (!session.user.customerId) {
        return res.status(400).json({ error: 'Customer account required to make bookings' });
      }

      // Validate warehouse exists and is active
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, status: true, capacity: true },
      });

      if (!warehouse || warehouse.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'Warehouse is not available for booking' });
      }

      // Check if requested pallets exceed capacity
      if (palletCount > warehouse.capacity) {
        return res.status(400).json({ error: 'Requested pallets exceed warehouse capacity' });
      }

      // TODO: Check for conflicting bookings in the date range
      // This would require a more complex query to check overlapping dates

      // Generate booking number
      const bookingNumber = `BK-${nanoid(10).toUpperCase()}`;

      // Create the booking
      const booking = await prisma.booking.create({
        data: {
          bookingNumber,
          customerId: session.user.customerId,
          warehouseId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          palletCount,
          status: 'PENDING',
          totalPrice,
          currency: 'USD',
          notes,
          specialRequirements,
          bookingCharges: {
            create: [
              {
                chargeType: 'STORAGE',
                description: 'Storage charges',
                quantity: palletCount,
                unitPrice: totalPrice / palletCount,
                totalAmount: totalPrice,
              },
            ],
          },
        },
        include: {
          customer: true,
          warehouse: {
            include: {
              operator: true,
            },
          },
        },
      });

      return res.status(201).json(booking);
    } catch (error) {
      console.error('Error creating booking:', error);
      return res.status(500).json({ error: 'Failed to create booking' });
    }
  } else if (req.method === 'GET') {
    try {
      // Fetch user's bookings
      if (!session.user.customerId) {
        return res.status(200).json([]);
      }

      const bookings = await prisma.booking.findMany({
        where: {
          customerId: session.user.customerId,
        },
        include: {
          warehouse: {
            include: {
              operator: true,
            },
          },
          bookingCharges: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return res.status(200).json(bookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}