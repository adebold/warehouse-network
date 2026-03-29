// Email service for sending invitations and notifications
// In production, integrate with a service like Resend, SendGrid, or AWS SES

interface InvitationEmailData {
  email: string
  token: string
  organizationName: string
  inviterName: string
  message?: string
  expiresAt: Date
}

interface WelcomeEmailData {
  email: string
  name: string
  organizationName: string
  loginUrl: string
}

interface PasswordResetEmailData {
  email: string
  name: string
  resetToken: string
  expiresAt: Date
}

export async function sendInvitationEmail(data: InvitationEmailData): Promise<void> {
  const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept-invitation?token=${data.token}`

  const emailContent = `
    <h2>You're invited to join ${data.organizationName}</h2>

    <p>Hi there,</p>

    <p>${data.inviterName} has invited you to join <strong>${data.organizationName}</strong> on Skidspace.</p>

    ${data.message ? `<p><em>"${data.message}"</em></p>` : ''}

    <p>Click the link below to accept the invitation and create your account:</p>

    <a href="${invitationUrl}" style="
      background-color: #3B82F6;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      display: inline-block;
      margin: 16px 0;
    ">Accept Invitation</a>

    <p>This invitation will expire on ${data.expiresAt.toLocaleDateString()}.</p>

    <p>If you're unable to click the button, copy and paste this URL into your browser:</p>
    <p style="font-family: monospace; background-color: #f3f4f6; padding: 8px;">${invitationUrl}</p>

    <p>If you didn't expect this invitation, you can safely ignore this email.</p>

    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">

    <p style="color: #6b7280; font-size: 14px;">
      Best regards,<br>
      The Skidspace Team
    </p>
  `

  await sendEmail({
    to: data.email,
    subject: `Invitation to join ${data.organizationName}`,
    html: emailContent
  })
}

export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
  const emailContent = `
    <h2>Welcome to ${data.organizationName}!</h2>

    <p>Hi ${data.name},</p>

    <p>Welcome to <strong>${data.organizationName}</strong> on Skidspace! Your account has been successfully created.</p>

    <p>You can now sign in to your dashboard:</p>

    <a href="${data.loginUrl}" style="
      background-color: #10B981;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      display: inline-block;
      margin: 16px 0;
    ">Sign In to Dashboard</a>

    <p>Here are some things you can do to get started:</p>
    <ul>
      <li>Complete your profile information</li>
      <li>Explore your organization's dashboard</li>
      <li>Connect with your team members</li>
      <li>Set up your preferences</li>
    </ul>

    <p>If you have any questions, don't hesitate to reach out to our support team.</p>

    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">

    <p style="color: #6b7280; font-size: 14px;">
      Best regards,<br>
      The Skidspace Team
    </p>
  `

  await sendEmail({
    to: data.email,
    subject: `Welcome to ${data.organizationName}`,
    html: emailContent
  })
}

export async function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${data.resetToken}`

  const emailContent = `
    <h2>Reset Your Password</h2>

    <p>Hi ${data.name},</p>

    <p>We received a request to reset your password for your Skidspace account.</p>

    <p>Click the link below to create a new password:</p>

    <a href="${resetUrl}" style="
      background-color: #EF4444;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      display: inline-block;
      margin: 16px 0;
    ">Reset Password</a>

    <p>This link will expire on ${data.expiresAt.toLocaleDateString()} for security reasons.</p>

    <p>If you're unable to click the button, copy and paste this URL into your browser:</p>
    <p style="font-family: monospace; background-color: #f3f4f6; padding: 8px;">${resetUrl}</p>

    <p><strong>If you didn't request this password reset, please ignore this email.</strong> Your password will remain unchanged.</p>

    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">

    <p style="color: #6b7280; font-size: 14px;">
      Best regards,<br>
      The Skidspace Team
    </p>
  `

  await sendEmail({
    to: data.email,
    subject: 'Reset Your Password - Skidspace',
    html: emailContent
  })
}

interface EmailOptions {
  to: string
  subject: string
  html: string
  from?: string
}

async function sendEmail(options: EmailOptions): Promise<void> {
  const fromEmail = options.from || process.env.FROM_EMAIL || 'noreply@skidspace.com'

  if (process.env.NODE_ENV === 'development') {
    // In development, log email instead of sending
    console.log('📧 Email would be sent:')
    console.log(`To: ${options.to}`)
    console.log(`Subject: ${options.subject}`)
    console.log(`From: ${fromEmail}`)
    console.log('Body:', options.html)
    return
  }

  try {
    // Example using Resend (replace with your preferred email service)
    if (process.env.SMTP_HOST && process.env.SMTP_PASSWORD) {
      // Use nodemailer or similar for SMTP
      const nodemailer = await import('nodemailer')

      const transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      })

      await transporter.sendMail({
        from: fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
      })
    } else if (process.env.RESEND_API_KEY) {
      // Use Resend API
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [options.to],
          subject: options.subject,
          html: options.html,
        }),
      })

      if (!response.ok) {
        throw new Error(`Email send failed: ${response.statusText}`)
      }
    } else {
      console.warn('No email service configured. Email not sent.')
    }
  } catch (error) {
    console.error('Failed to send email:', error)
    throw error
  }
}

// Helper function to validate email templates
export function validateEmailTemplate(template: string, variables: Record<string, any>): boolean {
  try {
    // Check if all required variables are present in the template
    const requiredVars = template.match(/\{\{(\w+)\}\}/g)

    if (requiredVars) {
      for (const variable of requiredVars) {
        const varName = variable.replace(/\{\{|\}\}/g, '')
        if (!(varName in variables)) {
          console.warn(`Missing template variable: ${varName}`)
          return false
        }
      }
    }

    return true
  } catch (error) {
    console.error('Email template validation error:', error)
    return false
  }
}

// Helper function to render email template with variables
export function renderEmailTemplate(template: string, variables: Record<string, any>): string {
  let rendered = template

  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    rendered = rendered.replace(placeholder, String(value))
  })

  return rendered
}