import {
  generateInvitationToken,
  generateApiKey,
  formatUserName,
  validatePassword,
  sanitizeInput,
  generateColor,
  createSlug,
  truncateText,
  isValidEmail,
  formatPhoneNumber,
  getInitials
} from '@/lib/utils'

describe('Utils Functions', () => {
  describe('generateInvitationToken', () => {
    it('should generate a 64-character hex token', () => {
      const token = generateInvitationToken()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should generate unique tokens', () => {
      const token1 = generateInvitationToken()
      const token2 = generateInvitationToken()
      expect(token1).not.toBe(token2)
    })
  })

  describe('generateApiKey', () => {
    it('should generate valid API key structure', () => {
      const { key, hash, prefix } = generateApiKey()

      expect(key).toMatch(/^sk_[0-9a-f]{48}$/)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      expect(prefix).toBe(key.substring(0, 8))
    })

    it('should generate unique API keys', () => {
      const key1 = generateApiKey()
      const key2 = generateApiKey()

      expect(key1.key).not.toBe(key2.key)
      expect(key1.hash).not.toBe(key2.hash)
    })
  })

  describe('formatUserName', () => {
    it('should return name if available', () => {
      const user = { name: 'John Doe', email: 'john@example.com' }
      expect(formatUserName(user)).toBe('John Doe')
    })

    it('should return email prefix if name is null', () => {
      const user = { name: null, email: 'john@example.com' }
      expect(formatUserName(user)).toBe('john')
    })

    it('should return email prefix if name is empty', () => {
      const user = { name: '', email: 'jane.smith@example.com' }
      expect(formatUserName(user)).toBe('jane.smith')
    })
  })

  describe('validatePassword', () => {
    it('should validate strong password', () => {
      const result = validatePassword('MyStr0ngP@ssw0rd!')

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.strength).toBe('strong')
    })

    it('should reject short password', () => {
      const result = validatePassword('Sh0rt!')

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Password must be at least 8 characters long')
    })

    it('should reject password without lowercase', () => {
      const result = validatePassword('PASSWORD123!')

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Password must contain at least one lowercase letter')
    })

    it('should reject password without uppercase', () => {
      const result = validatePassword('password123!')

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Password must contain at least one uppercase letter')
    })

    it('should reject password without numbers', () => {
      const result = validatePassword('Password!')

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Password must contain at least one number')
    })

    it('should reject password without special characters', () => {
      const result = validatePassword('Password123')

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Password must contain at least one special character')
    })

    it('should assign correct strength levels', () => {
      expect(validatePassword('weak').strength).toBe('weak')
      expect(validatePassword('Password1').strength).toBe('fair')
      expect(validatePassword('Password1!').strength).toBe('good')
      expect(validatePassword('MyStr0ngP@ssw0rd!').strength).toBe('strong')
    })
  })

  describe('sanitizeInput', () => {
    it('should remove HTML tags', () => {
      const input = 'Hello <script>alert("xss")</script> World'
      expect(sanitizeInput(input)).toBe('Hello alert("xss") World')
    })

    it('should trim whitespace', () => {
      const input = '  Hello World  '
      expect(sanitizeInput(input)).toBe('Hello World')
    })

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('')
    })
  })

  describe('generateColor', () => {
    it('should return a valid hex color', () => {
      const color = generateColor()
      expect(color).toMatch(/^#[0-9A-F]{6}$/)
    })

    it('should return different colors', () => {
      const colors = Array.from({ length: 20 }, () => generateColor())
      const uniqueColors = new Set(colors)
      expect(uniqueColors.size).toBeGreaterThan(1)
    })
  })

  describe('createSlug', () => {
    it('should create valid slugs', () => {
      expect(createSlug('Hello World')).toBe('hello-world')
      expect(createSlug('My Company, Inc.')).toBe('my-company-inc')
      expect(createSlug('Special@Characters#Here!')).toBe('specialcharactershere')
    })

    it('should handle multiple spaces', () => {
      expect(createSlug('Multiple   Spaces')).toBe('multiple-spaces')
    })

    it('should handle leading and trailing hyphens', () => {
      expect(createSlug('---Test---')).toBe('test')
    })
  })

  describe('truncateText', () => {
    it('should truncate long text', () => {
      const text = 'This is a very long text that should be truncated'
      expect(truncateText(text, 20)).toBe('This is a very long...')
    })

    it('should not truncate short text', () => {
      const text = 'Short text'
      expect(truncateText(text, 20)).toBe('Short text')
    })

    it('should handle empty text', () => {
      expect(truncateText('', 10)).toBe('')
    })
  })

  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true)
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true)
      expect(isValidEmail('user+tag@example.org')).toBe(true)
    })

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid-email')).toBe(false)
      expect(isValidEmail('@example.com')).toBe(false)
      expect(isValidEmail('test@')).toBe(false)
      expect(isValidEmail('test.example.com')).toBe(false)
    })
  })

  describe('formatPhoneNumber', () => {
    it('should format US phone numbers', () => {
      expect(formatPhoneNumber('1234567890')).toBe('(123) 456-7890')
      expect(formatPhoneNumber('123-456-7890')).toBe('(123) 456-7890')
      expect(formatPhoneNumber('(123) 456-7890')).toBe('(123) 456-7890')
    })

    it('should return original for invalid formats', () => {
      expect(formatPhoneNumber('123')).toBe('123')
      expect(formatPhoneNumber('invalid')).toBe('invalid')
    })
  })

  describe('getInitials', () => {
    it('should extract initials from names', () => {
      expect(getInitials('John Doe')).toBe('JD')
      expect(getInitials('Mary Jane Smith')).toBe('MJ')
      expect(getInitials('SingleName')).toBe('S')
    })

    it('should handle empty or invalid names', () => {
      expect(getInitials('')).toBe('')
      expect(getInitials('   ')).toBe('')
    })

    it('should limit to two initials', () => {
      expect(getInitials('First Middle Last Name')).toBe('FM')
    })
  })
})