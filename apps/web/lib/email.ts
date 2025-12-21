interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendEmail(options: EmailOptions) {
  const { to, subject, html, text, from = 'noreply@warehouse-network.com' } = options;

  // In production, integrate with email service like SendGrid, AWS SES, etc.
  if (process.env.NODE_ENV === 'production') {
    // TODO: Implement actual email sending
    console.log('Email would be sent:', { to, subject, from });

    // Example SendGrid integration:
    // const sgMail = require('@sendgrid/mail')
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY)
    // await sgMail.send({
    //   to,
    //   from,
    //   subject,
    //   text: text || '',
    //   html,
    // })
  } else {
    // In development, log emails to console
    console.log('=== EMAIL NOTIFICATION ===');
    console.log('To:', to);
    console.log('From:', from);
    console.log('Subject:', subject);
    console.log('Text:', text || 'No text version');
    console.log('========================');
  }
}
