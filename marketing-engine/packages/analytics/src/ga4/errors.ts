/**
 * GA4-specific error types
 */

export class GA4Error extends Error {
  public readonly statusCode?: number;
  public readonly code: string = 'GA4_ERROR';

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'GA4Error';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, GA4Error.prototype);
  }
}

export class GA4ValidationError extends GA4Error {
  public readonly field?: string;
  public readonly code: string = 'GA4_VALIDATION_ERROR';

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'GA4ValidationError';
    this.field = field;
    Object.setPrototypeOf(this, GA4ValidationError.prototype);
  }
}

export class GA4QuotaError extends GA4Error {
  public readonly code: string = 'GA4_QUOTA_ERROR';
  public readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message, 429);
    this.name = 'GA4QuotaError';
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, GA4QuotaError.prototype);
  }
}

export class GA4AuthError extends GA4Error {
  public readonly code: string = 'GA4_AUTH_ERROR';

  constructor(message: string) {
    super(message, 401);
    this.name = 'GA4AuthError';
    Object.setPrototypeOf(this, GA4AuthError.prototype);
  }
}