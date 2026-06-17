import type { FetchLike } from './types.js';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface SmartDiscoveryTenantRef {
  id?: string | number;
  vendor?: string;
  name?: string;
  fhirBaseUrl: string;
  smartConfigUrl?: string | null;
}

export interface SmartDiscoveryOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => string;
}

export interface DiscoveryEndpointUrls {
  fhirBaseUrl: string;
  smartConfigurationUrl: string;
  capabilityStatementUrl: string;
}

export interface DiscoveryDocument<TSummary> {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  summary?: TSummary;
}

export interface SmartConfigurationSummary {
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  registrationEndpoint?: string;
  managementEndpoint?: string;
  introspectionEndpoint?: string;
  revocationEndpoint?: string;
  launchEndpoint?: string;
  capabilities: string[];
  scopesSupported: string[];
  responseTypesSupported: string[];
  tokenEndpointAuthMethodsSupported: string[];
  codeChallengeMethodsSupported: string[];
  cdsHooks?: SmartConfigurationCdsHooksHints;
}

export interface SmartConfigurationCdsHooksHints {
  endpoint?: string;
  hooks: string[];
  fhirAuthorizationRequired?: boolean;
  fields: string[];
}

export interface CapabilityStatementSummary {
  resourceType?: string;
  status?: string;
  fhirVersion?: string;
  publisher?: string;
  date?: string;
  software?: {
    name?: string;
    version?: string;
  };
  implementation?: {
    description?: string;
    url?: string;
  };
  formats: string[];
  security: {
    cors?: boolean;
    services: string[];
    descriptions: string[];
    oauthUris: OAuthUris;
    extensions: string[];
  };
  resourceTypes: string[];
  resourceSupport: Record<string, CapabilityResourceSupport>;
  operations: string[];
  instantiates: string[];
}

export interface CapabilityResourceSupport {
  interactions: string[];
  searchParams: string[];
}

export interface OAuthUris {
  authorize?: string;
  token?: string;
  register?: string;
  manage?: string;
  introspect?: string;
  revoke?: string;
}

export interface SmartDiscoverySupportSummary {
  endpoints: {
    authorization: boolean;
    token: boolean;
    registration: boolean;
    management: boolean;
    introspection: boolean;
    revocation: boolean;
    launch: boolean;
  };
  scopes: {
    supported: string[];
    patient: string[];
    user: string[];
    system: string[];
    launch: string[];
    openid: boolean;
    fhirUser: boolean;
    onlineAccess: boolean;
    offlineAccess: boolean;
    wildcard: boolean;
  };
  launch: {
    ehr: boolean;
    standalone: boolean;
    patientContext: {
      ehr: boolean;
      standalone: boolean;
    };
    encounterContext: {
      ehr: boolean;
      standalone: boolean;
    };
  };
  cdsHooks: {
    advertised: boolean;
    endpoint?: string;
    hooks: string[];
    fhirAuthorizationRequired: boolean;
    hints: string[];
  };
}

export interface SmartDiscoveryResult {
  checkedAt: string;
  tenant: {
    id?: string | number;
    name?: string;
    vendor?: string;
  };
  endpoints: DiscoveryEndpointUrls;
  smartConfiguration: DiscoveryDocument<SmartConfigurationSummary>;
  capabilityStatement: DiscoveryDocument<CapabilityStatementSummary>;
  support: SmartDiscoverySupportSummary;
}

type JsonRecord = Record<string, unknown>;
type OAuthUriKey = keyof OAuthUris;

const SMART_ACCEPT_HEADER = 'application/json, application/fhir+json';
const SMART_SCOPE_PREFIXES = ['patient/', 'user/', 'system/'] as const;

export async function discoverSmartConfiguration(
  tenant: SmartDiscoveryTenantRef,
  options: SmartDiscoveryOptions = {},
): Promise<SmartDiscoveryResult> {
  const endpoints = discoveryUrlsForTenant(tenant);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('SMART discovery requires a global fetch implementation');
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [smartConfiguration, capabilityStatement] = await Promise.all([
    fetchDiscoveryDocument(endpoints.smartConfigurationUrl, summarizeSmartConfiguration, fetchImpl, timeoutMs),
    fetchDiscoveryDocument(endpoints.capabilityStatementUrl, summarizeCapabilityStatement, fetchImpl, timeoutMs),
  ]);

  return {
    checkedAt: options.now?.() ?? new Date().toISOString(),
    tenant: {
      id: tenant.id,
      name: tenant.name,
      vendor: tenant.vendor,
    },
    endpoints,
    smartConfiguration,
    capabilityStatement,
    support: summarizeSupport(smartConfiguration.summary, capabilityStatement.summary),
  };
}

