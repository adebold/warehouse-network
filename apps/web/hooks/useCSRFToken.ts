import { useState, useEffect, useCallback } from 'react';

interface UseCSRFTokenReturn {
  csrfToken: string | null;
  isLoading: boolean;
  error: Error | null;
  refreshToken: () => Promise<void>;
}

export function useCSRFToken(): UseCSRFTokenReturn {
  const [csrfToken, setCSRFToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCSRFToken = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/auth/csrf', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch CSRF token');
      }

      const data = await response.json();
      setCSRFToken(data.csrfToken);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCSRFToken();
  }, [fetchCSRFToken]);

  return {
    csrfToken,
    isLoading,
    error,
    refreshToken: fetchCSRFToken,
  };
}

// Helper function to include CSRF token in fetch requests
export async function fetchWithCSRF(
  url: string,
  options: RequestInit = {},
  csrfToken: string | null
): Promise<Response> {
  if (!csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method || 'GET')) {
    throw new Error('CSRF token is required for state-changing requests');
  }

  const headers = new Headers(options.headers);
  
  if (csrfToken) {
    headers.set('x-csrf-token', csrfToken);
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}