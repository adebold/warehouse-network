import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('ErrorHandler');

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorId: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorId = uuidv4();
    this.details = details;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, true);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, true);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, true);
  }
}

export interface ErrorResponse {
  error: {
    id: string;
    message: string;
    code?: string;
    details?: any;
    timestamp: string;
  };
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let error = err as AppError;

  // Handle non-operational errors
  if (!(err instanceof AppError)) {
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

    error = new AppError(message, 500, false);
    
    // Log the original error
    logger.error('Unhandled error', err, {
      url: req.url,
      method: req.method,
      body: req.body,
      headers: req.headers
    });
  }

  // Log operational errors
  if (error.statusCode >= 500) {
    logger.error('Server error', error, {
      errorId: error.errorId,
      url: req.url,
      method: req.method,
      statusCode: error.statusCode
    });
  } else {
    logger.warn('Client error', {
      errorId: error.errorId,
      message: error.message,
      url: req.url,
      method: req.method,
      statusCode: error.statusCode
    });
  }

  // Send error response
  const response: ErrorResponse = {
    error: {
      id: error.errorId,
      message: error.message,
      timestamp: new Date().toISOString()
    }
  };

  // Include details in non-production environments
  if (process.env.NODE_ENV !== 'production' && error.details) {
    response.error.details = error.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    (response.error as any).stack = error.stack.split('\n');
  }

  res.status(error.statusCode).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  const error = new NotFoundError('Endpoint');
  res.status(error.statusCode).json({
    error: {
      id: error.errorId,
      message: error.message,
      timestamp: new Date().toISOString()
    }
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Database error handler
export function handleDatabaseError(error: any): AppError {
  // PostgreSQL error codes
  const pgErrorCodes: Record<string, (err: any) => AppError> = {
    '23505': (err) => new ConflictError(`Duplicate value: ${err.detail}`),
    '23503': (err) => new ValidationError(`Foreign key violation: ${err.detail}`),
    '23502': (err) => new ValidationError(`Missing required field: ${err.column}`),
    '22P02': () => new ValidationError('Invalid input syntax'),
    '42P01': (err) => new AppError(`Database table not found: ${err.table}`, 500)
  };

  const handler = pgErrorCodes[error.code];
  if (handler) {
    return handler(error);
  }

  return new AppError('Database operation failed', 500, false, error);
}

// Validation error formatter for Joi
export function formatJoiError(error: any): ValidationError {
  const details = error.details.reduce((acc: any, detail: any) => {
    const path = detail.path.join('.');
    acc[path] = detail.message;
    return acc;
  }, {});

  return new ValidationError('Validation failed', details);
}