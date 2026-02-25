import { ErrorHandlingService } from './ErrorHandlingService';

export class SecurityService {
  private static instance: SecurityService;
  private requestCounts: Map<string, number[]>;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds
  private readonly MAX_REQUESTS_PER_WINDOW = 30;
  private readonly MAX_MESSAGE_LENGTH = 1000;

  private constructor() {
    this.requestCounts = new Map();
    this.startCleanupInterval();
  }

  static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  private startCleanupInterval() {
    setInterval(() => this.cleanup(), 300000); // Clean up every 5 minutes
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.requestCounts.entries()) {
      const validTimestamps = timestamps.filter(
        ts => now - ts < this.RATE_LIMIT_WINDOW
      );
      if (validTimestamps.length === 0) {
        this.requestCounts.delete(key);
      } else {
        this.requestCounts.set(key, validTimestamps);
      }
    }
  }

  checkRateLimit(key = 'default'): boolean {
    const now = Date.now();
    const timestamps = this.requestCounts.get(key) || [];

    // Remove timestamps outside the window
    const validTimestamps = timestamps.filter(
      ts => now - ts < this.RATE_LIMIT_WINDOW
    );

    if (validTimestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
      throw ErrorHandlingService.createError(
        'Rate limit exceeded. Please try again later.',
        'RATE_LIMIT_EXCEEDED',
        false
      );
    }

    validTimestamps.push(now);
    this.requestCounts.set(key, validTimestamps);
    return true;
  }

  sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      throw ErrorHandlingService.createError(
        'Invalid input type',
        'VALIDATION_ERROR',
        false
      );
    }

    if (input.length > this.MAX_MESSAGE_LENGTH) {
      throw ErrorHandlingService.createError(
        'Message exceeds maximum length',
        'VALIDATION_ERROR',
        false
      );
    }

    // Remove potential XSS content
    let sanitized = input
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .replace(/data:/gi, '') // Remove data: protocol
      .trim();

    // Remove potential SQL injection patterns
    sanitized = sanitized
      .replace(/[\s]+(OR|AND)[\s]+[0-9]+[\s]*=[\s]*[0-9]+/gi, '')
      .replace(/[\s]+(OR|AND)[\s]+['"][\s]*=[\s]*['"]]/gi, '')
      .replace(/[;]+(DROP|DELETE|UPDATE|INSERT)[\s]+/gi, '');

    return sanitized;
  }

  validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return [
        'http:', 'https:'
      ].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  validateEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return emailRegex.test(email);
  }

  generateNonce(): string {
    return crypto.randomUUID();
  }

  hashString(input: string): string {
    // In a real implementation, use a proper hashing function
    // This is just a simple example
    return Array.from(input)
      .reduce((hash, char) => {
        const chr = char.charCodeAt(0);
        return ((hash << 5) - hash) + chr;
      }, 0)
      .toString(36);
  }
}

export const securityService = SecurityService.getInstance();
