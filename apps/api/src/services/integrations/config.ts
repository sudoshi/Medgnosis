// =============================================================================
// Medgnosis API — External clinical integrations: configuration
// FUTURE DIRECTIVE. All integrations are OFF by default; reading this config
// never touches the validated startup config and never crashes the app.
// Secrets are referenced by env-var NAME (passwordRef), never inlined here.
// =============================================================================

import type { IntegrationStatus } from './types.js';

function envStr(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value === 'true';
}

export interface EpicFhirIntegrationConfig {
  /**
   * Epic FHIR is delivered through the existing EHR/SMART/UDAP layer
   * (apps/api/src/services/ehr). This flag only tracks directive intent.
   */
  enabled: boolean;
}

export interface RisPacsIntegrationConfig {
  enabled: boolean;
  /** DICOMweb (QIDO/WADO/STOW) base URL. Defaults to the shared Orthanc PACS. */
  dicomWebUrl: string;
  username: string;
  /** Name of the env var holding the password — never the secret itself. */
  passwordRef: string;
}

export interface LisIntegrationConfig {
  enabled: boolean;
  /** FHIR base URL of the LIS, when it exposes DiagnosticReport/Observation. */
  fhirBaseUrl: string;
  /** HL7v2 ORU MLLP endpoint (host:port), when the LIS is v2-only. */
  hl7Endpoint: string;
}

export interface IntegrationsConfig {
  epicFhir: EpicFhirIntegrationConfig;
  risPacs: RisPacsIntegrationConfig;
  lis: LisIntegrationConfig;
}

export const integrationsConfig: IntegrationsConfig = {
  epicFhir: {
    enabled: envBool('EPIC_FHIR_ENABLED', false),
  },
  risPacs: {
    enabled: envBool('RIS_PACS_ENABLED', false),
    // The shared Orthanc PACS, reachable by DNS on the acropolis-backend network.
    dicomWebUrl: envStr('RIS_PACS_DICOMWEB_URL', 'http://parthenon-orthanc:8042/dicom-web'),
    username: envStr('RIS_PACS_USERNAME', 'parthenon'),
    passwordRef: envStr('RIS_PACS_PASSWORD_REF', 'RIS_PACS_PASSWORD'),
  },
  lis: {
    enabled: envBool('LIS_ENABLED', false),
    fhirBaseUrl: envStr('LIS_FHIR_BASE_URL', ''),
    hl7Endpoint: envStr('LIS_HL7_ENDPOINT', ''),
  },
};

/** Map an enabled flag to its directive status (planned until switched on). */
export function integrationStatus(enabled: boolean): IntegrationStatus {
  return enabled ? 'enabled' : 'planned';
}
