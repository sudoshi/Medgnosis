import * as Sentry from '@sentry/node';
import type { ErrorEvent, EventHint } from '@sentry/node';
import { sanitizeForTelemetry } from './redaction.js';

let initializedDsn: string | null = null;

export interface SentryConfig {
  dsn: string;
  environment: string;
}

export function initSentry(config: SentryConfig): void {
  if (!config.dsn) {
    initializedDsn = null;
    return;
  }
  if (initializedDsn === config.dsn) return;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    beforeSend: sentryBeforeSend,
    tracesSampleRate: 0,
  });
  initializedDsn = config.dsn;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initializedDsn) return;
  Sentry.captureException(error, {
    extra: context ? sanitizeForTelemetry(context) : undefined,
  });
}

export function sentryBeforeSend(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  return sanitizeForTelemetry(event);
}
