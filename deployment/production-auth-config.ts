/**
 * Production Authentication Configuration
 *
 * Enhanced NextAuth.js configuration for production deployment with:
 * - Advanced security settings
 * - Multi-environment support
 * - Enhanced session management
 * - Production-ready OAuth configuration
 * - Comprehensive audit logging
 */

import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { getUserPermissions, getUserRoles } from "@/lib/rbac"
import type { User, Organization } from "@prisma/client"
import crypto from 'crypto'

// Security configurations for different environments
const getSecurityConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production'
  const isStaging = process.env.NODE_ENV === 'staging'

  return {
    // Session configuration
    session: {
      strategy: "jwt" as const,
      maxAge: isProduction ? 8 * 60 * 60 : 24 * 60 * 60, // 8 hours in prod, 24 hours in dev
      updateAge: isProduction ? 60 * 60 : 24 * 60 * 60, // Update session every hour in prod
      generateSessionToken: () => crypto.randomUUID()
    },

    // JWT configuration
    jwt: {
      maxAge: isProduction ? 8 * 60 * 60 : 24 * 60 * 60,
      encode: async ({ secret, token, maxAge }) => {
        // Custom JWT encoding with additional security in production
        if (isProduction) {
          // Add additional claims for production
          const enhancedToken = {
            ...token,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + maxAge!,
            jti: crypto.randomUUID(), // JWT ID for tracking
            aud: process.env.NEXT_PUBLIC_APP_URL,
            iss: process.env.NEXT_PUBLIC_APP_URL
          }
          return enhancedToken as any // Return enhanced token
        }
        return token as any // Default behavior for non-production
      }
    },

    // Cookie configuration
    cookies: {
      sessionToken: {
        name: isProduction ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
        options: {
          httpOnly: true,
          sameSite: isProduction ? 'strict' : 'lax' as const,
          path: '/',
          secure: isProduction,
          domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
          maxAge: isProduction ? 8 * 60 * 60 : 24 * 60 * 60
        }
      },
      callbackUrl: {
        name: isProduction ? '__Secure-next-auth.callback-url' : 'next-auth.callback-url',
        options: {
          httpOnly: true,
          sameSite: isProduction ? 'strict' : 'lax' as const,
          path: '/',
          secure: isProduction,
          domain: isProduction ? process.env.COOKIE_DOMAIN : undefined
        }
      },
      csrfToken: {
        name: isProduction ? '__Host-next-auth.csrf-token' : 'next-auth.csrf-token',
        options: {
          httpOnly: true,
          sameSite: isProduction ? 'strict' : 'lax' as const,
          path: '/',
          secure: isProduction
        }
      }
    },

    // Security headers and features
    security: {
      enableCSRF: isProduction,
      enableSecurityHeaders: isProduction,
      enableRateLimiting: isProduction,
      maxFailedAttempts: isProduction ? 5 : 999,
      lockoutDuration: isProduction ? 15 * 60 * 1000 : 0, // 15 minutes in production
      enableAuditLogging: true,
      enableBruteForceProtection: isProduction
    }
  }
}

// Rate limiting store (in-memory for demo, use Redis in production)
const rateLimitStore = new Map<string, { attempts: number; lastAttempt: number; lockedUntil?: number }>()

// Helper function to check rate limits
const checkRateLimit = (identifier: string, maxAttempts: number, windowMs: number) => {
  const now = Date.now()
  const key = identifier
  const record = rateLimitStore.get(key) || { attempts: 0, lastAttempt: now }

  // Reset if window has passed
  if (now - record.lastAttempt > windowMs) {
    record.attempts = 0
  }

  // Check if locked
  if (record.lockedUntil && now < record.lockedUntil) {
    return false
  }

  // Check if exceeded attempts
  if (record.attempts >= maxAttempts) {
    record.lockedUntil = now + windowMs
    rateLimitStore.set(key, record)
    return false
  }

  return true
}

// Helper function to record failed attempt
const recordFailedAttempt = (identifier: string) => {
  const now = Date.now()
  const key = identifier
  const record = rateLimitStore.get(key) || { attempts: 0, lastAttempt: now }

  record.attempts += 1
  record.lastAttempt = now
  rateLimitStore.set(key, record)
}