export function discoveryUrlsForTenant(tenant: SmartDiscoveryTenantRef): DiscoveryEndpointUrls {
  const fhirBaseUrl = trimTrailingSlash(tenant.fhirBaseUrl.trim());
  const configuredSmartUrl =
    typeof tenant.smartConfigUrl === 'string' && tenant.smartConfigUrl.trim().length > 0
      ? tenant.smartConfigUrl.trim()
      : undefined;

  return {
    fhirBaseUrl,
    smartConfigurationUrl: configuredSmartUrl ?? `${fhirBaseUrl}/.well-known/smart-configuration`,
    capabilityStatementUrl: `${fhirBaseUrl}/metadata`,
  };
}

export function summarizeSmartConfiguration(config: JsonRecord): SmartConfigurationSummary {
  return {
    issuer: stringValue(config.issuer),
    authorizationEndpoint: stringValue(config.authorization_endpoint),
    tokenEndpoint: stringValue(config.token_endpoint),
    registrationEndpoint: stringValue(config.registration_endpoint),
    managementEndpoint: stringValue(config.management_endpoint),
    introspectionEndpoint: stringValue(config.introspection_endpoint),
    revocationEndpoint: stringValue(config.revocation_endpoint),
    launchEndpoint: stringValue(config.launch_endpoint),
    capabilities: uniqueStrings(stringArrayValue(config.capabilities)),
    scopesSupported: uniqueStrings(stringArrayValue(config.scopes_supported)),
    responseTypesSupported: uniqueStrings(stringArrayValue(config.response_types_supported)),
    tokenEndpointAuthMethodsSupported: uniqueStrings(
      stringArrayValue(config.token_endpoint_auth_methods_supported),
    ),
    codeChallengeMethodsSupported: uniqueStrings(
      stringArrayValue(config.code_challenge_methods_supported),
    ),
    cdsHooks: summarizeSmartCdsHooks(config),
  };
}

export function summarizeCapabilityStatement(statement: JsonRecord): CapabilityStatementSummary {
  const rest = recordArray(statement.rest);
  const serverRest = rest.find((entry) => stringValue(entry.mode) === 'server') ?? rest[0];
  const security = isRecord(serverRest?.security) ? serverRest.security : undefined;
  const resourceSupport = summarizeCapabilityResources(serverRest);
  const oauthUris = extractOAuthUris(security?.extension);

  return {
    resourceType: stringValue(statement.resourceType),
    status: stringValue(statement.status),
    fhirVersion: stringValue(statement.fhirVersion),
    publisher: stringValue(statement.publisher),
    date: stringValue(statement.date),
    software: summarizeNamedBlock(statement.software),
    implementation: summarizeImplementation(statement.implementation),
    formats: uniqueStrings(stringArrayValue(statement.format)),
    security: {
      cors: booleanValue(security?.cors),
      services: summarizeSecurityServices(security),
      descriptions: stringValue(security?.description) ? [stringValue(security?.description)!] : [],
      oauthUris,
      extensions: uniqueStrings(collectExtensionUrls(security?.extension)),
    },
    resourceTypes: Object.keys(resourceSupport).sort(),
    resourceSupport,
    operations: uniqueStrings(operationNames(recordArray(serverRest?.operation))),
    instantiates: uniqueStrings([
      ...stringArrayValue(statement.instantiates),
      ...stringArrayValue(statement.imports),
      ...stringArrayValue(statement.implementationGuide),
    ]),
  };
}

