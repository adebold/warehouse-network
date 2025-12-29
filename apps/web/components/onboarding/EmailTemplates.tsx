
// Welcome email for new customers
import { logger } from './utils/logger';

export const CustomerWelcomeEmailTemplate = {
  subject: 'Welcome to SkidSpace - Your Warehouse Journey Begins!',
  html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to SkidSpace</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; }
            .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; font-size: 28px; margin-bottom: 8px; }
            .header p { color: #93c5fd; font-size: 16px; }
            .content { padding: 40px 20px; }
            .welcome-message { text-align: center; margin-bottom: 32px; }
            .welcome-message h2 { color: #1f2937; font-size: 24px; margin-bottom: 12px; }
            .welcome-message p { color: #6b7280; font-size: 16px; }
            .features { margin: 32px 0; }
            .feature { display: flex; align-items: flex-start; margin-bottom: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; }
            .feature-icon { width: 40px; height: 40px; background: #dbeafe; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 16px; flex-shrink: 0; }
            .feature-content h3 { color: #1f2937; font-size: 16px; margin-bottom: 4px; }
            .feature-content p { color: #6b7280; font-size: 14px; }
            .next-steps { background: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 8px; padding: 24px; margin: 32px 0; }
            .next-steps h3 { color: #0c4a6e; font-size: 18px; margin-bottom: 16px; }
            .step { display: flex; align-items: center; margin-bottom: 12px; }
            .step-number { width: 24px; height: 24px; background: #2563eb; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px; }
            .cta { text-align: center; margin: 32px 0; }
            .cta-button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
            .footer { background: #f8fafc; padding: 24px 20px; text-align: center; border-top: 1px solid #e5e7eb; }
            .footer p { color: #6b7280; font-size: 14px; margin-bottom: 8px; }
            .social-links a { color: #6b7280; margin: 0 8px; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to SkidSpace!</h1>
                <p>The flexible warehouse marketplace</p>
            </div>
            
            <div class="content">
                <div class="welcome-message">
                    <h2>{{customerName}}, you're all set! 🎉</h2>
                    <p>Welcome to the future of warehouse storage. We're excited to help you find the perfect space for your inventory.</p>
                </div>
                
                <div class="features">
                    <div class="feature">
                        <div class="feature-icon">📦</div>
                        <div class="feature-content">
                            <h3>Pay Only for What You Use</h3>
                            <p>Book by the pallet position, not the whole warehouse. Scale up or down as needed.</p>
                        </div>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">⚡</div>
                        <div class="feature-content">
                            <h3>Instant Booking</h3>
                            <p>Find and reserve space in minutes. No lengthy contracts or negotiations.</p>
                        </div>
                    </div>
                    
                    <div class="feature">
                        <div class="feature-icon">🛡️</div>
                        <div class="feature-content">
                            <h3>Verified Partners</h3>
                            <p>All warehouse operators are vetted and verified for quality and reliability.</p>
                        </div>
                    </div>
                </div>
                
                <div class="next-steps">
                    <h3>What's Next?</h3>
                    <div class="step">
                        <div class="step-number">1</div>
                        <span>Complete your onboarding to unlock all features</span>
                    </div>
                    <div class="step">
                        <div class="step-number">2</div>
                        <span>Browse available warehouse spaces in your area</span>
                    </div>
                    <div class="step">
                        <div class="step-number">3</div>
                        <span>Book your first pallet positions</span>
                    </div>
                    <div class="step">
                        <div class="step-number">4</div>
                        <span>Start storing and managing your inventory</span>
                    </div>
                </div>
                
                <div class="cta">
                    <a href="{{dashboardUrl}}" class="cta-button">Complete Your Setup</a>
                </div>
                
                <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 24px 0;">
                    <p style="color: #92400e; margin: 0;">
                        <strong>Need help?</strong> Our support team is here 24/7. Reply to this email or call us at {{supportPhone}}.
                    </p>
                </div>
            </div>
            
            <div class="footer">
                <p>Thanks for choosing SkidSpace!</p>
                <p>
                    <a href="{{unsubscribeUrl}}" class="social-links">Unsubscribe</a> |
                    <a href="{{helpUrl}}" class="social-links">Help Center</a> |
                    <a href="{{termsUrl}}" class="social-links">Terms</a>
                </p>
            </div>
        </div>
    </body>
    </html>
  `,
  text: `
    Welcome to SkidSpace!
    
    Hi {{customerName}},
    
    Welcome to SkidSpace, the flexible warehouse marketplace! We're excited to help you find the perfect storage space for your inventory.
    
    What makes SkidSpace special:
    • Pay only for what you use - book by pallet position
    • Instant booking - reserve space in minutes
    • Verified partners - all operators are vetted and reliable
    
    What's next:
    1. Complete your onboarding to unlock all features
    2. Browse available warehouse spaces in your area
    3. Book your first pallet positions
    4. Start storing and managing your inventory
    
    Complete your setup: {{dashboardUrl}}
    
    Need help? Our support team is here 24/7. Reply to this email or call {{supportPhone}}.
    
    Thanks for choosing SkidSpace!
  `
};

// Welcome email for new warehouse operators
export const OperatorWelcomeEmailTemplate = {
  subject: 'Welcome to SkidSpace - Start Earning from Your Warehouse Space!',
  html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to SkidSpace</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; }
            .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; font-size: 28px; margin-bottom: 8px; }
            .header p { color: #86efac; font-size: 16px; }
            .content { padding: 40px 20px; }
            .welcome-message { text-align: center; margin-bottom: 32px; }
            .welcome-message h2 { color: #1f2937; font-size: 24px; margin-bottom: 12px; }
            .welcome-message p { color: #6b7280; font-size: 16px; }
            .stats { display: flex; justify-content: space-around; margin: 32px 0; padding: 24px; background: #f0fdf4; border-radius: 8px; }
            .stat { text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; color: #059669; }
            .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
            .benefits { margin: 32px 0; }
            .benefit { display: flex; align-items: flex-start; margin-bottom: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; }
            .benefit-icon { width: 40px; height: 40px; background: #dcfce7; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 16px; flex-shrink: 0; }
            .benefit-content h3 { color: #1f2937; font-size: 16px; margin-bottom: 4px; }
            .benefit-content p { color: #6b7280; font-size: 14px; }
            .highlight { background: #dcfce7; color: #166534; font-size: 12px; padding: 4px 8px; border-radius: 4px; }
            .setup-steps { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 24px; margin: 32px 0; }
            .setup-steps h3 { color: #14532d; font-size: 18px; margin-bottom: 16px; }
            .step { display: flex; align-items: center; margin-bottom: 12px; padding: 12px; background: white; border-radius: 6px; }
            .step-number { width: 24px; height: 24px; background: #059669; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px; }
            .step-time { background: #e5e7eb; color: #6b7280; font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-left: auto; }
            .cta { text-align: center; margin: 32px 0; }
            .cta-button { display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
            .footer { background: #f8fafc; padding: 24px 20px; text-align: center; border-top: 1px solid #e5e7eb; }
            .footer p { color: #6b7280; font-size: 14px; margin-bottom: 8px; }
            .social-links a { color: #6b7280; margin: 0 8px; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to SkidSpace!</h1>
                <p>Start monetizing your warehouse space</p>
            </div>
            
            <div class="content">
                <div class="welcome-message">
                    <h2>{{operatorName}}, let's start earning! 💰</h2>
                    <p>Welcome to SkidSpace! Join hundreds of warehouse owners who are maximizing their revenue with our platform.</p>
                </div>
                
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value">500+</div>
                        <div class="stat-label">WAREHOUSE PARTNERS</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">$2.5M+</div>
                        <div class="stat-label">REVENUE GENERATED</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">95%</div>
                        <div class="stat-label">AVG OCCUPANCY</div>
                    </div>
                </div>
                
                <div class="benefits">
                    <div class="benefit">
                        <div class="benefit-icon">💰</div>
                        <div class="benefit-content">
                            <h3>Maximize Revenue</h3>
                            <p>Monetize every pallet position in your warehouse</p>
                            <div class="highlight">Up to 30% increase in revenue</div>
                        </div>
                    </div>
                    
                    <div class="benefit">
                        <div class="benefit-icon">👥</div>
                        <div class="benefit-content">
                            <h3>Zero Management Hassle</h3>
                            <p>We handle tenant screening and operations</p>
                            <div class="highlight">Full-service management</div>
                        </div>
                    </div>
                    
                    <div class="benefit">
                        <div class="benefit-icon">📊</div>
                        <div class="benefit-content">
                            <h3>Dynamic Pricing</h3>
                            <p>Set rates based on demand and seasonality</p>
                            <div class="highlight">AI-powered optimization</div>
                        </div>
                    </div>
                </div>
                
                <div class="setup-steps">
                    <h3>Quick Setup Process (25 minutes)</h3>
                    <div class="step">
                        <div class="step-number">1</div>
                        <span>Verify your business and insurance</span>
                        <div class="step-time">5 min</div>
                    </div>
                    <div class="step">
                        <div class="step-number">2</div>
                        <span>Add warehouse details and photos</span>
                        <div class="step-time">10 min</div>
                    </div>
                    <div class="step">
                        <div class="step-number">3</div>
                        <span>Configure pricing and services</span>
                        <div class="step-time">5 min</div>
                    </div>
                    <div class="step">
                        <div class="step-number">4</div>
                        <span>Setup Stripe for payouts</span>
                        <div class="step-time">3 min</div>
                    </div>
                    <div class="step">
                        <div class="step-number">5</div>
                        <span>Invite your team members</span>
                        <div class="step-time">2 min</div>
                    </div>
                </div>
                
                <div class="cta">
                    <a href="{{setupUrl}}" class="cta-button">Start Setup Process</a>
                </div>
                
                <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin: 24px 0;">
                    <p style="color: #92400e; margin: 0;">
                        <strong>Start earning immediately!</strong> Once approved, your warehouse will be visible to customers and you can start accepting bookings right away. Average first booking happens within 48 hours.
                    </p>
                </div>
            </div>
            
            <div class="footer">
                <p>Thanks for joining SkidSpace!</p>
                <p>
                    <a href="{{unsubscribeUrl}}" class="social-links">Unsubscribe</a> |
                    <a href="{{helpUrl}}" class="social-links">Help Center</a> |
                    <a href="{{termsUrl}}" class="social-links">Terms</a>
                </p>
            </div>
        </div>
    </body>
    </html>
  `,
  text: `
    Welcome to SkidSpace!
    
    Hi {{operatorName}},
    
    Welcome to SkidSpace! Join hundreds of warehouse owners who are maximizing their revenue with our platform.
    
    Platform highlights:
    • 500+ warehouse partners
    • $2.5M+ revenue generated
    • 95% average occupancy
    
    Benefits for you:
    • Maximize Revenue - Up to 30% increase
    • Zero Management Hassle - We handle operations
    • Dynamic Pricing - AI-powered optimization
    
    Quick Setup Process (25 minutes):
    1. Verify your business and insurance (5 min)
    2. Add warehouse details and photos (10 min)
    3. Configure pricing and services (5 min)
    4. Setup Stripe for payouts (3 min)
    5. Invite your team members (2 min)
    
    Start setup: {{setupUrl}}
    
    Start earning immediately! Once approved, you can start accepting bookings within 48 hours.
    
    Need help? Contact us at {{supportEmail}} or {{supportPhone}}.
    
    Thanks for joining SkidSpace!
  `
};

// Onboarding completion reminder
export const OnboardingReminderEmailTemplate = {
  subject: 'Complete Your SkidSpace Setup - Only 5 Minutes Left!',
  html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Complete Your Setup</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; font-size: 24px; margin-bottom: 8px; }
            .header p { color: #fde68a; font-size: 16px; }
            .content { padding: 40px 20px; }
            .progress-section { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 24px; margin-bottom: 32px; }
            .progress-bar { background: #e5e7eb; height: 8px; border-radius: 4px; margin: 16px 0; overflow: hidden; }
            .progress-fill { background: #f59e0b; height: 100%; transition: width 0.3s ease; }
            .remaining-steps { margin: 24px 0; }
            .step { display: flex; align-items: center; padding: 12px; margin-bottom: 8px; background: #fefbf2; border-radius: 6px; }
            .step-checkbox { width: 16px; height: 16px; border: 2px solid #d97706; border-radius: 3px; margin-right: 12px; }
            .step-checkbox.completed { background: #d97706; }
            .cta { text-align: center; margin: 32px 0; }
            .cta-button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
            .footer { background: #f8fafc; padding: 24px 20px; text-align: center; border-top: 1px solid #e5e7eb; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>You're Almost There! ⏰</h1>
                <p>Complete your SkidSpace setup</p>
            </div>
            
            <div class="content">
                <div class="progress-section">
                    <h3 style="color: #92400e; margin-bottom: 12px;">Your Progress</h3>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: {{progressPercentage}}%;"></div>
                    </div>
                    <p style="text-align: center; color: #92400e;">{{progressPercentage}}% Complete</p>
                </div>
                
                <h3 style="margin-bottom: 16px;">Remaining Steps:</h3>
                <div class="remaining-steps">
                    {{#each remainingSteps}}
                    <div class="step">
                        <div class="step-checkbox"></div>
                        <span>{{this}}</span>
                    </div>
                    {{/each}}
                </div>
                
                <div style="background: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 16px; margin: 24px 0;">
                    <p style="color: #1e40af; margin: 0;">
                        <strong>Only {{estimatedTimeLeft}} minutes left!</strong> Complete your setup now to start {{#if isOperator}}earning from your warehouse space{{else}}finding the perfect storage solutions{{/if}}.
                    </p>
                </div>
                
                <div class="cta">
                    <a href="{{continueUrl}}" class="cta-button">Continue Setup</a>
                </div>
                
                <div style="text-align: center; margin-top: 24px;">
                    <p style="color: #6b7280; font-size: 14px;">
                        Need help? <a href="mailto:{{supportEmail}}" style="color: #f59e0b;">Contact our support team</a>
                    </p>
                </div>
            </div>
            
            <div class="footer">
                <p style="color: #6b7280; font-size: 14px;">
                    <a href="{{unsubscribeUrl}}" style="color: #6b7280;">Unsubscribe</a> from setup reminders
                </p>
            </div>
        </div>
    </body>
    </html>
  `,
  text: `
    You're Almost There!
    
    Hi {{userName}},
    
    Your SkidSpace setup is {{progressPercentage}}% complete. Just {{estimatedTimeLeft}} minutes left to finish!
    
    Remaining steps:
    {{#each remainingSteps}}
    • {{this}}
    {{/each}}
    
    Complete your setup: {{continueUrl}}
    
    Need help? Contact us at {{supportEmail}}
    
    Thanks,
    The SkidSpace Team
  `
};

// Step completion notification
export const StepCompletionEmailTemplate = {
  subject: 'Great Progress! {{stepName}} Complete ✅',
  html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Step Complete</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center; }
            .header h1 { color: white; font-size: 24px; margin-bottom: 8px; }
            .header p { color: #86efac; font-size: 16px; }
            .content { padding: 30px 20px; }
            .achievement { text-align: center; margin-bottom: 24px; }
            .achievement-icon { font-size: 48px; margin-bottom: 12px; }
            .next-steps { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0; }
            .cta-button { display: inline-block; background: #10b981; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; }
            .footer { background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Step Complete! ✅</h1>
                <p>You're making great progress</p>
            </div>
            
            <div class="content">
                <div class="achievement">
                    <div class="achievement-icon">🎉</div>
                    <h2 style="color: #059669; margin-bottom: 8px;">{{stepName}} Complete!</h2>
                    <p style="color: #6b7280;">Great job! You're {{progressPercentage}}% done with your setup.</p>
                </div>
                
                {{#if nextStepName}}
                <div class="next-steps">
                    <h3 style="color: #14532d; margin-bottom: 12px;">What's Next?</h3>
                    <p style="color: #166534; margin-bottom: 16px;">Your next step: <strong>{{nextStepName}}</strong></p>
                    <a href="{{continueUrl}}" class="cta-button">Continue Setup</a>
                </div>
                {{else}}
                <div style="background: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 16px; text-align: center;">
                    <p style="color: #1e40af; margin: 0;">
                        <strong>🎊 Congratulations!</strong> You've completed your SkidSpace onboarding. You're ready to {{#if isOperator}}start earning from your warehouse space{{else}}find and book warehouse spaces{{/if}}!
                    </p>
                </div>
                {{/if}}
            </div>
            
            <div class="footer">
                <p style="color: #6b7280; font-size: 14px;">
                    Thanks for choosing SkidSpace!
                </p>
            </div>
        </div>
    </body>
    </html>
  `,
  text: `
    Step Complete! ✅
    
    Hi {{userName}},
    
    Great job! You've completed: {{stepName}}
    
    You're {{progressPercentage}}% done with your setup.
    
    {{#if nextStepName}}
    What's next: {{nextStepName}}
    Continue setup: {{continueUrl}}
    {{else}}
    🎊 Congratulations! You've completed your SkidSpace onboarding.
    {{/if}}
    
    Thanks for choosing SkidSpace!
  `
};

export const EmailService = {
  async sendWelcomeEmail(userEmail: string, userName: string, userRole: string) {
    const isOperator = userRole === 'OPERATOR_ADMIN';
    const template = isOperator ? OperatorWelcomeEmailTemplate : CustomerWelcomeEmailTemplate;
    
    const variables = {
      customerName: userName,
      operatorName: userName,
      dashboardUrl: `${process.env.NEXTAUTH_URL}/dashboard`,
      setupUrl: `${process.env.NEXTAUTH_URL}/onboarding`,
      supportEmail: 'support@skidspace.com',
      supportPhone: '1-800-SKIDSPACE',
      unsubscribeUrl: `${process.env.NEXTAUTH_URL}/unsubscribe`,
      helpUrl: `${process.env.NEXTAUTH_URL}/help`,
      termsUrl: `${process.env.NEXTAUTH_URL}/terms`
    };

    return this.sendEmail({
      to: userEmail,
      subject: template.subject,
      html: this.replaceVariables(template.html, variables),
      text: this.replaceVariables(template.text, variables)
    });
  },

  async sendOnboardingReminder(userEmail: string, userName: string, progress: number, remainingSteps: string[], isOperator: boolean) {
    const variables = {
      userName,
      progressPercentage: Math.round(progress),
      estimatedTimeLeft: Math.max(1, Math.round(remainingSteps.length * 2.5)),
      remainingSteps,
      isOperator,
      continueUrl: `${process.env.NEXTAUTH_URL}/onboarding`,
      supportEmail: 'support@skidspace.com',
      unsubscribeUrl: `${process.env.NEXTAUTH_URL}/unsubscribe`
    };

    return this.sendEmail({
      to: userEmail,
      subject: OnboardingReminderEmailTemplate.subject,
      html: this.replaceVariables(OnboardingReminderEmailTemplate.html, variables),
      text: this.replaceVariables(OnboardingReminderEmailTemplate.text, variables)
    });
  },

  async sendStepCompletionEmail(userEmail: string, userName: string, stepName: string, progress: number, nextStepName?: string, isOperator: boolean = false) {
    const variables = {
      userName,
      stepName,
      progressPercentage: Math.round(progress),
      nextStepName,
      isOperator,
      continueUrl: `${process.env.NEXTAUTH_URL}/onboarding`
    };

    return this.sendEmail({
      to: userEmail,
      subject: this.replaceVariables(StepCompletionEmailTemplate.subject, variables),
      html: this.replaceVariables(StepCompletionEmailTemplate.html, variables),
      text: this.replaceVariables(StepCompletionEmailTemplate.text, variables)
    });
  },

  replaceVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value || ''));
    });

    return result;
  },

  async sendEmail(options: { to: string; subject: string; html: string; text: string }) {
    // Implementation would depend on your email service
    // This could be SendGrid, AWS SES, Mailgun, etc.
    
    logger.info('Sending email:', {
      to: options.to,
      subject: options.subject
      // Don't log the full content in production
    });

    // Example using a hypothetical email service
    // return await emailProvider.send(options);
    
    // For development, just log
    if (process.env.NODE_ENV === 'development') {
      logger.info('Email content (dev mode):', options);
    }

    return { success: true, messageId: 'dev-' + Date.now() };
  }
};

export default EmailService;