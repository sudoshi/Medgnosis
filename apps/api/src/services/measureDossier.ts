// =============================================================================
// Medgnosis API — Measure dossier
// Assembles the per-measure transparency package: the FHIR artifact binding
// (migration 056), the VSAC value sets behind the measure with version pins,
// and bridge status. The published proof that a measure is defined, versioned,
// and traceable (Phase 1 Task 8 / Pillar "radical, shippable transparency").
// =============================================================================

import { sql } from '@medgnosis/db';
import {
  getMeasureValueSets,
  getMeasureBridgeStatus,
  type MeasureValueSet,
  type MeasureBridgeStatus,
} from './vsacService.js';

export interface MeasureArtifact {
  ecqm_id: string | null;
  ecqm_version: string | null;
  fhir_measure_url: string | null;
  fhir_library_url: string | null;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  vsac_version_pins: Record<string, string>;
  status: string;
}

export interface MeasureDossier {
  measureCode: string;
  binding: MeasureArtifact | null;
  bridgeStatus: MeasureBridgeStatus | null;
  valueSets: MeasureValueSet[];
  components: {
    fhirLibraryUrl: string | null;
    fhirMeasureUrl: string | null;
    elm: string | null;
    testDeckCoverage: string | null;
    measureReport: string | null;
  };
}

export async function getMeasureDossier(measureCode: string): Promise<MeasureDossier> {
  const bindings = await sql<MeasureArtifact[]>`
    SELECT ecqm_id, ecqm_version, fhir_measure_url, fhir_library_url,
           reporting_period_start::text AS reporting_period_start,
           reporting_period_end::text   AS reporting_period_end,
           vsac_version_pins, status
    FROM phm_edw.measure_artifact
    WHERE measure_code = ${measureCode}
    ORDER BY reporting_period_start DESC NULLS LAST
    LIMIT 1
  `;
  const binding = bindings[0] ?? null;

  const [bridgeStatus, valueSets] = await Promise.all([
    getMeasureBridgeStatus(measureCode),
    getMeasureValueSets(measureCode),
  ]);

  return {
    measureCode,
    binding,
    bridgeStatus,
    valueSets,
    components: {
      fhirLibraryUrl: binding?.fhir_library_url ?? null,
      fhirMeasureUrl: binding?.fhir_measure_url ?? null,
      elm: null, // shipped with the FHIR Library content; surfaced via the engine
      testDeckCoverage: null, // populated from CI test-deck results (scripts/cql-realmeasure-smoke.sh)
      measureReport: null, // latest computed report; surfaced once persisted
    },
  };
}
