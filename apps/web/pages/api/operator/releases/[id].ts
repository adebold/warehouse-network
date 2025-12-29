
import { getServerSession } from 'next-auth/next';

import prisma from '../../../../lib/prisma';
import { updateReleaseRequestSchema } from '../../../../lib/schemas';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const session = await getServerSession(req, res, authOptions);

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    try {
      const validation = updateReleaseRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { status } = validation.data;

      const releaseRequest = await prisma.releaseRequest.findUnique({
        where: { id: String(id) },
        include: { skids: { include: { skid: true } } },
      });

      if (!releaseRequest) {
        return res.status(404).json({ message: 'Release request not found.' });
      }

      if (releaseRequest.warehouseId !== session.user.warehouseId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const updatedReleaseRequest = await prisma.releaseRequest.update({
        where: { id: String(id) },
        data: { status },
      });

      if (status === 'APPROVED') {
        await prisma.skid.updateMany({
          where: { id: { in: releaseRequest.skids.map(s => s.skidId) } },
          data: { status: 'READY' },
        });
      }

      res.status(200).json(updatedReleaseRequest);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
