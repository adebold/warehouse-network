import crypto from 'crypto';

import { serialize, parse } from 'cookie';
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextApiHandler } from 'next';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = '_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Generate a secure CSRF token
function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

// Get CSRF token from request
function getTokenFromRequest(req: NextApiRequest): string | undefined {
  // Check header first
  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;
  if (headerToken) {return headerToken;}

  // Check body (for form submissions)
  if (req.body && typeof req.body === 'object') {
    return req.body._csrf || req.body.csrf || req.body.csrfToken;
  }

  // Check query parameters as last resort
  return req.query._csrf as string | undefined;
}

// Verify CSRF token
export function verifyCSRFToken(req: NextApiRequest): boolean {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method || '')) {
    return true;
  }

  // Get stored token from cookie
  const cookies = parse(req.headers.cookie || '');
  const storedToken = cookies[CSRF_COOKIE_NAME];

  if (!storedToken) {
    return false;
  }

  // Get token from request
  const requestToken = getTokenFromRequest(req);

  if (!requestToken) {
    return false;
  }

  // Constant time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(storedToken),
    Buffer.from(requestToken)
  );
}

// Set CSRF token cookie
export function setCSRFCookie(res: NextApiResponse, token?: string): string {
  const csrfToken = token || generateToken();
  
  const cookie = serialize(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: CSRF_TOKEN_TTL / 1000, // Convert to seconds
  });

  res.setHeader('Set-Cookie', cookie);
  return csrfToken;
}

// CSRF protection middleware
export function withCSRFProtection(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Generate and set CSRF token for GET requests
    if (req.method === 'GET') {
      const cookies = parse(req.headers.cookie || '');
      const existingToken = cookies[CSRF_COOKIE_NAME];
      
      if (!existingToken) {
        setCSRFCookie(res);
      }
      
      return handler(req, res);
    }

    // Verify CSRF token for state-changing requests
    if (!verifyCSRFToken(req)) {
      res.status(403).json({
        error: 'Invalid or missing CSRF token',
        code: 'CSRF_VALIDATION_FAILED',
      });
      return;
    }

    // Continue to handler
    return handler(req, res);
  };
}

// Helper to get CSRF token for client
export function getCSRFToken(req: NextApiRequest): string | undefined {
  const cookies = parse(req.headers.cookie || '');
  return cookies[CSRF_COOKIE_NAME];
}

// API route to get CSRF token
export async function csrfTokenHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cookies = parse(req.headers.cookie || '');
  let token = cookies[CSRF_COOKIE_NAME];

  if (!token) {
    token = setCSRFCookie(res);
  }

  res.status(200).json({ csrfToken: token });
}