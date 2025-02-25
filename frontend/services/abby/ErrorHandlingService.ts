import { AbbyError } from './types';

export class ErrorHandlingService {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000; // ms
  private static readonly ERROR_CODES = {
    NETWORK: 'NETWORK_ERROR',
    SERVICE: 'SERVICE_UNAVAILABLE',
    RATE_LIMIT: 'RATE_LIMIT_EXCEEDED',
    VALIDATION: 'VALIDATION_ERROR',
    UNKNOWN: 'UNKNOWN_ERROR'
  } as const;

  static async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = this.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.error(`Error in ${context} (attempt ${attempt}/${maxRetries}):`, error);
        
        if (this.isAbbyError(error) && !error.retry) {
          throw error; // Don't retry if explicitly marked as non-retryable
        }
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
          continue;
        }
      }
    }
    
    throw this.createError(
      `Failed after ${maxRetries} attempts: ${lastError?.message}`,
      this.ERROR_CODES.UNKNOWN,
      false,
      lastError
    );
  }

  static createError(
    message: string,
    code: string,
    retry = false,
    original?: unknown
  ): AbbyError {
    return {
      message: this.sanitizeErrorMessage(message),
      code,
      retry,
      original
    };
  }

  static sanitizeErrorMessage(message: string): string {
    return message
      .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi, '[EMAIL]')
      .replace(/\b\d{4}\b/g, '[ID]')
      .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[CARD]')
      .replace(/(api[_-]?key|token|secret)[=:][\s]*['"]?[\w\-\.]+['"]?/gi, '$1=[REDACTED]');
  }

  static isAbbyError(error: unknown): error is AbbyError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    );
  }

  static isNetworkError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (
        error.message.toLowerCase().includes('network') ||
        error.message.toLowerCase().includes('fetch') ||
        error.message.toLowerCase().includes('connection')
      )
    );
  }

  static isServiceUnavailable(error: unknown): boolean {
    return (
      error instanceof Error &&
      (
        error.message.includes('503') ||
        error.message.toLowerCase().includes('service unavailable') ||
        error.message.toLowerCase().includes('timeout')
      )
    );
  }

  static handleGlobalError(error: Error): void {
    // Log to error reporting service
    console.error('Global error:', error);
    
    // You might want to integrate with a service like Sentry here
    // if (typeof window !== 'undefined' && window.Sentry) {
    //   window.Sentry.captureException(error);
    // }
  }
}

// Global error handler setup
if (typeof window !== 'undefined') {
  window.onerror = (message, source, lineno, colno, error) => {
    ErrorHandlingService.handleGlobalError(error || new Error(String(message)));
    return false;
  };

  window.onunhandledrejection = (event) => {
    ErrorHandlingService.handleGlobalError(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason))
    );
  };
}

export const errorHandler = new ErrorHandlingService();
