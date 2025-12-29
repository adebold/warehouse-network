/**
 * Authentication API routes
 */

import { Router } from 'express';

import { logger } from '../monitoring/logger.js';
import * as metrics from '../monitoring/metrics.js';
import { authenticate , authService } from '../security/auth.js';

export const authRoutes = Router();

// Register new user
authRoutes.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({
        error: { message: 'Username, email, and password are required' }
      });
    }

    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: { message: 'Invalid email format' }
      });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({
        error: { message: 'Password must be at least 8 characters long' }
      });
    }

    const user = await authService.createUser(
      username,
      email,
      password,
      ['user'] // Default role
    );

    // Generate tokens
    const accessToken = await authService.generateAccessToken(user);
    const refreshToken = await authService.generateRefreshToken(user);

    return res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles
      },
      tokens: {
        access: accessToken,
        refresh: refreshToken
      }
    });

    logger.info('User registered via API', {
      userId: user.id,
      username: user.username
    });

  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: { message: error.message }
      });
    }
    return next(error);
  }
});

// Login
authRoutes.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: { message: 'Username and password are required' }
      });
    }

    const result = await authService.authenticateUser(username, password);

    return res.json({
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        roles: result.user.roles
      },
      tokens: {
        access: result.accessToken,
        refresh: result.refreshToken
      }
    });

    metrics.apiRequestsTotal.inc({
      method: 'POST',
      endpoint: '/api/auth/login',
      status_code: '200'
    });

  } catch (error: any) {
    if (error.message === 'Invalid credentials') {
      metrics.apiRequestsTotal.inc({
        method: 'POST',
        endpoint: '/api/auth/login',
        status_code: '401'
      });

      return res.status(401).json({
        error: { message: 'Invalid credentials' }
      });
    }
    return next(error);
  }
});

// Refresh access token
authRoutes.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: { message: 'Refresh token is required' }
      });
    }

    const accessToken = await authService.refreshAccessToken(refresh_token);

    return res.json({
      access_token: accessToken
    });

  } catch (error: any) {
    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      return res.status(401).json({
        error: { message: error.message }
      });
    }
    return next(error);
  }
});

// Logout (revoke tokens)
authRoutes.post('/logout', authenticate(), async (req, res, next) => {
  try {
    const token = (req as any).token;
    const user = (req as any).user;

    // Revoke the access token
    await authService.revokeToken(token);

    // If refresh token provided, revoke it too
    if (req.body.refresh_token) {
      await authService.revokeToken(req.body.refresh_token);
    }

    return res.json({
      success: true,
      message: 'Logged out successfully'
    });

    logger.info('User logged out', {
      userId: user.id,
      username: user.username
    });

  } catch (error) {
    return next(error);
  }
});

// Get current user
authRoutes.get('/me', authenticate(), async (req, res, next) => {
  try {
    const user = (req as any).user;

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    });

  } catch (error) {
    return next(error);
  }
});

// Change password
authRoutes.post('/change-password', authenticate(), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        error: { message: 'Current and new passwords are required' }
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error: { message: 'New password must be at least 8 characters long' }
      });
    }

    await authService.changePassword(
      user.id,
      current_password,
      new_password
    );

    return res.json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });

    logger.info('Password changed', {
      userId: user.id,
      username: user.username
    });

  } catch (error: any) {
    if (error.message === 'Invalid current password') {
      return res.status(401).json({
        error: { message: error.message }
      });
    }
    return next(error);
  }
});

// Revoke all tokens (security feature)
authRoutes.post('/revoke-all', authenticate(), async (req, res, next) => {
  try {
    const user = (req as any).user;

    await authService.revokeAllUserTokens(user.id);

    return res.json({
      success: true,
      message: 'All tokens revoked. Please login again.'
    });

    logger.warn('All tokens revoked for user', {
      userId: user.id,
      username: user.username
    });

  } catch (error) {
    return next(error);
  }
});

// Admin: Create user with specific roles
authRoutes.post('/users', authenticate(), async (req, res, next) => {
  try {
    const currentUser = (req as any).user;

    // Check if current user is admin
    if (!authService.hasRole(currentUser, 'admin')) {
      return res.status(403).json({
        error: { message: 'Insufficient permissions' }
      });
    }

    const { username, email, password, roles } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        error: { message: 'Username, email, and password are required' }
      });
    }

    const user = await authService.createUser(
      username,
      email,
      password,
      roles || ['user']
    );

    return res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
      createdAt: user.createdAt
    });

    logger.info('User created by admin', {
      adminId: currentUser.id,
      newUserId: user.id,
      newUsername: user.username
    });

  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        error: { message: error.message }
      });
    }
    return next(error);
  }
});