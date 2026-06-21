// =============================================================================
// Medgnosis API — LIS (Laboratory Information System) integration client
// FUTURE DIRECTIVE — STUB. See docs/EXTERNAL-CLINICAL-INTEGRATIONS-DIRECTIVE.md.
//
// Targets FHIR R4 DiagnosticReport/Observation where the LIS exposes them,
// falling back to HL7v2 ORU^R01 over MLLP for v2-only systems. Methods throw
// IntegrationNotImplementedError until implemented.
// =============================================================================

import { integrationsConfig, type LisIntegrationConfig } from './config.js';
import { IntegrationNotImplementedError } from './notImplemented.js';
import type { LabResultRef, LisResultQuery } from './types.js';

export class LisClient {
  private readonly config: LisIntegrationConfig;

  constructor(config: LisIntegrationConfig = integrationsConfig.lis) {
    this.config = config;
  }

  /** Pull resulted lab observations for a patient (FHIR or mapped from ORU). */
  async fetchResults(query: LisResultQuery): Promise<LabResultRef[]> {
    throw new IntegrationNotImplementedError('lis', 'fetchResults', {
      query,
      fhirBaseUrl: this.config.fhirBaseUrl,
      hl7Endpoint: this.config.hl7Endpoint,
    });
  }
}