function summarizeSupport(
  smart: SmartConfigurationSummary | undefined,
  capability: CapabilityStatementSummary | undefined,
): SmartDiscoverySupportSummary {
  const scopes = smart?.scopesSupported ?? [];
  const capabilities = new Set((smart?.capabilities ?? []).map((capabilityName) => capabilityName.toLowerCase()));
  const oauthUris = capability?.security.oauthUris ?? {};
  const cdsHooks = summarizeCdsHooks(smart, capability);

  return {
    endpoints: {
      authorization: Boolean(smart?.authorizationEndpoint ?? oauthUris.authorize),
      token: Boolean(smart?.tokenEndpoint ?? oauthUris.token),
      registration: Boolean(smart?.registrationEndpoint ?? oauthUris.register),
      management: Boolean(smart?.managementEndpoint ?? oauthUris.manage),
      introspection: Boolean(smart?.introspectionEndpoint ?? oauthUris.introspect),
      revocation: Boolean(smart?.revocationEndpoint ?? oauthUris.revoke),
      launch: Boolean(smart?.launchEndpoint),
    },
    scopes: {
      supported: scopes,
      patient: scopesByPrefix(scopes, 'patient/'),
      user: scopesByPrefix(scopes, 'user/'),
      system: scopesByPrefix(scopes, 'system/'),
      launch: scopes.filter((scope) => scope === 'launch' || scope.startsWith('launch/')),
      openid: scopes.includes('openid'),
      fhirUser: scopes.includes('fhirUser'),
      onlineAccess: scopes.includes('online_access'),
      offlineAccess: scopes.includes('offline_access'),
      wildcard: scopes.some((scope) => SMART_SCOPE_PREFIXES.some((prefix) => scope.startsWith(`${prefix}*`))),
    },
    launch: {
      ehr: capabilities.has('launch-ehr'),
      standalone: capabilities.has('launch-standalone'),
      patientContext: {
        ehr: capabilities.has('context-ehr-patient'),
        standalone: capabilities.has('context-standalone-patient') || scopes.includes('launch/patient'),
      },
      encounterContext: {
        ehr: capabilities.has('context-ehr-encounter'),
        standalone: capabilities.has('context-standalone-encounter') || scopes.includes('launch/encounter'),
      },
    },
    cdsHooks,
  };
}

async function fetchDiscoveryDocument<TSummary>(
  url: string,
  summarize: (record: JsonRecord) => TSummary,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<DiscoveryDocument<TSummary>> {
  const controller = createAbortController();
  let timeout: NodeJS.Timeout | undefined;
  let timedOut = false;

  if (controller && timeoutMs > 0) {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: SMART_ACCEPT_HEADER },
      signal: controller?.signal,
    });

    if (timeout) clearTimeout(timeout);

    if (!response.ok) {
      return {
        url,
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
      };
    }

    const body = await parseResponseBody(response);
    if (!isRecord(body)) {
      return {
        url,
        ok: false,
        status: response.status,
        error: 'Discovery document did not return a JSON object',
      };
    }

    return {
      url,
      ok: true,
      status: response.status,
      summary: summarize(body),
    };
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    return {
      url,
      ok: false,
      error: timedOut ? `Discovery request timed out after ${timeoutMs}ms` : errorMessage(error),
    };
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function summarizeCapabilityResources(serverRest: JsonRecord | undefined): Record<string, CapabilityResourceSupport> {
  const support: Record<string, CapabilityResourceSupport> = {};
  for (const resource of recordArray(serverRest?.resource)) {
    const type = stringValue(resource.type);
    if (!type) continue;
    support[type] = {
      interactions: uniqueStrings(operationCodes(recordArray(resource.interaction))),
      searchParams: uniqueStrings(searchParamNames(recordArray(resource.searchParam))),
    };
  }
  return support;
}

function summarizeNamedBlock(value: unknown): { name?: string; version?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const name = stringValue(value.name);
  const version = stringValue(value.version);
  return name || version ? { name, version } : undefined;
}

function summarizeImplementation(value: unknown): { description?: string; url?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const description = stringValue(value.description);
  const url = stringValue(value.url);
  return description || url ? { description, url } : undefined;
}

function summarizeSecurityServices(security: JsonRecord | undefined): string[] {
  if (!security) return [];

  return uniqueStrings(
    recordArray(security.service).flatMap((service) => {
      const codings = recordArray(service.coding);
      const codingLabels = codings.flatMap((coding) => [
        stringValue(coding.system),
        stringValue(coding.code),
        stringValue(coding.display),
      ]);
      return [...codingLabels, stringValue(service.text)].filter(isString);
    }),
  );
}

