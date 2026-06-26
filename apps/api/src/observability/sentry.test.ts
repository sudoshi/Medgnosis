import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REDACTION_CENSOR } from './redaction.js';

const { mockCaptureException, mockSentryInit } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockSentryInit: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
  init: mockSentryInit,
}));

import { captureException, initSentry } from './sentry.js';

describe('Sentry observability wrapper', () => {
  beforeEach(() => {
    initSentry({ dsn: '', environment: 'test' });
    mockCaptureException.mockClear();
    mockSentryInit.mockClear();
  });

  it('initializes Sentry with PHI-safe beforeSend handling', () => {
    initSentry({ dsn: 'https://public@example.test/1', environment: 'test' });

    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@example.test/1',
        environment: 'test',
        beforeSend: expect.any(Function),
        tracesSampleRate: 0,
      }),
    );
  });

  it('sanitizes context before capturing exceptions', () => {
    const error = new Error('boom');
    initSentry({ dsn: 'https://public@example.test/2', environment: 'test' });

    captureException(error, {
      route: '/ehr/qdm/cql/load',
      patientId: 'patient-123',
      token: 'raw-token',
      nested: {
        patientRef: 'Patient/pat-123',
        counts: { failed: 1 },
      },
    });

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      extra: {
        route: '/ehr/qdm/cql/load',
        patientId: REDACTION_CENSOR,
        token: REDACTION_CENSOR,
        nested: {
          patientRef: REDACTION_CENSOR,
          counts: { failed: 1 },
        },
      },
    });
  });

  it('skips capture when Sentry is not configured', () => {
    captureException(new Error('boom'), { patientId: 'patient-123' });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
