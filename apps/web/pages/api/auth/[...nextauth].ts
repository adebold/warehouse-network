import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import CredentialsProvider from 'next-auth/providers/credentials'
import prisma from '@warehouse-network/db/src/client'
import type { NextAuthOptions } from 'next-auth'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text', placeholder: 'jsmith@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials) {
          return null
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (user && user.password === credentials.password) {
          return user
        } else {
          return null
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.customerId = user.customerId
        const operatorUser = await prisma.operatorUser.findUnique({
          where: { userId: user.id },
        })
        if (operatorUser) {
          token.warehouseId = operatorUser.warehouseId
          token.operatorId = operatorUser.operatorId
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.warehouseId = token.warehouseId
        session.user.customerId = token.customerId
        session.user.operatorId = token.operatorId
      }
      return session
    },
  },
}

export default NextAuth(authOptions)
