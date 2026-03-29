/**
 * Validation utilities for the notification system
 */

import {
  NotificationRequest,
  NotificationChannel,
  NotificationCategory,
  NotificationPriority,
  NotificationRecipient
} from '../types/notification.types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate notification request
 */
export function validateNotificationRequest(request: NotificationRequest): ValidationResult {
  const errors: string[] = [];

  // Basic required fields
  if (!request.recipients || request.recipients.length === 0) {
    errors.push('At least one recipient is required');
  }

  if (!request.content || request.content.trim().length === 0) {
    errors.push('Content is required');
  }

  if (!request.channels || request.channels.length === 0) {
    errors.push('At least one notification channel is required');
  }

  if (!request.priority) {
    errors.push('Priority is required');
  }

  if (!request.category) {
    errors.push('Category is required');
  }

  // Validate channels
  if (request.channels) {
    for (const channel of request.channels) {
      if (!Object.values(NotificationChannel).includes(channel)) {
        errors.push(`Invalid notification channel: ${channel}`);
      }
    }
  }

  // Validate priority
  if (request.priority && !Object.values(NotificationPriority).includes(request.priority)) {
    errors.push(`Invalid priority: ${request.priority}`);
  }

  // Validate category
  if (request.category && !Object.values(NotificationCategory).includes(request.category)) {
    errors.push(`Invalid category: ${request.category}`);
  }

  // Validate recipients
  if (request.recipients) {
    for (let i = 0; i < request.recipients.length; i++) {
      const recipientErrors = validateRecipient(request.recipients[i]);
      if (!recipientErrors.isValid) {
        recipientErrors.errors.forEach(error => {
          errors.push(`Recipient ${i + 1}: ${error}`);
        });
      }
    }
  }

  // Validate scheduling
  if (request.scheduledAt) {
    const scheduledTime = new Date(request.scheduledAt);
    if (isNaN(scheduledTime.getTime())) {
      errors.push('Invalid scheduled date');
    } else if (scheduledTime < new Date()) {
      errors.push('Scheduled date must be in the future');
    }
  }

  if (request.expiresAt) {
    const expiryTime = new Date(request.expiresAt);
    if (isNaN(expiryTime.getTime())) {
      errors.push('Invalid expiry date');
    } else if (expiryTime < new Date()) {
      errors.push('Expiry date must be in the future');
    }

    // Check that expiry is after scheduled time
    if (request.scheduledAt) {
      const scheduledTime = new Date(request.scheduledAt);
      if (expiryTime <= scheduledTime) {
        errors.push('Expiry date must be after scheduled date');
      }
    }
  }

  // Validate content length limits
  const contentLimits = {
    [NotificationChannel.SMS]: 1600, // SMS concatenated message limit
    [NotificationChannel.PUSH]: 500,  // Push notification limit
    [NotificationChannel.EMAIL]: 100000, // Email content limit
    [NotificationChannel.IN_APP]: 2000,  // In-app notification limit
    [NotificationChannel.WEBHOOK]: 50000 // Webhook payload limit
  };

  for (const channel of request.channels || []) {
    const limit = contentLimits[channel];
    if (limit && request.content.length > limit) {
      errors.push(`Content too long for ${channel}: ${request.content.length}/${limit} characters`);
    }
  }

  // Validate subject length for channels that need it
  const channelsNeedingSubject = [NotificationChannel.EMAIL, NotificationChannel.PUSH];
  const subjectRequiredChannels = request.channels?.filter(c => channelsNeedingSubject.includes(c));

  if (subjectRequiredChannels && subjectRequiredChannels.length > 0) {
    if (!request.subject || request.subject.trim().length === 0) {
      errors.push(`Subject is required for channels: ${subjectRequiredChannels.join(', ')}`);
    } else if (request.subject.length > 200) {
      errors.push('Subject is too long (max 200 characters)');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate notification recipient
 */
export function validateRecipient(recipient: NotificationRecipient): ValidationResult {
  const errors: string[] = [];

  if (!recipient.id) {
    errors.push('Recipient ID is required');
  }

  if (!recipient.type) {
    errors.push('Recipient type is required');
  }

  if (!['user', 'organization', 'external'].includes(recipient.type)) {
    errors.push(`Invalid recipient type: ${recipient.type}`);
  }

  // Validate based on recipient type
  switch (recipient.type) {
    case 'user':
      if (!recipient.userId) {
        errors.push('User ID is required for user recipients');
      }
      break;
    case 'organization':
      if (!recipient.organizationId) {
        errors.push('Organization ID is required for organization recipients');
      }
      break;
  }

  // Validate contact information based on available channels
  if (recipient.email && !isValidEmail(recipient.email)) {
    errors.push('Invalid email address');
  }

  if (recipient.phone && !isValidPhoneNumber(recipient.phone)) {
    errors.push('Invalid phone number');
  }

  if (recipient.webhookUrl && !isValidUrl(recipient.webhookUrl)) {
    errors.push('Invalid webhook URL');
  }

  if (recipient.deviceTokens) {
    if (!Array.isArray(recipient.deviceTokens)) {
      errors.push('Device tokens must be an array');
    } else if (recipient.deviceTokens.some(token => !token || typeof token !== 'string')) {
      errors.push('All device tokens must be non-empty strings');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (basic validation)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');

  // Should have at least 10 digits (for most international numbers)
  // and at most 15 digits (ITU-T recommendation)
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Validate URL
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate cron expression (basic validation)
 */
export function isValidCronExpression(expression: string): boolean {
  // Basic validation for cron expression format
  const cronRegex = /^(\*|[0-5]?\d|\*\/[0-9]+)\s+(\*|[01]?\d|2[0-3]|\*\/[0-9]+)\s+(\*|[0-2]?\d|3[01]|\*\/[0-9]+)\s+(\*|[0-9]|1[0-2]|\*\/[0-9]+)\s+(\*|[0-6]|\*\/[0-9]+)$/;

  if (!cronRegex.test(expression)) {
    return false;
  }

  // Additional validation could be added here
  // For now, just check basic format
  return true;
}

/**
 * Validate template variables
 */
export function validateTemplateVariables(
  variables: Record<string, any>,
  requiredVariables: string[]
): ValidationResult {
  const errors: string[] = [];

  // Check required variables
  for (const required of requiredVariables) {
    if (!(required in variables)) {
      errors.push(`Required variable missing: ${required}`);
    }
  }

  // Check for potentially dangerous variables
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(variables)) {
    if (dangerousKeys.includes(key)) {
      errors.push(`Dangerous variable key not allowed: ${key}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize content for specific channels
 */
export function sanitizeContent(content: string, channel: NotificationChannel): string {
  let sanitized = content;

  switch (channel) {
    case NotificationChannel.SMS:
      // Remove or replace characters that might cause issues in SMS
      sanitized = sanitized.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
      break;

    case NotificationChannel.EMAIL:
      // Basic HTML escaping for email content
      sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      break;

    case NotificationChannel.PUSH:
      // Remove newlines and excessive whitespace for push notifications
      sanitized = sanitized.replace(/\s+/g, ' ').trim();
      break;

    case NotificationChannel.IN_APP:
      // Basic sanitization for in-app notifications
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      break;

    case NotificationChannel.WEBHOOK:
      // No sanitization for webhook - raw data
      break;
  }

  return sanitized;
}

/**
 * Validate notification preferences
 */
export function validateNotificationPreferences(preferences: any): ValidationResult {
  const errors: string[] = [];

  if (!preferences || typeof preferences !== 'object') {
    errors.push('Preferences must be an object');
    return { isValid: false, errors };
  }

  // Validate channels configuration
  if (preferences.channels) {
    if (typeof preferences.channels !== 'object') {
      errors.push('Channels must be an object');
    } else {
      for (const [channel, config] of Object.entries(preferences.channels)) {
        if (!Object.values(NotificationChannel).includes(channel as NotificationChannel)) {
          errors.push(`Invalid channel: ${channel}`);
        }

        if (config && typeof config === 'object') {
          const channelConfig = config as any;

          if (typeof channelConfig.enabled !== 'boolean') {
            errors.push(`Channel ${channel} enabled must be boolean`);
          }

          if (channelConfig.priority && !Array.isArray(channelConfig.priority)) {
            errors.push(`Channel ${channel} priority must be an array`);
          }

          if (channelConfig.categories && !Array.isArray(channelConfig.categories)) {
            errors.push(`Channel ${channel} categories must be an array`);
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}