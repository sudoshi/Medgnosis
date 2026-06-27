import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeasureGovernanceTab } from './MeasureGovernanceTab.js';
import type {
  DriftComment,
  MeasureDossier,
  MeasurePromotionConfig,
  SemanticDriftDetail,
  SemanticDriftWorklist,
} from './types.js';

const { mockApiGet, mockApiPost, mockApiPatch } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockApiPatch: vi.fn(),
}));

vi.mock('../../services/api.js', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
    patch: mockApiPatch,
  },
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

vi.mock('../../stores/ui.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

const CURRENT_USER_ID = '00000000-0000-4000-8000-000000000099';

vi.mock('../../stores/auth.js', () => ({
  useAuthStore: (selector: (state: { user: { id: string } | null }) => unknown) =>
    selector({ user: { id: CURRENT_USER_ID } }),
}));

const config: MeasurePromotionConfig = {
  measureCode: 'CMS122v12',
  promotionMode: 'cql_shadow',
  authoritativeSource: 'sql_bundle',
  tolerance: 0,
  evaluatorSource: 'qdm-cql',
  requireReconciliationAgreement: true,
  metadata: {
    latestShadowMaterialization: {
      sqlCounts: { denominator: 256, numerator: 58, exclusion: 0 },
      cqlCounts: { denominator: 17, numerator: 0, exclusion: 0 },
      deltas: { denominator: 239, numerator: 58, exclusion: 0 },
      evaluationScope: 'full_population',
      measureReportId: 9001,
      reconciliationRunId: 7003,
    },
  },
  latestReconciliationRun: {
    id: 7003,
    status: 'drift',
    agree: false,
    promotionEligible: false,
    evaluationScope: 'full_population',
    deltas: { denominator: 239, numerator: 58, exclusion: 0 },
    computedAt: '2026-06-18T12:00:00Z',
  },
};

const worklist: SemanticDriftWorklist = {
  measureCode: 'CMS122v12',
  dossierId: 42,
  sourceMeasureCode: 'DM-02',
  reconciliationRunId: 7003,
  measureReportId: 9001,
  period: { start: '2024-01-01', end: '2024-12-31' },
  semanticRelationship: 'surrogate_not_equivalent',
  generatedAt: '2026-06-18T13:15:00Z',
  filters: {
    denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
    numeratorDrift: null,
    exclusionDrift: null,
    patientId: null,
  },
  pagination: { limit: 25, offset: 0, total: 27, returned: 1, hasMore: false },
  classificationCounts: {
    denominator: {
      residual_cql_or_qicore_semantic_gap: 18,
      missing_cql_diabetes_value_set_evidence: 9,
    },
  },
  rows: [
    {
      dossierPatientId: 1001,
      patientId: 3,
      patientRef: 'Patient/3',
      patientKey: 10,
      sql: { denominator: true, numerator: true, exclusion: false },
      cql: { denominator: false, numerator: false, exclusion: false },
      localGapStatus: 'closed',
      denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
      numeratorDrift: 'local_gap_closed_without_qdm_hba1c_or_gmi_evidence',
      exclusionDrift: 'neither_exclusion',
      classification: {},
      evidenceSummary: {},
      cqlPopulationCounts: { 'initial-population': 0, denominator: 0 },
      hasSubjectReport: true,
      reviewBuckets: {
        localGap: 'closed',
        hba1c: 'missing',
        qdmEvidenceVolume: 'high',
        denominatorPrerequisites: 'age_diabetes_encounter_present',
        cqlSubjectPopulation: 'subject_population_zero',
      },
      reviewPriority: 100,
      reviewHint: 'Inspect QI-Core projection.',
      reviewState: 'in_review',
      assigneeUserId: CURRENT_USER_ID,
      reviewUpdatedAt: '2026-06-26T10:00:00Z',
      commentCount: 1,
      createdAt: '2026-06-18T13:20:00Z',
    },
  ],
};

const detail: SemanticDriftDetail = {
  measureCode: 'CMS122v12',
  dossierId: 42,
  dossierPatientId: 1001,
  sourceMeasureCode: 'DM-02',
  reconciliationRunId: 7003,
  measureReportId: 9001,
  period: { start: '2024-01-01', end: '2024-12-31' },
  semanticRelationship: 'surrogate_not_equivalent',
  generatedAt: '2026-06-18T13:15:00Z',
  worklistRow: worklist.rows[0],
  measureReportEvidence: {
    id: 90001,
    measureReportId: 9001,
    source: 'qdm-cql-smoke',
    period: { start: '2024-01-01', end: '2024-12-31' },
    flags: { denominator: false, numerator: false, exclusion: false },
    measureValue: null,
    computedAt: '2026-06-18T13:10:00Z',
    qdmEvidenceCount: 2,
    fhirSubjectReportPresent: true,
    qdmEvidence: [{ qdmEventId: 1 }],
    fhirSubjectReport: { resourceType: 'MeasureReport' },
  },
};

const dossier: MeasureDossier = {
  measureCode: 'CMS122v12',
  binding: {
    ecqm_id: 'CMS122',
    ecqm_version: 'CMS122v12',
    fhir_measure_url: 'http://example.org/Measure/CMS122',
    fhir_library_url: 'http://example.org/Library/CMS122',
    reporting_period_start: '2024-01-01',
    reporting_period_end: '2024-12-31',
    status: 'active',
  },
  valueSets: [
    {
      value_set_oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
      name: 'Diabetes',
      vsac_cms_id: 'CMS122v12',
      qdm_category: 'Diagnosis',
      code_count: 41,
    },
  ],
  components: {
    fhirLibraryUrl: 'http://example.org/Library/CMS122',
    fhirMeasureUrl: 'http://example.org/Measure/CMS122',
    elm: null,
    testDeckCoverage: null,
    measureReport: null,
  },
};

const comments: DriftComment[] = [
  {
    id: 5001,
    driftPatientId: 1001,
    authorUserId: CURRENT_USER_ID,
    body: 'Confirmed QI-Core projection drops the qualifying encounter.',
    createdAt: '2026-06-26T10:10:00Z',
  },
];

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data });
}

