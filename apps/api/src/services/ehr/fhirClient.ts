import { normalizeOperationOutcome } from './operationOutcome.js';
import type {
  EhrTenantRef,
  EhrVendorAdapter,
  FetchLike,
  FhirAccessTokenRef,
  FhirBundle,
  FhirReadResult,
  FhirRequestAudit,
  FhirResource,
  FhirSearchAudit,
  FhirSearchParamValue,
  FhirSearchParams,
  FhirSearchPrimitive,
  FhirSearchResult,
  NormalizedOperationOutcome,
} from './types.js';
import { getVendorAdapter } from './vendorAdapters/index.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_RETRY_MAX_DELAY_MS = 5_000;

export interface FhirClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retryAttempts?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface FhirRequestOptions {
  adapter?: EhrVendorAdapter;
  timeoutMs?: number;
  retryAttempts?: number;
}

export interface FhirSearchOptions extends FhirRequestOptions {
  pageSize?: number;
  maxPages?: number;
}

interface RequestJsonOptions extends FhirRequestOptions {
  interaction: FhirRequestAudit['interaction'];
  resourceType?: string;
  searchParamKeys?: string[];
}

interface RequestJsonResult {
  body: unknown;
  audit: FhirRequestAudit;
}

export class FhirClientError extends Error {
  readonly status?: number;
  readonly outcome: NormalizedOperationOutcome;
  readonly audit?: FhirRequestAudit;

  constructor(outcome: NormalizedOperationOutcome, audit?: FhirRequestAudit) {
    super(outcome.message);
    this.name = 'FhirClientError';
    this.status = outcome.status;
    this.outcome = outcome;
    this.audit = audit;
  }
}

