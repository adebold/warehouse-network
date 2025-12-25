import { validateProjectName, validateEmail, validateUrl } from '../../src/utils/validation';

describe('validation utilities', () => {
  describe('validateProjectName', () => {
    it('should accept valid project names', () => {
      const result = validateProjectName('my-project');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty names', () => {
      const result = validateProjectName('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Project name cannot be empty');
    });

    it('should reject names with uppercase letters', () => {
      const result = validateProjectName('My-Project');
      expect(result.valid).toBe(false);
    });

    it('should reject names starting with hyphens', () => {
      const result = validateProjectName('-my-project');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.email+tag@domain.co.uk')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
    });
  });

  describe('validateUrl', () => {
    it('should accept valid URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://localhost:3000')).toBe(true);
      expect(validateUrl('ftp://files.example.com')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateUrl('not-a-url')).toBe(false);
      expect(validateUrl('http://')).toBe(false);
      expect(validateUrl('')).toBe(false);
    });
  });
});