function wireGet(): void {
  mockApiGet.mockImplementation((path: string) => {
    if (path.includes('/comments')) return ok({ comments });
    if (path.endsWith('/dossier')) return ok(dossier);
    if (/semantic-drift-worklist\/\d+$/.test(path)) return ok({ detail });
    if (path.includes('semantic-drift-worklist')) return ok({ worklist });
    if (path.includes('measure-promotion-configs')) return ok({ configs: [config] });
    if (path.includes('qdm-bridge/status')) return ok({ status: [] });
    if (path.includes('qdm-bridge/issues')) return ok({ issues: [] });
    return ok({});
  });
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MeasureGovernanceTab />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  wireGet();
  mockApiPost.mockResolvedValue({ success: true, data: { comment: comments[0] } });
  mockApiPatch.mockResolvedValue({
    success: true,
    data: { review: { ...worklist.rows[0], reviewState: 'resolved' } },
  });
});

describe('MeasureGovernanceTab review workflow + drilldowns', () => {
  it('renders the SQL-vs-CQL count comparison drilldown from the config', async () => {
    renderTab();

    const panel = (await screen.findByText('SQL vs CQL Counts')).closest('.surface') as HTMLElement;
    expect(await within(panel).findByText('256')).toBeInTheDocument();
    expect(within(panel).getByText('17')).toBeInTheDocument();
    expect(within(panel).getByText('239')).toBeInTheDocument();
  });

  it('renders the drift summary control from classification counts', async () => {
    renderTab();

    const panel = (await screen.findByText('Drift Summary')).closest('.surface') as HTMLElement;
    expect(await within(panel).findByText('Residual CQL or QI-Core Semantic Gap')).toBeInTheDocument();
    expect(within(panel).getByText('18')).toBeInTheDocument();
  });

  it('renders the value-set drilldown from the dossier', async () => {
    renderTab();

    const panel = (await screen.findByText('Value Set Drilldown')).closest('.surface') as HTMLElement;
    expect(await within(panel).findByText('Diabetes')).toBeInTheDocument();
    expect(within(panel).getByText('41')).toBeInTheDocument();
  });

  it('renders the review workflow with state, assignee, and comment thread', async () => {
    renderTab();

    expect(await screen.findByText('Review Workflow')).toBeInTheDocument();
    expect(
      await screen.findByText('Confirmed QI-Core projection drops the qualifying encounter.'),
    ).toBeInTheDocument();
    // Both the assignee row and the comment author render the truncated id.
    expect(screen.getAllByText(`${CURRENT_USER_ID.slice(0, 8)}…`).length).toBeGreaterThanOrEqual(1);
    // The current in_review state appears in the review-state badge.
    expect(screen.getAllByText('In Review').length).toBeGreaterThanOrEqual(1);
  });

  it('posts a comment through the review workflow', async () => {
    const user = userEvent.setup();
    renderTab();

    const textarea = await screen.findByPlaceholderText('Add a reviewer comment (no PHI)...');
    await user.type(textarea, 'Needs CQL timing review');
    await user.click(screen.getByRole('button', { name: /add comment/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        expect.stringMatching(/semantic-drift-worklist\/1001\/comments$/),
        { body: 'Needs CQL timing review' },
      );
    });
  });

  it('claims the drift row for the current reviewer', async () => {
    const user = userEvent.setup();
    renderTab();

    await screen.findByText('Review Workflow');
    await user.click(screen.getByRole('button', { name: /claim/i }));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith(
        expect.stringMatching(/semantic-drift-worklist\/1001\/assignee$/),
        { assigneeUserId: CURRENT_USER_ID },
      );
    });
  });
});