export class FhirClient {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: FhirClientOptions = {}) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('FHIR client requires a global fetch implementation');
    }

    this.fetchImpl = fetchImpl.bind(globalThis) as FetchLike;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryAttempts = options.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async readResource<TResource extends FhirResource = FhirResource>(
    tenant: EhrTenantRef,
    token: FhirAccessTokenRef,
    resourceType: string,
    id: string,
    options: FhirRequestOptions = {},
  ): Promise<FhirReadResult<TResource>> {
    const url = resourceUrl(tenant.fhirBaseUrl, resourceType, id);
    const result = await this.requestJson(tenant, token, url, {
      ...options,
      interaction: 'read',
      resourceType,
    });

    if (!isFhirResource(result.body)) {
      throw this.invalidResponseError('FHIR read did not return a resource', result.audit, tenant, options.adapter);
    }

    return {
      resource: result.body as TResource,
      audit: result.audit,
    };
  }

  async search<TResource extends FhirResource = FhirResource>(
    tenant: EhrTenantRef,
    token: FhirAccessTokenRef,
    resourceType: string,
    params: FhirSearchParams = {},
    options: FhirSearchOptions = {},
  ): Promise<FhirSearchResult<TResource>> {
    const adapter = options.adapter ?? getVendorAdapter(tenant.vendor);
    const pageSize = options.pageSize ?? adapter.paginationPolicy.defaultPageSize;
    const maxPages = options.maxPages ?? adapter.paginationPolicy.maxPages;
    const searchParams = adapter.normalizeSearchParams(resourceType, { ...params, _count: pageSize });
    const searchParamKeys = Object.keys(searchParams).sort();
    const pages: Array<FhirBundle<TResource>> = [];
    const requests: FhirRequestAudit[] = [];
    let nextUrl: string | undefined = resourceUrl(tenant.fhirBaseUrl, resourceType, undefined, searchParams);

    while (nextUrl && pages.length < maxPages) {
      const result = await this.requestJson(tenant, token, nextUrl, {
        ...options,
        adapter,
        interaction: 'search',
        resourceType,
        searchParamKeys,
      });
      requests.push(result.audit);

      if (!isFhirBundle<TResource>(result.body)) {
        throw this.invalidResponseError('FHIR search did not return a Bundle', result.audit, tenant, adapter);
      }

      pages.push(result.body);
      nextUrl = nextLink(result.body, tenant.fhirBaseUrl);
      if (nextUrl && !isTenantFhirUrl(nextUrl, tenant.fhirBaseUrl)) {
        throw this.invalidResponseError(
          'FHIR search Bundle next link points outside the tenant FHIR base URL',
          result.audit,
          tenant,
          adapter,
        );
      }
    }

    const resources = pages.flatMap((page) =>
      (page.entry ?? []).flatMap((entry) => (entry.resource ? [entry.resource] : [])),
    );
    const remainingNextUrl = nextUrl;
    const combinedBundle = combineBundles(pages, resources, remainingNextUrl);

    return {
      bundle: combinedBundle,
      pages,
      resources,
      nextUrl: remainingNextUrl,
      audit: {
        interaction: 'search',
        resourceType,
        pageCount: pages.length,
        requestCount: requests.length,
        requests,
        searchParamKeys,
      } satisfies FhirSearchAudit,
    };
  }

  private async requestJson(
    tenant: EhrTenantRef,
    token: FhirAccessTokenRef,
    url: string,
    options: RequestJsonOptions,
  ): Promise<RequestJsonResult> {
    const adapter = options.adapter ?? getVendorAdapter(tenant.vendor);
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const retryAttempts = options.retryAttempts ?? this.retryAttempts;
    const maxAttempts = Math.max(1, retryAttempts + 1);
    let attemptCount = 0;
    let retryCount = 0;

    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
      attemptCount += 1;
      const controller = createAbortController();
      const timeoutMs = options.timeoutMs ?? this.timeoutMs;
      let timeout: NodeJS.Timeout | undefined;
      let timedOut = false;

      if (controller && timeoutMs > 0) {
        timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
      }

      try {
        const response = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            accept: 'application/fhir+json, application/json',
            authorization: `${token.tokenType ?? 'Bearer'} ${token.accessToken}`,
          },
          signal: controller?.signal,
        });

        if (timeout) clearTimeout(timeout);

        if (response.ok) {
          return {
            body: await parseResponseBody(response),
            audit: makeAudit(options, response.status, attemptCount, retryCount, startedAtMs, startedAt),
          };
        }

        if (isRetryableStatus(response.status) && attemptIndex < maxAttempts - 1) {
          retryCount += 1;
          await this.sleep(retryDelayMs(response, attemptIndex, this.retryBaseDelayMs, this.retryMaxDelayMs));
          continue;
        }

        const body = await parseResponseBody(response);
        const audit = makeAudit(options, response.status, attemptCount, retryCount, startedAtMs, startedAt);
        throw new FhirClientError(
          adapter.handleOperationOutcome(body, {
            status: response.status,
            fallbackMessage: `FHIR request failed with HTTP ${response.status}`,
          }),
          audit,
        );
      } catch (error) {
        if (timeout) clearTimeout(timeout);
        if (error instanceof FhirClientError) {
          throw error;
        }

        if (attemptIndex < maxAttempts - 1) {
          retryCount += 1;
          await this.sleep(backoffDelayMs(attemptIndex, this.retryBaseDelayMs, this.retryMaxDelayMs));
          continue;
        }

        const audit = makeAudit(options, undefined, attemptCount, retryCount, startedAtMs, startedAt);
        const outcome = normalizeOperationOutcome(undefined, {
          vendor: adapter.vendor,
          classification: timedOut ? 'timeout' : 'network',
          fallbackMessage: timedOut
            ? `FHIR request timed out after ${timeoutMs}ms`
            : errorMessage(error, 'FHIR network request failed'),
        });
        throw new FhirClientError(outcome, audit);
      }
    }

    const audit = makeAudit(options, undefined, attemptCount, retryCount, startedAtMs, startedAt);
    throw new FhirClientError(
      normalizeOperationOutcome(undefined, {
        vendor: adapter.vendor,
        classification: 'network',
        fallbackMessage: 'FHIR request failed after retries',
      }),
      audit,
    );
  }

  private invalidResponseError(
    message: string,
    audit: FhirRequestAudit,
    tenant: EhrTenantRef,
    adapter?: EhrVendorAdapter,
  ): FhirClientError {
    const selectedAdapter = adapter ?? getVendorAdapter(tenant.vendor);
    return new FhirClientError(
      normalizeOperationOutcome(undefined, {
        vendor: selectedAdapter.vendor,
        status: audit.status,
        classification: 'invalid_request',
        fallbackMessage: message,
      }),
      audit,
    );
  }
}

