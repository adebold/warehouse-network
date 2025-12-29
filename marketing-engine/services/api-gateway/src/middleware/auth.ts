import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/errors';

export interface JwtPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
  token?: string;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('Missing or invalid authorization header', 401);
    }
    
    const token = authHeader.substring(7);
    
    // Check if token is blacklisted
    const isBlacklisted = await redis.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new ApiError('Token has been revoked', 401);
    }
    
    // Verify token
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    
    // Check if session is still valid
    const sessionKey = `session:${payload.sessionId}`;
    const session = await redis.get(sessionKey);
    
    if (!session) {
      throw new ApiError('Session expired', 401);
    }
    
    // Update session TTL
    await redis.expire(sessionKey, 3600 * 24); // 24 hours
    
    // Attach user to request
    req.user = payload;
    req.token = token;
    
    // Log authentication
    logger.debug('User authenticated', {
      userId: payload.userId,
      email: payload.email,
      sessionId: payload.sessionId,
    });
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new ApiError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new ApiError('Token expired', 401));
    } else {
      next(error);
    }
  }
}

export function authorize(...requiredPermissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ApiError('Unauthorized', 401));
    }
    
    const hasPermission = requiredPermissions.every(permission =>
      req.user!.permissions.includes(permission)
    );
    
    if (!hasPermission) {
      logger.warn('Authorization failed', {
        userId: req.user.userId,
        required: requiredPermissions,
        actual: req.user.permissions,
      });
      
      return next(new ApiError('Insufficient permissions', 403));
    }
    
    next();
  };
}

export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw new ApiError('Refresh token required', 400);
    }
    
    // Verify refresh token
    const payload = jwt.verify(
      refreshToken,
      config.jwt.refreshSecret
    ) as JwtPayload;
    
    // Check if refresh token is valid
    const refreshKey = `refresh:${payload.sessionId}`;
    const storedToken = await redis.get(refreshKey);
    
    if (storedToken !== refreshToken) {
      throw new ApiError('Invalid refresh token', 401);
    }
    
    // Generate new access token
    const newAccessToken = jwt.sign(
      {
        userId: payload.userId,
        email: payload.email,
        roles: payload.roles,
        permissions: payload.permissions,
        sessionId: payload.sessionId,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiry }
    );
    
    res.json({
      accessToken: newAccessToken,
      expiresIn: config.jwt.expiry,
    });
    
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new ApiError('Invalid refresh token', 401));
    } else {
      next(error);
    }
  }
}