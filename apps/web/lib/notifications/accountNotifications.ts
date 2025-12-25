import { Customer as PrismaCustomer, User as PrismaUser, AccountLockHistory } from '@prisma/client';
import { sendEmail } from '../email';
import prisma from '../prisma';

interface NotificationData {
  customer: PrismaCustomer;
  action: 'LOCKED' | 'UNLOCKED';
  reason?: string;
  performedBy: PrismaUser;
}

export async function sendAccountLockNotification(data: NotificationData) {
  const { customer, action, reason, performedBy } = data;

  // Get customer users to notify
  const customerUsers = await prisma.user.findMany({
    where: {
      customerId: customer.id,
      role: { in: ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] },
    },
  });

  // Prepare email content
  const subject =
    action === 'LOCKED'
      ? '⚠️ Your Warehouse Network Account Has Been Locked'
      : '✅ Your Warehouse Network Account Has Been Unlocked';

  const htmlContent = generateEmailHtml(data);
  const textContent = generateEmailText(data);

  // Send emails to all customer users
  const emailPromises = customerUsers.map((user: PrismaUser) =>
    sendEmail({
      to: user.email,
      subject,
      html: htmlContent,
      text: textContent,
    })
  );

  // Send notification to warehouse operators
  const operators = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'OPERATOR'] },
      NOT: { id: performedBy.id }, // Don't notify the person who performed the action
    },
  });

  const operatorSubject = `Account ${action.toLowerCase()}: ${customer.name}`;
  const operatorHtml = generateOperatorEmailHtml(data);

  const operatorPromises = operators.map((operator: PrismaUser) =>
    sendEmail({
      to: operator.email,
      subject: operatorSubject,
      html: operatorHtml,
      text: `${customer.name}'s account was ${action.toLowerCase()} by ${performedBy.name}. Reason: ${reason || 'Not specified'}`,
    })
  );

  await Promise.all([...emailPromises, ...operatorPromises]);
}

