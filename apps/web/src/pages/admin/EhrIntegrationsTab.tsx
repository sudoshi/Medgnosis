import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Play,
  PlugZap,
  RefreshCw,
  Save,
  XCircle,
} from 'lucide-react';
import { api, apiErrorMessage } from '../../services/api.js';
import { useToast } from '../../stores/ui.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { fmtDateTime } from './helpers.js';
import type {
  EhrBulkExportLevel,
  EhrBulkJob,
  EhrBulkSchedule,
  EhrCapabilitySnapshot,
  EhrClientAuthMethod,
  EhrClientRegistration,
  EhrClientType,
  EhrEnvironment,
  EhrIngestRun,
  EhrTenant,
  EhrTenantDetail,
  EhrTenantReadinessEvidence,
  EhrTenantSyncStatus,
  EhrVendor,
} from './types.js';

const VENDOR_OPTIONS: Array<{ value: EhrVendor; label: string }> = [
  { value: 'epic', label: 'Epic' },
  { value: 'oracle_cerner', label: 'Oracle Cerner' },
  { value: 'smart_generic', label: 'SMART Generic' },
  { value: 'hapi', label: 'HAPI' },
  { value: 'other', label: 'Other' },
];

const ENVIRONMENT_OPTIONS: EhrEnvironment[] = ['sandbox', 'staging', 'production'];
const MAX_BULK_SCHEDULE_INTERVAL_MINUTES = 525_600;

interface TenantListResponse {
  tenants: EhrTenant[];
  count: number;
}

interface EhrRegistrationResponse {
  tenant: EhrTenant;
  clients: EhrClientRegistration[];
}

interface EhrDiagnosticsResponse {
  tenant: EhrTenant;
  diagnostics: unknown;
  snapshot: EhrCapabilitySnapshot;
}

interface EhrBackendTokenCheckResponse {
  tenant: EhrTenant;
  backendTokenCheck: {
    status: 'succeeded';
    authMethod: string;
    tokenType: string;
    scope: string | null;
    scopeCount: number;
    expiresAt: string | null;
    tokenMetadataId: string | null;
  };
}

interface EhrIngestRunsResponse {
  tenant: EhrTenant;
  ingestRuns: EhrIngestRun[];
  latest: EhrIngestRun | null;
  count: number;
}

interface EhrBulkJobsResponse {
  tenant: EhrTenant;
  bulkJobs: EhrBulkJob[];
  latest: EhrBulkJob | null;
  count: number;
}

interface EhrBulkSchedulesResponse {
  tenant: EhrTenant;
  bulkSchedules: EhrBulkSchedule[];
  latest: EhrBulkSchedule | null;
  count: number;
}

interface EhrSyncStatusResponse {
  tenant: EhrTenant;
  syncStatus: EhrTenantSyncStatus;
}

interface EhrReadinessEvidenceResponse {
  tenant: EhrTenant;
  readinessEvidence: EhrTenantReadinessEvidence;
}

interface EhrBulkScheduleResponse {
  tenant: EhrTenant;
  bulkSchedule: EhrBulkSchedule;
}

interface EhrBulkExportResponse {
  tenant: EhrTenant;
  bulkExport: {
    enqueued: boolean;
    queueName: string;
    jobId?: string;
    reason?: string;
  };
}

interface EhrBulkImportResponse {
  tenant: EhrTenant;
  bulkImport: {
    enqueued: boolean;
    queueName: string;
    jobId?: string;
    reason?: string;
  };
}

interface BulkImportPayload {
  bulkJobId: string;
  maxResourcesPerFile?: number;
  resumeFailedOnly?: boolean;
}

interface EhrBulkCancelResponse {
  tenant: EhrTenant;
  bulkCancel: {
    job: EhrBulkJob;
    tokenMetadataId: string | null;
  };
}

interface EhrQdmReplayResponse {
  tenant: EhrTenant;
  ingestRunId: string;
  qdm: {
    resourcesSeen: number;
    resourcesNormalized: number;
    resourcesSkipped: number;
    resourcesFailed: number;
    eventsUpserted: number;
    errors: unknown[];
  };
}

interface FormState {
  apiBaseUrl: string;
  tenantName: string;
  vendor: EhrVendor;
  environment: EhrEnvironment;
  status: string;
  fhirBaseUrl: string;
  smartConfigUrl: string;
  smartClientId: string;
  smartAuthMethod: EhrClientAuthMethod;
  smartScopes: string;
  smartRedirectUris: string;
  smartLaunchUrl: string;
  backendClientId: string;
  backendAuthMethod: EhrClientAuthMethod;
  backendScopes: string;
  backendPrivateKeyRef: string;
  backendClientSecretRef: string;
  backendJwksUrl: string;
}

interface BulkExportFormState {
  exportLevel: EhrBulkExportLevel;
  resourceTypes: string;
  groupId: string;
  patientId: string;
  since: string;
  maxResourcesPerFile: string;
  scheduleIntervalMinutes: string;
}

interface UpsertTenantPayload {
  apiBaseUrl: string;
  tenant: {
    vendor: EhrVendor;
    name: string;
    environment: EhrEnvironment;
    fhirBaseUrl: string;
    smartConfigUrl?: string | null;
    status: string;
  };
  smartLaunch?: {
    clientId: string;
    authMethod: EhrClientAuthMethod;
    scopesRequested: string;
    scopesGranted: string;
    redirectUris?: string[];
    launchUrl?: string | null;
    enabled: boolean;
  };
  backendServices?: {
    clientId: string;
    authMethod: EhrClientAuthMethod;
    scopesRequested: string;
    scopesGranted: string;
    privateKeyRef?: string | null;
    clientSecretRef?: string | null;
    jwksUrl?: string | null;
    enabled: boolean;
  };
}

interface BulkExportPayload {
  exportLevel: EhrBulkExportLevel;
  resourceTypes: string[];
  groupId?: string;
  patientId?: string;
  since?: string;
  maxResourcesPerFile?: number;
}

interface BulkSchedulePayload extends BulkExportPayload {
  id?: string;
  enabled: boolean;
  intervalMinutes: number;
  sinceMode: 'last_success';
}

