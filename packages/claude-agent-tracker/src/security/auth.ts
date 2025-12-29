/**
 * JWT authentication and security
 */

import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import config from '../config/index.js';
import { db } from '../database/index.js';
import { redis } from '../database/redis.js';
import { logger } from '../monitoring/logger.js';
import { User } from '../types/index.js';

export interface TokenPayload {
  userId: string;
  username: string;
  roles: string[];
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export class AuthService {
  private jwtSecret: string;
  private jwtAlgorithm: jwt.Algorithm;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;
  private bcryptRounds: number;

  constructor() {
    this.jwtSecret = config.security.jwt.secret;
    this.jwtAlgorithm = config.security.jwt.algorithm as jwt.Algorithm;
    this.accessTokenExpiry = config.security.jwt.expiresIn;
    this.refreshTokenExpiry = config.security.jwt.refreshExpiresIn;
    this.bcryptRounds = config.security.bcrypt.rounds;
  }

  async createUser(
    username: string,
    email: string,
    password: string,
    roles: string[] = ['user']
  ): Promise<User> {
    // Validate input
    if (!username || !email || !password) {
      throw new Error('Username, email, and password are required');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);

    try {
      const result = await db.query<any>(`
        INSERT INTO users (username, email, password_hash, roles)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, email, roles, permissions, created_at
      `, [username, email, passwordHash, roles]);

      const user: User = {
        id: result.rows[0].id,
        username: result.rows[0].username,
        email: result.rows[0].email,
        roles: result.rows[0].roles,
        permissions: result.rows[0].permissions,
        createdAt: result.rows[0].created_at
      };

      logger.info('User created', { userId: user.id, username: user.username });
      
      return user;

    } catch (error: any) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Username or email already exists');
      }
      throw error;
    }
  }

  async authenticateUser(
    username: string,
    password: string
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    // Find user
    const result = await db.query<any>(`
      SELECT id, username, email, password_hash, roles, permissions, created_at
      FROM users WHERE username = $1 OR email = $1
    `, [username]);

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const row = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, row.password_hash);
    if (!validPassword) {
      throw new Error('Invalid credentials');
    }

    const user: User = {
      id: row.id,
      username: row.username,
      email: row.email,
      roles: row.roles,
      permissions: row.permissions,
      createdAt: row.created_at
    };

    // Update last login
    await db.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate tokens
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);

    logger.info('User authenticated', { userId: user.id, username: user.username });

    return { user, accessToken, refreshToken };
  }

  async generateAccessToken(user: User): Promise<string> {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      type: 'access'
    };

    const token = jwt.sign(payload, this.jwtSecret, {
      algorithm: this.jwtAlgorithm,
      expiresIn: this.accessTokenExpiry
    } as jwt.SignOptions);

    // Store in Redis for quick validation
    await redis.set(
      `token:access:${user.id}`,
      { token, roles: user.roles },
      3600 // 1 hour
    );

    return token;
  }

  async generateRefreshToken(user: User): Promise<string> {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      type: 'refresh'
    };

    const token = jwt.sign(payload, this.jwtSecret, {
      algorithm: this.jwtAlgorithm,
      expiresIn: this.refreshTokenExpiry
    } as jwt.SignOptions);

    // Store in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await db.query(`
      INSERT INTO session_tokens (user_id, token, type, expires_at, scopes)
      VALUES ($1, $2, $3, $4, $5)
    `, [user.id, token, 'refresh', expiresAt, user.roles]);

    return token;
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: [this.jwtAlgorithm]
      }) as TokenPayload;

      // Additional validation for access tokens
      if (payload.type === 'access') {
        const cached = await redis.get(`token:access:${payload.userId}`);
        if (!cached) {
          throw new Error('Token not found or expired');
        }
      }

      return payload;

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const payload = await this.verifyToken(refreshToken);

    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    // Verify refresh token exists in database
    const result = await db.query<any>(`
      SELECT u.* FROM users u
      JOIN session_tokens st ON u.id = st.user_id
      WHERE st.token = $1 AND st.type = 'refresh' AND st.expires_at > NOW()
    `, [refreshToken]);

    if (result.rows.length === 0) {
      throw new Error('Invalid refresh token');
    }

    const user: User = {
      id: result.rows[0].id,
      username: result.rows[0].username,
      email: result.rows[0].email,
      roles: result.rows[0].roles,
      permissions: result.rows[0].permissions,
      createdAt: result.rows[0].created_at
    };

    return this.generateAccessToken(user);
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const payload = await this.verifyToken(token);

      if (payload.type === 'access') {
        await redis.delete(`token:access:${payload.userId}`);
      } else {
        await db.query(
          'DELETE FROM session_tokens WHERE token = $1',
          [token]
        );
      }

      logger.info('Token revoked', {
        userId: payload.userId,
        type: payload.type
      });

    } catch (error) {
      logger.error('Failed to revoke token', { error });
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    // Remove access token from Redis
    await redis.delete(`token:access:${userId}`);

    // Remove all refresh tokens from database
    await db.query(
      'DELETE FROM session_tokens WHERE user_id = $1',
      [userId]
    );

    logger.info('All tokens revoked for user', { userId });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    // Get current password hash
    const result = await db.query<any>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    // Verify current password
    const validPassword = await bcrypt.compare(
      currentPassword,
      result.rows[0].password_hash
    );

    if (!validPassword) {
      throw new Error('Invalid current password');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, this.bcryptRounds);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );

    // Revoke all tokens
    await this.revokeAllUserTokens(userId);

    logger.info('Password changed', { userId });
  }

  async getUser(userId: string): Promise<User | null> {
    const result = await db.query<any>(`
      SELECT id, username, email, roles, permissions, created_at, last_login
      FROM users WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      roles: row.roles,
      permissions: row.permissions,
      createdAt: row.created_at,
      lastLogin: row.last_login
    };
  }

  hasRole(user: User, role: string): boolean {
    return user.roles.includes(role) || user.roles.includes('admin');
  }

  hasPermission(user: User, permission: string): boolean {
    return user.permissions.includes(permission) || 
           user.roles.includes('admin');
  }
}

// Singleton instance
export const authService = new AuthService();

// Express middleware
export function authenticate(required = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      if (required) {
        return res.status(401).json({ error: 'No authorization header' });
      }
      return next();
    }

    const [scheme, token] = authHeader.split(' ');
    
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Invalid authorization format' });
    }

    try {
      const payload = await authService.verifyToken(token);
      
      if (payload.type !== 'access') {
        return res.status(401).json({ error: 'Invalid token type' });
      }

      const user = await authService.getUser(payload.userId);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Attach user to request
      (req as any).user = user;
      (req as any).token = token;
      
      return next();

    } catch (error: any) {
      logger.error('Authentication failed', { error });
      return res.status(401).json({ error: error.message });
    }
  };
}

export function authorize(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as User;
    
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const hasRequiredRole = roles.some(role => authService.hasRole(user, role));
    
    if (!hasRequiredRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    return next();
  };
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as User;
    
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!authService.hasPermission(user, permission)) {
      return res.status(403).json({ error: 'Missing required permission' });
    }

    return next();
  };
}