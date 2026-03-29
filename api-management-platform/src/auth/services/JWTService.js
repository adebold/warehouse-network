const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { AuthenticationError } = require('../../shared/middleware/errorHandler');
const logger = require('../../shared/utils/logger');

class JWTService {
  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || this.generateSecret();
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || this.generateSecret();
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
    this.issuer = process.env.JWT_ISSUER || 'api-platform';
    this.audience = process.env.JWT_AUDIENCE || 'api-platform-users';

    if (!process.env.JWT_ACCESS_SECRET) {
      logger.warn('JWT_ACCESS_SECRET not set, using generated secret (not suitable for production)');
    }
  }

  /**
   * Generate a random secret (for development only)
   */
  generateSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate access token
   */
  generateAccessToken(payload) {
    try {
      const tokenPayload = {
        sub: payload.id || payload.sub,
        email: payload.email,
        role: payload.role,
        tier: payload.tier,
        permissions: payload.permissions || [],
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
      };

      return jwt.sign(tokenPayload, this.accessTokenSecret, {
        expiresIn: this.accessTokenExpiry,
        issuer: this.issuer,
        audience: this.audience,
        algorithm: 'HS256',
      });
    } catch (error) {
      logger.error('Error generating access token:', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload) {
    try {
      const tokenPayload = {
        sub: payload.id || payload.sub,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
      };

      return jwt.sign(tokenPayload, this.refreshTokenSecret, {
        expiresIn: this.refreshTokenExpiry,
        issuer: this.issuer,
        audience: this.audience,
        algorithm: 'HS256',
      });
    } catch (error) {
      logger.error('Error generating refresh token:', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate token pair (access + refresh)
   */
  generateTokenPair(payload) {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return { accessToken, refreshToken };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });

      if (decoded.type !== 'access') {
        throw new AuthenticationError('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid token');
      }
      throw new AuthenticationError('Token verification failed');
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });

      if (decoded.type !== 'refresh') {
        throw new AuthenticationError('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Refresh token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid refresh token');
      }
      throw new AuthenticationError('Refresh token verification failed');
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      logger.error('Error decoding token:', error);
      return null;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded?.exp ? new Date(decoded.exp * 1000) : null;
    } catch (error) {
      logger.error('Error getting token expiration:', error);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded?.exp) return true;

      const now = Math.floor(Date.now() / 1000);
      return decoded.exp < now;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get time until token expires (in seconds)
   */
  getTimeUntilExpiry(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded?.exp) return 0;

      const now = Math.floor(Date.now() / 1000);
      return Math.max(0, decoded.exp - now);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Generate API key token (long-lived)
   */
  generateApiKeyToken(payload, expiresIn = '1y') {
    try {
      const tokenPayload = {
        sub: payload.id || payload.sub,
        apiKeyId: payload.apiKeyId,
        permissions: payload.permissions || [],
        type: 'api_key',
        iat: Math.floor(Date.now() / 1000),
      };

      return jwt.sign(tokenPayload, this.accessTokenSecret, {
        expiresIn,
        issuer: this.issuer,
        audience: this.audience,
        algorithm: 'HS256',
      });
    } catch (error) {
      logger.error('Error generating API key token:', error);
      throw new Error('API key token generation failed');
    }
  }

  /**
   * Verify API key token
   */
  verifyApiKeyToken(token) {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });

      if (decoded.type !== 'api_key') {
        throw new AuthenticationError('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('API key token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid API key token');
      }
      throw new AuthenticationError('API key token verification failed');
    }
  }

  /**
   * Create a blacklist token (for logout)
   */
  blacklistToken(token) {
    // In production, you would store this in Redis or database
    // For now, we'll just decode it to get the expiry time
    const decoded = this.decodeToken(token);
    if (decoded) {
      logger.info('Token blacklisted', {
        jti: decoded.payload.jti,
        exp: decoded.payload.exp,
      });
    }
  }

  /**
   * Check if token is blacklisted
   */
  isTokenBlacklisted(token) {
    // In production, check against Redis or database
    // For now, always return false
    return false;
  }
}

module.exports = JWTService;