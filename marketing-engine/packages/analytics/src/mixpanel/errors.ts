/**
 * Mixpanel-specific error types
 */

export class MixpanelError extends Error {
  public readonly code: string = 'MIXPANEL_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'MixpanelError';
    Object.setPrototypeOf(this, MixpanelError.prototype);
  }
}

export class MixpanelAuthError extends MixpanelError {
  public readonly code: string = 'MIXPANEL_AUTH_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'MixpanelAuthError';
    Object.setPrototypeOf(this, MixpanelAuthError.prototype);
  }
}

export class MixpanelQuotaError extends MixpanelError {
  public readonly code: string = 'MIXPANEL_QUOTA_ERROR';
  public readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = 'MixpanelQuotaError';
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, MixpanelQuotaError.prototype);
  }
}

export class MixpanelValidationError extends MixpanelError {
  public readonly code: string = 'MIXPANEL_VALIDATION_ERROR';
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'MixpanelValidationError';
    this.field = field;
    Object.setPrototypeOf(this, MixpanelValidationError.prototype);
  }
}