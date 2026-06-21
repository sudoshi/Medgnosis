// =============================================================================
// Medgnosis API — RIS/PACS integration client (DICOMweb)
// FUTURE DIRECTIVE — STUB. See docs/EXTERNAL-CLINICAL-INTEGRATIONS-DIRECTIVE.md.
//
// The shared Orthanc PACS is already reachable on the acropolis-backend network
// at http://parthenon-orthanc:8042. This client will wrap its DICOMweb API
// (QIDO-RS / WADO-RS / STOW-RS) once RIS/PACS access is prioritized. Methods
// throw IntegrationNotImplementedError until then.
// =============================================================================

import { integrationsConfig, type RisPacsIntegrationConfig } from './config.js';
import { IntegrationNotImplementedError } from './notImplemented.js';
import type { DicomWebStudyQuery, ImagingStudyRef } from './types.js';

export class RisPacsClient {
  private readonly config: RisPacsIntegrationConfig;

  constructor(config: RisPacsIntegrationConfig = integrationsConfig.risPacs) {
    this.config = config;
  }

  /** QIDO-RS: search for imaging studies matching the query. */
  async queryStudies(query: DicomWebStudyQuery): Promise<ImagingStudyRef[]> {
    throw new IntegrationNotImplementedError('ris-pacs', 'queryStudies', {
      query,
      dicomWebUrl: this.config.dicomWebUrl,
    });
  }

  /** WADO-RS: retrieve the DICOM Part-10 instances for a study. */
  async retrieveStudy(studyInstanceUid: string): Promise<ArrayBuffer> {
    throw new IntegrationNotImplementedError('ris-pacs', 'retrieveStudy', {
      studyInstanceUid,
      dicomWebUrl: this.config.dicomWebUrl,
    });
  }
}
