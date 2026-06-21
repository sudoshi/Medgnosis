// =============================================================================
// Medgnosis API — External clinical integrations: public surface
// FUTURE DIRECTIVE. See docs/EXTERNAL-CLINICAL-INTEGRATIONS-DIRECTIVE.md.
// =============================================================================

import { integrationsConfig, integrationStatus } from './config.js';
import type { IntegrationDescriptor } from './types.js';

export * from './types.js';
export * from './config.js';
export { IntegrationNotImplementedError } from './notImplemented.js';
export { RisPacsClient } from './risPacs.js';
export { LisClient } from './lis.js';

/**
 * Directive-level registry of external clinical integrations and their state.
 * Safe to read at any time; intended for future System Health / admin surfaces.
 */
export function listIntegrations(): IntegrationDescriptor[] {
  return [
    {
      key: 'epic-fhir',
      title: 'Epic (EHR) via FHIR R4 / SMART / UDAP',
      status: integrationsConfig.epicFhir.enabled ? 'enabled' : 'planned',
      standards: ['FHIR R4', 'SMART on FHIR', 'UDAP', 'Bulk Data ($export)'],
      note: 'Core EHR/SMART/UDAP plumbing already exists under services/ehr; this entry tracks Epic-specific enablement.',
    },
    {
      key: 'lis',
      title: 'Laboratory Information System (LIS)',
      status: integrationStatus(integrationsConfig.lis.enabled),
      standards: ['FHIR R4 DiagnosticReport/Observation', 'HL7v2 ORU^R01', 'LOINC'],
      note: 'Stub only. See EXTERNAL-CLINICAL-INTEGRATIONS-DIRECTIVE.md.',
    },
    {
      key: 'ris-pacs',
      title: 'RIS / PACS (medical imaging)',
      status: integrationStatus(integrationsConfig.risPacs.enabled),
      standards: [
        'DICOMweb (QIDO/WADO/STOW)',
        'FHIR R4 ImagingStudy',
        'HL7v2 ORM/ORU',
        'DICOM C-FIND/C-MOVE',
      ],
      note: 'Stub only. Shared Orthanc PACS reachable at parthenon-orthanc:8042 on acropolis-backend.',
    },
  ];
}
