import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/services/authService';
import { logSecurityEvent } from '@/utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

const authService = new AuthService();

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
      logSecurityEvent('MISSING_AUTH_TOKEN', { endpoint: req.path }, req);
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    try {
      const payload = await authService.verifyToken(token);
      req.user = {
        id: payload.userId,
        email: payload.email
      };
      
      next();
    } catch (error) {
      logSecurityEvent('INVALID_AUTH_TOKEN', {
        endpoint: req.path,
        error: error.message
      }, req);
      
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
    return;
  }
};

export const requireRole = (roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get user role from database
      // In a real implementation, you'd fetch the user's role
      // For this example, we'll assume all authenticated users have 'user' role
      const userRole = 'user';

      if (!roles.includes(userRole)) {
        logSecurityEvent('INSUFFICIENT_PERMISSIONS', {
          userId: req.user.id,
          requiredRoles: roles,
          userRole
        }, req);
        
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Authorization error' });
      return;
    }
  };
};