function operationCodes(values: JsonRecord[]): string[] {
  return values.map((value) => stringValue(value.code)).filter(isString);
}

function searchParamNames(values: JsonRecord[]): string[] {
  return values.map((value) => stringValue(value.name)).filter(isString);
}

function operationNames(values: JsonRecord[]): string[] {
  return values.flatMap((value) => [
    stringValue(value.name),
    stringValue(value.definition),
  ]).filter(isString);
}

function summarizeCdsHooks(
  smart: SmartConfigurationSummary | undefined,
  capability: CapabilityStatementSummary | undefined,
): SmartDiscoverySupportSummary['cdsHooks'] {
  const hooks = uniqueStrings([
    ...(smart?.cdsHooks?.hooks ?? []),
    ...cdsHookNamesFromSmart(smart),
    ...cdsHookNamesFromCapability(capability),
  ]);
  const endpoint = cdsEndpointFromSmart(smart);
  const hints = uniqueStrings([
    ...(endpoint ? ['SMART configuration advertises a CDS Hooks discovery endpoint'] : []),
    ...((smart?.cdsHooks?.fields ?? []).map((field) => `SMART configuration includes ${field}`)),
    ...hooks.map((hook) => `CDS Hooks hook advertised: ${hook}`),
    ...cdsHintsFromCapability(capability),
  ]);
  const fhirAuthorizationRequired =
    smart?.cdsHooks?.fhirAuthorizationRequired ??
    Boolean(
      smart?.capabilities.some((capabilityName) => capabilityName.toLowerCase().includes('cds')) &&
        (smart.scopesSupported.some((scope) => scope.startsWith('patient/') || scope.startsWith('user/')) ||
          smart.scopesSupported.includes('openid')),
    );

  return {
    advertised: Boolean(endpoint || hooks.length > 0 || hints.length > 0),
    endpoint,
    hooks,
    fhirAuthorizationRequired,
    hints,
  };
}

function cdsEndpointFromSmart(smart: SmartConfigurationSummary | undefined): string | undefined {
  return smart?.cdsHooks?.endpoint ?? (smart?.launchEndpoint?.includes('cds') ? smart.launchEndpoint : undefined);
}

function cdsHookNamesFromSmart(smart: SmartConfigurationSummary | undefined): string[] {
  return (smart?.capabilities ?? [])
    .filter((capabilityName) => capabilityName.toLowerCase().includes('cds'))
    .map((capabilityName) => capabilityName.replace(/^cds-hooks?[:-]?/i, ''))
    .filter((capabilityName) => capabilityName.length > 0);
}

function cdsHookNamesFromCapability(capability: CapabilityStatementSummary | undefined): string[] {
  if (!capability) return [];
  return [
    ...capability.operations,
    ...capability.instantiates,
    ...capability.security.extensions,
    ...capability.security.services,
  ]
    .filter((value) => value.toLowerCase().includes('cds'))
    .map((value) => value.split('/').pop() ?? value);
}

function cdsHintsFromCapability(capability: CapabilityStatementSummary | undefined): string[] {
  if (!capability) return [];

  const hints: string[] = [];
  for (const value of [
    ...capability.instantiates,
    ...capability.security.extensions,
    ...capability.security.services,
    ...capability.operations,
  ]) {
    if (value.toLowerCase().includes('cds')) {
      hints.push(`CapabilityStatement references ${value}`);
    }
  }
  return hints;
}

