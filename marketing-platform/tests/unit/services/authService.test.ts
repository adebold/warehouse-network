import { AuthService } from '@/services/authService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { redisService } from '@/utils/redis';
import database from '@/utils/database';

// Mock dependencies
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('@/utils/redis');
jest.mock('@/utils/database');

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;
const mockRedis = redisService as jest.Mocked<typeof redisService>;
const mockDatabase = database as jest.Mocked<typeof database>;

describe('AuthService', () => {
  let authService: AuthService;
  
  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe'
      };

      const hashedPassword = 'hashed_password';
      const userId = 'user-123';

      mockBcrypt.hash.mockResolvedValue(hashedPassword as never);
      mockDatabase.query.mockResolvedValueOnce({ rows: [] }); // Email check
      mockDatabase.query.mockResolvedValueOnce({ 
        rows: [{ id: userId, email: userData.email, first_name: userData.firstName, last_name: userData.lastName }]
      }); // Insert user

      const result = await authService.register(userData);

      expect(mockBcrypt.hash).toHaveBeenCalledWith(userData.password, 12);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        'SELECT id FROM users WHERE email = $1',
        [userData.email]
      );
      expect(result).toEqual({
        id: userId,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName
      });
    });

    it('should throw error if email already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe'
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] });

      await expect(authService.register(userData)).rejects.toThrow('Email already exists');
    });

    it('should validate password strength', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'weak',
        firstName: 'John',
        lastName: 'Doe'
      };

      await expect(authService.register(userData)).rejects.toThrow('Password does not meet requirements');
    });
  });

  describe('login', () => {
    it('should login user successfully with valid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'Password123!'
      };

      const user = {
        id: 'user-123',
        email: credentials.email,
        password_hash: 'hashed_password',
        first_name: 'John',
        last_name: 'Doe',
        is_active: true
      };

      const accessToken = 'access_token';
      const refreshToken = 'refresh_token';

      mockDatabase.query.mockResolvedValueOnce({ rows: [user] });
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockJwt.sign.mockReturnValueOnce(accessToken as never);
      mockJwt.sign.mockReturnValueOnce(refreshToken as never);
      mockDatabase.query.mockResolvedValueOnce({ rows: [{ id: 'token-id' }] }); // Insert refresh token
      mockDatabase.query.mockResolvedValueOnce({ rows: [] }); // Update last login

      const result = await authService.login(credentials);

      expect(result).toEqual({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name
        },
        accessToken,
        refreshToken
      });
    });

    it('should throw error for invalid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(authService.login(credentials)).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for inactive user', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'Password123!'
      };

      const user = {
        id: 'user-123',
        email: credentials.email,
        password_hash: 'hashed_password',
        first_name: 'John',
        last_name: 'Doe',
        is_active: false
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [user] });

      await expect(authService.login(credentials)).rejects.toThrow('Account is inactive');
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token successfully', async () => {
      const refreshToken = 'valid_refresh_token';
      const userId = 'user-123';
      const newAccessToken = 'new_access_token';

      const tokenRecord = {
        id: 'token-id',
        user_id: userId,
        is_revoked: false,
        expires_at: new Date(Date.now() + 86400000) // 24 hours from now
      };

      const user = {
        id: userId,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe'
      };

      mockJwt.verify.mockReturnValueOnce({ userId } as never);
      mockDatabase.query.mockResolvedValueOnce({ rows: [tokenRecord] });
      mockDatabase.query.mockResolvedValueOnce({ rows: [user] });
      mockJwt.sign.mockReturnValueOnce(newAccessToken as never);

      const result = await authService.refreshToken(refreshToken);

      expect(result).toEqual({
        accessToken: newAccessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name
        }
      });
    });

    it('should throw error for invalid refresh token', async () => {
      const refreshToken = 'invalid_token';

      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      const refreshToken = 'valid_refresh_token';

      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await authService.logout(refreshToken);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        'UPDATE refresh_tokens SET is_revoked = true WHERE token_hash = $1',
        expect.any(Array)
      );
    });
  });

  describe('validatePassword', () => {
    it('should validate strong password', () => {
      const strongPassword = 'StrongPassword123!';
      expect(() => authService.validatePassword(strongPassword)).not.toThrow();
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        'weak',
        '12345678',
        'onlylowercase',
        'ONLYUPPERCASE',
        'NoNumbers!',
        'NoSpecialChars123'
      ];

      weakPasswords.forEach(password => {
        expect(() => authService.validatePassword(password)).toThrow('Password does not meet requirements');
      });
    });
  });

  describe('verifyToken', () => {
    it('should verify valid JWT token', async () => {
      const token = 'valid_jwt_token';
      const payload = { userId: 'user-123', email: 'test@example.com' };

      mockJwt.verify.mockReturnValueOnce(payload as never);

      const result = await authService.verifyToken(token);

      expect(result).toEqual(payload);
    });

    it('should throw error for invalid JWT token', async () => {
      const token = 'invalid_token';

      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyToken(token)).rejects.toThrow('Invalid token');
    });
  });
});