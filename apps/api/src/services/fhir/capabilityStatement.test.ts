// =============================================================================
// Unit tests - FHIR CapabilityStatement conformance (US Core / R4 structure)
// =============================================================================

import { describe, expect, it } from 'vitest';
import { buildCapabilityStatement } from './capabilityStatement.js';
import { US_CORE } from './profiles.js';

const BASE = 'https://medgnosis.acumenus.net/api/fhir';

interface CapResource {
  type: string;
  interaction?: Array<{ code: string }>;
  supportedProfile?: string[];
  searchParam?: Array<{ name: string; type: string }>;
}

describe('buildCapabilityStatement', () => {
  const cap = buildCapabilityStatement(BASE) as {
    resourceType: string;
    status: string;
    fhirVersion: string;
    format: string[];
    software?: { name: string };
    instantiates?: string[];
    rest: Array<{ mode: string; security?: { service?: unknown[] }; resource: CapResource[] }>;
  };
  const server = cap.rest[0]!;
  const byType = new Map(server.resource.map((r) => [r.type, r]));

  it('is a well-formed R4 server CapabilityStatement', () => {
    expect(cap.resourceType).toBe('CapabilityStatement');
    expect(cap.status).toBe('active');
    expect(cap.fhirVersion).toBe('4.0.1');
    expect(cap.format).toContain('json');
    expect(cap.software?.name).toBeTruthy();
    expect(server.mode).toBe('server');
  });

  it('instantiates the US Core server capability statement', () => {
    expect(cap.instantiates).toContain('http://hl7.org/fhir/us/core/CapabilityStatement/us-core-server');
  });

  it('declares a security service (token-based auth)', () => {
    expect(server.security?.service?.length ?? 0).toBeGreaterThan(0);
  });

  it('declares the US Core supportedProfile for each clinical resource', () => {
    expect(byType.get('Patient')?.supportedProfile).toContain(US_CORE.patient);
    expect(byType.get('Condition')?.supportedProfile).toContain(US_CORE.conditionProblems);
    expect(byType.get('Observation')?.supportedProfile).toContain(US_CORE.observationClinicalResult);
    expect(byType.get('MedicationRequest')?.supportedProfile).toContain(US_CORE.medicationRequest);
  });

  it('declares read+search on Patient and the patient search param on clinical resources', () => {
    const patient = byType.get('Patient')!;
    expect(patient.interaction?.map((i) => i.code).sort()).toEqual(['read', 'search-type']);
    for (const type of ['Condition', 'Observation', 'MedicationRequest']) {
      expect(byType.get(type)?.searchParam?.some((p) => p.name === 'patient')).toBe(true);
    }
  });

  it('exposes ValueSet terminology operations', () => {
    const valueSet = server.resource.find((r) => r.type === 'ValueSet') as
      | (CapResource & { operation?: Array<{ name: string }> })
      | undefined;
    const ops = valueSet?.operation?.map((o) => o.name) ?? [];
    expect(ops).toEqual(expect.arrayContaining(['expand', 'validate-code']));
  });
});
