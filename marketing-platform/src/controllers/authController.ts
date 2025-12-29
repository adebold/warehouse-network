import { Request, Response } from 'express';
import { AuthService } from '@/services/authService';
import { logger, logSecurityEvent } from '@/utils/logger';

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      const user = await authService.register({
        email,
        password,
        firstName,
        lastName
      });

      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        }
      });
    } catch (error) {
      logger.error('Registration failed', {
        error: error.message,
        email: req.body.email
      });

      if (error.message === 'Email already exists') {
        res.status(409).json({
          success: false,
          error: 'Email already exists'
        });
        return;
      }

      if (error.message.includes('Password does not meet requirements')) {
        res.status(400).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Registration failed'
      });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      
      const result = await authService.login({ email, password }, req);

      // Set secure HTTP-only cookie for refresh token
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      logger.info('User logged in successfully', {
        userId: result.user.id,
        email: result.user.email
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        user: result.user,
        accessToken: result.accessToken
      });
    } catch (error) {
      logger.error('Login failed', {
        error: error.message,
        email: req.body.email
      });

      if (error.message === 'Invalid credentials' || error.message === 'Account is inactive') {
        logSecurityEvent('LOGIN_FAILED', {
          email: req.body.email,
          reason: error.message
        }, req);
        
        res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Login failed'
      });
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      // Try to get refresh token from cookie or request body
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
      
      if (!refreshToken) {
        res.status(401).json({
          success: false,
          error: 'Refresh token required'
        });
        return;
      }

      const result = await authService.refreshToken(refreshToken);

      logger.info('Token refreshed successfully', {
        userId: result.user.id
      });

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        user: result.user,
        accessToken: result.accessToken
      });
    } catch (error) {
      logger.error('Token refresh failed', {
        error: error.message
      });

      // Clear the invalid refresh token cookie
      res.clearCookie('refreshToken');

      res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
      
      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      // Clear refresh token cookie
      res.clearCookie('refreshToken');

      logger.info('User logged out successfully', {
        userId: req.user?.id
      });

      res.status(200).json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      logger.error('Logout failed', {
        error: error.message,
        userId: req.user?.id
      });

      // Still clear the cookie even if logout fails
      res.clearCookie('refreshToken');

      res.status(200).json({
        success: true,
        message: 'Logout completed'
      });
    }
  }

  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const user = await authService.getUserById(req.user.id);
      
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        user
      });
    } catch (error) {
      logger.error('Failed to get user profile', {
        error: error.message,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get profile'
      });
    }
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      // Verify current password by attempting login
      const user = await authService.getUserById(req.user.id);
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      try {
        await authService.login({ email: user.email, password: currentPassword });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Current password is incorrect'
        });
        return;
      }

      // Validate new password
      authService.validatePassword(newPassword);

      // Update password (implementation would go here)
      // For this example, we'll just return success
      
      logSecurityEvent('PASSWORD_CHANGED', {
        userId: req.user.id
      }, req);

      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      logger.error('Password change failed', {
        error: error.message,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Password change failed'
      });
    }
  }

  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      
      // Email verification implementation would go here
      // For this example, we'll just return success
      
      res.status(200).json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      logger.error('Email verification failed', {
        error: error.message,
        token: req.params.token
      });

      res.status(400).json({
        success: false,
        error: 'Email verification failed'
      });
    }
  }

  async requestPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      
      // Password reset implementation would go here
      // For this example, we'll just return success
      
      logSecurityEvent('PASSWORD_RESET_REQUESTED', {
        email
      }, req);

      res.status(200).json({
        success: true,
        message: 'Password reset instructions sent to email'
      });
    } catch (error) {
      logger.error('Password reset request failed', {
        error: error.message,
        email: req.body.email
      });

      // Always return success for security reasons
      res.status(200).json({
        success: true,
        message: 'Password reset instructions sent to email'
      });
    }
  }
}