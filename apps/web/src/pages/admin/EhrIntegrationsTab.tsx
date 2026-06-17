import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
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
  EhrCapabilitySnapshot,
  EhrClientAuthMethod,
  EhrClientRegistration,
  EhrClientType,
  EhrEnvironment,
  EhrTenant,
  EhrTenantDetail,
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

export function EhrIntegrationsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [vendorFilter, setVendorFilter] = useState<EhrVendor | 'all'>('all');
  const [environmentFilter, setEnvironmentFilter] = useState<EhrEnvironment | 'all'>('all');
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(() => defaultFormState());

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
    }
  }, [selectedTenantId, tenants]);

  const detailQuery = useQuery({
    queryKey: ['ehr', 'tenant-detail', selectedTenantId],
    queryFn: () => api.get<EhrTenantDetail>(`/ehr/admin/tenants/${selectedTenantId}`),
    enabled: selectedTenantId !== null,
    staleTime: 15_000,
  });

  const detail = detailQuery.data?.data;
  const readinessBlocked = useMemo(
    () => detail?.readiness.clients.some((client) => client.status === 'blocked') ?? false,
    [detail],
  );

  const upsertMutation = useMutation({
    mutationFn: () => api.post<EhrRegistrationResponse>('/ehr/admin/tenants', buildUpsertPayload(form)),
    onSuccess: (response) => {
      const tenantId = response.data?.tenant.id ?? null;
      toast.success('EHR tenant saved');
      if (tenantId !== null) setSelectedTenantId(tenantId);
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenants'] });
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-detail'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save EHR tenant')),
  });

  const diagnosticsMutation = useMutation({
    mutationFn: (tenantId: number) => api.get<EhrDiagnosticsResponse>(`/ehr/admin/tenants/${tenantId}/diagnostics`),
    onSuccess: () => {
      toast.success('Diagnostics completed');
      void qc.invalidateQueries({ queryKey: ['ehr', 'tenant-detail', selectedTenantId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Diagnostics failed')),
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
          onClick={() => void tenantsQuery.refetch()}
          disabled={tenantsQuery.isFetching}
        >
          <RefreshCw className={tenantsQuery.isFetching ? 'animate-spin' : ''} />
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
                    onClick={() => setSelectedTenantId(tenant.id)}
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
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <ReadinessMetric label="Clients" value={detail.clientRegistrations.length} />
              <ReadinessMetric
                label="Blocked"
                value={detail.readiness.clients.filter((client) => client.status === 'blocked').length}
                tone={readinessBlocked ? 'amber' : 'emerald'}
              />
              <ReadinessMetric
                label="Last snapshot"
                value={detail.latestCapabilitySnapshot ? fmtDateTime(detail.latestCapabilitySnapshot.capturedAt) : 'None'}
              />
            </div>

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

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function documentOk(value: Record<string, unknown> | null): boolean {
  return value?.ok === true;
}
