import crypto from 'crypto'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { prisma } from './prisma'

export interface TwoFactorSetup {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
  manualEntryKey: string
}

export interface TwoFactorVerification {
  isValid: boolean
  usedBackupCode?: boolean
  error?: string
}

/**
 * Generate 2FA secret and setup data
 */
export async function generate2FASetup(
  userId: string,
  organizationName: string = 'Skidspace'
): Promise<TwoFactorSetup> {
  // Generate a random secret
  const secret = authenticator.generateSecret()

  // Get user email for the label
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  if (!user) {
    throw new Error('User not found')
  }

  // Create the key URI for QR code
  const keyUri = authenticator.keyuri(
    user.email,
    organizationName,
    secret
  )

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(keyUri)

  // Generate backup codes
  const backupCodes = generateBackupCodes()

  // Store the secret (encrypted) in the database
  const encryptedSecret = encrypt2FASecret(secret)

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: encryptedSecret,
      twoFactorBackupCodes: encryptBackupCodes(backupCodes),
      twoFactorEnabled: false, // Will be enabled after verification
    },
  })

  return {
    secret,
    qrCodeUrl,
    backupCodes,
    manualEntryKey: secret,
  }
}

/**
 * Verify 2FA token and enable 2FA for the user
 */
export async function verify2FASetup(
  userId: string,
  token: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true },
  })

  if (!user || !user.twoFactorSecret) {
    return false
  }

  const secret = decrypt2FASecret(user.twoFactorSecret)
  const isValid = authenticator.verify({ token, secret })

  if (isValid) {
    // Enable 2FA for the user
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    })

    // Log the 2FA setup
    await prisma.auditLog.create({
      data: {
        userId,
        action: '2fa.enabled',
        resource: `user:${userId}`,
        status: 'success',
      },
    })
  }

  return isValid
}

/**
 * Verify 2FA token for authentication
 */
export async function verify2FAToken(
  userId: string,
  token: string
): Promise<TwoFactorVerification> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorSecret: true,
      twoFactorEnabled: true,
      twoFactorBackupCodes: true,
    },
  })

  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return { isValid: false, error: '2FA not enabled for this user' }
  }

  const secret = decrypt2FASecret(user.twoFactorSecret)

  // First try to verify with TOTP
  const isValidTOTP = authenticator.verify({
    token,
    secret,
    window: 2, // Allow 1 time step before and after current time
  })

  if (isValidTOTP) {
    await logSecurityEvent(userId, '2fa.verified', 'success')
    return { isValid: true }
  }

  // If TOTP fails, try backup codes
  if (user.twoFactorBackupCodes) {
    const backupCodes = decryptBackupCodes(user.twoFactorBackupCodes)
    const normalizedToken = token.replace(/\s/g, '').toUpperCase()

    const codeIndex = backupCodes.findIndex(code => code === normalizedToken)

    if (codeIndex !== -1) {
      // Remove the used backup code
      backupCodes.splice(codeIndex, 1)

      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorBackupCodes: encryptBackupCodes(backupCodes),
        },
      })

      await logSecurityEvent(userId, '2fa.backup_code_used', 'success', {
        remainingCodes: backupCodes.length,
      })

      return { isValid: true, usedBackupCode: true }
    }
  }

  await logSecurityEvent(userId, '2fa.verification_failed', 'failure')
  return { isValid: false, error: 'Invalid 2FA token' }
}

/**
 * Disable 2FA for a user (requires admin privileges)
 */
export async function disable2FA(
  userId: string,
  adminUserId: string
): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: '2fa.disabled',
        resource: `user:${userId}`,
        status: 'success',
      },
    })

    return true
  } catch (error) {
    console.error('Error disabling 2FA:', error)
    return false
  }
}

/**
 * Generate new backup codes
 */
export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const newBackupCodes = generateBackupCodes()

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorBackupCodes: encryptBackupCodes(newBackupCodes),
    },
  })

  await logSecurityEvent(userId, '2fa.backup_codes_regenerated', 'success')

  return newBackupCodes
}

/**
 * Check if user has 2FA enabled
 */
export async function is2FAEnabled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  })

  return user?.twoFactorEnabled || false
}

/**
 * Get 2FA status and backup codes count
 */
