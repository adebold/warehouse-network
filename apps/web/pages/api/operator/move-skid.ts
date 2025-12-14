import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import prisma from '../../../lib/prisma'
import { z } from 'zod'

const moveSkidSchema = z.object({
  skidCode: z.string(),
  locationName: z.string(),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'PUT') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || (session.user?.role !== 'OPERATOR_ADMIN' && session.user?.role !== 'WAREHOUSE_STAFF')) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    try {
      const validation = moveSkidSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const { skidCode, locationName } = validation.data

      const skid = await prisma.skid.findUnique({ where: { skidCode } })
      if (!skid) {
        return res.status(404).json({ message: 'Skid not found.' })
      }

      const location = await prisma.location.findFirst({
        where: { name: locationName, warehouseId: skid.warehouseId },
      })
      if (!location) {
        return res.status(404).json({ message: 'Location not found.' })
      }

      const updatedSkid = await prisma.skid.update({
        where: { id: skid.id },
        data: { locationId: location.id, status: 'STORED' },
      })

      // TODO: Add audit logging when AuditEvent model is implemented
      console.log(`User ${session.user.id} moved skid ${skid.id} to location ${location.id}`)

      res.status(200).json(updatedSkid)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['PUT'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
