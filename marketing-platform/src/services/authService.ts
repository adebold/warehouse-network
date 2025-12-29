import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import database from '@/utils/database';
import { redisService } from '@/utils/redis';
import { logger, logSecurityEvent } from '@/utils/logger';

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface RefreshResult {
  accessToken: string;
  user: User;
}

export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly jwtRefreshExpiresIn: string;
  private readonly bcryptRounds: number;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'fallback-secret';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '15m';
    this.jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');

    if (this.jwtSecret.length < 32 || this.jwtRefreshSecret.length < 32) {
      throw new Error('JWT secrets must be at least 32 characters long');
    }
  }

  async register(data: RegisterData): Promise<User> {
    const { email, password, firstName, lastName } = data;

    // Validate input
    this.validateEmail(email);
    this.validatePassword(password);
    this.validateName(firstName, 'First name');
    this.validateName(lastName, 'Last name');

    try {
      // Check if email already exists
      const existingUser = await database.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('Email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, this.bcryptRounds);

      // Insert new user
      const result = await database.query(
        `INSERT INTO users (email, password_hash, first_name, last_name) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, email, first_name, last_name`,
        [email.toLowerCase(), passwordHash, firstName.trim(), lastName.trim()]
      );

      const user = result.rows[0];
      
      logger.info('User registered successfully', { userId: user.id, email: user.email });

      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      };
    } catch (error) {
      logger.error('Registration failed', { email, error: error.message });
      throw error;
    }
  }

  async login(credentials: LoginCredentials, req?: any): Promise<AuthResult> {
    const { email, password } = credentials;

    try {
      // Get user by email
      const result = await database.query(
        `SELECT id, email, password_hash, first_name, last_name, is_active 
         FROM users WHERE email = $1`,
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        logSecurityEvent('LOGIN_ATTEMPT_INVALID_EMAIL', { email }, req);
        throw new Error('Invalid credentials');
      }

      const user = result.rows[0];

      if (!user.is_active) {
        logSecurityEvent('LOGIN_ATTEMPT_INACTIVE_ACCOUNT', { email, userId: user.id }, req);
        throw new Error('Account is inactive');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        logSecurityEvent('LOGIN_ATTEMPT_INVALID_PASSWORD', { email, userId: user.id }, req);
        throw new Error('Invalid credentials');
      }

      // Generate tokens
      const accessToken = this.generateAccessToken(user.id, user.email);
      const refreshToken = await this.generateRefreshToken(user.id);

      // Update last login
      await database.query(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      logger.info('User logged in successfully', { userId: user.id, email: user.email });

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name
        },
        accessToken,
        refreshToken
      };
    } catch (error) {
      logger.error('Login failed', { email, error: error.message });
      throw error;
    }
  }

  async refreshToken(token: string): Promise<RefreshResult> {
    try {
      // Verify refresh token
      const payload = jwt.verify(token, this.jwtRefreshSecret) as any;
      const userId = payload.userId;

      // Check if refresh token exists and is not revoked
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const tokenResult = await database.query(
        `SELECT id, user_id, is_revoked, expires_at 
         FROM refresh_tokens 
         WHERE token_hash = $1 AND user_id = $2`,
        [tokenHash, userId]
      );

      if (tokenResult.rows.length === 0 || tokenResult.rows[0].is_revoked) {
        throw new Error('Invalid refresh token');
      }

      const tokenRecord = tokenResult.rows[0];
      if (new Date() > new Date(tokenRecord.expires_at)) {
        throw new Error('Refresh token expired');
      }

      // Get user data
      const userResult = await database.query(
        'SELECT id, email, first_name, last_name FROM users WHERE id = $1 AND is_active = true',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found or inactive');
      }

      const user = userResult.rows[0];

      // Generate new access token
      const newAccessToken = this.generateAccessToken(user.id, user.email);

      logger.info('Access token refreshed', { userId: user.id });

      return {
        accessToken: newAccessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name
        }
      };
    } catch (error) {
      logger.error('Token refresh failed', { error: error.message });
      throw new Error('Invalid refresh token');
    }
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      
      // Revoke refresh token
      await database.query(
        'UPDATE refresh_tokens SET is_revoked = true WHERE token_hash = $1',
        [tokenHash]
      );

      logger.info('User logged out successfully');
    } catch (error) {
      logger.error('Logout failed', { error: error.message });
      throw error;
    }
  }

  async verifyToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  validatePassword(password: string): void {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (password.length < minLength || !hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      throw new Error(
        'Password does not meet requirements. Must be at least 8 characters with uppercase, lowercase, number, and special character.'
      );
    }
  }

  private validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
  }

  private validateName(name: string, fieldName: string): void {
    if (!name || name.trim().length < 1 || name.trim().length > 100) {
      throw new Error(`${fieldName} must be between 1 and 100 characters`);
    }
  }

  private generateAccessToken(userId: string, email: string): string {
    return jwt.sign(
      { userId, email },
      this.jwtSecret,
      { 
        expiresIn: this.jwtExpiresIn,
        issuer: 'marketing-platform',
        subject: userId
      }
    );
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = jwt.sign(
      { userId },
      this.jwtRefreshSecret,
      { 
        expiresIn: this.jwtRefreshExpiresIn,
        issuer: 'marketing-platform',
        subject: userId
      }
    );

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store refresh token in database
    await database.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    return token;
  }

  async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await database.query(
        'DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP OR is_revoked = true'
      );
      
      if (result.rowCount > 0) {
        logger.info(`Cleaned up ${result.rowCount} expired refresh tokens`);
      }
    } catch (error) {
      logger.error('Failed to cleanup expired tokens', { error: error.message });
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    try {
      const result = await database.query(
        'SELECT id, email, first_name, last_name FROM users WHERE id = $1 AND is_active = true',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      };
    } catch (error) {
      logger.error('Failed to get user by ID', { userId, error: error.message });
      throw error;
    }
  }
}