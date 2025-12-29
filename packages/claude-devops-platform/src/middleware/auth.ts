import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { Database } from '../database';
import { logger } from '../utils/logger';
import { Permission, RolePermissions, Role } from '../types';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: Role[];
    permissions: Permission[];
  };
  apiKey?: {
    id: string;
    name: string;
    permissions: Permission[];
  };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'No authorization header provided',
        },
      });
      return;
    }
    
    if (authHeader.startsWith('Bearer ')) {
      // JWT authentication
      const token = authHeader.substring(7);
      await handleJwtAuth(req, res, token, next);
    } else if (authHeader.startsWith('ApiKey ')) {
      // API key authentication
      const apiKey = authHeader.substring(7);
      await handleApiKeyAuth(req, res, apiKey, next);
    } else {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_AUTH_SCHEME',
          message: 'Invalid authentication scheme',
        },
      });
    }
  } catch (error) {
    logger.error('Authentication error:', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed',
      },
    });
  }
}

async function handleJwtAuth(
  req: AuthRequest,
  res: Response,
  token: string,
  next: NextFunction
): Promise<void> {
  try {
    const decoded = jwt.verify(token, config.security.jwtSecret) as any;
    
    // Get user from database
    const result = await Database.query(
      'SELECT id, email, roles FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
      return;
    }
    
    const user = result.rows[0];
    const roles = user.roles as Role[];
    const permissions = new Set<Permission>();
    
    // Aggregate permissions from roles
    for (const role of roles) {
      const rolePerms = RolePermissions[role] || [];
      rolePerms.forEach(perm => permissions.add(perm));
    }
    
    req.user = {
      id: user.id,
      email: user.email,
      roles,
      permissions: Array.from(permissions),
    };
    
    // Audit log
    await Database.audit(
      user.id,
      'api_access',
      'jwt',
      null,
      {
        path: req.path,
        method: req.method,
      },
      req.ip,
      req.get('user-agent')
    );
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired',
        },
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token',
        },
      });
    } else {
      throw error;
    }
  }
}

async function handleApiKeyAuth(
  req: AuthRequest,
  res: Response,
  apiKey: string,
  next: NextFunction
): Promise<void> {
  // Hash the API key to compare with stored hash
  const keyHash = await bcrypt.hash(apiKey, 10);
  
  // Get API key from database
  const result = await Database.query(
    `SELECT id, name, permissions, expires_at 
     FROM api_keys 
     WHERE key_hash = $1`,
    [keyHash]
  );
  
  if (result.rows.length === 0) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    });
    return;
  }
  
  const apiKeyRecord = result.rows[0];
  
  // Check if API key is expired
  if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
    res.status(401).json({
      success: false,
      error: {
        code: 'API_KEY_EXPIRED',
        message: 'API key has expired',
      },
    });
    return;
  }
  
  req.apiKey = {
    id: apiKeyRecord.id,
    name: apiKeyRecord.name,
    permissions: apiKeyRecord.permissions,
  };
  
  // Update last used timestamp
  await Database.query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
    [apiKeyRecord.id]
  );
  
  // Audit log
  await Database.audit(
    null,
    'api_access',
    'api_key',
    apiKeyRecord.id,
    {
      path: req.path,
      method: req.method,
      keyName: apiKeyRecord.name,
    },
    req.ip,
    req.get('user-agent')
  );
  
  next();
}

export function requirePermission(permission: Permission | Permission[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const requiredPermissions = Array.isArray(permission) ? permission : [permission];
    
    let hasPermission = false;
    
    if (req.user) {
      // Check user permissions
      hasPermission = requiredPermissions.every(perm => 
        req.user!.permissions.includes(perm)
      );
    } else if (req.apiKey) {
      // Check API key permissions
      hasPermission = requiredPermissions.every(perm => 
        req.apiKey!.permissions.includes(perm)
      );
    }
    
    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions',
          details: {
            required: requiredPermissions,
          },
        },
      });
      return;
    }
    
    next();
  };
}

export function requireRole(role: Role | Role[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(403).json({
        success: false,
        error: {
          code: 'ROLE_REQUIRED',
          message: 'This endpoint requires user authentication',
        },
      });
      return;
    }
    
    const requiredRoles = Array.isArray(role) ? role : [role];
    const hasRole = requiredRoles.some(r => req.user!.roles.includes(r));
    
    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: 'Insufficient role privileges',
          details: {
            required: requiredRoles,
            current: req.user.roles,
          },
        },
      });
      return;
    }
    
    next();
  };
}

// Helper functions for authentication
export async function generateToken(userId: string): Promise<string> {
  return jwt.sign(
    { userId },
    config.security.jwtSecret,
    { expiresIn: config.security.jwtExpiry }
  );
}

export async function generateRefreshToken(userId: string): Promise<string> {
  return jwt.sign(
    { userId, type: 'refresh' },
    config.security.jwtSecret,
    { expiresIn: config.security.refreshTokenExpiry }
  );
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function generateApiKey(): Promise<{ key: string; hash: string }> {
  const key = Buffer.from(require('crypto').randomBytes(32)).toString('base64url');
  const hash = await bcrypt.hash(key, 10);
  return { key, hash };
}