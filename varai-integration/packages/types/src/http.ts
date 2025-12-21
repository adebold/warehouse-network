// packages/types/src/http.ts
// HTTP-specific type definitions

export interface HttpHeaders {
  [key: string]: string | string[] | undefined;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type HttpStatusCode =
  | 200 // OK
  | 201 // Created
  | 204 // No Content
  | 400 // Bad Request
  | 401 // Unauthorized
  | 403 // Forbidden
  | 404 // Not Found
  | 409 // Conflict
  | 422 // Unprocessable Entity
  | 429 // Too Many Requests
  | 500 // Internal Server Error
  | 502 // Bad Gateway
  | 503 // Service Unavailable
  | 504; // Gateway Timeout

export interface HttpError {
  statusCode: HttpStatusCode;
  message: string;
  code?: string;
  details?: unknown;
}

export interface RequestContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  ipAddress: string;
  userAgent: string;
  path: string;
  method: HttpMethod;
  timestamp: Date;
}
