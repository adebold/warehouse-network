#!/usr/bin/env tsx

/**
 * Security Validation Script
 *
 * This script validates all implemented security features to ensure
 * they are properly configured and functioning.
 */

import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import crypto from 'crypto'

const prisma = new PrismaClient()

interface ValidationResult {
  feature: string
  status: 'PASS' | 'FAIL' | 'WARNING'
  message: string
  details?: any
}

class SecurityValidator {
  private results: ValidationResult[] = []

  async validateAll(): Promise<ValidationResult[]> {
    console.log('🔐 Starting Security Validation...\n')

    await this.validateEnvironmentVariables()
    await this.validateDatabaseSchema()
    await this.validateRedisConnection()
    await this.validateEncryptionKeys()
    await this.validateSecurityFeatures()

    this.printResults()
    return this.results
  }

  private async validateEnvironmentVariables(): Promise<void> {
    console.log('📋 Validating Environment Variables...')

    const requiredVars = [
      'NEXTAUTH_SECRET',
      'SUPER_ADMIN_SETUP_KEY',
      'ENCRYPTION_KEY',
      'REDIS_HOST',
      'DATABASE_URL'
    ]

    const criticalVars = [
      'EMERGENCY_2FA_BYPASS_CODE',
      'CSP_REPORT_URI'
    ]

    for (const varName of requiredVars) {
      const value = process.env[varName]
      if (!value) {
        this.results.push({
          feature: 'Environment Variables',
          status: 'FAIL',
          message: `Required environment variable ${varName} is missing`
        })
      } else if (value.length < 16) {
        this.results.push({
          feature: 'Environment Variables',
          status: 'WARNING',
          message: `Environment variable ${varName} may be too short (< 16 characters)`
        })
      } else {
        this.results.push({
          feature: 'Environment Variables',
          status: 'PASS',
          message: `${varName} is properly configured`
        })
      }
    }

    for (const varName of criticalVars) {
      const value = process.env[varName]
      if (!value) {
        this.results.push({
          feature: 'Environment Variables',
          status: 'WARNING',
          message: `Optional but recommended variable ${varName} is missing`
        })
      }
    }
  }

  private async validateDatabaseSchema(): Promise<void> {
    console.log('🗄️  Validating Database Schema...')

    try {
      // Check for security-related tables
      const securityTables = [
        'SecurityEvent',
        'SecurityAlert',
        'BlockedIP',
        'RefreshToken',
        'UserSession'
      ]

      for (const tableName of securityTables) {
        try {
          const result = await prisma.$queryRaw`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_name = ${tableName}
            );
          `

          if (result[0]?.exists) {
            this.results.push({
              feature: 'Database Schema',
              status: 'PASS',
              message: `Table ${tableName} exists`
            })
          } else {
            this.results.push({
              feature: 'Database Schema',
              status: 'FAIL',
              message: `Security table ${tableName} is missing`
            })
          }
        } catch (error) {
          this.results.push({
            feature: 'Database Schema',
            status: 'FAIL',
            message: `Error checking table ${tableName}: ${error.message}`
          })
        }
      }

      // Check for 2FA columns in User table
      try {
        const userColumns = await prisma.$queryRaw`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'User'
          AND column_name IN ('twoFactorSecret', 'twoFactorEnabled', 'requires2FA');
        `

        const expectedColumns = ['twoFactorSecret', 'twoFactorEnabled', 'requires2FA']
        const existingColumns = userColumns.map(col => col.column_name)

        for (const column of expectedColumns) {
          if (existingColumns.includes(column)) {
            this.results.push({
              feature: 'Database Schema',
              status: 'PASS',
              message: `User.${column} column exists`
            })
          } else {
            this.results.push({
              feature: 'Database Schema',
              status: 'FAIL',
              message: `User.${column} column is missing`
            })
          }
        }
      } catch (error) {
        this.results.push({
          feature: 'Database Schema',
          status: 'FAIL',
          message: `Error checking User table columns: ${error.message}`
        })
      }

    } catch (error) {
      this.results.push({
        feature: 'Database Schema',
        status: 'FAIL',
        message: `Database connection failed: ${error.message}`
      })
    }
  }

