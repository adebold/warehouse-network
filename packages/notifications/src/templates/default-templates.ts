/**
 * Default notification templates for common use cases
 */

import {
  NotificationTemplate,
  NotificationChannel,
  NotificationCategory,
  NotificationPriority
} from '../types/notification.types';

/**
 * Welcome notification template
 */
export const welcomeTemplate: NotificationTemplate = {
  id: 'welcome',
  name: 'Welcome Message',
  description: 'Welcome message for new users',
  category: NotificationCategory.USER_ACTION,
  channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
  content: {
    [NotificationChannel.EMAIL]: {
      subject: 'Welcome to {{organizationName}}!',
      body: `Hi {{userName}},

Welcome to {{organizationName}}! We're excited to have you join us.

Here's what you can do next:
- Complete your profile setup
- Explore the dashboard
- Connect with your team

If you have any questions, don't hesitate to reach out to our support team.

Best regards,
The {{organizationName}} Team`,
      htmlBody: `<!DOCTYPE html>
<html>
<head>
    <title>Welcome to {{organizationName}}</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #333;">Welcome to {{organizationName}}!</h1>

    <p>Hi {{userName}},</p>

    <p>Welcome to {{organizationName}}! We're excited to have you join us.</p>

    <h2>What's next?</h2>
    <ul>
        <li>Complete your profile setup</li>
        <li>Explore the dashboard</li>
        <li>Connect with your team</li>
    </ul>

    <p>If you have any questions, don't hesitate to reach out to our support team.</p>

    <p>Best regards,<br>
    The {{organizationName}} Team</p>
</body>
</html>`
    },
    [NotificationChannel.IN_APP]: {
      body: 'Welcome to {{organizationName}}! Get started by completing your profile setup.'
    }
  },
  variables: [
    { name: 'userName', type: 'string', required: true, description: 'The user\'s name' },
    { name: 'organizationName', type: 'string', required: true, description: 'The organization name' }
  ],
  priority: NotificationPriority.NORMAL,
  version: '1.0.0',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

/**
 * Password reset template
 */
export const passwordResetTemplate: NotificationTemplate = {
  id: 'password_reset',
  name: 'Password Reset',
  description: 'Password reset notification with secure link',
  category: NotificationCategory.SECURITY,
  channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
  content: {
    [NotificationChannel.EMAIL]: {
      subject: 'Password Reset Request for {{organizationName}}',
      body: `Hi {{userName}},

We received a request to reset your password for your {{organizationName}} account.

Click the link below to reset your password:
{{resetUrl}}

This link will expire in {{expirationHours}} hours.

If you didn't request this password reset, please ignore this email or contact support if you have concerns.

Best regards,
The {{organizationName}} Team`,
      htmlBody: `<!DOCTYPE html>
<html>
<head>
    <title>Password Reset Request</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #333;">Password Reset Request</h1>

    <p>Hi {{userName}},</p>

    <p>We received a request to reset your password for your {{organizationName}} account.</p>

    <div style="text-align: center; margin: 30px 0;">
        <a href="{{resetUrl}}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Reset Password
        </a>
    </div>

    <p>This link will expire in {{expirationHours}} hours.</p>

    <p><small>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</small></p>

    <p>Best regards,<br>
    The {{organizationName}} Team</p>
</body>
</html>`
    },
    [NotificationChannel.SMS]: {
      body: 'Password reset for {{organizationName}}: {{resetUrl}} (expires in {{expirationHours}}h)'
    }
  },
  variables: [
    { name: 'userName', type: 'string', required: true, description: 'The user\'s name' },
    { name: 'organizationName', type: 'string', required: true, description: 'The organization name' },
    { name: 'resetUrl', type: 'string', required: true, description: 'Password reset URL' },
    { name: 'expirationHours', type: 'number', required: true, description: 'Hours until link expires' }
  ],
  priority: NotificationPriority.HIGH,
  version: '1.0.0',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

/**
 * Inventory low stock alert template
 */
export const lowStockAlertTemplate: NotificationTemplate = {
  id: 'low_stock_alert',
  name: 'Low Stock Alert',
  description: 'Alert when inventory levels are low',
  category: NotificationCategory.INVENTORY,
  channels: [NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.IN_APP],
  content: {
    [NotificationChannel.EMAIL]: {
      subject: 'Low Stock Alert: {{itemName}}',
      body: `INVENTORY ALERT

Item: {{itemName}}
SKU: {{itemSku}}
Current Stock: {{currentStock}}
Minimum Threshold: {{minThreshold}}
Location: {{warehouseName}}

This item is running low and may need restocking soon.

Action Required:
- Review current demand
- Check pending orders
- Initiate restocking if necessary

View Inventory Dashboard: {{dashboardUrl}}

Best regards,
Inventory Management System`,
      htmlBody: `<!DOCTYPE html>
<html>
<head>
    <title>Low Stock Alert</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin-bottom: 20px;">
        <h1 style="color: #856404; margin: 0;">⚠️ Low Stock Alert</h1>
    </div>

    <h2>Item Details</h2>
    <table style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Item:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{itemName}}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>SKU:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{itemSku}}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Current Stock:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #dc3545;"><strong>{{currentStock}}</strong></td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Minimum Threshold:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{minThreshold}}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Location:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{warehouseName}}</td>
        </tr>
    </table>

    <h3>Action Required</h3>
    <ul>
        <li>Review current demand</li>
        <li>Check pending orders</li>
        <li>Initiate restocking if necessary</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
        <a href="{{dashboardUrl}}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Inventory Dashboard
        </a>
    </div>
</body>
</html>`
    },
    [NotificationChannel.SMS]: {
      body: 'LOW STOCK ALERT: {{itemName}} ({{itemSku}}) - {{currentStock}} remaining at {{warehouseName}}'
    },
    [NotificationChannel.IN_APP]: {
      body: '⚠️ {{itemName}} is running low ({{currentStock}} remaining) at {{warehouseName}}'
    }
  },
  variables: [
    { name: 'itemName', type: 'string', required: true, description: 'Item name' },
    { name: 'itemSku', type: 'string', required: true, description: 'Item SKU' },
    { name: 'currentStock', type: 'number', required: true, description: 'Current stock level' },
    { name: 'minThreshold', type: 'number', required: true, description: 'Minimum stock threshold' },
    { name: 'warehouseName', type: 'string', required: true, description: 'Warehouse name' },
    { name: 'dashboardUrl', type: 'string', required: false, description: 'Link to inventory dashboard' }
  ],
  priority: NotificationPriority.HIGH,
  version: '1.0.0',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

/**
 * Payment successful template
 */
export const paymentSuccessTemplate: NotificationTemplate = {
  id: 'payment_success',
  name: 'Payment Successful',
  description: 'Confirmation of successful payment',
  category: NotificationCategory.BILLING,
  channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
  content: {
    [NotificationChannel.EMAIL]: {
      subject: 'Payment Confirmation - {{organizationName}}',
      body: `Hi {{customerName}},

Thank you for your payment! We've successfully processed your transaction.

Payment Details:
- Amount: {{formatCurrency amount currency}}
- Payment Method: {{paymentMethod}}
- Transaction ID: {{transactionId}}
- Date: {{formatDate paymentDate 'long'}}

{{#if invoiceUrl}}
Download Invoice: {{invoiceUrl}}
{{/if}}

If you have any questions about this payment, please contact our billing support.

Best regards,
The {{organizationName}} Team`,
      htmlBody: `<!DOCTYPE html>
<html>
<head>
    <title>Payment Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 15px; margin-bottom: 20px;">
        <h1 style="color: #155724; margin: 0;">✅ Payment Successful</h1>
    </div>

    <p>Hi {{customerName}},</p>

    <p>Thank you for your payment! We've successfully processed your transaction.</p>

    <h2>Payment Details</h2>
    <table style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Amount:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{formatCurrency amount currency}}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Payment Method:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{paymentMethod}}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Transaction ID:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><code>{{transactionId}}</code></td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Date:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{formatDate paymentDate 'long'}}</td>
        </tr>
    </table>

    {{#if invoiceUrl}}
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{invoiceUrl}}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Download Invoice
        </a>
    </div>
    {{/if}}

    <p>If you have any questions about this payment, please contact our billing support.</p>

    <p>Best regards,<br>
    The {{organizationName}} Team</p>
</body>
</html>`
    },
    [NotificationChannel.IN_APP]: {
      body: '✅ Payment of {{formatCurrency amount currency}} processed successfully. Transaction ID: {{transactionId}}'
    }
  },
  variables: [
    { name: 'customerName', type: 'string', required: true, description: 'Customer name' },
    { name: 'organizationName', type: 'string', required: true, description: 'Organization name' },
    { name: 'amount', type: 'number', required: true, description: 'Payment amount (in cents)' },
    { name: 'currency', type: 'string', required: true, description: 'Currency code' },
    { name: 'paymentMethod', type: 'string', required: true, description: 'Payment method used' },
    { name: 'transactionId', type: 'string', required: true, description: 'Transaction ID' },
    { name: 'paymentDate', type: 'date', required: true, description: 'Payment date' },
    { name: 'invoiceUrl', type: 'string', required: false, description: 'Invoice download URL' }
  ],
  priority: NotificationPriority.NORMAL,
  version: '1.0.0',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

/**
 * Security alert template
 */
export const securityAlertTemplate: NotificationTemplate = {
  id: 'security_alert',
  name: 'Security Alert',
  description: 'Security-related notifications and alerts',
  category: NotificationCategory.SECURITY,
  channels: [NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.IN_APP],
  content: {
    [NotificationChannel.EMAIL]: {
      subject: 'Security Alert - {{alertType}}',
      body: `SECURITY ALERT

Alert Type: {{alertType}}
Time: {{formatDate alertTime 'long'}}
IP Address: {{ipAddress}}
Location: {{location}}
User Agent: {{userAgent}}

Details:
{{alertDetails}}

If this was you, no further action is required. If you don't recognize this activity, please:
1. Change your password immediately
2. Review your account activity
3. Contact our security team

Secure Account: {{securityUrl}}

Best regards,
Security Team`,
      htmlBody: `<!DOCTYPE html>
<html>
<head>
    <title>Security Alert</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 15px; margin-bottom: 20px;">
        <h1 style="color: #721c24; margin: 0;">🔒 Security Alert</h1>
    </div>

    <h2>Alert Details</h2>
    <table style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Alert Type:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{alertType}}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Time:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{formatDate alertTime 'long'}}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>IP Address:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><code>{{ipAddress}}</code></td>
        </tr>
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Location:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">{{location}}</td>
        </tr>
    </table>

    <h3>Details</h3>
    <p>{{alertDetails}}</p>

    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 20px 0;">
        <p><strong>If this was you,</strong> no further action is required.</p>
        <p><strong>If you don't recognize this activity:</strong></p>
        <ol>
            <li>Change your password immediately</li>
            <li>Review your account activity</li>
            <li>Contact our security team</li>
        </ol>
    </div>

    <div style="text-align: center; margin: 30px 0;">
        <a href="{{securityUrl}}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Secure My Account
        </a>
    </div>

    <p>Best regards,<br>
    Security Team</p>
</body>
</html>`
    },
    [NotificationChannel.SMS]: {
      body: 'SECURITY ALERT: {{alertType}} from {{location}} at {{formatDate alertTime "short"}}. If not you, secure your account: {{securityUrl}}'
    },
    [NotificationChannel.IN_APP]: {
      body: '🔒 Security Alert: {{alertType}} detected from {{location}}. Review your account security if this wasn\'t you.'
    }
  },
  variables: [
    { name: 'alertType', type: 'string', required: true, description: 'Type of security alert' },
    { name: 'alertTime', type: 'date', required: true, description: 'When the alert occurred' },
    { name: 'ipAddress', type: 'string', required: true, description: 'IP address involved' },
    { name: 'location', type: 'string', required: true, description: 'Geographic location' },
    { name: 'userAgent', type: 'string', required: false, description: 'User agent string' },
    { name: 'alertDetails', type: 'string', required: true, description: 'Detailed alert information' },
    { name: 'securityUrl', type: 'string', required: true, description: 'URL to security settings' }
  ],
  priority: NotificationPriority.CRITICAL,
  version: '1.0.0',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

/**
 * Array of all default templates
 */
export const defaultTemplates: NotificationTemplate[] = [
  welcomeTemplate,
  passwordResetTemplate,
  lowStockAlertTemplate,
  paymentSuccessTemplate,
  securityAlertTemplate
];

/**
 * Get default template by ID
 */
export function getDefaultTemplate(templateId: string): NotificationTemplate | undefined {
  return defaultTemplates.find(template => template.id === templateId);
}

/**
 * Get all default templates for a specific category
 */
export function getDefaultTemplatesByCategory(category: NotificationCategory): NotificationTemplate[] {
  return defaultTemplates.filter(template => template.category === category);
}

/**
 * Get all default templates that support a specific channel
 */
export function getDefaultTemplatesByChannel(channel: NotificationChannel): NotificationTemplate[] {
  return defaultTemplates.filter(template => template.channels.includes(channel));
}