import { RetryConfig, ChannelError } from '@marketing-engine/core/interfaces/channel.interface';
import { Logger } from 'winston';

export interface RetryOptions {
  onRetry?: (error: Error, attempt: number) => void;
  shouldRetry?: (error: Error) => boolean;
  signal?: AbortSignal;
}

export class RetryHandler {
  constructor(
    private config: RetryConfig,
    private logger: Logger
  ) {}

  async execute<T>(
    fn: () => Promise<T>,
    operation: string,
    options: RetryOptions = {}
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = this.config.initialDelayMs;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (options.signal?.aborted) {
          throw new Error('Operation aborted');
        }

        return await fn();
      } catch (error) {
        lastError = error as Error;

        const shouldRetry = this.shouldRetry(error as Error, attempt, options.shouldRetry);
        
        if (!shouldRetry) {
          throw error;
        }

        this.logger.warn(`Retry attempt ${attempt}/${this.config.maxRetries} for ${operation}`, {
          error: error instanceof Error ? error.message : String(error),
          nextDelayMs: delay
        });

        if (options.onRetry) {
          options.onRetry(error as Error, attempt);
        }

        // Wait before next retry
        await this.delay(delay, options.signal);

        // Calculate next delay with exponential backoff
        delay = Math.min(
          delay * this.config.backoffMultiplier,
          this.config.maxDelayMs
        );
      }
    }

    throw new Error(`Failed after ${this.config.maxRetries} retries: ${lastError?.message}`);
  }

  private shouldRetry(
    error: Error,
    attempt: number,
    customShouldRetry?: (error: Error) => boolean
  ): boolean {
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    // Use custom retry logic if provided
    if (customShouldRetry) {
      return customShouldRetry(error);
    }

    // Check if error is a ChannelError with retryable flag
    if (this.isChannelError(error)) {
      return error.retryable;
    }

    // Default retry logic for common error types
    if (this.isNetworkError(error)) {
      return true;
    }

    if (this.isRateLimitError(error)) {
      return true;
    }

    if (this.isTimeoutError(error)) {
      return true;
    }

    // Don't retry on client errors (4xx) except rate limits
    if (this.isClientError(error)) {
      return false;
    }

    // Retry on server errors (5xx)
    if (this.isServerError(error)) {
      return true;
    }

    return false;
  }

  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Delay aborted'));
        });
      }
    });
  }

  private isChannelError(error: any): error is { retryable: boolean; retryAfter?: number } {
    return error && typeof error.retryable === 'boolean';
  }

  private isNetworkError(error: any): boolean {
    const networkErrors = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
    return error.code && networkErrors.includes(error.code);
  }

  private isRateLimitError(error: any): boolean {
    if (error.response?.status === 429) return true;
    if (error.code === 'RATE_LIMIT_EXCEEDED') return true;
    return false;
  }

  private isTimeoutError(error: any): boolean {
    return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
  }

  private isClientError(error: any): boolean {
    const status = error.response?.status;
    return status >= 400 && status < 500;
  }

  private isServerError(error: any): boolean {
    const status = error.response?.status;
    return status >= 500 && status < 600;
  }
}