function summarizeSmartCdsHooks(config: JsonRecord): SmartConfigurationCdsHooksHints | undefined {
  const directFields = Object.keys(config).filter((key) => key.toLowerCase().includes('cds')).sort();
  const nestedRecords = [
    config.cds_hooks,
    config.cdsHooks,
    config.cds_services,
    config.cdsServices,
  ].filter(isRecord);

  const endpoint = firstString([
    stringValue(config.cds_hooks_endpoint),
    stringValue(config.cdsHooksEndpoint),
    stringValue(config.cds_services_endpoint),
    stringValue(config.cdsServicesEndpoint),
    ...nestedRecords.flatMap((record) => [
      stringValue(record.endpoint),
      stringValue(record.discovery_endpoint),
      stringValue(record.services_endpoint),
      stringValue(record.discoveryEndpoint),
      stringValue(record.servicesEndpoint),
    ]),
  ]);
  const hooks = uniqueStrings([
    ...stringArrayValue(config.cds_hooks_supported),
    ...stringArrayValue(config.cdsHooksSupported),
    ...stringArrayValue(config.hooks_supported),
    ...stringArrayValue(config.hooksSupported),
    ...nestedRecords.flatMap((record) => [
      ...stringArrayValue(record.hooks),
      ...stringArrayValue(record.hooks_supported),
      ...stringArrayValue(record.hooksSupported),
      ...hookNamesFromServices(record.services),
    ]),
  ]);
  const fhirAuthorizationRequired = firstBoolean([
    booleanValue(config.fhir_authorization_required),
    booleanValue(config.fhirAuthorizationRequired),
    ...nestedRecords.flatMap((record) => [
      booleanValue(record.fhir_authorization_required),
      booleanValue(record.fhirAuthorizationRequired),
    ]),
  ]);

  if (!endpoint && hooks.length === 0 && fhirAuthorizationRequired === undefined && directFields.length === 0) {
    return undefined;
  }

  return {
    endpoint,
    hooks,
    fhirAuthorizationRequired,
    fields: directFields,
  };
}

function hookNamesFromServices(value: unknown): string[] {
  return recordArray(value).map((service) => stringValue(service.hook)).filter(isString);
}

function extractOAuthUris(value: unknown): OAuthUris {
  const result: OAuthUris = {};
  for (const extension of recordArray(value)) {
    mergeOAuthUris(result, oauthUrisFromExtension(extension));
  }
  return result;
}

function oauthUrisFromExtension(extension: JsonRecord): OAuthUris {
  const result: OAuthUris = {};
  const url = stringValue(extension.url);
  const nested = recordArray(extension.extension);

  if (nested.length > 0) {
    for (const child of nested) {
      mergeOAuthUris(result, oauthUrisFromExtension(child));
    }
  }

  const key = oauthKey(url);
  const uri = stringValue(extension.valueUri) ?? stringValue(extension.valueUrl) ?? stringValue(extension.valueString);
  if (key && uri) {
    result[key] = uri;
  }

  return result;
}

function oauthKey(value: string | undefined): OAuthUriKey | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'authorize' || normalized.endsWith('/authorize')) return 'authorize';
  if (normalized === 'token' || normalized.endsWith('/token')) return 'token';
  if (normalized === 'register' || normalized === 'registration' || normalized.endsWith('/register')) {
    return 'register';
  }
  if (normalized === 'manage' || normalized === 'management' || normalized.endsWith('/manage')) return 'manage';
  if (normalized === 'introspect' || normalized === 'introspection' || normalized.endsWith('/introspect')) {
    return 'introspect';
  }
  if (normalized === 'revoke' || normalized === 'revocation' || normalized.endsWith('/revoke')) return 'revoke';
  return undefined;
}

function mergeOAuthUris(target: OAuthUris, source: OAuthUris): void {
  for (const key of Object.keys(source) as OAuthUriKey[]) {
    target[key] = source[key];
  }
}

function collectExtensionUrls(value: unknown): string[] {
  return recordArray(value).flatMap((extension) => {
    const url = stringValue(extension.url);
    return [
      ...(url ? [url] : []),
      ...collectExtensionUrls(extension.extension),
    ];
  });
}

function scopesByPrefix(scopes: string[], prefix: string): string[] {
  return scopes.filter((scope) => scope.startsWith(prefix));
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(isString);
  }
  if (typeof value === 'string') {
    return value.split(/\s+/).filter((item) => item.length > 0);
  }
  return [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function firstString(values: Array<string | undefined>): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function firstBoolean(values: Array<boolean | undefined>): boolean | undefined {
  return values.find((value): value is boolean => typeof value === 'boolean');
}

function recordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function createAbortController(): AbortController | undefined {
  return typeof AbortController === 'undefined' ? undefined : new AbortController();
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'Discovery request failed';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
