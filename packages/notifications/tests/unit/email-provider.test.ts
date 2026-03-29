/**
 * Unit tests for EmailProvider
 */

import nodemailer from 'nodemailer';
import { EmailProvider } from '../../src/providers/email-provider';
import {
  NotificationChannel,
  NotificationCategory,
  NotificationPriority,
  NotificationRequest,
  NotificationRecipient,
  NotificationStatus
} from '../../src/types/notification.types';

// Mock nodemailer
const mockTransporter = {
  sendMail: jest.fn(),
  verify: jest.fn()
};

jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(() => mockTransporter)
}));

describe('EmailProvider', () => {
  let emailProvider: EmailProvider;
  let mockRequest: NotificationRequest;
  let mockRecipient: NotificationRecipient;

  const config = {
    provider: 'smtp' as const,
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'test@example.com',
      pass: 'password'
    },
    fromAddress: 'noreply@example.com',
    fromName: 'Test System'
  };

  beforeEach(() => {
    emailProvider = new EmailProvider(config);

    mockRequest = {
      id: 'test-email-123',
      recipients: [],
      content: 'This is a test email notification.',
      subject: 'Test Email Subject',
      channels: [NotificationChannel.EMAIL],
      priority: NotificationPriority.NORMAL,
      category: NotificationCategory.SYSTEM
    };

    mockRecipient = {
      id: 'recipient-1',
      type: 'user',
      userId: 'user-123',
      email: 'recipient@example.com'
    };

    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with SMTP configuration', () => {
      expect(nodemailer.createTransporter).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'password'
        }
      });
    });

    it('should initialize with SendGrid configuration', () => {
      const sendGridConfig = {
        provider: 'sendgrid' as const,
        apiKey: 'sg-test-key',
        fromAddress: 'noreply@example.com',
        fromName: 'Test System'
      };

      new EmailProvider(sendGridConfig);

      expect(nodemailer.createTransporter).toHaveBeenCalledWith({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: 'sg-test-key'
        }
      });
    });
  });

  describe('send', () => {
    it('should send email successfully', async () => {
      const mockSendResponse = {
        messageId: 'test-message-id',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK'
      };

      mockTransporter.sendMail.mockResolvedValue(mockSendResponse);

      const result = await emailProvider.send(mockRequest, mockRecipient);

      expect(result.status).toBe(NotificationStatus.SENT);
      expect(result.providerMessageId).toBe('test-message-id');
      expect(result.providerResponse).toEqual({
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK'
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: {
          name: 'Test System',
          address: 'noreply@example.com'
        },
        to: 'recipient@example.com',
        subject: 'Test Email Subject',
        text: 'This is a test email notification.',
        html: expect.stringContaining('This is a test email notification.'),
        messageId: expect.stringContaining('test-email-123_recipient-1_email'),
        headers: expect.objectContaining({
          'X-Notification-ID': expect.stringContaining('test-email-123_recipient-1_email'),
          'X-Organization-ID': '',
          'X-User-ID': 'user-123'
        })
      });
    });

    it('should fail when recipient has no email', async () => {
      const recipientWithoutEmail = { ...mockRecipient };
      delete recipientWithoutEmail.email;

      const result = await emailProvider.send(mockRequest, recipientWithoutEmail);

      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.error?.message).toBe('Recipient email address is required');
    });

    it('should handle email sending failure', async () => {
      const error = new Error('SMTP connection failed');
      mockTransporter.sendMail.mockRejectedValue(error);

      const result = await emailProvider.send(mockRequest, mockRecipient);

      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.error?.message).toBe('SMTP connection failed');
    });

    it('should include HTML content when provided', async () => {
      const requestWithHtml = {
        ...mockRequest,
        htmlContent: '<h1>Test HTML Email</h1><p>This is HTML content.</p>'
      };

      mockTransporter.sendMail.mockResolvedValue({
        messageId: 'test-message-id',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK'
      });

      await emailProvider.send(requestWithHtml, mockRecipient);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<h1>Test HTML Email</h1><p>This is HTML content.</p>'
        })
      );
    });

    it('should include metadata in headers', async () => {
      const requestWithMetadata = {
        ...mockRequest,
        metadata: {
          campaignId: 'campaign-123',
          source: 'user-action'
        }
      };

      mockTransporter.sendMail.mockResolvedValue({
        messageId: 'test-message-id',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK'
      });

      await emailProvider.send(requestWithMetadata, mockRecipient);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Metadata': JSON.stringify({
              campaignId: 'campaign-123',
              source: 'user-action'
            })
          })
        })
      );
    });

    it('should generate HTML from plain text when no HTML provided', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: 'test-message-id',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK'
      });

      await emailProvider.send(mockRequest, mockRecipient);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('This is a test email notification.');
      expect(callArgs.html).toContain('<!DOCTYPE html>');
      expect(callArgs.html).toContain('automated notification from Warehouse Network');
    });
  });

  describe('getStatus', () => {
    it('should return SENT status', async () => {
      const status = await emailProvider.getStatus('message-id');
      expect(status).toBe(NotificationStatus.SENT);
    });
  });

  describe('validateConfiguration', () => {
    it('should validate configuration successfully', async () => {
      mockTransporter.verify.mockResolvedValue(true);

      const isValid = await emailProvider.validateConfiguration();
      expect(isValid).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should handle validation failure', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('Invalid configuration'));

      const isValid = await emailProvider.validateConfiguration();
      expect(isValid).toBe(false);
    });
  });

  describe('sendBulk', () => {
    const bulkRequests = [
      { request: mockRequest, recipient: mockRecipient },
      {
        request: { ...mockRequest, id: 'test-email-456' },
        recipient: {
          id: 'recipient-2',
          type: 'user' as const,
          userId: 'user-456',
          email: 'recipient2@example.com'
        }
      }
    ];

    it('should send bulk emails successfully', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: 'test-message-id',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK'
      });

      const results = await emailProvider.sendBulk(bulkRequests);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe(NotificationStatus.SENT);
      expect(results[1].status).toBe(NotificationStatus.SENT);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in bulk send', async () => {
      mockTransporter.sendMail
        .mockResolvedValueOnce({
          messageId: 'success-id',
          accepted: ['recipient@example.com'],
          rejected: [],
          response: '250 OK'
        })
        .mockRejectedValueOnce(new Error('Send failed'));

      const results = await emailProvider.sendBulk(bulkRequests);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe(NotificationStatus.SENT);
      expect(results[1].status).toBe(NotificationStatus.FAILED);
    });

    it('should process bulk emails in batches', async () => {
      // Create 100 bulk requests to test batching
      const largeBulkRequests = Array.from({ length: 100 }, (_, i) => ({
        request: { ...mockRequest, id: `test-email-${i}` },
        recipient: {
          id: `recipient-${i}`,
          type: 'user' as const,
          userId: `user-${i}`,
          email: `recipient${i}@example.com`
        }
      }));

      mockTransporter.sendMail.mockResolvedValue({
        messageId: 'test-message-id',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK'
      });

      const results = await emailProvider.sendBulk(largeBulkRequests);

      expect(results).toHaveLength(100);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(100);
    });
  });

  describe('testConfiguration', () => {
    it('should test configuration successfully', async () => {
      mockTransporter.sendMail.mockResolvedValue({
        messageId: 'test-message-id',
        accepted: ['test@example.com'],
        rejected: [],
        response: '250 OK'
      });

      const result = await emailProvider.testConfiguration('test@example.com');
      expect(result).toBe(true);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Test Email - Warehouse Network',
          text: 'This is a test email from Warehouse Network notification system.'
        })
      );
    });

    it('should handle test failure', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('Test failed'));

      const result = await emailProvider.testConfiguration('test@example.com');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return provider statistics', () => {
      const stats = emailProvider.getStats();

      expect(stats).toEqual({
        provider: 'smtp',
        status: 'active',
        lastVerified: expect.any(Date)
      });
    });
  });

  describe('HTML generation', () => {
    it('should escape HTML special characters in plain text', async () => {
      const requestWithSpecialChars = {
        ...mockRequest,
        content: 'Test with <script>alert("xss")</script> & "quotes" and \'apostrophes\''
      };

      mockTransporter.sendMail.mockResolvedValue({
        messageId: 'test-message-id',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK'
      });

      await emailProvider.send(requestWithSpecialChars, mockRecipient);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('&lt;script&gt;');
      expect(callArgs.html).toContain('&amp;');
      expect(callArgs.html).toContain('&quot;');
      expect(callArgs.html).toContain('&#39;');
    });

    it('should convert newlines to HTML breaks', async () => {
      const requestWithNewlines = {
        ...mockRequest,
        content: 'Line 1\nLine 2\nLine 3'
      };

      mockTransporter.sendMail.mockResolvedValue({
        messageId: 'test-message-id',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK'
      });

      await emailProvider.send(requestWithNewlines, mockRecipient);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('Line 1<br>Line 2<br>Line 3');
    });
  });
});