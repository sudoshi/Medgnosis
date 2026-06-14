// =============================================================================
// Unit tests — Da Vinci DEQM Gaps-In-Care Bundle builder
// =============================================================================

import { describe, it, expect } from 'vitest';
import { buildGapsInCareBundle } from './careGaps.js';

describe('buildGapsInCareBundle', () => {
  it('emits a DEQM Gaps-In-Care Bundle with a DetectedIssue + MeasureReport per gap', () => {
    const b = buildGapsInCareBundle('Patient/1', [
      { measureCode: 'CMS122v13', gapStatus: 'open', prospective: false },
      { measureCode: 'CMS165v12', gapStatus: 'prospective', prospective: true },
    ]);
    const types = b.entry.map((e) => e.resource.resourceType);
    expect(types).toContain('Composition');
    expect(types.filter((t) => t === 'DetectedIssue')).toHaveLength(2);
    expect(types.filter((t) => t === 'MeasureReport')).toHaveLength(2);
  });

  it('is a document Bundle with the Composition first', () => {
    const b = buildGapsInCareBundle('Patient/1', [{ measureCode: 'CMS122v13', gapStatus: 'open', prospective: false }]);
    expect(b.type).toBe('document');
    expect(b.entry[0]?.resource.resourceType).toBe('Composition');
  });

  it('carries the DEQM gap-status codes (open-gap / closed-gap / prospective-gap)', () => {
    const b = buildGapsInCareBundle('Patient/1', [
      { measureCode: 'A', gapStatus: 'open', prospective: false },
      { measureCode: 'B', gapStatus: 'closed', prospective: false },
      { measureCode: 'C', gapStatus: 'prospective', prospective: true },
    ]);
    const issues = b.entry
      .map((e) => e.resource)
      .filter((r) => r.resourceType === 'DetectedIssue') as Array<Record<string, unknown>>;
    const statuses = issues.flatMap((di) =>
      ((di['modifierExtension'] ?? di['extension']) as Array<{ valueCodeableConcept?: { coding?: Array<{ code: string }> } }>)
        .flatMap((x) => x.valueCodeableConcept?.coding?.map((c) => c.code) ?? []),
    );
    expect(statuses).toContain('open-gap');
    expect(statuses).toContain('closed-gap');
    expect(statuses).toContain('prospective-gap');
  });

  it('individual MeasureReports reference the subject and the measure', () => {
    const b = buildGapsInCareBundle('Patient/42', [
      { measureCode: 'CMS122v13', measureUrl: 'https://madie.cms.gov/Measure/CMS122', gapStatus: 'open', prospective: false },
    ]);
    const mr = b.entry.map((e) => e.resource).find((r) => r.resourceType === 'MeasureReport') as Record<string, unknown>;
    expect(mr['type']).toBe('individual');
    expect((mr['subject'] as { reference: string }).reference).toBe('Patient/42');
    expect(mr['measure']).toBe('https://madie.cms.gov/Measure/CMS122');
  });

  it('DetectedIssue code identifies it as a care gap and references its MeasureReport', () => {
    const b = buildGapsInCareBundle('Patient/1', [{ measureCode: 'CMS122v13', gapStatus: 'open', prospective: false }]);
    const di = b.entry.map((e) => e.resource).find((r) => r.resourceType === 'DetectedIssue') as Record<string, unknown>;
    const codeText = JSON.stringify(di['code']);
    expect(codeText).toContain('CAREGAP'); // DEQM fixes DetectedIssue.code to v3-ActCode CAREGAP
    // links to the gap's MeasureReport
    expect(JSON.stringify(di['evidence'] ?? di['implicated'])).toContain('MeasureReport/');
  });
});
