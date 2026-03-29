/**
 * Secure NextAuth Configuration
 * Enhanced authentication with security patches and hardening measures
 */

import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { getUserPermissions, getUserRoles } from "@/lib/rbac"
import { SecurityConfig } from "@/lib/security/config"
import { rateLimiter, getClientIP } from "@/lib/security/rate-limiter"
import { twoFactorAuth } from "@/lib/security/two-factor"
import type { User, Organization } from "@prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      image?: string
      organizationId?: string
      organization?: {
        id: string
        name: string
        slug: string
        type: string
      }
      roles: Array<{
        id: string
        name: string
        slug: string
        level: number
      }>
      permissions: string[]
      requiresTwoFactor?: boolean
      isTwoFactorVerified?: boolean
    }
  }

  interface User {
    organizationId?: string
    organization?: Organization
    requiresTwoFactor?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId?: string
    organization?: {
      id: string
      name: string
      slug: string
      type: string
    }
    roles: Array<{
      id: string
      name: string
      slug: string
      level: number
    }>
    permissions: string[]
    requiresTwoFactor?: boolean
    isTwoFactorVerified?: boolean
    lastActivity?: number
    sessionId?: string
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
      // Removed allowDangerousEmailAccountLinking for security
    }),

    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email",
        },
      },
      // Removed allowDangerousEmailAccountLinking for security
    }),

    CredentialsProvider({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        organizationSlug: { label: "Organization", type: "text", optional: true },
        twoFactorToken: { label: "2FA Code", type: "text", optional: true },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required")
        }

        const clientIP = getClientIP(req);
        const identifier = `${credentials.email}:${clientIP}`;

        try {
          // Check rate limiting for authentication attempts
          const rateLimitResult = await rateLimiter.checkAuthLimit(identifier);
          if (!rateLimitResult.allowed) {
            throw new Error("Too many login attempts. Please try again later.");
          }

          // Check for account lockout
          const isLocked = await rateLimiter.isAccountLocked(credentials.email);
          if (isLocked) {
            throw new Error("Account temporarily locked due to multiple failed attempts");
          }

          // Find user by email
          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
            include: {
              organization: true,
              userTwoFactor: true,
            },
          });

          if (!user || !user.password) {
            await rateLimiter.incrementFailedAttempts(credentials.email);
            throw new Error("Invalid credentials");
          }

          // Verify password
          const isPasswordValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );

          if (!isPasswordValid) {
            await rateLimiter.incrementFailedAttempts(credentials.email);
            throw new Error("Invalid credentials");
          }

          // Check if user is active
          if (user.status !== "ACTIVE") {
            throw new Error("Account is not active");
          }

          // Check organization context if provided
          if (credentials.organizationSlug && user.organization) {
            if (user.organization.slug !== credentials.organizationSlug) {
              throw new Error("Invalid organization");
            }
          }

          // Check 2FA requirement
          const requires2FA = user.userTwoFactor?.isEnabled || false;

          if (requires2FA) {
            if (!credentials.twoFactorToken) {
              // Return user with 2FA requirement flag
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image,
                organizationId: user.organizationId,
                organization: user.organization,
                requiresTwoFactor: true,
              };
            }

            // Verify 2FA token
            const twoFactorResult = await twoFactorAuth.verifyTwoFactor(
              user.id,
              credentials.twoFactorToken
            );

            if (!twoFactorResult.isValid) {
              await rateLimiter.incrementFailedAttempts(identifier);
              throw new Error("Invalid 2FA code");
            }
          }

          // Reset failed attempts on successful login
          await rateLimiter.resetFailedAttempts(credentials.email);

          // Update login tracking
          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastLoginAt: new Date(),
              loginCount: { increment: 1 },
            },
          });

          // Log successful authentication
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              organizationId: user.organizationId,
              action: "auth.login",
              resource: `user:${user.id}`,
              details: {
                provider: "credentials",
                ipAddress: clientIP,
                userAgent: req?.headers?.["user-agent"],
                twoFactorUsed: requires2FA,
              },
              status: "success",
            },
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            organizationId: user.organizationId,
            organization: user.organization,
            requiresTwoFactor: false,
          };
        } catch (error) {
          // Log failed authentication attempt
          await prisma.auditLog.create({
            data: {
              userId: null,
              organizationId: null,
              action: "auth.login_failed",
              resource: `email:${credentials.email}`,
              details: {
                provider: "credentials",
                ipAddress: clientIP,
                userAgent: req?.headers?.["user-agent"],
                error: error instanceof Error ? error.message : "Unknown error",
              },
              status: "failure",
            },
          }).catch(console.error);

          throw error;
        }
      },
    }),

    CredentialsProvider({
      id: "super-admin-2fa",
      name: "Super Admin with 2FA",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        adminCode: { label: "Admin Code", type: "password" },
        twoFactorToken: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password || !credentials?.adminCode || !credentials?.twoFactorToken) {
          throw new Error("All fields are required for super admin login");
        }

        const clientIP = getClientIP(req);

        try {
          // Extra strict rate limiting for super admin
          const rateLimitResult = await rateLimiter.checkTwoFactorLimit(clientIP);
          if (!rateLimitResult.allowed) {
            throw new Error("Rate limit exceeded for admin access");
          }

          // Verify admin code (additional security for super admin)
          if (credentials.adminCode !== process.env.SUPER_ADMIN_CODE) {
            await rateLimiter.flagSuspiciousActivity(
              clientIP,
              "invalid_super_admin_code",
              { email: credentials.email }
            );
            throw new Error("Invalid admin code");
          }

          // Find user with super admin role
          const user = await prisma.user.findFirst({
            where: {
              email: credentials.email as string,
              organization: {
                type: "PLATFORM",
              },
              userRoles: {
                some: {
                  role: {
                    slug: "super-admin",
                  },
                },
              },
            },
            include: {
              organization: true,
              userTwoFactor: true,
            },
          });

          if (!user || !user.password) {
            throw new Error("Invalid super admin credentials");
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );

          if (!isPasswordValid) {
            throw new Error("Invalid super admin credentials");
          }

          // Super admin MUST have 2FA enabled
          if (!user.userTwoFactor?.isEnabled) {
            throw new Error("2FA is required for super admin accounts");
          }

          // Verify 2FA token
          const twoFactorResult = await twoFactorAuth.verifyTwoFactor(
            user.id,
            credentials.twoFactorToken
          );

          if (!twoFactorResult.isValid) {
            throw new Error("Invalid 2FA code for super admin");
          }

          // Update login tracking
          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastLoginAt: new Date(),
              loginCount: { increment: 1 },
            },
          });

          // Log super admin access
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              organizationId: user.organizationId,
              action: "auth.super_admin_login",
              resource: `user:${user.id}`,
              details: {
                provider: "super-admin-2fa",
                ipAddress: clientIP,
                userAgent: req?.headers?.["user-agent"],
                twoFactorMethod: twoFactorResult.usedBackupCode ? "backup_code" : "totp",
              },
              status: "success",
            },
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            organizationId: user.organizationId,
            organization: user.organization,
            requiresTwoFactor: false,
          };
        } catch (error) {
          // Log failed super admin attempt
          await prisma.auditLog.create({
            data: {
              userId: null,
              organizationId: null,
              action: "auth.super_admin_login_failed",
              resource: `email:${credentials.email}`,
              details: {
                provider: "super-admin-2fa",
                ipAddress: clientIP,
                userAgent: req?.headers?.["user-agent"],
                error: error instanceof Error ? error.message : "Unknown error",
              },
              status: "failure",
            },
          }).catch(console.error);

          throw error;
        }
      },
    }),
  ],

  session: {
    strategy: "database", // Use database sessions for better security
    maxAge: SecurityConfig.auth.sessionMaxAge,
    updateAge: SecurityConfig.auth.sessionUpdateAge,
    generateSessionToken: () => {
      // Generate cryptographically secure session token
      const { randomBytes } = require('crypto');
      return randomBytes(32).toString('hex');
    },
  },

  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === "production",
        maxAge: SecurityConfig.auth.sessionMaxAge,
      },
    },
    callbackUrl: {
      name: `__Secure-next-auth.callback-url`,
      options: {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: `__Host-next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      try {
        // Additional security checks for OAuth providers
        if (account?.provider !== "credentials" && account?.provider !== "super-admin-2fa") {
          // Verify email is verified for OAuth providers
          if (profile?.email_verified === false) {
            return false;
          }

          // Check if user exists and is allowed OAuth login
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
            include: { organization: true },
          });

          if (existingUser) {
            // Log OAuth login
            await prisma.auditLog.create({
              data: {
                userId: existingUser.id,
                organizationId: existingUser.organizationId,
                action: "auth.oauth_signin",
                resource: `user:${existingUser.id}`,
                details: {
                  provider: account.provider,
                  accountId: account.providerAccountId,
                },
                status: "success",
              },
            });
          }
        }

        return true;
      } catch (error) {
        console.error("SignIn callback error:", error);
        return false;
      }
    },

    async jwt({ token, user, account, trigger, session }) {
      // Initial sign in
      if (user) {
        token.organizationId = user.organizationId;
        token.organization = user.organization ? {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          type: user.organization.type,
        } : undefined;
        token.requiresTwoFactor = user.requiresTwoFactor || false;
        token.isTwoFactorVerified = !user.requiresTwoFactor;
        token.sessionId = require('crypto').randomUUID();
        token.lastActivity = Date.now();

        // Get user roles and permissions
        if (user.id) {
          const roles = await getUserRoles(user.id);
          const permissions = await getUserPermissions(user.id);

          token.roles = roles;
          token.permissions = permissions;
        }
      }

      // Check for session timeout
      if (token.lastActivity && Date.now() - token.lastActivity > SecurityConfig.auth.sessionMaxAge * 1000) {
        return null; // Force re-authentication
      }

      // Update last activity
      token.lastActivity = Date.now();

      // Refresh roles and permissions periodically
      if (token.sub && (!token.roles || !token.permissions || trigger === "update")) {
        const roles = await getUserRoles(token.sub);
        const permissions = await getUserPermissions(token.sub);

        token.roles = roles;
        token.permissions = permissions;
      }

      return token;
    },

    async session({ session, token, user }) {
      if (token) {
        session.user.id = token.sub!;
        session.user.organizationId = token.organizationId;
        session.user.organization = token.organization;
        session.user.roles = token.roles || [];
        session.user.permissions = token.permissions || [];
        session.user.requiresTwoFactor = token.requiresTwoFactor;
        session.user.isTwoFactorVerified = token.isTwoFactorVerified;
      } else if (user) {
        // Database session
        session.user.id = user.id;

        // Fetch additional user data
        const userData = await prisma.user.findUnique({
          where: { id: user.id },
          include: { organization: true },
        });

        if (userData) {
          session.user.organizationId = userData.organizationId;
          session.user.organization = userData.organization ? {
            id: userData.organization.id,
            name: userData.organization.name,
            slug: userData.organization.slug,
            type: userData.organization.type,
          } : undefined;

          // Get roles and permissions
          const roles = await getUserRoles(user.id);
          const permissions = await getUserPermissions(user.id);
          session.user.roles = roles;
          session.user.permissions = permissions;

          // Check 2FA status
          const twoFactorEnabled = await twoFactorAuth.isTwoFactorEnabled(user.id);
          session.user.requiresTwoFactor = twoFactorEnabled;
          session.user.isTwoFactorVerified = !twoFactorEnabled; // Assume verified if not required
        }
      }

      return session;
    },

    async redirect({ url, baseUrl }) {
      // Prevent open redirect vulnerabilities
      try {
        const redirectUrl = new URL(url, baseUrl);

        // Only allow redirects to same origin
        if (redirectUrl.origin !== new URL(baseUrl).origin) {
          return `${baseUrl}/dashboard`;
        }

        return redirectUrl.toString();
      } catch {
        return `${baseUrl}/dashboard`;
      }
    },
  },

  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
    newUser: '/auth/welcome',
  },

  events: {
    async signOut({ token, session }) {
      const userId = token?.sub || session?.user?.id;

      if (userId) {
        // Log sign out
        await prisma.auditLog.create({
          data: {
            userId,
            organizationId: token?.organizationId || session?.user?.organizationId,
            action: "auth.signout",
            resource: `user:${userId}`,
            status: "success",
          },
        }).catch(console.error);

        // Clear any additional session data
        if (token?.sessionId) {
          // Could implement session blacklisting here
        }
      }
    },

    async session({ session, token }) {
      // Track session activity for monitoring
      if (token?.sub) {
        await prisma.user.update({
          where: { id: token.sub },
          data: { updatedAt: new Date() },
        }).catch(() => {
          // Ignore errors to avoid breaking the session
        });
      }
    },

    async createUser({ user }) {
      // Log new user creation
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          organizationId: null,
          action: "auth.user_created",
          resource: `user:${user.id}`,
          details: {
            email: user.email,
            provider: "oauth",
          },
          status: "success",
        },
      }).catch(console.error);
    },

    async linkAccount({ user, account, profile }) {
      // Log account linking
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          organizationId: null,
          action: "auth.account_linked",
          resource: `user:${user.id}`,
          details: {
            provider: account.provider,
            accountId: account.providerAccountId,
          },
          status: "success",
        },
      }).catch(console.error);
    },
  },

  logger: {
    error: (code, metadata) => {
      console.error(`NextAuth Error [${code}]:`, metadata);

      // Log critical authentication errors
      prisma.auditLog.create({
        data: {
          userId: null,
          organizationId: null,
          action: "auth.system_error",
          resource: "nextauth",
          details: {
            code,
            metadata: typeof metadata === 'object' ? metadata : { message: metadata },
          },
          status: "failure",
        },
      }).catch(console.error);
    },
    warn: (code, metadata) => {
      console.warn(`NextAuth Warning [${code}]:`, metadata);
    },
    debug: (code, metadata) => {
      if (process.env.NODE_ENV === "development") {
        console.debug(`NextAuth Debug [${code}]:`, metadata);
      }
    },
  },

  debug: process.env.NODE_ENV === "development",
});