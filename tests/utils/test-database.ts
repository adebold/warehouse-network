import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import { randomBytes } from 'crypto'

export class TestDatabase {
  private prisma: PrismaClient
  private dbName: string
  private originalDatabaseUrl: string

  constructor() {
    this.originalDatabaseUrl = process.env.DATABASE_URL || ''
    this.dbName = `test_${randomBytes(8).toString('hex')}`
    this.prisma = new PrismaClient()
  }

  async setup(): Promise<void> {
    try {
      // Create test database
      await this.createDatabase()

      // Update DATABASE_URL to point to test database
      const baseUrl = this.originalDatabaseUrl.split('/').slice(0, -1).join('/')
      process.env.DATABASE_URL = `${baseUrl}/${this.dbName}`

      // Initialize new Prisma client with test database
      await this.prisma.$disconnect()
      this.prisma = new PrismaClient()

      // Run migrations
      execSync(`npx prisma db push --force-reset --accept-data-loss`, {
        env: { ...process.env, DATABASE_URL: `${baseUrl}/${this.dbName}` },
        stdio: 'pipe'
      })

      console.log(`Test database ${this.dbName} created and migrated`)
    } catch (error) {
      console.error('Failed to setup test database:', error)
      throw error
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.prisma.$disconnect()

      // Drop test database
      await this.dropDatabase()

      // Restore original DATABASE_URL
      process.env.DATABASE_URL = this.originalDatabaseUrl

      console.log(`Test database ${this.dbName} cleaned up`)
    } catch (error) {
      console.error('Failed to cleanup test database:', error)
    }
  }

  async reset(): Promise<void> {
    try {
      // Clear all data but keep schema
      const tablenames = await this.prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname='public'
      `

      for (const { tablename } of tablenames) {
        if (tablename !== '_prisma_migrations') {
          await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`)
        }
      }

      console.log('Test database reset')
    } catch (error) {
      console.error('Failed to reset test database:', error)
      throw error
    }
  }

  getClient(): PrismaClient {
    return this.prisma
  }

  getDatabaseName(): string {
    return this.dbName
  }

  private async createDatabase(): Promise<void> {
    const adminPrisma = new PrismaClient({
      datasources: {
        db: {
          url: this.originalDatabaseUrl
        }
      }
    })

    try {
      await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${this.dbName}"`)
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error
      }
    } finally {
      await adminPrisma.$disconnect()
    }
  }

  private async dropDatabase(): Promise<void> {
    const adminPrisma = new PrismaClient({
      datasources: {
        db: {
          url: this.originalDatabaseUrl
        }
      }
    })

    try {
      // Terminate active connections to the test database
      await adminPrisma.$executeRawUnsafe(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${this.dbName}'
          AND pid <> pg_backend_pid()
      `)

      // Drop the database
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${this.dbName}"`)
    } finally {
      await adminPrisma.$disconnect()
    }
  }
}

export const createTestDatabase = () => new TestDatabase()