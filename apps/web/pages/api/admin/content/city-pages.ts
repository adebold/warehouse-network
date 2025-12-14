import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]'
import prisma from '@warehouse-network/db/src/client'
import { cityPageSchema } from '../../../../lib/schemas'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || session.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    try {
      const validation = cityPageSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const { city, region, h1, introContent, isActive } = validation.data

      const author = await prisma.user.findUnique({
        where: { id: session.user.id },
      })

      if (!author) {
        return res.status(404).json({ message: 'Author not found.' })
      }

      const slug = `${city.toLowerCase().replace(/ /g, '-')}-${(region || '').toLowerCase().replace(/ /g, '-')}`.replace(/--/g, '-').replace(/^-|-$/g, '');

      const cityPage = await prisma.cityPage.create({
        data: {
          city,
          region,
          h1,
          introContent,
          isActive,
          authorId: author.id,
          slug,
        },
      })

      res.status(201).json(cityPage)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
