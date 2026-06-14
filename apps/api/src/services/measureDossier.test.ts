// =============================================================================
// Unit tests — Measure dossier assembly
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql, mockValueSets, mockBridge } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockValueSets: vi.fn(),
  mockBridge: vi.fn(),
}));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./vsacService.js', () => ({
  getMeasureValueSets: mockValueSets,
  getMeasureBridgeStatus: mockBridge,
}));

import { getMeasureDossier } from './measureDossier.js';

beforeEach(() => vi.clearAllMocks());

describe('getMeasureDossier', () => {
  it('assembles binding + value sets + bridge status', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ecqm_id: 'CMS122FHIR',
        ecqm_version: 'CMS122v13',
        fhir_measure_url: 'https://madie.cms.gov/Measure/CMS122',
        fhir_library_url: 'https://madie.cms.gov/Library/CMS122',
        reporting_period_start: '2026-01-01',
        reporting_period_end: '2026-12-31',
        vsac_version_pins: { '2.16.840.1.113883.3.464.1003.103.12.1001': '2025-05' },
        status: 'active',
      },
    ]);
    mockBridge.mockResolvedValue({ measure_code: 'CMS122v13', version_drift: false, roles: {}, unclassified_count: 0 });
    mockValueSets.mockResolvedValue([{ value_set_oid: 'x', name: 'Diabetes', code_count: 10 }]);

    const d = await getMeasureDossier('CMS122v13');
    expect(d.measureCode).toBe('CMS122v13');
    expect(d.binding?.ecqm_version).toBe('CMS122v13');
    expect(d.components.fhirLibraryUrl).toBe('https://madie.cms.gov/Library/CMS122');
    expect(d.valueSets).toHaveLength(1);
    expect(d.bridgeStatus?.version_drift).toBe(false);
  });

  it('returns a null binding when no artifact is bound yet (value sets still served)', async () => {
    mockSql.mockResolvedValueOnce([]);
    mockBridge.mockResolvedValue(null);
    mockValueSets.mockResolvedValue([]);
    const d = await getMeasureDossier('CMS999v1');
    expect(d.binding).toBeNull();
    expect(d.components.fhirLibraryUrl).toBeNull();
    expect(d.valueSets).toEqual([]);
  });
});
