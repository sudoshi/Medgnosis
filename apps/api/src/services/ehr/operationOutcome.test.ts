import { describe, expect, it } from 'vitest';
import { normalizeOperationOutcome } from './operationOutcome.js';

describe('normalizeOperationOutcome', () => {
  it('normalizes issue diagnostics, code, severity, and status', () => {
    const normalized = normalizeOperationOutcome(
      {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            diagnostics: 'Missing patient parameter',
            expression: ['Observation.patient'],
          },
        ],
      },
      { status: 400, vendor: 'smart_generic' },
    );

    expect(normalized).toMatchObject({
      status: 400,
      vendor: 'smart_generic',
      classification: 'invalid_request',
      retryable: false,
      message: 'Missing patient parameter',
      issues: [
        {
          severity: 'error',
          code: 'invalid',
          diagnostics: 'Missing patient parameter',
          expression: ['Observation.patient'],
        },
      ],
    });
  });

  it('classifies rate limits as retryable', () => {
    const normalized = normalizeOperationOutcome(
      {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'throttled', diagnostics: 'Rate limit exceeded' }],
      },
      { status: 429 },
    );

    expect(normalized.classification).toBe('rate_limited');
    expect(normalized.retryable).toBe(true);
  });

  it('classifies Epic restricted-patient and merged-patient outcomes', () => {
    expect(
      normalizeOperationOutcome(
        {
          resourceType: 'OperationOutcome',
          issue: [{ code: 'forbidden', diagnostics: 'Break-the-glass required for restricted patient' }],
        },
        { status: 403, vendor: 'epic' },
      ).classification,
    ).toBe('restricted_patient');

    expect(
      normalizeOperationOutcome(
        {
          resourceType: 'OperationOutcome',
          issue: [{ code: 'conflict', diagnostics: 'The requested record is a merged patient' }],
        },
        { status: 409, vendor: 'epic' },
      ).classification,
    ).toBe('merged_patient');
  });

  it('uses fallback messages for non-OperationOutcome bodies', () => {
    const normalized = normalizeOperationOutcome({ error: 'nope' }, { status: 503 });

    expect(normalized).toMatchObject({
      classification: 'service_unavailable',
      retryable: true,
      message: 'FHIR request failed with HTTP 503',
      issues: [],
    });
  });
});
