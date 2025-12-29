import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';
  
  // Log error
  logger.error('Request error', {
    error: {
      message: err.message,
      code: errorCode,
      stack: err.stack,
      details: err.details,
    },
    request: {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
      headers: req.headers,
      ip: req.ip,
    },
  });
  
  // Record error metric
  MetricsCollector.recordError(errorCode, req.path);
  
  // Send error response
  const response: any = {
    success: false,
    error: {
      code: errorCode,
      message: err.message,
    },
    metadata: {
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] || 'unknown',
      version: process.env.npm_package_version || '1.0.0',
    },
  };
  
  // Include details in development
  if (process.env.NODE_ENV === 'development') {
    response.error.details = err.details;
    response.error.stack = err.stack;
  }
  
  res.status(statusCode).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
      details: {
        path: req.path,
        method: req.method,
      },
    },
    metadata: {
      timestamp: new Date(),
      requestId: req.headers['x-request-id'] || 'unknown',
      version: process.env.npm_package_version || '1.0.0',
    },
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export class ApiError extends Error implements AppError {
  statusCode: number;
  code: string;
  details?: any;
  
  constructor(statusCode: number, code: string, message: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
    
    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error creators
export const BadRequestError = (message: string, details?: any) =>
  new ApiError(400, 'BAD_REQUEST', message, details);

export const UnauthorizedError = (message: string = 'Unauthorized') =>
  new ApiError(401, 'UNAUTHORIZED', message);

export const ForbiddenError = (message: string = 'Forbidden') =>
  new ApiError(403, 'FORBIDDEN', message);

export const NotFoundError = (resource: string, id?: string) =>
  new ApiError(
    404,
    'NOT_FOUND',
    `${resource}${id ? ` with id ${id}` : ''} not found`
  );

export const ConflictError = (message: string, details?: any) =>
  new ApiError(409, 'CONFLICT', message, details);

export const ValidationError = (message: string, details?: any) =>
  new ApiError(422, 'VALIDATION_ERROR', message, details);

export const InternalServerError = (message: string = 'Internal server error') =>
  new ApiError(500, 'INTERNAL_ERROR', message);

export const ServiceUnavailableError = (service: string) =>
  new ApiError(503, 'SERVICE_UNAVAILABLE', `${service} is currently unavailable`);