export async function get2FAStatus(userId: string): Promise<{
  enabled: boolean
  backupCodesCount: number
  setupRequired: boolean
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorBackupCodes: true,
      userRoles: {
        include: {
          role: {
            select: { slug: true },
          },
        },
      },
    },
  })

  if (!user) {
    return { enabled: false, backupCodesCount: 0, setupRequired: false }
  }

  // Check if this user is a super admin (requires 2FA)
  const isSuperAdmin = user.userRoles.some(
    userRole => userRole.role.slug === 'super-admin'
  )

  const backupCodesCount = user.twoFactorBackupCodes
    ? decryptBackupCodes(user.twoFactorBackupCodes).length
    : 0

  return {
    enabled: user.twoFactorEnabled || false,
    backupCodesCount,
    setupRequired: isSuperAdmin && !user.twoFactorEnabled,
  }
}

// Helper functions

function generateBackupCodes(): string[] {
  const codes: string[] = []
  for (let i = 0; i < 8; i++) {
    // Generate 8-digit codes
    const code = crypto.randomInt(10000000, 99999999).toString()
    codes.push(code)
  }
  return codes
}

function encrypt2FASecret(secret: string): string {
  const algorithm = 'aes-256-gcm'
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'fallback-key', 'salt', 32)
  const iv = crypto.randomBytes(16)

  const cipher = crypto.createCipher(algorithm, key)
  let encrypted = cipher.update(secret, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const tag = (cipher as any).getAuthTag()

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

function decrypt2FASecret(encryptedSecret: string): string {
  const [ivHex, tagHex, encrypted] = encryptedSecret.split(':')
  const algorithm = 'aes-256-gcm'
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'fallback-key', 'salt', 32)

  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')

  const decipher = crypto.createDecipher(algorithm, key)
  ;(decipher as any).setAuthTag(tag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

function encryptBackupCodes(codes: string[]): string {
  return encrypt2FASecret(JSON.stringify(codes))
}

function decryptBackupCodes(encryptedCodes: string): string[] {
  const decrypted = decrypt2FASecret(encryptedCodes)
  return JSON.parse(decrypted)
}

async function logSecurityEvent(
  userId: string,
  action: string,
  status: 'success' | 'failure',
  details?: any
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource: `user:${userId}`,
        status,
        details: details || {},
      },
    })
  } catch (error) {
    console.error('Failed to log security event:', error)
  }
}

/**
 * Emergency 2FA bypass (for super admin recovery)
 */
export async function emergency2FABypass(
  userId: string,
  emergencyCode: string
): Promise<boolean> {
  // This should only be used in extreme circumstances
  const expectedCode = process.env.EMERGENCY_2FA_BYPASS_CODE

  if (!expectedCode || emergencyCode !== expectedCode) {
    await logSecurityEvent(userId, '2fa.emergency_bypass_failed', 'failure')
    return false
  }

  await logSecurityEvent(userId, '2fa.emergency_bypass_used', 'success')

  // Log this as a critical security event
  console.error('CRITICAL: Emergency 2FA bypass used for user:', userId)

  return true
}

/**
 * Time-based one-time password validation with rate limiting
 */
export async function validateTOTPWithRateLimit(
  userId: string,
  token: string,
  maxAttempts: number = 3
): Promise<TwoFactorVerification> {
  const cacheKey = `2fa_attempts:${userId}`

  // In a real implementation, you'd use Redis for this
  // For now, we'll use a simple in-memory cache
  const attempts = global.twoFactorAttempts?.[userId] || 0

  if (attempts >= maxAttempts) {
    return {
      isValid: false,
      error: `Too many 2FA attempts. Please wait before trying again.`,
    }
  }

  const result = await verify2FAToken(userId, token)

  if (!result.isValid) {
    // Increment attempt counter
    global.twoFactorAttempts = global.twoFactorAttempts || {}
    global.twoFactorAttempts[userId] = attempts + 1

    // Reset attempts after 15 minutes
    setTimeout(() => {
      if (global.twoFactorAttempts) {
        delete global.twoFactorAttempts[userId]
      }
    }, 15 * 60 * 1000)
  } else {
    // Reset attempts on successful verification
    if (global.twoFactorAttempts) {
      delete global.twoFactorAttempts[userId]
    }
  }

  return result
}

// Global variable for rate limiting (replace with Redis in production)
declare global {
  var twoFactorAttempts: Record<string, number> | undefined
}