/**
 * Two-Factor Authentication (2FA) Implementation
 * TOTP-based 2FA with backup codes
 */

import { randomBytes, createHmac } from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { SecurityConfig } from './config';
import { prisma } from '@/lib/prisma';

export interface TwoFactorSetupResult {
  secret: string;
  qrCodeUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
  manualEntryKey: string;
}

export interface TwoFactorVerification {
  isValid: boolean;
  usedBackupCode?: boolean;
  error?: string;
}

export class TwoFactorAuth {
  constructor() {
    // Configure authenticator
    authenticator.options = {
      digits: SecurityConfig.twoFactor.digits,
      step: SecurityConfig.twoFactor.period,
      window: SecurityConfig.twoFactor.window,
      algorithm: SecurityConfig.twoFactor.algorithm,
    };
  }

  /**
   * Generate secret for new 2FA setup
   */
  generateSecret(userEmail: string): string {
    return authenticator.generateSecret();
  }

  /**
   * Generate QR code URL for authenticator apps
   */
  generateQRCodeUrl(secret: string, userEmail: string, issuer: string = SecurityConfig.twoFactor.issuer): string {
    return authenticator.keyuri(userEmail, issuer, secret);
  }

  /**
   * Generate QR code data URL for display
   */
  async generateQRCodeDataUrl(qrCodeUrl: string): Promise<string> {
    try {
      return await QRCode.toDataURL(qrCodeUrl, {
        width: SecurityConfig.twoFactor.qrCodeSize,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
    } catch (error) {
      console.error('QR code generation error:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate backup codes
   */
  generateBackupCodes(count: number = SecurityConfig.twoFactor.backupCodesCount): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = randomBytes(SecurityConfig.twoFactor.backupCodeLength / 2)
        .toString('hex')
        .toUpperCase();
      codes.push(code);
    }

    return codes;
  }

  /**
   * Hash backup codes for storage
   */
  hashBackupCodes(codes: string[]): string[] {
    return codes.map(code => {
      const hmac = createHmac('sha256', process.env.NEXTAUTH_SECRET!);
      hmac.update(code);
      return hmac.digest('hex');
    });
  }

  /**
   * Verify backup code
   */
  verifyBackupCode(code: string, hashedCodes: string[]): boolean {
    const hmac = createHmac('sha256', process.env.NEXTAUTH_SECRET!);
    hmac.update(code.toUpperCase().replace(/\s/g, ''));
    const hashedInput = hmac.digest('hex');

    return hashedCodes.includes(hashedInput);
  }

  /**
   * Set up 2FA for a user
   */
  async setupTwoFactor(userId: string, userEmail: string): Promise<TwoFactorSetupResult> {
    try {
      // Generate secret and backup codes
      const secret = this.generateSecret(userEmail);
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = this.hashBackupCodes(backupCodes);

      // Generate QR code
      const qrCodeUrl = this.generateQRCodeUrl(secret, userEmail);
      const qrCodeDataUrl = await this.generateQRCodeDataUrl(qrCodeUrl);

      // Store in database (not enabled yet)
      await prisma.userTwoFactor.upsert({
        where: { userId },
        update: {
          secret,
          backupCodes: hashedBackupCodes,
          isEnabled: false,
          setupAt: new Date(),
        },
        create: {
          userId,
          secret,
          backupCodes: hashedBackupCodes,
          isEnabled: false,
          setupAt: new Date(),
        },
      });

      return {
        secret,
        qrCodeUrl,
        qrCodeDataUrl,
        backupCodes,
        manualEntryKey: secret,
      };
    } catch (error) {
      console.error('2FA setup error:', error);
      throw new Error('Failed to set up two-factor authentication');
    }
  }

  /**
   * Enable 2FA after verification
   */
  async enableTwoFactor(userId: string, token: string): Promise<boolean> {
    try {
      const userTwoFactor = await prisma.userTwoFactor.findUnique({
        where: { userId },
      });

      if (!userTwoFactor || !userTwoFactor.secret) {
        throw new Error('2FA not set up for user');
      }

      // Verify the token
      const isValid = authenticator.verify({
        token,
        secret: userTwoFactor.secret,
      });

      if (!isValid) {
        return false;
      }

      // Enable 2FA
      await prisma.userTwoFactor.update({
        where: { userId },
        data: {
          isEnabled: true,
          enabledAt: new Date(),
        },
      });

      // Log the enablement
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'two_factor.enabled',
          resource: `user:${userId}`,
          status: 'success',
          details: {
            method: 'totp',
          },
        },
      });

      return true;
    } catch (error) {
      console.error('2FA enable error:', error);
      throw new Error('Failed to enable two-factor authentication');
    }
  }

