import { describe, it, expect } from 'vitest';
import { buildSearchCoreQuery } from '../search-query.js';

describe('buildSearchCoreQuery', () => {
  it('builds a basic patient search query', () => {
    const result = buildSearchCoreQuery({
      searchTerm: 'john smith',
      docType: 'patient',
      providerId: 2816,
      limit: 25,
      offset: 0,
    });
    expect(result.q).toBe('john smith');
    expect(result.fq).toContain('doc_type:patient');
    expect(result.fq).toContain('provider_id:2816');
    expect(result.fq).toContain('active_ind:Y');
    expect(result.rows).toBe(25);
    expect(result.start).toBe(0);
  });

  it('builds care gap query with status and priority filters', () => {
    const result = buildSearchCoreQuery({
      searchTerm: 'diabetes',
      docType: 'care_gap',
      providerId: 2816,
      filters: { gap_status: 'open', gap_priority: 'high' },
      limit: 10,
      offset: 0,
    });
    expect(result.fq).toContain('doc_type:care_gap');
    expect(result.fq).toContain('gap_status:open');
    expect(result.fq).toContain('gap_priority:high');
  });

  it('builds global search (no doc_type filter)', () => {
    const result = buildSearchCoreQuery({
      searchTerm: 'john',
      limit: 20,
      offset: 0,
    });
    expect(result.q).toBe('john');
    expect(result.fq?.find((f) => f.startsWith('doc_type:'))).toBeUndefined();
  });

  it('omits provider filter for admin (no providerId)', () => {
    const result = buildSearchCoreQuery({
      searchTerm: 'smith',
      docType: 'patient',
      limit: 25,
      offset: 0,
    });
    expect(result.fq?.find((f) => f.startsWith('provider_id:'))).toBeUndefined();
  });

  it('keeps providerId zero as a scoped filter', () => {
    const result = buildSearchCoreQuery({
      searchTerm: 'smith',
      docType: 'patient',
      providerId: 0,
      limit: 25,
      offset: 0,
    });
    expect(result.fq).toContain('provider_id:0');
  });

  it('escapes Solr special characters in the search term', () => {
    const result = buildSearchCoreQuery({
      searchTerm: 'smith:(john) && active',
      docType: 'patient',
      limit: 25,
      offset: 0,
    });
    expect(result.q).toBe('smith\\:\\(john\\) \\&& active');
  });

  it('escapes allowed filter values and ignores unknown filter fields', () => {
    const result = buildSearchCoreQuery({
      searchTerm: '*:*',
      docType: 'care_gap',
      filters: {
        gap_status: 'open OR *:*',
        unknown_field: 'patient_id:*',
      },
      limit: 25,
      offset: 0,
    });
    expect(result.q).toBe('*:*');
    expect(result.fq).toContain('gap_status:open OR \\*\\:\\*');
    expect(result.fq?.some((f) => f.startsWith('unknown_field:'))).toBe(false);
  });

  it('returns correct sort for patients by name', () => {
    const result = buildSearchCoreQuery({
      searchTerm: 'john',
      docType: 'patient',
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 25,
      offset: 0,
    });
    expect(result.sort).toBe('last_name asc');
  });

  it('returns relevance sort by default', () => {
    const result = buildSearchCoreQuery({
      searchTerm: 'john',
      limit: 25,
      offset: 0,
    });
    expect(result.sort).toBe('score desc');
  });

  it('returns care gap sort by priority and due date', () => {
    const result = buildSearchCoreQuery({
      searchTerm: 'hba1c',
      docType: 'care_gap',
      limit: 25,
      offset: 0,
    });
    expect(result.sort).toBe('gap_priority asc, due_date asc');
  });
});