const defaultClient = new FhirClient();

export function readResource<TResource extends FhirResource = FhirResource>(
  tenant: EhrTenantRef,
  token: FhirAccessTokenRef,
  resourceType: string,
  id: string,
  options: FhirRequestOptions = {},
): Promise<FhirReadResult<TResource>> {
  return defaultClient.readResource<TResource>(tenant, token, resourceType, id, options);
}

export function search<TResource extends FhirResource = FhirResource>(
  tenant: EhrTenantRef,
  token: FhirAccessTokenRef,
  resourceType: string,
  params: FhirSearchParams = {},
  options: FhirSearchOptions = {},
): Promise<FhirSearchResult<TResource>> {
  return defaultClient.search<TResource>(tenant, token, resourceType, params, options);
}

function resourceUrl(
  baseUrl: string,
  resourceType: string,
  id?: string,
  params?: FhirSearchParams,
): string {
  const path = id
    ? `${trimTrailingSlash(baseUrl)}/${encodeURIComponent(resourceType)}/${encodeURIComponent(id)}`
    : `${trimTrailingSlash(baseUrl)}/${encodeURIComponent(resourceType)}`;
  const url = new URL(path);

  if (params) {
    appendSearchParams(url.searchParams, params);
  }

  return url.toString();
}

function appendSearchParams(searchParams: URLSearchParams, params: FhirSearchParams): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (isSearchParamArray(value)) {
      for (const item of value) {
        searchParams.append(key, stringifyParam(item));
      }
      continue;
    }
    searchParams.append(key, stringifyParam(value));
  }
}

function stringifyParam(value: FhirSearchPrimitive): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function isSearchParamArray(value: FhirSearchParamValue): value is readonly FhirSearchPrimitive[] {
  return Array.isArray(value);
}

function nextLink(bundle: FhirBundle, baseUrl: string): string | undefined {
  const url = bundle.link?.find((link) => link.relation === 'next')?.url;
  return url ? new URL(url, `${trimTrailingSlash(baseUrl)}/`).toString() : undefined;
}

function isTenantFhirUrl(url: string, baseUrl: string): boolean {
  const parsedUrl = new URL(url);
  const parsedBase = new URL(trimTrailingSlash(baseUrl));
  const basePath = trimTrailingSlash(parsedBase.pathname);

  if (parsedUrl.origin !== parsedBase.origin) return false;
  if (!basePath || basePath === '/') return true;
  return parsedUrl.pathname === basePath || parsedUrl.pathname.startsWith(`${basePath}/`);
}

function combineBundles<TResource extends FhirResource>(
  pages: Array<FhirBundle<TResource>>,
  resources: TResource[],
  nextUrl: string | undefined,
): FhirBundle<TResource> {
  const first = pages[0];
  return {
    resourceType: 'Bundle',
    type: first?.type ?? 'searchset',
    total: first?.total,
    entry: resources.map((resource) => ({ resource })),
    link: nextUrl ? [{ relation: 'next', url: nextUrl }] : undefined,
  };
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

function createAbortController(): AbortController | undefined {
  return typeof AbortController === 'undefined' ? undefined : new AbortController();
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(
  response: Response,
  attemptIndex: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
  return retryAfter ?? backoffDelayMs(attemptIndex, baseDelayMs, maxDelayMs);
}

export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(dateMs - nowMs, 0);
  }

  return undefined;
}

function backoffDelayMs(attemptIndex: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** attemptIndex, maxDelayMs);
}

function makeAudit(
  options: RequestJsonOptions,
  status: number | undefined,
  attemptCount: number,
  retryCount: number,
  startedAtMs: number,
  startedAt: string,
): FhirRequestAudit {
  const completedAtMs = Date.now();
  return {
    method: 'GET',
    interaction: options.interaction,
    resourceType: options.resourceType,
    status,
    attemptCount,
    retryCount,
    durationMs: completedAtMs - startedAtMs,
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    searchParamKeys: options.searchParamKeys,
  };
}

function isFhirResource(value: unknown): value is FhirResource {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { resourceType?: unknown }).resourceType === 'string'
  );
}

function isFhirBundle<TResource extends FhirResource>(value: unknown): value is FhirBundle<TResource> {
  return isFhirResource(value) && value.resourceType === 'Bundle';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
