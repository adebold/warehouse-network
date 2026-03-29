import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { getUserPermissions, getUserRoles } from "@/lib/rbac"
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
    }
  }

  interface User {
    organizationId?: string
    organization?: Organization
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
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Removed allowDangerousEmailAccountLinking for security
    }),

    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // Removed allowDangerousEmailAccountLinking for security
    }),

    CredentialsProvider({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        organizationSlug: { label: "Organization", type: "text", optional: true }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required")
        }

        // Find user by email
        let user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            organization: true
          }
        })

        if (!user || !user.password) {
          throw new Error("Invalid credentials")
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!isPasswordValid) {
          throw new Error("Invalid credentials")
        }

        // Check if user is active
        if (user.status !== "ACTIVE") {
          throw new Error("Account is not active")
        }

        // Check organization context if provided
        if (credentials.organizationSlug && user.organization) {
          if (user.organization.slug !== credentials.organizationSlug) {
            throw new Error("Invalid organization")
          }
        }

        // Update login tracking
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            loginCount: { increment: 1 }
          }
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          organizationId: user.organizationId,
          organization: user.organization
        }
      }
    }),

    CredentialsProvider({
      id: "super-admin",
      name: "Super Admin",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        adminCode: { label: "Admin Code", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.adminCode) {
          throw new Error("All fields are required")
        }

        // Verify admin code (additional security for super admin)
        if (credentials.adminCode !== process.env.SUPER_ADMIN_CODE) {
          throw new Error("Invalid admin code")
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
            organization: true
          }
        })

        if (!user || !user.password) {
          throw new Error("Invalid super admin credentials")
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!isPasswordValid) {
          throw new Error("Invalid super admin credentials")
        }

        // Update login tracking
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            loginCount: { increment: 1 }
          }
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          organizationId: user.organizationId,
          organization: user.organization
        }
      }
    })
  ],

  session: {
    strategy: "jwt",
    maxAge: 15 * 60, // 15 minutes
    updateAge: 5 * 60, // Update every 5 minutes
  },

  jwt: {
    maxAge: 15 * 60, // 15 minutes
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      // Log the sign-in attempt
      if (user.id) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            organizationId: user.organizationId,
            action: "auth.signin",
            resource: `user:${user.id}`,
            details: {
              provider: account?.provider,
              type: account?.type,
              userAgent: undefined, // Will be set by middleware
            },
            status: "success"
          }
        }).catch(console.error)
      }

      return true
    },

    async jwt({ token, user, account }) {
      // Initial sign in
      if (user) {
        token.organizationId = user.organizationId
        token.organization = user.organization ? {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          type: user.organization.type
        } : undefined

        // Get user roles and permissions
        if (user.id) {
          const roles = await getUserRoles(user.id)
          const permissions = await getUserPermissions(user.id)

          token.roles = roles
          token.permissions = permissions
        }
      }

      // Refresh roles and permissions every 15 minutes
      if (token.sub && (!token.roles || !token.permissions)) {
        const roles = await getUserRoles(token.sub)
        const permissions = await getUserPermissions(token.sub)

        token.roles = roles
        token.permissions = permissions
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
      }

      return session
    },

    async redirect({ url, baseUrl }) {
      // Redirect to organization-specific dashboard after sign-in
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`
      }

      // Handle organization-specific redirects
      const urlObj = new URL(url)
      if (urlObj.origin === baseUrl) {
        return url
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
    async signOut({ token }) {
      // Log sign out
      if (token?.sub) {
        await prisma.auditLog.create({
          data: {
            userId: token.sub,
            organizationId: token.organizationId,
            action: "auth.signout",
            resource: `user:${token.sub}`,
            status: "success"
          }
        }).catch(console.error)
      }
    },

    async session({ session, token }) {
      // Update last activity (optional - for session tracking)
      if (token?.sub) {
        await prisma.user.update({
          where: { id: token.sub },
          data: { updatedAt: new Date() }
        }).catch(() => {
          // Ignore errors to avoid breaking the session
        })
      }
    }
  },

  debug: process.env.NODE_ENV === "development",
})