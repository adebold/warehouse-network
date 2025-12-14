import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]'
import prisma from '@warehouse-network/db/src/client'
import { stripe } from '@warehouse-network/integrations/src/stripe'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email ?? '' },
        include: { operatorUser: { include: { operator: true } } },
      })

      if (!user?.operatorUser) {
        return res.status(404).json({ message: 'Operator not found for this user.' })
      }

      let stripeAccountId = user.operatorUser.operator.stripeAccountId
      if (!stripeAccountId) {
        const account = await stripe.accounts.create({
          type: 'express',
        })
        stripeAccountId = account.id
        await prisma.operator.update({
          where: { id: user.operatorUser.operatorId },
          data: { stripeAccountId },
        })
      }

      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${process.env.NEXTAUTH_URL}/operator/stripe/onboarding-refresh`,
        return_url: `${process.env.NEXTAUTH_URL}/operator/dashboard`,
        type: 'account_onboarding',
      })

      res.status(200).json({ url: accountLink.url })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