function generateEmailHtml(data: NotificationData): string {
  const { customer, action, reason } = data;

  if (action === 'LOCKED') {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9fafb; padding: 30px; }
            .warning { background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 24px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Account Locked</h1>
            </div>
            <div class="content">
              <p>Dear ${customer.name},</p>
              
              <div class="warning">
                <strong>Your account has been temporarily locked.</strong>
                ${reason ? `<p>Reason: ${reason}</p>` : ''}
              </div>
              
              <p>While your account is locked, you will not be able to:</p>
              <ul>
                <li>Receive new inventory shipments</li>
                <li>Create release requests for existing inventory</li>
                <li>Submit new RFQs or orders</li>
              </ul>
              
              <p>You can still:</p>
              <ul>
                <li>View your existing inventory</li>
                <li>Access your account information</li>
                <li>Make payments</li>
              </ul>
              
              <p><strong>To resolve this issue:</strong></p>
              <ol>
                <li>Review any outstanding payments</li>
                <li>Contact our support team</li>
                <li>Submit payment if applicable</li>
              </ol>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NEXTAUTH_URL}/app/dashboard" class="button">View Account</a>
              </div>
              
              <p>If you believe this is an error or need assistance, please contact our support team immediately.</p>
            </div>
            <div class="footer">
              <p>© 2024 Warehouse Network. All rights reserved.</p>
              <p>This is an automated notification. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  } else {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #16a34a; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9fafb; padding: 30px; }
            .success { background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Account Unlocked</h1>
            </div>
            <div class="content">
              <p>Dear ${customer.name},</p>
              
              <div class="success">
                <strong>Good news! Your account has been unlocked.</strong>
                ${reason ? `<p>Note: ${reason}</p>` : ''}
              </div>
              
              <p>You now have full access to all warehouse operations:</p>
              <ul>
                <li>✅ Receive new inventory shipments</li>
                <li>✅ Create release requests</li>
                <li>✅ Submit RFQs and orders</li>
                <li>✅ All standard warehouse operations</li>
              </ul>
              
              <p>Thank you for resolving any outstanding issues. We appreciate your business and look forward to continuing to serve your warehousing needs.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NEXTAUTH_URL}/app/dashboard" class="button">Access Your Account</a>
              </div>
            </div>
            <div class="footer">
              <p>© 2024 Warehouse Network. All rights reserved.</p>
              <p>This is an automated notification. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

function generateEmailText(data: NotificationData): string {
  const { customer, action, reason } = data;

  if (action === 'LOCKED') {
    return `
Dear ${customer.name},

Your Warehouse Network account has been temporarily locked.
${reason ? `Reason: ${reason}` : ''}

While your account is locked, you will not be able to:
- Receive new inventory shipments
- Create release requests for existing inventory
- Submit new RFQs or orders

You can still:
- View your existing inventory
- Access your account information
- Make payments

To resolve this issue:
1. Review any outstanding payments
2. Contact our support team
3. Submit payment if applicable

Visit your account: ${process.env.NEXTAUTH_URL}/app/dashboard

If you believe this is an error, please contact support immediately.

© 2024 Warehouse Network
    `.trim();
  } else {
    return `
Dear ${customer.name},

Good news! Your Warehouse Network account has been unlocked.
${reason ? `Note: ${reason}` : ''}

You now have full access to all warehouse operations:
- Receive new inventory shipments
- Create release requests
- Submit RFQs and orders
- All standard warehouse operations

Thank you for resolving any outstanding issues.

Access your account: ${process.env.NEXTAUTH_URL}/app/dashboard

© 2024 Warehouse Network
    `.trim();
  }
}

function generateOperatorEmailHtml(data: NotificationData): string {
  const { customer, action, reason, performedBy } = data;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e40af; color: white; padding: 20px; }
          .content { background-color: #f9fafb; padding: 20px; }
          .info-box { background-color: white; border: 1px solid #e5e7eb; padding: 15px; margin: 15px 0; }
          .label { font-weight: bold; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Account ${action === 'LOCKED' ? 'Lock' : 'Unlock'} Notification</h2>
          </div>
          <div class="content">
            <div class="info-box">
              <p><span class="label">Customer:</span> ${customer.name}</p>
              <p><span class="label">Action:</span> Account ${action.toLowerCase()}</p>
              <p><span class="label">Performed by:</span> ${performedBy.name} (${performedBy.email})</p>
              <p><span class="label">Date:</span> ${new Date().toLocaleString()}</p>
              <p><span class="label">Reason:</span> ${reason || 'Not specified'}</p>
              ${customer.totalOutstanding > 0 ? `<p><span class="label">Outstanding Amount:</span> $${customer.totalOutstanding.toFixed(2)}</p>` : ''}
            </div>
            
            <p>This is an automated notification for account status changes in the Warehouse Network system.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Send payment reminder notifications
export async function sendPaymentReminderNotification(customer: Customer, daysOverdue: number) {
  const customerUsers = await prisma.user.findMany({
    where: {
      customerId: customer.id,
      role: { in: ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] },
    },
  });

  const urgency =
    daysOverdue > 30 ? 'Final Notice' : daysOverdue > 15 ? 'Second Notice' : 'Payment Reminder';
  const subject = `${urgency}: Payment Overdue - $${customer.overdueAmount.toFixed(2)}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f59e0b; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9fafb; padding: 30px; }
          .warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
          .amount-due { font-size: 24px; color: #dc2626; font-weight: bold; text-align: center; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${urgency}</h1>
          </div>
          <div class="content">
            <p>Dear ${customer.name},</p>
            
            <div class="warning">
              <strong>Your account has an overdue balance.</strong>
            </div>
            
            <div class="amount-due">
              Amount Due: $${customer.overdueAmount.toFixed(2)}
            </div>
            
            <p>Your payment is now <strong>${daysOverdue} days overdue</strong>. 
            ${daysOverdue > 15 ? 'To avoid service interruption and account restrictions, please submit payment immediately.' : 'Please submit payment at your earliest convenience to avoid service interruption.'}</p>
            
            ${
              daysOverdue > 20
                ? `
              <p style="color: #dc2626;"><strong>Warning:</strong> If payment is not received within 5 business days, your account may be locked, preventing:</p>
              <ul style="color: #dc2626;">
                <li>New inventory receipts</li>
                <li>Release of existing inventory</li>
                <li>New orders and RFQs</li>
              </ul>
            `
                : ''
            }
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXTAUTH_URL}/app/payments" class="button">Make Payment</a>
            </div>
            
            <p>If you have already submitted payment, please disregard this notice. If you have questions about your account, please contact our billing department.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await Promise.all(
    customerUsers.map(user =>
      sendEmail({
        to: user.email,
        subject,
        html,
        text: `${urgency}: Your account has an overdue balance of $${customer.overdueAmount.toFixed(2)}. Please submit payment to avoid service interruption.`,
      })
    )
  );
}