  private async validateRedisConnection(): Promise<void> {
    console.log('📡 Validating Redis Connection...')

    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true,
      })

      await redis.ping()

      // Test rate limiting functionality
      const testKey = 'security_validation_test'
      await redis.zadd(testKey, Date.now(), 'test_request')
      const count = await redis.zcard(testKey)
      await redis.del(testKey)

      if (count === 1) {
        this.results.push({
          feature: 'Redis Connection',
          status: 'PASS',
          message: 'Redis is accessible and rate limiting commands work'
        })
      } else {
        this.results.push({
          feature: 'Redis Connection',
          status: 'WARNING',
          message: 'Redis connected but rate limiting test failed'
        })
      }

      await redis.disconnect()

    } catch (error) {
      this.results.push({
        feature: 'Redis Connection',
        status: 'FAIL',
        message: `Redis connection failed: ${error.message}`
      })
    }
  }

  private async validateEncryptionKeys(): Promise<void> {
    console.log('🔑 Validating Encryption Keys...')

    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      this.results.push({
        feature: 'Encryption',
        status: 'FAIL',
        message: 'ENCRYPTION_KEY environment variable is missing'
      })
      return
    }

    // Test encryption/decryption
    try {
      const testData = 'test-secret-data'
      const algorithm = 'aes-256-gcm'
      const key = crypto.scryptSync(encryptionKey, 'salt', 32)
      const iv = crypto.randomBytes(16)

      const cipher = crypto.createCipher(algorithm, key)
      let encrypted = cipher.update(testData, 'utf8', 'hex')
      encrypted += cipher.final('hex')

      const decipher = crypto.createDecipher(algorithm, key)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      if (decrypted === testData) {
        this.results.push({
          feature: 'Encryption',
          status: 'PASS',
          message: 'Encryption/decryption working correctly'
        })
      } else {
        this.results.push({
          feature: 'Encryption',
          status: 'FAIL',
          message: 'Encryption/decryption test failed'
        })
      }
    } catch (error) {
      this.results.push({
        feature: 'Encryption',
        status: 'FAIL',
        message: `Encryption test failed: ${error.message}`
      })
    }

    // Validate key strength
    if (encryptionKey.length < 32) {
      this.results.push({
        feature: 'Encryption',
        status: 'WARNING',
        message: 'Encryption key should be at least 32 characters long'
      })
    }

    // Test NextAuth secret
    const nextAuthSecret = process.env.NEXTAUTH_SECRET
    if (!nextAuthSecret || nextAuthSecret.length < 32) {
      this.results.push({
        feature: 'Encryption',
        status: 'WARNING',
        message: 'NEXTAUTH_SECRET should be at least 32 characters long'
      })
    } else {
      this.results.push({
        feature: 'Encryption',
        status: 'PASS',
        message: 'NEXTAUTH_SECRET has adequate length'
      })
    }
  }

  private async validateSecurityFeatures(): Promise<void> {
    console.log('🛡️  Validating Security Features...')

    // Check security file imports
    const securityFiles = [
      'src/lib/rate-limit.ts',
      'src/lib/csrf.ts',
      'src/lib/csp.ts',
      'src/lib/input-sanitization.ts',
      'src/lib/two-factor-auth.ts',
      'src/lib/security-monitoring.ts',
      'src/lib/refresh-token.ts'
    ]

    for (const file of securityFiles) {
      try {
        // Check if file exists and can be imported
        const fs = require('fs')
        const path = require('path')
        const filePath = path.join(process.cwd(), file)

        if (fs.existsSync(filePath)) {
          this.results.push({
            feature: 'Security Files',
            status: 'PASS',
            message: `${file} exists`
          })
        } else {
          this.results.push({
            feature: 'Security Files',
            status: 'FAIL',
            message: `${file} is missing`
          })
        }
      } catch (error) {
        this.results.push({
          feature: 'Security Files',
          status: 'FAIL',
          message: `Error checking ${file}: ${error.message}`
        })
      }
    }

    // Validate middleware security integration
    try {
      const fs = require('fs')
      const path = require('path')
      const middlewarePath = path.join(process.cwd(), 'src/middleware.ts')

      if (fs.existsSync(middlewarePath)) {
        const content = fs.readFileSync(middlewarePath, 'utf8')

        const securityFeatures = [
          'rate-limit',
          'csrf',
          'csp',
          'security-monitoring'
        ]

        for (const feature of securityFeatures) {
          if (content.includes(feature)) {
            this.results.push({
              feature: 'Middleware Integration',
              status: 'PASS',
              message: `${feature} is integrated in middleware`
            })
          } else {
            this.results.push({
              feature: 'Middleware Integration',
              status: 'WARNING',
              message: `${feature} may not be integrated in middleware`
            })
          }
        }
      } else {
        this.results.push({
          feature: 'Middleware Integration',
          status: 'FAIL',
          message: 'Middleware file not found'
        })
      }
    } catch (error) {
      this.results.push({
        feature: 'Middleware Integration',
        status: 'FAIL',
        message: `Error checking middleware: ${error.message}`
      })
    }
  }

  private printResults(): void {
    console.log('\n📊 Security Validation Results:\n')

    const passed = this.results.filter(r => r.status === 'PASS').length
    const failed = this.results.filter(r => r.status === 'FAIL').length
    const warnings = this.results.filter(r => r.status === 'WARNING').length

    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`⚠️  Warnings: ${warnings}`)
    console.log(`📋 Total: ${this.results.length}\n`)

    // Group results by status
    const failedResults = this.results.filter(r => r.status === 'FAIL')
    const warningResults = this.results.filter(r => r.status === 'WARNING')

    if (failedResults.length > 0) {
      console.log('❌ FAILED CHECKS:')
      failedResults.forEach(result => {
        console.log(`   • ${result.feature}: ${result.message}`)
      })
      console.log('')
    }

    if (warningResults.length > 0) {
      console.log('⚠️  WARNINGS:')
      warningResults.forEach(result => {
        console.log(`   • ${result.feature}: ${result.message}`)
      })
      console.log('')
    }

    // Overall security status
    const overallStatus = failed === 0 ? (warnings === 0 ? 'SECURE' : 'MOSTLY_SECURE') : 'INSECURE'

    switch (overallStatus) {
      case 'SECURE':
        console.log('🔒 OVERALL STATUS: SECURE')
        console.log('All security features are properly implemented and configured.')
        break
      case 'MOSTLY_SECURE':
        console.log('🔐 OVERALL STATUS: MOSTLY SECURE')
        console.log('Security features are implemented but some warnings need attention.')
        break
      case 'INSECURE':
        console.log('🚨 OVERALL STATUS: INSECURE')
        console.log('Critical security issues found. Please fix failed checks before deploying.')
        break
    }

    console.log('\n' + '='.repeat(50))
  }
}

// Main execution
async function main() {
  const validator = new SecurityValidator()

  try {
    const results = await validator.validateAll()

    const failed = results.filter(r => r.status === 'FAIL').length
    process.exit(failed > 0 ? 1 : 0)

  } catch (error) {
    console.error('Security validation failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main()
}

export default SecurityValidator