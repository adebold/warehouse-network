import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { securityConfig } from '../../../lib/config/security';
import prisma from '../../../lib/prisma';
import { logger } from './utils/logger';


export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text', placeholder: 'jsmith@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        try {
          if (!credentials?.email || !credentials?.password) {
            logger.error('Missing credentials');
            return null;
          }

          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: {
              customer: true,
            },
          });

          if (!user || !user.password) {
            logger.error('User not found:', credentials.email);
            return null;
          }

          const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

          if (!isPasswordValid) {
            logger.error('Invalid password for user:', credentials.email);
            return null;
          }

          // Check if customer account is locked
          if (user.customer && user.customer.accountStatus === 'LOCKED') {
            logger.error('Account is locked:', credentials.email);
            throw new Error(
              'Account is locked due to: ' + (user.customer.lockReason || 'Payment issues')
            );
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            customerId: user.customerId,
          };
        } catch (error) {
          logger.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: securityConfig.auth.sessionMaxAge,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: securityConfig.auth.sessionSecret,
  cookies: {
    sessionToken: {
      name: securityConfig.session.cookieName,
      options: {
        httpOnly: securityConfig.session.httpOnly,
        sameSite: securityConfig.session.sameSite,
        path: securityConfig.session.path,
        secure: securityConfig.session.secure,
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.customerId = user.customerId;
        // Note: Operator associations would need to be handled separately
        // as there's no direct User-Operator relationship in the current schema
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.warehouseId = token.warehouseId;
        session.user.customerId = token.customerId;
        session.user.operatorId = token.operatorId;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