// Enhanced types for production
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
      sessionId?: string
      loginMethod?: string
      lastActivity?: string
      securityFlags?: {
        isFirstLogin: boolean
        requiresPasswordChange: boolean
        requires2FA: boolean
        isSuperAdmin: boolean
      }
    }
  }

  interface User {
    organizationId?: string
    organization?: Organization
    securityFlags?: {
      isFirstLogin: boolean
      requiresPasswordChange: boolean
      requires2FA: boolean
      isSuperAdmin: boolean
    }
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
    sessionId?: string
    loginMethod?: string
    lastActivity?: string
    securityFlags?: {
      isFirstLogin: boolean
      requiresPasswordChange: boolean
      requires2FA: boolean
      isSuperAdmin: boolean
    }
    jti?: string // JWT ID
    aud?: string // Audience
    iss?: string // Issuer
  }
}

const securityConfig = getSecurityConfig()

export const productionAuthConfig = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: process.env.NODE_ENV !== 'production',
      authorization: {
        params: {
          scope: "openid email profile",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          // Add additional security for production
          ...(process.env.NODE_ENV === 'production' && {
            hd: process.env.GOOGLE_WORKSPACE_DOMAIN || undefined // Restrict to workspace domain
          })
        }
      }
    }),

    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: process.env.NODE_ENV !== 'production',
      authorization: {
        params: {
          scope: "read:user user:email",
          // Add additional security for production
          ...(process.env.NODE_ENV === 'production' && {
            // Add any GitHub-specific security params
          })
        }
      }
    }),

    // Enhanced credentials provider with security features
    CredentialsProvider({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        organizationSlug: { label: "Organization", type: "text", optional: true },
        captcha: { label: "Captcha", type: "text", optional: true }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required")
        }

        const clientIp = req?.headers?.['x-forwarded-for'] || req?.headers?.['x-real-ip'] || 'unknown'
        const userAgent = req?.headers?.['user-agent'] || 'unknown'
        const identifier = `${credentials.email}:${clientIp}`

        // Rate limiting check
        if (securityConfig.security.enableRateLimiting) {
          if (!checkRateLimit(identifier, securityConfig.security.maxFailedAttempts, securityConfig.security.lockoutDuration)) {
            await prisma.auditLog.create({
              data: {
                action: "auth.rate_limited",
                resource: `user:${credentials.email}`,
                details: {
                  email: credentials.email,
                  clientIp,
                  userAgent,
                  reason: "Rate limit exceeded"
                },
                status: "blocked",
                ipAddress: clientIp as string,
                userAgent: userAgent as string
              }
            }).catch(console.error)

            throw new Error("Too many failed attempts. Please try again later.")
          }
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            organization: true,
            userRoles: {
              include: {
                role: true
              }
            }
          }
        })

        if (!user || !user.password) {
          // Record failed attempt
          if (securityConfig.security.enableRateLimiting) {
            recordFailedAttempt(identifier)
          }

          // Log failed attempt
          await prisma.auditLog.create({
            data: {
              action: "auth.failed",
              resource: `user:${credentials.email}`,
              details: {
                email: credentials.email,
                clientIp,
                userAgent,
                reason: "User not found or no password set"
              },
              status: "failed",
              ipAddress: clientIp as string,
              userAgent: userAgent as string
            }
          }).catch(console.error)

          throw new Error("Invalid credentials")
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!isPasswordValid) {
          // Record failed attempt
          if (securityConfig.security.enableRateLimiting) {
            recordFailedAttempt(identifier)
          }

          // Log failed attempt
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              organizationId: user.organizationId,
              action: "auth.failed",
              resource: `user:${user.id}`,
              details: {
                email: credentials.email,
                clientIp,
                userAgent,
                reason: "Invalid password"
              },
              status: "failed",
              ipAddress: clientIp as string,
              userAgent: userAgent as string
            }
          }).catch(console.error)

          throw new Error("Invalid credentials")
        }

        // Check if user is active
        if (user.status !== "ACTIVE") {
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              organizationId: user.organizationId,
              action: "auth.blocked",
              resource: `user:${user.id}`,
              details: {
                email: credentials.email,
                clientIp,
                userAgent,
                reason: `User status: ${user.status}`
              },
              status: "blocked",
              ipAddress: clientIp as string,
              userAgent: userAgent as string
            }
          }).catch(console.error)

          throw new Error("Account is not active")
        }

        // Check organization context if provided
        if (credentials.organizationSlug && user.organization) {
          if (user.organization.slug !== credentials.organizationSlug) {
            throw new Error("Invalid organization")
          }
        }

        // Check for security flags
        const isSuperAdmin = user.userRoles.some(ur => ur.role.slug === 'super-admin')
        const isFirstLogin = !user.lastLoginAt
        const requiresPasswordChange = user.metadata?.requiresPasswordChange || false

        // Update login tracking
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            loginCount: { increment: 1 },
            metadata: {
              ...user.metadata as any,
              lastLoginIp: clientIp,
              lastUserAgent: userAgent
            }
          }
        }).catch(console.error)

        // Log successful login
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId,
            action: "auth.success",
            resource: `user:${user.id}`,
            details: {
              email: credentials.email,
              clientIp,
              userAgent,
              loginMethod: "credentials"
            },
            status: "success",
            ipAddress: clientIp as string,
            userAgent: userAgent as string
          }
        }).catch(console.error)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          organizationId: user.organizationId,
          organization: user.organization,
          securityFlags: {
            isFirstLogin,
            requiresPasswordChange,
            requires2FA: false, // Implement 2FA logic here
            isSuperAdmin
          }
        }
      }
    }),

    // Enhanced super admin provider
    CredentialsProvider({
      id: "super-admin",
      name: "Super Admin",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        setupKey: { label: "Setup Key", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password || !credentials?.setupKey) {
          throw new Error("All fields are required")
        }

        const clientIp = req?.headers?.['x-forwarded-for'] || req?.headers?.['x-real-ip'] || 'unknown'
        const userAgent = req?.headers?.['user-agent'] || 'unknown'

        // Verify setup key (additional security for super admin)
        if (credentials.setupKey !== process.env.SUPER_ADMIN_SETUP_KEY) {
          await prisma.auditLog.create({
            data: {
              action: "auth.super_admin_blocked",
              resource: `user:${credentials.email}`,
              details: {
                email: credentials.email,
                clientIp,
                userAgent,
                reason: "Invalid setup key"
              },
              status: "blocked",
              ipAddress: clientIp as string,
              userAgent: userAgent as string
            }
          }).catch(console.error)

          throw new Error("Invalid setup key")
        }

        // Find user with super admin role
        const user = await prisma.user.findFirst({
          where: {
            email: credentials.email as string,
            organization: {
              type: "PLATFORM"
            },
            userRoles: {
              some: {
                role: {
                  slug: "super-admin"
                }
              }
            }
          },
          include: {
            organization: true,
            userRoles: {
              include: {
                role: true
              }
            }
          }
        })

        if (!user || !user.password) {
          await prisma.auditLog.create({
            data: {
              action: "auth.super_admin_failed",
              resource: `user:${credentials.email}`,
              details: {
                email: credentials.email,
                clientIp,
                userAgent,
                reason: "Super admin user not found"
              },
              status: "failed",
              ipAddress: clientIp as string,
              userAgent: userAgent as string
            }
          }).catch(console.error)

          throw new Error("Invalid super admin credentials")
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!isPasswordValid) {
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              organizationId: user.organizationId,
              action: "auth.super_admin_failed",
              resource: `user:${user.id}`,
              details: {
                email: credentials.email,
                clientIp,
                userAgent,
                reason: "Invalid password"
              },
              status: "failed",
              ipAddress: clientIp as string,
              userAgent: userAgent as string
            }
          }).catch(console.error)

          throw new Error("Invalid super admin credentials")
        }

        // Update login tracking
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            loginCount: { increment: 1 },
            metadata: {
              ...user.metadata as any,
              lastLoginIp: clientIp,
              lastUserAgent: userAgent,
              lastSuperAdminLogin: new Date().toISOString()
            }
          }
        }).catch(console.error)

        // Log successful super admin login
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId,
            action: "auth.super_admin_success",
            resource: `user:${user.id}`,
            details: {
              email: credentials.email,
              clientIp,
              userAgent,
              loginMethod: "super-admin"
            },
            status: "success",
            ipAddress: clientIp as string,
            userAgent: userAgent as string
          }
        }).catch(console.error)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          organizationId: user.organizationId,
          organization: user.organization,
          securityFlags: {
            isFirstLogin: false,
            requiresPasswordChange: false,
            requires2FA: false,
            isSuperAdmin: true
          }
        }
      }
    })
  ],

  session: securityConfig.session,
  jwt: securityConfig.jwt,
  cookies: securityConfig.cookies,

  callbacks: {
    async signIn({ user, account, profile, credentials }) {
      // Enhanced sign-in validation
      if (user.id) {
        // Check for any additional security validations here

        // Log the sign-in attempt with enhanced details
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId,
            action: "auth.signin",
            resource: `user:${user.id}`,
            details: {
              provider: account?.provider,
              type: account?.type,
              providerAccountId: account?.providerAccountId,
              profileEmail: profile?.email,
              securityFlags: user.securityFlags
            },
            status: "success"
          }
        }).catch(console.error)
      }

      return true
    },

    async jwt({ token, user, account, trigger }) {
      // Initial sign in
      if (user) {
        token.organizationId = user.organizationId
        token.organization = user.organization ? {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          type: user.organization.type
        } : undefined

        token.sessionId = crypto.randomUUID()
        token.loginMethod = account?.provider || 'credentials'
        token.lastActivity = new Date().toISOString()
        token.securityFlags = user.securityFlags

        // Get user roles and permissions
        if (user.id) {
          const roles = await getUserRoles(user.id)
          const permissions = await getUserPermissions(user.id)

          token.roles = roles
          token.permissions = permissions
        }
      }

      // Refresh roles and permissions periodically
      if (token.sub && trigger === 'update' && (!token.roles || !token.permissions)) {
        const roles = await getUserRoles(token.sub)
        const permissions = await getUserPermissions(token.sub)

        token.roles = roles
        token.permissions = permissions
      }

      // Update last activity
      if (trigger === 'update') {
        token.lastActivity = new Date().toISOString()
      }

      return token
    },

    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub
        session.user.organizationId = token.organizationId
        session.user.organization = token.organization
        session.user.roles = token.roles || []
        session.user.permissions = token.permissions || []
        session.user.sessionId = token.sessionId
        session.user.loginMethod = token.loginMethod
        session.user.lastActivity = token.lastActivity
        session.user.securityFlags = token.securityFlags
      }

      return session
    },

    async redirect({ url, baseUrl }) {
      // Enhanced redirect logic for production
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`
      }

      // Security: Only allow redirects to same origin
      try {
        const urlObj = new URL(url)
        const baseUrlObj = new URL(baseUrl)

        if (urlObj.origin === baseUrlObj.origin) {
          return url
        }
      } catch {
        // Invalid URL, fallback to dashboard
      }

      return `${baseUrl}/dashboard`
    }
  },

  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
    newUser: '/auth/welcome'
  },

  events: {
    async signOut({ token, session }) {
      // Enhanced sign out logging
      if (token?.sub) {
        await prisma.auditLog.create({
          data: {
            userId: token.sub,
            organizationId: token.organizationId,
            action: "auth.signout",
            resource: `user:${token.sub}`,
            details: {
              sessionId: token.sessionId,
              loginMethod: token.loginMethod,
              sessionDuration: token.lastActivity ?
                Date.now() - new Date(token.lastActivity).getTime() : undefined
            },
            status: "success"
          }
        }).catch(console.error)
      }
    },

    async session({ session, token }) {
      // Enhanced session tracking
      if (token?.sub && securityConfig.security.enableAuditLogging) {
        // Update user activity periodically (throttled to avoid excessive DB calls)
        const lastUpdate = token.lastActivity ? new Date(token.lastActivity) : new Date()
        const now = new Date()
        const timeDiff = now.getTime() - lastUpdate.getTime()

        // Update every 15 minutes
        if (timeDiff > 15 * 60 * 1000) {
          await prisma.user.update({
            where: { id: token.sub },
            data: {
              updatedAt: now,
              metadata: {
                ...(await prisma.user.findUnique({ where: { id: token.sub } }))?.metadata as any,
                lastActivity: now.toISOString()
              }
            }
          }).catch(() => {
            // Ignore errors to avoid breaking the session
          })
        }
      }
    },

    async linkAccount({ user, account, profile }) {
      // Log account linking
      await prisma.auditLog.create({
        data: {
          userId: user.id!,
          organizationId: user.organizationId,
          action: "auth.link_account",
          resource: `user:${user.id}`,
          details: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            profileEmail: profile?.email
          },
          status: "success"
        }
      }).catch(console.error)
    },

    async createUser({ user }) {
      // Log user creation
      await prisma.auditLog.create({
        data: {
          userId: user.id!,
          organizationId: user.organizationId,
          action: "auth.create_user",
          resource: `user:${user.id}`,
          details: {
            email: user.email,
            name: user.name,
            provider: "oauth"
          },
          status: "success"
        }
      }).catch(console.error)
    }
  },

  debug: process.env.NODE_ENV === "development",

  // Production-specific configuration
  useSecureCookies: process.env.NODE_ENV === 'production',

  // Custom error handling
  logger: {
    error: (error: Error) => {
      console.error('NextAuth Error:', error)
      // In production, you might want to send this to a logging service
    },
    warn: (message: string) => {
      console.warn('NextAuth Warning:', message)
    },
    debug: (message: string) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('NextAuth Debug:', message)
      }
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(productionAuthConfig)