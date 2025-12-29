import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Database } from '../config/database';
import { RedisClient } from '../config/redis';
import { Logger } from '../utils/logger';
import { User, AuthTokens } from '../types';

export interface AuthRequest extends Request {
  user?: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export class AuthService {
  private db: Database;
  private redis: RedisClient;
  private logger: Logger;
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private jwtExpiry: string;
  private jwtRefreshExpiry: string;

  constructor(db: Database, redis: RedisClient) {
    this.db = db;
    this.redis = redis;
    this.logger = new Logger('AuthService');
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret';
    this.jwtExpiry = process.env.JWT_EXPIRY || '15m';
    this.jwtRefreshExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';

    if (this.jwtSecret.length < 32) {
      this.logger.warn('JWT secret is too short. Use at least 32 characters in production');
    }
  }

  async register(data: RegisterData): Promise<User> {
    this.logger.info('Registering new user', { email: data.email });

    // Check if user exists
    const existingUser = await this.db.query(
      'SELECT id FROM users WHERE email = $1',
      [data.email]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('User already exists');
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(data.password, saltRounds);

    // Create user
    const query = `
      INSERT INTO users (email, password_hash, name, roles, permissions)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, name, roles, permissions, active, created_at
    `;

    const result = await this.db.query(query, [
      data.email,
      passwordHash,
      data.name,
      ['user'],
      []
    ]);

    const user = this.mapToUser(result.rows[0]);
    this.logger.info('User registered successfully', { userId: user.id });
    this.logger.audit('user_register', user.id, user.id, { email: user.email });

    return user;
  }

  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    this.logger.info('User login attempt', { email: credentials.email });

    // Get user
    const query = `
      SELECT id, email, password_hash, name, roles, permissions, active, created_at, last_login
      FROM users
      WHERE email = $1
    `;

    const result = await this.db.query(query, [credentials.email]);

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const userRecord = result.rows[0];

    // Check if user is active
    if (!userRecord.active) {
      throw new Error('Account is disabled');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(
      credentials.password,
      userRecord.password_hash
    );

    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await this.db.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [userRecord.id]
    );

    // Generate tokens
    const user = this.mapToUser(userRecord);
    const tokens = await this.generateTokens(user);

    this.logger.info('User logged in successfully', { userId: user.id });
    this.logger.audit('user_login', user.id, user.id);

    return tokens;
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as any;

      // Check if token is in database and not revoked
      const tokenQuery = `
        SELECT u.* FROM refresh_tokens rt
        INNER JOIN users u ON rt.user_id = u.id
        WHERE rt.token_hash = $1 AND rt.revoked = false AND rt.expires_at > CURRENT_TIMESTAMP
      `;

      const tokenHash = await this.hashToken(refreshToken);
      const result = await this.db.query(tokenQuery, [tokenHash]);

      if (result.rows.length === 0) {
        throw new Error('Invalid refresh token');
      }

      const user = this.mapToUser(result.rows[0]);

      // Revoke old token
      await this.db.query(
        'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
        [tokenHash]
      );

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      this.logger.info('Tokens refreshed successfully', { userId: user.id });

      return tokens;
    } catch (error) {
      this.logger.error('Failed to refresh tokens', error);
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // Revoke specific token
      const tokenHash = await this.hashToken(refreshToken);
      await this.db.query(
        'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
        [tokenHash]
      );
    } else {
      // Revoke all tokens for user
      await this.db.query(
        'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
        [userId]
      );
    }

    // Clear any cached sessions
    await this.redis.del(`session:${userId}`);

    this.logger.info('User logged out', { userId });
    this.logger.audit('user_logout', userId, userId);
  }

  async verifyToken(token: string): Promise<User> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;

      // Check cache first
      const cached = await this.redis.get<User>(`session:${decoded.sub}`);
      if (cached) {
        return cached;
      }

      // Get user from database
      const query = `
        SELECT id, email, name, roles, permissions, active, created_at, last_login
        FROM users
        WHERE id = $1 AND active = true
      `;

      const result = await this.db.query(query, [decoded.sub]);

      if (result.rows.length === 0) {
        throw new Error('User not found or inactive');
      }

      const user = this.mapToUser(result.rows[0]);

      // Cache for 5 minutes
      await this.redis.set(`session:${user.id}`, user, 300);

      return user;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    // Generate access token
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles
      },
      this.jwtSecret,
      {
        expiresIn: this.jwtExpiry,
        issuer: 'marketing-engine',
        audience: 'marketing-engine-api'
      }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { sub: user.id },
      this.jwtRefreshSecret,
      {
        expiresIn: this.jwtRefreshExpiry,
        issuer: 'marketing-engine'
      }
    );

    // Store refresh token
    const tokenHash = await this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.db.query(`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `, [user.id, tokenHash, expiresAt]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900 // 15 minutes in seconds
    };
  }

  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  }

  private mapToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      roles: row.roles || [],
      permissions: row.permissions || [],
      active: row.active,
      createdAt: row.created_at,
      lastLogin: row.last_login
    };
  }
}

// Middleware factory
export function createAuthMiddleware(authService: AuthService) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required' });
      }

      const token = authHeader.substring(7);
      const user = await authService.verifyToken(token);

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// Role-based access control middleware
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasRole = roles.some(role => req.user!.roles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Permission-based access control middleware
export function requirePermission(...permissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasPermission = permissions.every(permission => 
      req.user!.permissions.includes(permission) ||
      req.user!.roles.includes('admin') // Admins bypass permission checks
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}