export function EhrIntegrationsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [vendorFilter, setVendorFilter] = useState<EhrVendor | 'all'>('all');
  const [environmentFilter, setEnvironmentFilter] = useState<EhrEnvironment | 'all'>('all');
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(() => defaultFormState());
  const [bulkForm, setBulkForm] = useState<BulkExportFormState>(() => defaultBulkExportFormState());
  const [bulkImportJobId, setBulkImportJobId] = useState<string | null>(null);
  const [bulkCancelJobId, setBulkCancelJobId] = useState<string | null>(null);
  const [bulkQdmReplayJobId, setBulkQdmReplayJobId] = useState<string | null>(null);
  const [selectedIngestRunId, setSelectedIngestRunId] = useState<string | null>(null);
  const [ingestQdmReplayRunId, setIngestQdmReplayRunId] = useState<string | null>(null);

  const tenantsQuery = useQuery({
    queryKey: ['ehr', 'tenants', vendorFilter, environmentFilter],
    queryFn: () => api.get<TenantListResponse>(`/ehr/admin/tenants${tenantFilterQuery(vendorFilter, environmentFilter)}`),
    staleTime: 30_000,
  });

  const tenantRows = tenantsQuery.data?.data?.tenants;
  const tenants = useMemo(() => tenantRows ?? [], [tenantRows]);

  useEffect(() => {
    if (selectedTenantId === null && tenants.length > 0) {
      setSelectedTenantId(tenants[0]!.id);
      setSelectedIngestRunId(null);
    }
  }, [selectedTenantId, tenants]);

  const detailQuery = useQuery({
    queryKey: ['ehr', 'tenant-detail', selectedTenantId],
    queryFn: () => api.get<EhrTenantDetail>(`/ehr/admin/tenants/${selectedTenantId}`),
    enabled: selectedTenantId !== null,
    staleTime: 15_000,
  });

  const ingestRunsQuery = useQuery({
    queryKey: ['ehr', 'tenant-ingest-runs', selectedTenantId],
    queryFn: () => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      return api.get<EhrIngestRunsResponse>(`/ehr/admin/tenants/${selectedTenantId}/ingest-runs?limit=50`);
    },
    enabled: selectedTenantId !== null,
    staleTime: 15_000,
  });

  const bulkJobsQuery = useQuery({
    queryKey: ['ehr', 'tenant-bulk-jobs', selectedTenantId],
    queryFn: () => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      return api.get<EhrBulkJobsResponse>(`/ehr/admin/tenants/${selectedTenantId}/bulk-jobs?limit=5`);
    },
    enabled: selectedTenantId !== null,
    staleTime: 15_000,
  });

  const bulkSchedulesQuery = useQuery({
    queryKey: ['ehr', 'tenant-bulk-schedules', selectedTenantId],
    queryFn: () => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      return api.get<EhrBulkSchedulesResponse>(`/ehr/admin/tenants/${selectedTenantId}/bulk-schedules`);
    },
    enabled: selectedTenantId !== null,
    staleTime: 15_000,
  });

  const syncStatusQuery = useQuery({
    queryKey: ['ehr', 'tenant-sync-status', selectedTenantId],
    queryFn: () => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      return api.get<EhrSyncStatusResponse>(`/ehr/admin/tenants/${selectedTenantId}/sync-status`);
    },
    enabled: selectedTenantId !== null,
    staleTime: 15_000,
  });

  const readinessEvidenceQuery = useQuery({
    queryKey: ['ehr', 'tenant-readiness-evidence', selectedTenantId],
    queryFn: () => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      return api.get<EhrReadinessEvidenceResponse>(`/ehr/admin/tenants/${selectedTenantId}/readiness-evidence`);
    },
    enabled: selectedTenantId !== null,
    staleTime: 15_000,
  });

  const detail = detailQuery.data?.data;
  const ingestRunRows = ingestRunsQuery.data?.data?.ingestRuns;
  const ingestRuns = useMemo(() => ingestRunRows ?? [], [ingestRunRows]);
  const latestIngestRun = ingestRunsQuery.data?.data?.latest ?? null;
  const bulkJobs = bulkJobsQuery.data?.data?.bulkJobs ?? [];
  const latestBulkJob = bulkJobsQuery.data?.data?.latest ?? null;
  const bulkSchedules = bulkSchedulesQuery.data?.data?.bulkSchedules ?? [];
  const latestBulkSchedule = bulkSchedulesQuery.data?.data?.latest ?? null;
  const syncStatus = syncStatusQuery.data?.data?.syncStatus ?? null;
  const readinessEvidence = readinessEvidenceQuery.data?.data?.readinessEvidence ?? null;
  const canStartBulkExport = isBulkExportFormValid(bulkForm);
  const canSaveBulkSchedule = canStartBulkExport && isBulkScheduleIntervalValid(bulkForm);
  const readinessBlocked = useMemo(
    () => detail?.readiness.clients.some((client) => client.status === 'blocked') ?? false,
    [detail],
  );

  useEffect(() => {
    if (!selectedIngestRunId && ingestRuns.length > 0) {
      setSelectedIngestRunId(ingestRuns[0]!.id);
    }
  }, [ingestRuns, selectedIngestRunId]);

  const upsertMutation = useMutation({
    mutationFn: () => api.post<EhrRegistrationResponse>('/ehr/admin/tenants', buildUpsertPayload(form)),
    onSuccess: (response) => {
      const tenantId = response.data?.tenant.id ?? null;
      toast.success('EHR tenant saved');
      if (tenantId !== null) {
        setSelectedTenantId(tenantId);
        setSelectedIngestRunId(null);
      }
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenants'] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-detail'] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-sync-status'] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-readiness-evidence'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save EHR tenant')),
  });

  const diagnosticsMutation = useMutation({
    mutationFn: (tenantId: number) => api.get<EhrDiagnosticsResponse>(`/ehr/admin/tenants/${tenantId}/diagnostics`),
    onSuccess: () => {
      toast.success('Diagnostics completed');
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-detail', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-readiness-evidence', selectedTenantId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Diagnostics failed')),
  });

  const backendTokenCheckMutation = useMutation({
    mutationFn: () => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      return api.post<EhrBackendTokenCheckResponse>(
        '/ehr/admin/tenants/' + selectedTenantId + '/backend-token-check',
        {},
      );
    },
    onSuccess: (response) => {
      const check = response.data?.backendTokenCheck;
      toast.success(
        check
          ? `Backend token check succeeded for ${formatCount(check.scopeCount)} scope(s)`
          : 'Backend token check succeeded',
      );
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-readiness-evidence', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-sync-status', selectedTenantId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Backend token check failed')),
  });

  const bulkExportMutation = useMutation({
    mutationFn: () => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      return api.post<EhrBulkExportResponse>(
        '/ehr/admin/tenants/' + selectedTenantId + '/bulk-exports',
        buildBulkExportPayload(bulkForm),
      );
    },
    onSuccess: (response) => {
      if (response.data?.bulkExport.enqueued) {
        toast.success('Bulk export queued');
      } else {
        toast.warning(`Bulk export not queued: ${response.data?.bulkExport.reason ?? 'queue unavailable'}`);
      }
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-bulk-jobs', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-sync-status', selectedTenantId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Bulk export queueing failed')),
  });

  const bulkScheduleMutation = useMutation({
    mutationFn: () => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      return api.post<EhrBulkScheduleResponse>(
        '/ehr/admin/tenants/' + selectedTenantId + '/bulk-schedules',
        buildBulkSchedulePayload(bulkForm, latestBulkSchedule?.id ?? null),
      );
    },
    onSuccess: () => {
      toast.success('Bulk schedule saved');
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-bulk-schedules', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-sync-status', selectedTenantId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Bulk schedule save failed')),
  });

  const bulkImportMutation = useMutation({
    mutationFn: (input: { job: EhrBulkJob; resumeFailedOnly?: boolean }) => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      const { job, resumeFailedOnly = false } = input;
      const payload: BulkImportPayload = { bulkJobId: job.id };
      const maxResourcesPerFile = Number.parseInt(bulkForm.maxResourcesPerFile.trim(), 10);
      if (Number.isFinite(maxResourcesPerFile) && maxResourcesPerFile > 0) {
        payload.maxResourcesPerFile = maxResourcesPerFile;
      }
      if (resumeFailedOnly) {
        payload.resumeFailedOnly = true;
      }
      return api.post<EhrBulkImportResponse>(
        '/ehr/admin/tenants/' + selectedTenantId + '/bulk-imports',
        payload,
      );
    },
    onSuccess: (response) => {
      if (response.data?.bulkImport.enqueued) {
        toast.success('Bulk import queued');
      } else {
        toast.warning(`Bulk import not queued: ${response.data?.bulkImport.reason ?? 'queue unavailable'}`);
      }
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-bulk-jobs', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-ingest-runs', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-sync-status', selectedTenantId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Bulk import queueing failed')),
    onSettled: () => setBulkImportJobId(null),
  });

  const bulkCancelMutation = useMutation({
    mutationFn: (job: EhrBulkJob) => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      return api.post<EhrBulkCancelResponse>(
        '/ehr/admin/tenants/' + selectedTenantId + '/bulk-jobs/' + job.id + '/cancel',
        {},
      );
    },
    onSuccess: () => {
      toast.success('Bulk export canceled');
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-bulk-jobs', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-sync-status', selectedTenantId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Bulk export cancellation failed')),
    onSettled: () => setBulkCancelJobId(null),
  });

  const bulkQdmReplayMutation = useMutation({
    mutationFn: (job: EhrBulkJob) => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      if (!job.importSummary.ingestRunId) throw new Error('Bulk job has no linked ingest run');
      const limit = Math.max(job.importSummary.resourcesStaged, 1);
      return api.post<EhrQdmReplayResponse>(
        '/ehr/admin/tenants/' + selectedTenantId + '/ingest-runs/' + job.importSummary.ingestRunId + '/qdm-normalization',
        { limit, sourceSystem: 'ehr-admin-bulk-qdm-replay' },
      );
    },
    onSuccess: (response) => {
      const qdm = response.data?.qdm;
      toast.success(
        qdm
          ? `QDM replay normalized ${formatCount(qdm.resourcesNormalized)} resource(s)`
          : 'QDM replay completed',
      );
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-bulk-jobs', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-ingest-runs', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-sync-status', selectedTenantId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'QDM replay failed')),
    onSettled: () => setBulkQdmReplayJobId(null),
  });

  const ingestQdmReplayMutation = useMutation({
    mutationFn: (run: EhrIngestRun) => {
      if (selectedTenantId === null) throw new Error('No EHR tenant selected');
      const limit = Math.max(run.resourcesStaged, 1);
      return api.post<EhrQdmReplayResponse>(
        '/ehr/admin/tenants/' + selectedTenantId + '/ingest-runs/' + run.id + '/qdm-normalization',
        { limit, sourceSystem: 'ehr-admin-ingest-run-qdm-replay' },
      );
    },
    onSuccess: (response) => {
      const qdm = response.data?.qdm;
      toast.success(
        qdm
          ? `QDM replay normalized ${formatCount(qdm.resourcesNormalized)} resource(s)`
          : 'QDM replay completed',
      );
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-ingest-runs', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-bulk-jobs', selectedTenantId] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-sync-status', selectedTenantId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'QDM replay failed')),
    onSettled: () => setIngestQdmReplayRunId(null),
  });

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? detail?.tenant ?? null;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-bright">EHR Integrations</h2>
          <p className="text-xs text-ghost mt-0.5">SMART, Backend Services, CDS Hooks, and capability readiness</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void tenantsQuery.refetch();
            if (selectedTenantId !== null) void ingestRunsQuery.refetch();
            if (selectedTenantId !== null) void bulkJobsQuery.refetch();
            if (selectedTenantId !== null) void bulkSchedulesQuery.refetch();
            if (selectedTenantId !== null) void syncStatusQuery.refetch();
            if (selectedTenantId !== null) void readinessEvidenceQuery.refetch();
          }}
          disabled={tenantsQuery.isFetching || ingestRunsQuery.isFetching || bulkJobsQuery.isFetching || bulkSchedulesQuery.isFetching || syncStatusQuery.isFetching || readinessEvidenceQuery.isFetching}
        >
          <RefreshCw className={tenantsQuery.isFetching || ingestRunsQuery.isFetching || bulkJobsQuery.isFetching || bulkSchedulesQuery.isFetching || syncStatusQuery.isFetching || readinessEvidenceQuery.isFetching ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)] gap-4">
        <section className="surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-xs font-semibold text-bright uppercase tracking-wider">Tenant Registry</h3>
            <div className="grid grid-cols-2 gap-2 sm:w-[360px]">
              <Select value={vendorFilter} onValueChange={(value) => setVendorFilter(value as EhrVendor | 'all')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vendors</SelectItem>
                  {VENDOR_OPTIONS.map((vendor) => (
                    <SelectItem key={vendor.value} value={vendor.value}>{vendor.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={environmentFilter} onValueChange={(value) => setEnvironmentFilter(value as EhrEnvironment | 'all')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All environments</SelectItem>
                  {ENVIRONMENT_OPTIONS.map((environment) => (
                    <SelectItem key={environment} value={environment}>{titleCase(environment)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tenantsQuery.isLoading ? (
            <p className="text-sm text-ghost py-8 text-center">Loading EHR tenants...</p>
          ) : tenants.length === 0 ? (
            <div className="py-10 text-center">
              <PlugZap size={22} className="mx-auto text-ghost mb-3" />
              <p className="text-sm text-bright">No EHR tenants registered</p>
              <p className="text-xs text-ghost mt-1">Submit the registration panel to create the first tenant.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow
                    key={tenant.id}
                    data-state={selectedTenantId === tenant.id ? 'selected' : undefined}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedTenantId(tenant.id);
                      setSelectedIngestRunId(null);
                    }}
                  >
                    <TableCell>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-bright truncate">{tenant.name}</p>
                        <p className="font-data text-[11px] text-ghost truncate">{tenant.fhirBaseUrl}</p>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="dim">{vendorLabel(tenant.vendor)}</Badge></TableCell>
                    <TableCell><span className="text-sm text-dim">{titleCase(tenant.environment)}</span></TableCell>
                    <TableCell><StatusPill status={tenant.status} /></TableCell>
                    <TableCell className="text-right">
                      <span className="font-data text-[11px] text-ghost">{fmtDateTime(tenant.updatedAt)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="surface p-5">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck size={15} className="text-[var(--primary)]" />
            <h3 className="text-xs font-semibold text-bright uppercase tracking-wider">Registration</h3>
          </div>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              upsertMutation.mutate();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={form.tenantName} onChange={(event) => updateForm(setForm, 'tenantName', event.target.value)} required />
              </Field>
              <Field label="API base URL">
                <Input value={form.apiBaseUrl} onChange={(event) => updateForm(setForm, 'apiBaseUrl', event.target.value)} required />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Vendor">
                <Select value={form.vendor} onValueChange={(value) => updateForm(setForm, 'vendor', value as EhrVendor)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VENDOR_OPTIONS.map((vendor) => (
                      <SelectItem key={vendor.value} value={vendor.value}>{vendor.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Environment">
                <Select value={form.environment} onValueChange={(value) => updateForm(setForm, 'environment', value as EhrEnvironment)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENVIRONMENT_OPTIONS.map((environment) => (
                      <SelectItem key={environment} value={environment}>{titleCase(environment)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(value) => updateForm(setForm, 'status', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="FHIR base URL">
              <Input
                type="url"
                value={form.fhirBaseUrl}
                onChange={(event) => updateForm(setForm, 'fhirBaseUrl', event.target.value)}
                placeholder="https://launch.smarthealthit.org/v/r4/fhir"
                required
              />
            </Field>
            <Field label="SMART configuration URL">
              <Input
                type="url"
                value={form.smartConfigUrl}
                onChange={(event) => updateForm(setForm, 'smartConfigUrl', event.target.value)}
                placeholder="Optional"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-3 pt-2">
              <Field label="SMART client ID">
                <Input value={form.smartClientId} onChange={(event) => updateForm(setForm, 'smartClientId', event.target.value)} required />
              </Field>
              <Field label="SMART auth">
                <Select value={form.smartAuthMethod} onValueChange={(value) => updateForm(setForm, 'smartAuthMethod', value as EhrClientAuthMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public_pkce">Public PKCE</SelectItem>
                    <SelectItem value="client_secret_basic">Secret basic</SelectItem>
                    <SelectItem value="client_secret_post">Secret post</SelectItem>
                    <SelectItem value="private_key_jwt">Private key JWT</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="SMART scopes">
              <Textarea
                value={form.smartScopes}
                onChange={(event) => updateForm(setForm, 'smartScopes', event.target.value)}
                rows={2}
                className="resize-none"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Redirect URIs">
                <Textarea
                  value={form.smartRedirectUris}
                  onChange={(event) => updateForm(setForm, 'smartRedirectUris', event.target.value)}
                  rows={2}
                  className="resize-none"
                  placeholder="Blank uses API default"
                />
              </Field>
              <Field label="Launch URL">
                <Input
                  value={form.smartLaunchUrl}
                  onChange={(event) => updateForm(setForm, 'smartLaunchUrl', event.target.value)}
                  placeholder="Blank uses API default"
                />
              </Field>
            </div>

            <div className="border-t border-edge/20 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px] gap-3">
                <Field label="Backend client ID">
                  <Input
                    value={form.backendClientId}
                    onChange={(event) => updateForm(setForm, 'backendClientId', event.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Backend auth">
                  <Select value={form.backendAuthMethod} onValueChange={(value) => updateForm(setForm, 'backendAuthMethod', value as EhrClientAuthMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private_key_jwt">Private key JWT</SelectItem>
                      <SelectItem value="client_secret_basic">Secret basic</SelectItem>
                      <SelectItem value="client_secret_post">Secret post</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Field label="Private key ref">
                  <Input
                    value={form.backendPrivateKeyRef}
                    onChange={(event) => updateForm(setForm, 'backendPrivateKeyRef', event.target.value)}
                    placeholder="env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=..."
                  />
                </Field>
                <Field label="Client secret ref">
                  <Input
                    value={form.backendClientSecretRef}
                    onChange={(event) => updateForm(setForm, 'backendClientSecretRef', event.target.value)}
                    placeholder="env:EHR_BACKEND_CLIENT_SECRET"
                  />
                </Field>
              </div>
              <Field label="Backend scopes">
                <Textarea
                  value={form.backendScopes}
                  onChange={(event) => updateForm(setForm, 'backendScopes', event.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </Field>
              <Field label="Backend JWKS URL">
                <Input
                  value={form.backendJwksUrl}
                  onChange={(event) => updateForm(setForm, 'backendJwksUrl', event.target.value)}
                  placeholder="Blank uses API default"
                />
              </Field>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm" disabled={upsertMutation.isPending}>
                <Save />
                {upsertMutation.isPending ? 'Saving...' : 'Save tenant'}
              </Button>
            </div>
          </form>
        </section>
      </div>

      <section className="surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h3 className="text-xs font-semibold text-bright uppercase tracking-wider">Readiness</h3>
            <p className="text-xs text-ghost mt-1">
              {selectedTenant ? `${selectedTenant.name} / tenant ${selectedTenant.id}` : 'No tenant selected'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {detail && (
              <Badge variant={readinessBlocked ? 'amber' : 'emerald'}>
                {readinessBlocked ? 'Blocked' : 'Ready'}
              </Badge>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => selectedTenantId !== null && diagnosticsMutation.mutate(selectedTenantId)}
              disabled={selectedTenantId === null || diagnosticsMutation.isPending}
            >
              <Activity className={diagnosticsMutation.isPending ? 'animate-spin' : ''} />
              Run diagnostics
            </Button>
          </div>
        </div>

        {detailQuery.isFetching && !detail ? (
          <p className="text-sm text-ghost py-8 text-center">Loading readiness...</p>
        ) : !detail ? (
          <p className="text-sm text-ghost py-8 text-center">Select a tenant to view readiness.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
              <ReadinessMetric label="Clients" value={detail.clientRegistrations.length} />
              <ReadinessMetric
                label="Blocked"
                value={detail.readiness.clients.filter((client) => client.status === 'blocked').length}
                tone={readinessBlocked ? 'amber' : 'emerald'}
              />
              <ReadinessMetric
                label="Last ingest"
                value={latestIngestRun ? fmtDateTime(latestIngestRun.startedAt) : 'None'}
                tone={latestIngestRun?.status === 'failed' ? 'amber' : latestIngestRun?.status === 'succeeded' ? 'emerald' : 'teal'}
              />
              <ReadinessMetric
                label="Last Bulk"
                value={latestBulkJob ? titleCase(latestBulkJob.status) : 'None'}
                tone={latestBulkJob?.status === 'failed' ? 'amber' : latestBulkJob?.status === 'completed' ? 'emerald' : 'teal'}
              />
            </div>

            <ReadinessEvidencePanel
              evidence={readinessEvidence}
              isFetching={readinessEvidenceQuery.isFetching}
              onRefresh={() => void readinessEvidenceQuery.refetch()}
              onCheckBackendToken={() => backendTokenCheckMutation.mutate()}
              isCheckingBackendToken={backendTokenCheckMutation.isPending}
            />

            <SyncStatusPanel
              status={syncStatus}
              isFetching={syncStatusQuery.isFetching}
              onRefresh={() => void syncStatusQuery.refetch()}
            />

            <IngestRunsPanel
              runs={ingestRuns}
              latest={latestIngestRun}
              selectedRunId={selectedIngestRunId}
              onSelectRun={setSelectedIngestRunId}
              onReplayQdm={(run) => {
                setIngestQdmReplayRunId(run.id);
                ingestQdmReplayMutation.mutate(run);
              }}
              replayingRunId={ingestQdmReplayRunId}
              isFetching={ingestRunsQuery.isFetching}
              onRefresh={() => void ingestRunsQuery.refetch()}
            />

            <BulkJobsPanel
              jobs={bulkJobs}
              latest={latestBulkJob}
              latestSchedule={latestBulkSchedule}
              scheduleCount={bulkSchedules.length}
              isFetching={bulkJobsQuery.isFetching || bulkSchedulesQuery.isFetching}
              onRefresh={() => {
                void bulkJobsQuery.refetch();
                void bulkSchedulesQuery.refetch();
              }}
              form={bulkForm}
              setForm={setBulkForm}
              onStart={() => bulkExportMutation.mutate()}
              isStarting={bulkExportMutation.isPending}
              canStart={canStartBulkExport}
              onSaveSchedule={() => bulkScheduleMutation.mutate()}
              isSavingSchedule={bulkScheduleMutation.isPending}
              canSaveSchedule={canSaveBulkSchedule}
              onImport={(job, resumeFailedOnly) => {
                setBulkImportJobId(job.id);
                bulkImportMutation.mutate({ job, resumeFailedOnly });
              }}
              importingJobId={bulkImportJobId}
              onReplayQdm={(job) => {
                setBulkQdmReplayJobId(job.id);
                bulkQdmReplayMutation.mutate(job);
              }}
              replayingQdmJobId={bulkQdmReplayJobId}
              onInspectIngestRun={(ingestRunId) => setSelectedIngestRunId(ingestRunId)}
              onCancel={(job) => {
                setBulkCancelJobId(job.id);
                bulkCancelMutation.mutate(job);
              }}
              cancelingJobId={bulkCancelJobId}
              disabled={selectedTenantId === null}
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Credentials</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Missing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.clientRegistrations.map((client) => {
                  const readiness = detail.readiness.clients.find((item) => item.clientSlot === client.clientSlot);
                  return (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-bright">{client.clientId}</p>
                          <p className="text-[11px] text-ghost">{clientTypeLabel(client.clientType)} / {client.clientSlot}</p>
                        </div>
                      </TableCell>
                      <TableCell><span className="font-data text-xs text-dim">{client.authMethod}</span></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <CredentialFlag label="secret" enabled={client.hasClientSecretRef} />
                          <CredentialFlag label="key" enabled={client.hasPrivateKeyRef} />
                          <CredentialFlag label="jwks" enabled={Boolean(client.jwksUrl)} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={readiness?.status === 'ready' ? 'emerald' : 'amber'}>
                          {readiness?.status ?? 'unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-ghost">
                          {readiness?.missing.length ? readiness.missing.join(', ') : 'None'}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {detail.clientRegistrations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-ghost">No client registrations saved</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <CapabilitySnapshot snapshot={detail.latestCapabilitySnapshot} />
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-dim mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const variant = status === 'active' ? 'emerald' : status === 'testing' ? 'info' : status === 'paused' ? 'amber' : 'dim';
  return <Badge variant={variant}>{status}</Badge>;
}

function CredentialFlag({ label, enabled }: { label: string; enabled: boolean }) {
  const Icon = enabled ? CheckCircle2 : XCircle;
  return (
    <span className={enabled ? 'inline-flex items-center gap-1 text-xs text-emerald' : 'inline-flex items-center gap-1 text-xs text-ghost'}>
      <Icon size={12} />
      {label}
    </span>
  );
}

function ReadinessMetric({
  label,
  value,
  tone = 'teal',
}: {
  label: string;
  value: string | number;
  tone?: 'teal' | 'amber' | 'emerald';
}) {
  const toneClass = tone === 'amber' ? 'text-amber' : tone === 'emerald' ? 'text-emerald' : 'text-[var(--primary)]';
  return (
    <div className="border border-edge/25 bg-s1/40 rounded-card p-4">
      <p className="text-xs text-ghost uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-data text-lg tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function ReadinessEvidencePanel({
  evidence,
  isFetching,
  onRefresh,
  onCheckBackendToken,
  isCheckingBackendToken,
}: {
  evidence: EhrTenantReadinessEvidence | null;
  isFetching: boolean;
  onRefresh: () => void;
  onCheckBackendToken: () => void;
  isCheckingBackendToken: boolean;
}) {
  const issues = evidence?.issues ?? [];
  const issueTone = highestIssueSeverity(issues);
  const discovery = evidence?.discovery;
  const capability = evidence?.capability;
  const backend = evidence?.backendServices;
  const launch = evidence?.launch;
  const bulk = evidence?.bulkDiagnostics;

  return (
    <div className="border border-edge/25 bg-s1/40 rounded-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
        <div>
          <p className="text-xs text-ghost uppercase tracking-wider mb-1">Tenant readiness evidence</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={issueTone === 'critical' ? 'crimson' : issueTone === 'warning' ? 'amber' : 'emerald'}>
              {evidence ? syncStatusLabel(issueTone, issues.length) : 'No evidence'}
            </Badge>
            {evidence && <span className="font-data text-xs text-ghost">{fmtDateTime(evidence.generatedAt)}</span>}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'animate-spin' : ''} />
          Refresh evidence
        </Button>
      </div>

      {!evidence ? (
        <p className="text-sm text-ghost py-8 text-center">Select a tenant to load readiness evidence.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-12 gap-3">
            <SnapshotItem
              label="SMART"
              value={discovery?.smartOk ? 'OK' : 'Issue'}
              tone={discovery?.smartOk ? 'emerald' : 'amber'}
            />
            <SnapshotItem
              label="Metadata"
              value={discovery?.capabilityOk ? 'OK' : 'Issue'}
              tone={discovery?.capabilityOk ? 'emerald' : 'amber'}
            />
            <SnapshotItem
              label="Issuer"
              value={discovery?.issuerMatches === false ? 'Drift' : discovery?.issuerMatches === true ? 'Match' : 'Unknown'}
              tone={discovery?.issuerMatches === false ? 'amber' : discovery?.issuerMatches === true ? 'emerald' : 'dim'}
            />
            <SnapshotItem label="Resources" value={formatCount(discovery?.resourceCount ?? 0)} />
            <SnapshotItem
              label="Bulk coverage"
              value={formatPercent(capability?.bulkResourceCoverageRatio ?? null)}
              tone={(capability?.missingRequiredBulkResourceTypes.length ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <SnapshotItem
              label="Backend"
              value={backendCredentialLabel(backend?.credentialStatus)}
              tone={backend?.credentialStatus === 'ready' ? 'emerald' : backend?.credentialStatus === 'incomplete' ? 'amber' : 'dim'}
            />
            <SnapshotItem
              label="Token"
              value={backend?.latestTokenIssuedAt ? 'Seen' : backend?.readyForTokenExchange ? 'Ready' : 'Blocked'}
              tone={backend?.latestTokenExpired ? 'amber' : backend?.latestTokenIssuedAt ? 'emerald' : backend?.readyForTokenExchange ? 'emerald' : 'amber'}
            />
            <SnapshotItem label="Launch 24h" value={formatCount(launch?.launchesStarted24h ?? 0)} />
            <SnapshotItem
              label="Callbacks"
              value={formatCount(launch?.callbacksSucceeded24h ?? 0)}
              tone={(launch?.callbacksSucceeded24h ?? 0) > 0 ? 'emerald' : 'dim'}
            />
            <SnapshotItem
              label="Failures"
              value={formatCount((launch?.launchesDenied24h ?? 0) + (launch?.callbacksFailed24h ?? 0))}
              tone={(launch?.launchesDenied24h ?? 0) + (launch?.callbacksFailed24h ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <SnapshotItem
              label="Pending"
              value={formatCount(launch?.activePendingLaunches ?? 0)}
              tone={(launch?.activePendingLaunches ?? 0) > 0 ? 'amber' : 'dim'}
            />
            <SnapshotItem
              label="Bulk ready"
              value={bulk?.readyForManualKickoff ? 'Ready' : 'Blocked'}
              tone={bulk?.readyForManualKickoff ? 'emerald' : 'amber'}
            />
            <SnapshotItem
              label="Bulk fails"
              value={formatCount(bulk?.failedJobs24h ?? 0)}
              tone={(bulk?.failedJobs24h ?? 0) > 0 ? 'amber' : 'emerald'}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
            <div className="border border-edge/20 rounded-card p-3">
              <p className="text-xs text-ghost uppercase tracking-wider mb-3">Discovery</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EvidenceLine label="Captured" value={discovery?.capturedAt ? fmtDateTime(discovery.capturedAt) : 'None'} />
                <EvidenceLine label="FHIR" value={discovery?.fhirVersion ?? 'Unknown'} />
                <EvidenceLine label="Registered issuer" value={discovery?.registeredIssuer ?? 'None'} />
                <EvidenceLine label="Discovered issuer" value={discovery?.discoveredIssuer ?? 'None'} />
                <EvidenceLine label="Previous snapshot" value={capability?.previousCapturedAt ? fmtDateTime(capability.previousCapturedAt) : 'None'} />
                <EvidenceLine label="Added" value={formatResourceList(capability?.addedResourceTypes ?? [])} />
                <EvidenceLine label="Removed" value={formatResourceList(capability?.removedResourceTypes ?? [])} />
                <EvidenceLine label="Changed" value={formatCount(capability?.changedResourceCount ?? 0)} />
                <EvidenceLine label="Required Bulk" value={formatResourceList(capability?.requiredBulkResourceTypes ?? [])} />
                <EvidenceLine label="Missing Bulk" value={formatResourceList(capability?.missingRequiredBulkResourceTypes ?? [])} />
              </div>
            </div>
            <div className="border border-edge/20 rounded-card p-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs text-ghost uppercase tracking-wider">Backend</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onCheckBackendToken}
                  disabled={!backend?.readyForTokenExchange || isCheckingBackendToken}
                >
                  <RefreshCw className={isCheckingBackendToken ? 'animate-spin' : ''} />
                  Token
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EvidenceLine label="Clients" value={formatCount(backend?.enabledClientCount ?? 0)} />
                <EvidenceLine label="Auth" value={formatBackendAuthMethods(backend?.authMethods ?? [])} />
                <EvidenceLine label="Credential" value={backendCredentialLabel(backend?.credentialStatus)} />
                <EvidenceLine label="Scopes" value={`${formatCount(backend?.scopesRequestedCount ?? 0)}/${formatCount(backend?.scopesGrantedCount ?? 0)}`} />
                <EvidenceLine label="Last token" value={backend?.latestTokenIssuedAt ? fmtDateTime(backend.latestTokenIssuedAt) : 'None'} />
                <EvidenceLine label="Expires" value={backend?.latestTokenExpiresAt ? fmtDateTime(backend.latestTokenExpiresAt) : 'None'} />
                <EvidenceLine label="Token 24h" value={formatCount(backend?.tokenRequests24h ?? 0)} />
                <EvidenceLine label="JWKS" value={backend?.hasJwksUrl ? 'Configured' : 'None'} />
              </div>
            </div>
            <div className="border border-edge/20 rounded-card p-3">
              <p className="text-xs text-ghost uppercase tracking-wider mb-3">Launch</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EvidenceLine label="Started" value={launch?.latestLaunchStartedAt ? fmtDateTime(launch.latestLaunchStartedAt) : 'None'} />
                <EvidenceLine label="Callback" value={launch?.latestCallbackSucceededAt ? fmtDateTime(launch.latestCallbackSucceededAt) : 'None'} />
                <EvidenceLine label="Handoff" value={launch?.latestHandoffCompletedAt ? fmtDateTime(launch.latestHandoffCompletedAt) : 'None'} />
                <EvidenceLine label="Expired pending" value={formatCount(launch?.expiredPendingLaunches ?? 0)} />
              </div>
            </div>
            <div className="border border-edge/20 rounded-card p-3">
              <p className="text-xs text-ghost uppercase tracking-wider mb-3">Bulk</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EvidenceLine label="Active" value={formatCount(bulk?.activeJobs ?? 0)} />
                <EvidenceLine label="Failed 24h" value={formatCount(bulk?.failedJobs24h ?? 0)} />
                <EvidenceLine label="Completed 24h" value={formatCount(bulk?.completedJobs24h ?? 0)} />
                <EvidenceLine label="Schedules" value={formatCount(bulk?.enabledScheduleCount ?? 0)} />
                <EvidenceLine label="Next" value={bulk?.nextScheduledAt ? fmtDateTime(bulk.nextScheduledAt) : 'None'} />
                <EvidenceLine label="Last complete" value={bulk?.latestCompletedAt ? fmtDateTime(bulk.latestCompletedAt) : 'None'} />
              </div>
            </div>
          </div>

          {issues.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {issues.slice(0, 6).map((issue) => (
                <Badge key={issue.code} variant={issueVariant(issue.severity)}>
                  {issue.code.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-ghost uppercase tracking-wider mb-1">{label}</p>
      <p className="font-data text-xs text-dim truncate">{value}</p>
    </div>
  );
}

function SyncStatusPanel({
  status,
  isFetching,
  onRefresh,
}: {
  status: EhrTenantSyncStatus | null;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const crosswalk = status?.crosswalk;
  const bulkWorker = status?.bulkWorker;
  const patientSync = status?.patientSync;
  const resources = status?.resources ?? [];
  const patientResources = status?.patientResources ?? [];
  const conflictTargets = status?.conflictTargets ?? [];
  const stalePatientResources = status?.stalePatientResources ?? [];
  const visibleIssues = status?.issues.slice(0, 5) ?? [];
  const issueTone = highestIssueSeverity(status?.issues ?? []);

  return (
    <div className="border border-edge/25 bg-s1/40 rounded-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className={issueTone === 'critical' ? 'text-crimson' : issueTone === 'warning' ? 'text-amber' : 'text-[var(--primary)]'} />
            <p className="text-xs text-ghost uppercase tracking-wider">Sync status</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={issueTone === 'critical' ? 'crimson' : issueTone === 'warning' ? 'amber' : 'emerald'}>
              {status ? syncStatusLabel(issueTone, status.issues.length) : 'No status'}
            </Badge>
            {status && <span className="font-data text-xs text-ghost">{fmtDateTime(status.generatedAt)}</span>}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'animate-spin' : ''} />
          Refresh status
        </Button>
      </div>

      {!status ? (
        <p className="text-sm text-ghost py-8 text-center">Select a tenant to load sync status.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-12 gap-3">
            <SnapshotItem label="Resources" value={formatCount(crosswalk?.totalResources ?? 0)} />
            <SnapshotItem label="Patients" value={formatCount(crosswalk?.patientCrosswalks ?? 0)} />
            <SnapshotItem label="Tracked patients" value={formatCount(patientSync?.totalPatients ?? 0)} />
            <SnapshotItem
              label="Stale patients"
              value={formatCount(patientSync?.stalePatients ?? 0)}
              tone={(patientSync?.stalePatients ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <SnapshotItem
              label="Mapped"
              value={formatCount(crosswalk?.localTargetResources ?? 0)}
              tone={(crosswalk?.localTargetResources ?? 0) > 0 ? 'emerald' : 'amber'}
            />
            <SnapshotItem
              label="Unmapped"
              value={formatCount(crosswalk?.unmappedLocalResources ?? 0)}
              tone={(crosswalk?.unmappedLocalResources ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <SnapshotItem
              label="Patient gaps"
              value={formatCount(crosswalk?.missingPatientResources ?? 0)}
              tone={(crosswalk?.missingPatientResources ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <SnapshotItem
              label="Collisions"
              value={formatCount(crosswalk?.collisionTargets ?? 0)}
              tone={(crosswalk?.collisionTargets ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <SnapshotItem
              label="Last seen"
              value={status.lastSeenAt ? fmtDateTime(status.lastSeenAt) : 'None'}
              tone={status.lastSeenAt ? 'emerald' : 'amber'}
            />
            <SnapshotItem
              label="Patient latest"
              value={patientSync?.lastPatientSeenAt ? fmtDateTime(patientSync.lastPatientSeenAt) : 'None'}
              tone={patientSync?.lastPatientSeenAt ? 'emerald' : 'amber'}
            />
            <SnapshotItem
              label="Worker failures"
              value={formatCount(bulkWorker?.failures24h ?? 0)}
              tone={(bulkWorker?.failures24h ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <SnapshotItem
              label="Overdue polls"
              value={formatCount(bulkWorker?.activeOverdueJobs ?? 0)}
              tone={(bulkWorker?.activeOverdueJobs ?? 0) > 0 ? 'amber' : 'emerald'}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead>Crosswalk</TableHead>
                <TableHead>FHIR sync</TableHead>
                <TableHead>Bulk import</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead className="text-right">Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((resource) => (
                <TableRow key={resource.resourceType}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-bright">{resource.resourceType}</p>
                      <p className="font-data text-[11px] text-ghost">{formatCount(resource.totalResources)} source rows</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-data text-xs text-dim tabular-nums">
                      {formatCount(resource.localTargetResources)}/{formatCount(resource.totalResources)} mapped
                    </span>
                    {(resource.unmappedLocalResources > 0 || resource.missingPatientResources > 0) && (
                      <p className="text-[11px] text-amber">
                        {formatCount(resource.unmappedLocalResources)} unmapped / {formatCount(resource.missingPatientResources)} patient gaps
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-data text-xs text-dim tabular-nums">
                        {formatCount(resource.ingestResourcesStaged)}/{formatCount(resource.ingestResourcesReceived)} staged
                      </p>
                      <p className="text-[11px] text-ghost">{resource.lastIngestSucceededAt ? fmtDateTime(resource.lastIngestSucceededAt) : 'No success'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-data text-xs text-dim tabular-nums">
                        {formatCount(resource.bulkResourcesStaged)}/{formatCount(resource.bulkRowsRead)} staged
                      </p>
                      <p className="text-[11px] text-ghost">{resource.lastBulkImportSucceededAt ? fmtDateTime(resource.lastBulkImportSucceededAt) : 'No import'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ResourceIssueBadges resource={resource} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-data text-[11px] text-ghost">{resource.lastSeenAt ? fmtDateTime(resource.lastSeenAt) : '-'}</span>
                  </TableCell>
                </TableRow>
              ))}
              {resources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-ghost">No sync resources found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-bright">Patient resource rollups</h3>
              <span className="font-data text-[11px] text-ghost">
                {formatCount(patientResources.length)} of {formatCount(patientSync?.totalPatients ?? 0)}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>FHIR Patient</TableHead>
                  <TableHead>Resources</TableHead>
                  <TableHead>Crosswalk</TableHead>
                  <TableHead>Latest</TableHead>
                  <TableHead className="text-right">Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patientResources.map((patient) => (
                  <TableRow key={patient.localPatientId}>
                    <TableCell>
                      <span className="font-data text-xs text-bright tabular-nums">{patient.localPatientId}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-data text-[11px] text-ghost break-all">{patient.patientResourceId ?? '-'}</span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-data text-xs text-dim tabular-nums">{formatCount(patient.totalResources)} rows</p>
                        <p className="text-[11px] text-ghost">{formatCount(patient.resourceTypes)} types</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-data text-xs text-dim tabular-nums">
                          {formatCount(patient.localTargetResources)}/{formatCount(patient.totalResources)} mapped
                        </p>
                        {patient.staleResources > 0 && (
                          <Badge variant="amber">{formatCount(patient.staleResources)} stale</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-dim">{patient.latestResourceType ?? '-'}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-data text-[11px] text-ghost">{patient.lastSeenAt ? fmtDateTime(patient.lastSeenAt) : '-'}</span>
                    </TableCell>
                  </TableRow>
                ))}
                {patientResources.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-ghost">No patient resource rollups found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-bright">Conflict drilldowns</h3>
                <span className="font-data text-[11px] text-ghost">{formatCount(conflictTargets.length)} targets</span>
              </div>
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Local target</TableHead>
                    <TableHead>Source resources</TableHead>
                    <TableHead>Patients</TableHead>
                    <TableHead className="text-right">Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conflictTargets.map((target) => (
                    <TableRow key={`${target.resourceType}:${target.localTable}:${target.localId}`}>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium text-bright">{target.resourceType}</p>
                          <p className="font-data text-[11px] text-ghost break-all">
                            {target.localTable}:{target.localId}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-data text-xs text-dim tabular-nums">{formatCount(target.sourceCount)} sources</p>
                          <p className="font-data text-[11px] text-ghost break-all">
                            {target.sourceResourceIds.length > 0 ? target.sourceResourceIds.join(', ') : '-'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-data text-xs text-dim tabular-nums">{formatCount(target.patientCount)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-data text-[11px] text-ghost">{target.lastSeenAt ? fmtDateTime(target.lastSeenAt) : '-'}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {conflictTargets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-ghost">No crosswalk conflicts found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-bright">Stale resource drilldowns</h3>
                <span className="font-data text-[11px] text-ghost">{formatCount(stalePatientResources.length)} groups</span>
              </div>
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Stale</TableHead>
                    <TableHead className="text-right">Window</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stalePatientResources.map((resource) => (
                    <TableRow key={`${resource.localPatientId}:${resource.resourceType}:${resource.oldestSeenAt ?? 'none'}`}>
                      <TableCell>
                        <div>
                          <p className="font-data text-xs text-bright tabular-nums">{resource.localPatientId}</p>
                          <p className="font-data text-[11px] text-ghost break-all">{resource.patientResourceId ?? '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-dim">{resource.resourceType}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="amber">{formatCount(resource.staleResources)} stale</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>
                          <p className="font-data text-[11px] text-ghost">{resource.oldestSeenAt ? fmtDateTime(resource.oldestSeenAt) : '-'}</p>
                          <p className="font-data text-[11px] text-ghost">{resource.latestSeenAt ? fmtDateTime(resource.latestSeenAt) : '-'}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {stalePatientResources.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-ghost">No stale patient resources found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </section>
          </div>

          {visibleIssues.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {visibleIssues.map((issue) => (
                <div key={`${issue.code}:${issue.resourceType ?? 'tenant'}:${issue.count ?? 'n'}`} className="border border-edge/20 rounded-card px-3 py-2">
                  <div className="flex items-start gap-2">
                    <Badge variant={issueVariant(issue.severity)} className="shrink-0">{titleCase(issue.severity)}</Badge>
                    <div className="min-w-0">
                      <p className="text-xs text-bright">{issue.message}</p>
                      <p className="text-[11px] text-dim mt-0.5">{issue.recommendedAction}</p>
                      <p className="font-data text-[11px] text-ghost mt-0.5">
                        {issue.source} / {issue.resourceType ?? 'tenant'} / {issue.code}
                        {issue.drilldownAvailable ? ' / drilldown' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResourceIssueBadges({ resource }: { resource: EhrTenantSyncStatus['resources'][number] }) {
  const issues: Array<{ label: string; variant: 'amber' | 'crimson' | 'emerald' | 'dim' }> = [];
  if (resource.collisionTargets > 0) issues.push({ label: `${formatCount(resource.collisionTargets)} collisions`, variant: 'crimson' });
  if (resource.unmappedLocalResources > 0) issues.push({ label: `${formatCount(resource.unmappedLocalResources)} unmapped`, variant: 'amber' });
  if (resource.missingPatientResources > 0) issues.push({ label: `${formatCount(resource.missingPatientResources)} patient`, variant: 'amber' });
  if (resource.staleResources > 0) issues.push({ label: `${formatCount(resource.staleResources)} stale`, variant: 'amber' });
  if (resource.bulkFailedFileCount > 0 || resource.bulkErrorCount > 0) issues.push({ label: `${formatCount(resource.bulkErrorCount)} bulk errors`, variant: 'amber' });
  if (issues.length === 0) issues.push({ label: 'Clear', variant: 'emerald' });

  return (
    <div className="flex flex-wrap gap-1.5">
      {issues.map((issue) => (
        <Badge key={issue.label} variant={issue.variant}>{issue.label}</Badge>
      ))}
    </div>
  );
}

function IngestRunsPanel({
  runs,
  latest,
  selectedRunId,
  onSelectRun,
  onReplayQdm,
  replayingRunId,
  isFetching,
  onRefresh,
}: {
  runs: EhrIngestRun[];
  latest: EhrIngestRun | null;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onReplayQdm: (run: EhrIngestRun) => void;
  replayingRunId: string | null;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const received = latest?.resourcesReceived ?? 0;
  const staged = latest?.resourcesStaged ?? 0;
  const updated = latest?.resourcesUpdated ?? 0;
  const selectedFromRows = selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? null : null;
  const selected = selectedFromRows ?? (selectedRunId ? null : latest ?? runs[0] ?? null);
  const selectedSummary = selected?.operationalSummary ?? null;
  const missingSelectedRunId = selectedRunId !== null && selectedFromRows === null;

  return (
    <div className="border border-edge/25 bg-s1/40 rounded-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <p className="text-xs text-ghost uppercase tracking-wider mb-1">Patient sync</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={latest ? runStatusVariant(latest.status) : 'dim'}>
              {latest ? titleCase(latest.status) : 'No runs'}
            </Badge>
            {latest && <span className="font-data text-xs text-ghost">{shortId(latest.id)}</span>}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'animate-spin' : ''} />
          Sync status
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <SnapshotItem label="Received" value={received} />
        <SnapshotItem label="Staged" value={staged} />
        <SnapshotItem label="Updated" value={updated} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>QDM</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Started</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const summary = run.operationalSummary;
            const selectedRow = selected?.id === run.id;
            return (
              <TableRow
                key={run.id}
                data-state={selectedRow ? 'selected' : undefined}
                aria-selected={selectedRow}
                tabIndex={0}
                className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 focus-visible:ring-inset"
                onClick={() => onSelectRun(run.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectRun(run.id);
                  }
                }}
              >
                <TableCell>
                  <div>
                    <p className="font-data text-xs text-bright">{shortId(run.id)}</p>
                    <p className="text-[11px] text-ghost truncate max-w-[220px]">{summary.source}</p>
                  </div>
                </TableCell>
                <TableCell><span className="text-xs text-dim">{titleCase(run.mode)}</span></TableCell>
                <TableCell><span className="text-xs text-dim">{run.resourceType ?? 'Mixed'}</span></TableCell>
                <TableCell>
                  <span className="font-data text-xs text-dim tabular-nums">
                    {formatCount(run.resourcesStaged)}/{formatCount(run.resourcesReceived)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={qdmReplayVariant(summary.qdmReplayStatus)}>{qdmReplayLabel(summary.qdmReplayStatus)}</Badge>
                    {summary.qdmResourcesNormalized !== null && (
                      <span className="font-data text-[11px] text-ghost tabular-nums">
                        {formatCount(summary.qdmResourcesNormalized)} normalized
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={runStatusVariant(run.status)}>{titleCase(run.status)}</Badge>
                    {run.errorCount > 0 && <span className="text-[11px] text-crimson">{formatCount(run.errorCount)} errors</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-data text-[11px] text-ghost">{fmtDateTime(run.startedAt)}</span>
                </TableCell>
              </TableRow>
            );
          })}
          {runs.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-ghost">No ingest runs found</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {missingSelectedRunId && (
        <div className="mt-4 border-t border-edge/20 pt-4">
          <p className="text-xs text-amber">
            Linked ingest run <span className="font-data">{shortId(selectedRunId)}</span> is outside the current recent-run list.
          </p>
          <p className="text-[11px] text-ghost mt-1">
            Refresh sync status after the run is indexed, or use the linked run id for audit lookup.
          </p>
        </div>
      )}

      {selected && selectedSummary && (
        <div className="mt-4 border-t border-edge/20 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <p className="text-xs text-ghost uppercase tracking-wider mb-1">Run detail</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-data text-xs text-bright">{shortId(selected.id)}</span>
                <Badge variant={runStatusVariant(selected.status)}>{titleCase(selected.status)}</Badge>
                <Badge variant={qdmReplayVariant(selectedSummary.qdmReplayStatus)}>{qdmReplayLabel(selectedSummary.qdmReplayStatus)}</Badge>
              </div>
            </div>
            {selectedSummary.canReplayQdm && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onReplayQdm(selected)}
                disabled={replayingRunId === selected.id}
              >
                <RefreshCw className={replayingRunId === selected.id ? 'animate-spin' : ''} />
                QDM
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            <SnapshotItem label="Duration" value={formatDurationMs(selectedSummary.durationMs)} />
            <SnapshotItem label="Completion" value={formatPercent(selectedSummary.completionRatio)} />
            <SnapshotItem label="Update rate" value={formatPercent(selectedSummary.updateRatio)} />
            <SnapshotItem
              label="Context"
              value={`${formatCount(selectedSummary.contextResourcesStaged ?? selected.resourcesStaged)}/${formatCount(selectedSummary.contextResourcesReceived ?? selected.resourcesReceived)}`}
            />
            <SnapshotItem
              label="EDW hydrated"
              value={selectedSummary.edwResourcesHydrated === null ? '-' : formatCount(selectedSummary.edwResourcesHydrated)}
              tone={(selectedSummary.edwResourcesFailed ?? 0) > 0 ? 'amber' : 'emerald'}
            />
            <SnapshotItem
              label="QDM events"
              value={selectedSummary.qdmEventsUpserted === null ? '-' : formatCount(selectedSummary.qdmEventsUpserted)}
              tone={selectedSummary.qdmReplayStatus === 'failed' ? 'amber' : selectedSummary.qdmReplayStatus === 'replayed' ? 'emerald' : 'dim'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-ghost uppercase tracking-wider mb-1">Lineage</p>
              <p className="text-dim">Source: <span className="font-data text-bright">{selectedSummary.source}</span></p>
              <p className="text-dim">Bulk job: <span className="font-data text-bright">{selectedSummary.bulkJobId ? shortId(selectedSummary.bulkJobId) : '-'}</span></p>
              <p className="text-dim">Output files: <span className="font-data text-bright">{selectedSummary.bulkOutputCount ?? '-'}</span></p>
            </div>
            <div>
              <p className="text-ghost uppercase tracking-wider mb-1">Context</p>
              <p className="text-dim">Attempted: <span className="font-data text-bright">{formatResourceList(selectedSummary.contextResourceTypesAttempted)}</span></p>
              <p className="text-dim">Skipped types: <span className="font-data text-bright">{formatCount(selectedSummary.contextResourceTypesSkipped)}</span></p>
              <p className="text-dim">Continuation pages: <span className="font-data text-bright">{selectedSummary.continuationPagesRemaining ?? '-'}</span></p>
            </div>
            <div>
              <p className="text-ghost uppercase tracking-wider mb-1">Action</p>
              <p className={selectedSummary.hasErrors ? 'text-amber' : 'text-dim'}>{selectedSummary.recommendedAction}</p>
              {selectedSummary.qdmLastReplayedAt && (
                <p className="font-data text-ghost mt-1">QDM replayed {fmtDateTime(selectedSummary.qdmLastReplayedAt)}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BulkJobsPanel({
  jobs,
  latest,
  latestSchedule,
  scheduleCount,
  isFetching,
  onRefresh,
  form,
  setForm,
  onStart,
  isStarting,
  canStart,
  onSaveSchedule,
  isSavingSchedule,
  canSaveSchedule,
  onImport,
  importingJobId,
  onReplayQdm,
  replayingQdmJobId,
  onInspectIngestRun,
  onCancel,
  cancelingJobId,
  disabled,
}: {
  jobs: EhrBulkJob[];
  latest: EhrBulkJob | null;
  latestSchedule: EhrBulkSchedule | null;
  scheduleCount: number;
  isFetching: boolean;
  onRefresh: () => void;
  form: BulkExportFormState;
  setForm: Dispatch<SetStateAction<BulkExportFormState>>;
  onStart: () => void;
  isStarting: boolean;
  canStart: boolean;
  onSaveSchedule: () => void;
  isSavingSchedule: boolean;
  canSaveSchedule: boolean;
  onImport: (job: EhrBulkJob, resumeFailedOnly?: boolean) => void;
  importingJobId: string | null;
  onReplayQdm: (job: EhrBulkJob) => void;
  replayingQdmJobId: string | null;
  onInspectIngestRun: (ingestRunId: string) => void;
  onCancel: (job: EhrBulkJob) => void;
  cancelingJobId: string | null;
  disabled: boolean;
}) {
  const latestFiles = latest?.importFiles ?? [];
  const latestSummary = latest?.importSummary;
  const staged = latestSummary?.resourcesStaged ?? latestFiles.reduce((sum, file) => sum + file.resourcesStaged, 0);
  const errors = latestSummary?.errorCount ?? latestFiles.reduce((sum, file) => sum + file.errorCount, 0);
  const completedFiles = latestSummary?.completedFiles ?? latestFiles.filter((file) => file.status === 'completed').length;
  const totalFiles = latestSummary?.totalFiles ?? latestFiles.length;

  return (
    <div className="border border-edge/25 bg-s1/40 rounded-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database size={14} className="text-[var(--primary)]" />
            <p className="text-xs text-ghost uppercase tracking-wider">Bulk Data</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={latest ? bulkStatusVariant(latest.status) : 'dim'}>
              {latest ? titleCase(latest.status) : 'No jobs'}
            </Badge>
            {latest && <span className="font-data text-xs text-ghost">{shortId(latest.id)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : ''} />
            Bulk status
          </Button>
          <Button size="sm" onClick={onStart} disabled={disabled || !canStart || isStarting}>
            <Play className={isStarting ? 'animate-pulse' : ''} />
            Start
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onSaveSchedule}
            disabled={disabled || !canSaveSchedule || isSavingSchedule}
          >
            <RefreshCw className={isSavingSchedule ? 'animate-spin' : ''} />
            Schedule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <SnapshotItem label="Files" value={`${completedFiles}/${totalFiles}`} />
        <SnapshotItem label="Staged" value={staged} />
        <SnapshotItem label="Errors" value={errors} tone={errors > 0 ? 'amber' : 'emerald'} />
        <SnapshotItem
          label="Next"
          value={latestSchedule ? fmtDateTime(latestSchedule.nextRunAt) : 'None'}
          tone={scheduleCount > 0 ? 'emerald' : 'amber'}
        />
        <SnapshotItem
          label="Last success"
          value={latestSchedule?.lastSuccessAt ? fmtDateTime(latestSchedule.lastSuccessAt) : 'None'}
          tone={latestSchedule?.lastSuccessAt ? 'emerald' : 'amber'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[120px_1fr_1fr_1fr_110px_110px] gap-3 mb-4">
        <Field label="Level">
          <Select
            value={form.exportLevel}
            onValueChange={(value) => updateBulkForm(setForm, 'exportLevel', value as EhrBulkExportLevel)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="group">Group</SelectItem>
              <SelectItem value="patient">Patient</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Group ID">
          <Input
            value={form.groupId}
            onChange={(event) => updateBulkForm(setForm, 'groupId', event.target.value)}
            disabled={form.exportLevel !== 'group'}
            placeholder="group-1"
          />
        </Field>
        <Field label="Patient ID">
          <Input
            value={form.patientId}
            onChange={(event) => updateBulkForm(setForm, 'patientId', event.target.value)}
            disabled={form.exportLevel !== 'patient'}
            placeholder="FHIR patient id"
          />
        </Field>
        <Field label="Resource types">
          <Input
            value={form.resourceTypes}
            onChange={(event) => updateBulkForm(setForm, 'resourceTypes', event.target.value)}
          />
        </Field>
        <Field label="Per file">
          <Input
            value={form.maxResourcesPerFile}
            onChange={(event) => updateBulkForm(setForm, 'maxResourcesPerFile', event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Every min">
          <Input
            value={form.scheduleIntervalMinutes}
            onChange={(event) => updateBulkForm(setForm, 'scheduleIntervalMinutes', event.target.value)}
            inputMode="numeric"
          />
        </Field>
      </div>
      <Field label="Since">
        <Input
          value={form.since}
          onChange={(event) => updateBulkForm(setForm, 'since', event.target.value)}
          placeholder="2026-06-01T00:00:00Z"
        />
      </Field>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Resources</TableHead>
            <TableHead>Import</TableHead>
            <TableHead>QDM</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Next</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const summary = job.importSummary;
            const fileStats = bulkFileStats(job);
            const canResume = summary.canResumeFailedFiles;
            const isBusy = importingJobId === job.id || cancelingJobId === job.id || replayingQdmJobId === job.id;
            return (
              <TableRow key={job.id}>
                <TableCell>
                  <div>
                    <p className="font-data text-xs text-bright">{shortId(job.id)}</p>
                    <p className="text-[11px] text-ghost">{titleCase(job.exportLevel)} export</p>
                    <p className="font-data text-[11px] text-ghost tabular-nums">{formatCount(job.pollCount)} polls</p>
                  </div>
                </TableCell>
                <TableCell><span className="font-data text-xs text-dim">{bulkTarget(job)}</span></TableCell>
                <TableCell><span className="text-xs text-dim">{job.resourceTypes.join(', ')}</span></TableCell>
                <TableCell>
                  <div>
                    <p className="font-data text-xs text-dim tabular-nums">
                      {summary.completedFiles}/{summary.totalFiles} files / {formatCount(summary.resourcesStaged)} staged
                    </p>
                    <p className="font-data text-[11px] text-ghost tabular-nums">
                      {formatCount(summary.rowsRead)} read{summary.manifestRows !== null ? ` / ${formatCount(summary.manifestRows)} manifest` : ''}
                    </p>
                    {fileStats.errors > 0 && <p className="text-[11px] text-crimson">{formatCount(fileStats.errors)} import errors</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <Badge variant={qdmReplayVariant(summary.qdmReplayStatus)}>{qdmReplayLabel(summary.qdmReplayStatus)}</Badge>
                    {summary.qdmResourcesNormalized !== null ? (
                      <p className="font-data text-[11px] text-ghost tabular-nums mt-1">
                        {formatCount(summary.qdmResourcesNormalized)} normalized / {formatCount(summary.qdmEventsUpserted ?? 0)} events
                      </p>
                    ) : (
                      <p className="font-data text-[11px] text-ghost tabular-nums mt-1">
                        {summary.ingestRunId ? 'Awaiting replay counts' : 'No ingest run'}
                      </p>
                    )}
                    {summary.ingestRunId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-0 py-0 font-data text-[11px] text-ghost hover:bg-transparent"
                        onClick={(event) => {
                          event.stopPropagation();
                          onInspectIngestRun(summary.ingestRunId!);
                        }}
                      >
                        {shortId(summary.ingestRunId)}
                      </Button>
                    )}
                    {summary.qdmLastReplayedAt && (
                      <p className="font-data text-[11px] text-ghost">{fmtDateTime(summary.qdmLastReplayedAt)}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={bulkStatusVariant(job.status)}>{titleCase(job.status)}</Badge>
                    <span className="text-[11px] text-ghost">{summary.recommendedAction}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-data text-[11px] text-ghost">
                    {job.nextPollAt ? fmtDateTime(job.nextPollAt) : fmtDateTime(job.requestedAt)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {job.status === 'completed' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onImport(job, false)}
                        disabled={disabled || isBusy}
                      >
                        <RefreshCw className={importingJobId === job.id ? 'animate-spin' : ''} />
                        Import
                      </Button>
                    )}
                    {canResume && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onImport(job, true)}
                        disabled={disabled || isBusy}
                      >
                        <RefreshCw className={importingJobId === job.id ? 'animate-spin' : ''} />
                        Resume
                      </Button>
                    )}
                    {summary.canReplayQdm && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onReplayQdm(job)}
                        disabled={disabled || isBusy}
                      >
                        <RefreshCw className={replayingQdmJobId === job.id ? 'animate-spin' : ''} />
                        QDM
                      </Button>
                    )}
                    {(job.status === 'accepted' || job.status === 'in_progress') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onCancel(job)}
                        disabled={disabled || isBusy}
                      >
                        <XCircle className={cancelingJobId === job.id ? 'animate-pulse' : ''} />
                        Cancel
                      </Button>
                    )}
                    {!summary.canReplayQdm && job.status !== 'completed' && job.status !== 'accepted' && job.status !== 'in_progress' && (
                      <span className="text-xs text-ghost">-</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {jobs.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-ghost">No Bulk jobs found</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function CapabilitySnapshot({ snapshot }: { snapshot: EhrCapabilitySnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="border border-edge/25 bg-s1/40 rounded-card p-4">
        <p className="text-sm text-ghost">No capability snapshot captured</p>
      </div>
    );
  }

  const smartOk = documentOk(snapshot.smartConfiguration);
  const capabilityOk = documentOk(snapshot.capabilityStatement);
  const resourceCount = Object.keys(snapshot.resourceSupport ?? {}).length;

  return (
    <div className="border border-edge/25 bg-s1/40 rounded-card p-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <SnapshotItem label="Captured" value={fmtDateTime(snapshot.capturedAt)} />
        <SnapshotItem label="SMART metadata" value={smartOk ? 'OK' : 'Issue'} tone={smartOk ? 'emerald' : 'amber'} />
        <SnapshotItem label="CapabilityStatement" value={capabilityOk ? 'OK' : 'Issue'} tone={capabilityOk ? 'emerald' : 'amber'} />
        <SnapshotItem label="Resources" value={resourceCount} />
      </div>
    </div>
  );
}

function SnapshotItem({
  label,
  value,
  tone = 'dim',
}: {
  label: string;
  value: string | number;
  tone?: 'dim' | 'amber' | 'emerald';
}) {
  const toneClass = tone === 'amber' ? 'text-amber' : tone === 'emerald' ? 'text-emerald' : 'text-bright';
  return (
    <div>
      <p className="text-xs text-ghost uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-data text-sm ${toneClass}`}>{value}</p>
    </div>
  );
}

function defaultFormState(): FormState {
  const apiBaseUrl = defaultApiBaseUrl();
  return {
    apiBaseUrl,
    tenantName: 'SMART Health IT Sandbox',
    vendor: 'smart_generic',
    environment: 'sandbox',
    status: 'testing',
    fhirBaseUrl: 'https://launch.smarthealthit.org/v/r4/fhir',
    smartConfigUrl: '',
    smartClientId: 'medgnosis-smart-launch',
    smartAuthMethod: 'public_pkce',
    smartScopes: 'openid fhirUser launch patient/Patient.r patient/Observation.rs patient/Condition.rs offline_access',
    smartRedirectUris: '',
    smartLaunchUrl: '',
    backendClientId: '',
    backendAuthMethod: 'private_key_jwt',
    backendScopes: 'system/Patient.rs system/Observation.rs system/Condition.rs system/Encounter.rs',
    backendPrivateKeyRef: '',
    backendClientSecretRef: '',
    backendJwksUrl: '',
  };
}

function defaultBulkExportFormState(): BulkExportFormState {
  return {
    exportLevel: 'group',
    resourceTypes: 'Patient,Observation,Condition,Encounter',
    groupId: '',
    patientId: '',
    since: '',
    maxResourcesPerFile: '5000',
    scheduleIntervalMinutes: '1440',
  };
}

function defaultApiBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3002';
  return window.location.origin;
}

function updateForm<K extends keyof FormState>(
  setForm: Dispatch<SetStateAction<FormState>>,
  key: K,
  value: FormState[K],
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function updateBulkForm<K extends keyof BulkExportFormState>(
  setForm: Dispatch<SetStateAction<BulkExportFormState>>,
  key: K,
  value: BulkExportFormState[K],
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function buildUpsertPayload(form: FormState): UpsertTenantPayload {
  const payload: UpsertTenantPayload = {
    apiBaseUrl: form.apiBaseUrl.trim(),
    tenant: {
      vendor: form.vendor,
      name: form.tenantName.trim(),
      environment: form.environment,
      fhirBaseUrl: form.fhirBaseUrl.trim(),
      smartConfigUrl: nullableString(form.smartConfigUrl),
      status: form.status.trim() || 'testing',
    },
  };

  if (form.smartClientId.trim()) {
    payload.smartLaunch = {
      clientId: form.smartClientId.trim(),
      authMethod: form.smartAuthMethod,
      scopesRequested: normalizeWhitespace(form.smartScopes),
      scopesGranted: normalizeWhitespace(form.smartScopes),
      redirectUris: optionalList(form.smartRedirectUris),
      launchUrl: nullableString(form.smartLaunchUrl),
      enabled: true,
    };
  }

  if (form.backendClientId.trim()) {
    payload.backendServices = {
      clientId: form.backendClientId.trim(),
      authMethod: form.backendAuthMethod,
      scopesRequested: normalizeWhitespace(form.backendScopes),
      scopesGranted: normalizeWhitespace(form.backendScopes),
      privateKeyRef: nullableString(form.backendPrivateKeyRef),
      clientSecretRef: nullableString(form.backendClientSecretRef),
      jwksUrl: nullableString(form.backendJwksUrl),
      enabled: true,
    };
  }

  return payload;
}

function buildBulkExportPayload(form: BulkExportFormState): BulkExportPayload {
  const payload: BulkExportPayload = {
    exportLevel: form.exportLevel,
    resourceTypes: optionalList(form.resourceTypes) ?? [],
  };
  const groupId = form.groupId.trim();
  const patientId = form.patientId.trim();
  const since = form.since.trim();
  const maxResourcesPerFile = Number.parseInt(form.maxResourcesPerFile.trim(), 10);

  if (form.exportLevel === 'group' && groupId) payload.groupId = groupId;
  if (form.exportLevel === 'patient' && patientId) payload.patientId = patientId;
  if (since) payload.since = since;
  if (Number.isFinite(maxResourcesPerFile) && maxResourcesPerFile > 0) {
    payload.maxResourcesPerFile = maxResourcesPerFile;
  }

  return payload;
}

function buildBulkSchedulePayload(
  form: BulkExportFormState,
  existingScheduleId?: string | null,
): BulkSchedulePayload {
  const intervalMinutes = Number.parseInt(form.scheduleIntervalMinutes.trim(), 10);
  const payload: BulkSchedulePayload = {
    ...buildBulkExportPayload(form),
    enabled: true,
    intervalMinutes: Number.isFinite(intervalMinutes) && intervalMinutes >= 15 ? intervalMinutes : 1440,
    sinceMode: 'last_success',
  };
  if (existingScheduleId) payload.id = existingScheduleId;
  return payload;
}

function isBulkExportFormValid(form: BulkExportFormState): boolean {
  const resourceTypes = optionalList(form.resourceTypes) ?? [];
  if (resourceTypes.length === 0) return false;
  if (form.exportLevel === 'group') return form.groupId.trim().length > 0;
  if (form.exportLevel === 'patient') return form.patientId.trim().length > 0;
  return true;
}

function isBulkScheduleIntervalValid(form: BulkExportFormState): boolean {
  const intervalMinutes = Number.parseInt(form.scheduleIntervalMinutes.trim(), 10);
  return Number.isFinite(intervalMinutes) &&
    intervalMinutes >= 15 &&
    intervalMinutes <= MAX_BULK_SCHEDULE_INTERVAL_MINUTES;
}

function tenantFilterQuery(
  vendor: EhrVendor | 'all',
  environment: EhrEnvironment | 'all',
): string {
  const params = new URLSearchParams();
  if (vendor !== 'all') params.set('vendor', vendor);
  if (environment !== 'all') params.set('environment', environment);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function optionalList(value: string): string[] | undefined {
  const items = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function nullableString(value: string): string | null | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeWhitespace(value: string): string {
  return value.split(/\s+/).map((item) => item.trim()).filter(Boolean).join(' ');
}

function vendorLabel(value: EhrVendor): string {
  return VENDOR_OPTIONS.find((vendor) => vendor.value === value)?.label ?? value;
}

function clientTypeLabel(value: EhrClientType): string {
  if (value === 'smart_launch') return 'SMART launch';
  if (value === 'backend_services') return 'Backend Services';
  return 'CDS Hooks';
}

function syncStatusLabel(severity: 'none' | 'info' | 'warning' | 'critical', count: number): string {
  if (count === 0) return 'Clear';
  if (severity === 'critical') return `${count} critical`;
  if (severity === 'warning') return `${count} warnings`;
  return `${count} notices`;
}

function highestIssueSeverity(
  issues: Array<{ severity: 'info' | 'warning' | 'critical' }>,
): 'none' | 'info' | 'warning' | 'critical' {
  if (issues.some((issue) => issue.severity === 'critical')) return 'critical';
  if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
  if (issues.length > 0) return 'info';
  return 'none';
}

function issueVariant(severity: EhrTenantSyncStatus['issues'][number]['severity']): 'crimson' | 'amber' | 'info' {
  if (severity === 'critical') return 'crimson';
  if (severity === 'warning') return 'amber';
  return 'info';
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

function formatDurationMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatResourceList(values: string[]): string {
  if (values.length === 0) return '-';
  if (values.length <= 3) return values.join(', ');
  return `${values.slice(0, 3).join(', ')} +${values.length - 3}`;
}

function formatBackendAuthMethods(values: string[]): string {
  if (values.length === 0) return '-';
  return formatResourceList(values.map((value) => value.replace(/_/g, ' ')));
}

function backendCredentialLabel(status: EhrTenantReadinessEvidence['backendServices']['credentialStatus'] | undefined): string {
  if (status === 'ready') return 'Ready';
  if (status === 'incomplete') return 'Incomplete';
  if (status === 'not_configured') return 'Missing';
  return 'Unknown';
}

function runStatusVariant(status: EhrIngestRun['status']): 'emerald' | 'amber' | 'crimson' | 'dim' | 'info' {
  if (status === 'succeeded') return 'emerald';
  if (status === 'running') return 'info';
  if (status === 'failed') return 'crimson';
  if (status === 'canceled') return 'amber';
  return 'dim';
}

function bulkStatusVariant(status: EhrBulkJob['status']): 'emerald' | 'amber' | 'crimson' | 'dim' | 'info' {
  if (status === 'completed') return 'emerald';
  if (status === 'accepted' || status === 'in_progress') return 'info';
  if (status === 'failed') return 'crimson';
  if (status === 'canceled') return 'amber';
  return 'dim';
}

function qdmReplayVariant(status: EhrBulkJob['importSummary']['qdmReplayStatus']): 'emerald' | 'amber' | 'crimson' | 'dim' | 'info' {
  if (status === 'replayed') return 'emerald';
  if (status === 'ready') return 'info';
  if (status === 'failed') return 'crimson';
  return 'dim';
}

function qdmReplayLabel(status: EhrBulkJob['importSummary']['qdmReplayStatus']): string {
  if (status === 'not_ready') return 'Not ready';
  return titleCase(status);
}

function bulkTarget(job: EhrBulkJob): string {
  if (job.exportLevel === 'group') return job.groupId ?? 'Group';
  if (job.exportLevel === 'patient') return job.patientId ?? 'Patient';
  return 'System';
}

function bulkFileStats(job: EhrBulkJob): { total: number; completed: number; staged: number; errors: number } {
  return job.importFiles.reduce(
    (stats, file) => ({
      total: stats.total + 1,
      completed: stats.completed + (file.status === 'completed' ? 1 : 0),
      staged: stats.staged + file.resourcesStaged,
      errors: stats.errors + file.errorCount,
    }),
    { total: 0, completed: 0, staged: 0, errors: 0 },
  );
}

function shortId(value: string): string {
  return value.length > 13 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function documentOk(value: Record<string, unknown> | null): boolean {
  return value?.ok === true;
}