  /**
   * Verify 2FA token or backup code
   */
  async verifyTwoFactor(userId: string, token: string): Promise<TwoFactorVerification> {
    try {
      const userTwoFactor = await prisma.userTwoFactor.findUnique({
        where: { userId },
      });

      if (!userTwoFactor || !userTwoFactor.isEnabled) {
        return {
          isValid: false,
          error: '2FA not enabled for user',
        };
      }

      // First try TOTP verification
      const isValidTOTP = authenticator.verify({
        token,
        secret: userTwoFactor.secret,
      });

      if (isValidTOTP) {
        // Log successful verification
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'two_factor.verified',
            resource: `user:${userId}`,
            status: 'success',
            details: {
              method: 'totp',
            },
          },
        });

        return { isValid: true };
      }

      // Try backup code verification
      if (userTwoFactor.backupCodes.length > 0) {
        const isValidBackupCode = this.verifyBackupCode(token, userTwoFactor.backupCodes);

        if (isValidBackupCode) {
          // Remove used backup code
          const hmac = createHmac('sha256', process.env.NEXTAUTH_SECRET!);
          hmac.update(token.toUpperCase().replace(/\s/g, ''));
          const usedCodeHash = hmac.digest('hex');

          await prisma.userTwoFactor.update({
            where: { userId },
            data: {
              backupCodes: userTwoFactor.backupCodes.filter(code => code !== usedCodeHash),
            },
          });

          // Log backup code usage
          await prisma.auditLog.create({
            data: {
              userId,
              action: 'two_factor.backup_code_used',
              resource: `user:${userId}`,
              status: 'success',
              details: {
                method: 'backup_code',
                remainingCodes: userTwoFactor.backupCodes.length - 1,
              },
            },
          });

          return {
            isValid: true,
            usedBackupCode: true,
          };
        }
      }

      // Log failed verification
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'two_factor.verification_failed',
          resource: `user:${userId}`,
          status: 'failure',
          details: {
            tokenLength: token.length,
          },
        },
      });

      return {
        isValid: false,
        error: 'Invalid 2FA token or backup code',
      };
    } catch (error) {
      console.error('2FA verification error:', error);
      return {
        isValid: false,
        error: 'Failed to verify two-factor authentication',
      };
    }
  }

  /**
   * Disable 2FA for a user
   */
  async disableTwoFactor(userId: string, password: string): Promise<boolean> {
    try {
      // Verify password before disabling 2FA
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });

      if (!user || !user.password) {
        throw new Error('User not found or no password set');
      }

      const bcrypt = await import('bcryptjs');
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return false;
      }

      // Disable 2FA
      await prisma.userTwoFactor.update({
        where: { userId },
        data: {
          isEnabled: false,
          disabledAt: new Date(),
        },
      });

      // Log the disablement
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'two_factor.disabled',
          resource: `user:${userId}`,
          status: 'success',
        },
      });

      return true;
    } catch (error) {
      console.error('2FA disable error:', error);
      throw new Error('Failed to disable two-factor authentication');
    }
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId: string, password: string): Promise<string[]> {
    try {
      // Verify password
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });

      if (!user || !user.password) {
        throw new Error('User not found or no password set');
      }

      const bcrypt = await import('bcryptjs');
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        throw new Error('Invalid password');
      }

      // Generate new backup codes
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = this.hashBackupCodes(backupCodes);

      // Update in database
      await prisma.userTwoFactor.update({
        where: { userId },
        data: {
          backupCodes: hashedBackupCodes,
        },
      });

      // Log the regeneration
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'two_factor.backup_codes_regenerated',
          resource: `user:${userId}`,
          status: 'success',
        },
      });

      return backupCodes;
    } catch (error) {
      console.error('Backup codes regeneration error:', error);
      throw new Error('Failed to regenerate backup codes');
    }
  }

  /**
   * Check if user has 2FA enabled
   */
  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    try {
      const userTwoFactor = await prisma.userTwoFactor.findUnique({
        where: { userId },
      });

      return userTwoFactor?.isEnabled || false;
    } catch (error) {
      console.error('2FA check error:', error);
      return false;
    }
  }

  /**
   * Get 2FA status and info
   */
  async getTwoFactorStatus(userId: string) {
    try {
      const userTwoFactor = await prisma.userTwoFactor.findUnique({
        where: { userId },
      });

      if (!userTwoFactor) {
        return {
          isSetup: false,
          isEnabled: false,
          backupCodesCount: 0,
          setupAt: null,
          enabledAt: null,
        };
      }

      return {
        isSetup: !!userTwoFactor.secret,
        isEnabled: userTwoFactor.isEnabled,
        backupCodesCount: userTwoFactor.backupCodes.length,
        setupAt: userTwoFactor.setupAt,
        enabledAt: userTwoFactor.enabledAt,
      };
    } catch (error) {
      console.error('2FA status error:', error);
      throw new Error('Failed to get two-factor authentication status');
    }
  }
}

// Create singleton instance
export const twoFactorAuth = new TwoFactorAuth();