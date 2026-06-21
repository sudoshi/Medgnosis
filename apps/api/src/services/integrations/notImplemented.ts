// =============================================================================
// Medgnosis API — External clinical integrations: NotImplemented sentinel
// FUTURE DIRECTIVE. Thrown by integration stubs that are scaffolded but not
// yet implemented. See docs/EXTERNAL-CLINICAL-INTEGRATIONS-DIRECTIVE.md.
// =============================================================================

import type { IntegrationKey } from './types.js';

export class IntegrationNotImplementedError extends Error {
  readonly integration: IntegrationKey;
  readonly operation: string;
  readonly details: unknown;

  constructor(integration: IntegrationKey, operation: string, details?: unknown) {
    super(
      `Integration "${integration}" operation "${operation}" is not implemented yet (future directive).`,
    );
    this.name = 'IntegrationNotImplementedError';
    this.integration = integration;
    this.operation = operation;
    this.details = details;
  }
}
