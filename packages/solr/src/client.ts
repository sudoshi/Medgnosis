// =============================================================================
// Solr HTTP Client — thin wrapper over undici for Solr's REST API
// Supports both search and clinical cores with Basic auth
// =============================================================================

import { request } from 'undici';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SolrConfig {
  baseUrl: string;
  searchCore: string;
  clinicalCore: string;
  authUser: string;
  authPassword: string;
  timeoutMs: number;
}

export interface SolrQueryParams {
  q: string;
  fq?: string | string[];
  fl?: string;
  sort?: string;
  start?: number;
  rows?: number;
  wt?: string;
}

export interface SolrResponse<T> {
  responseHeader: {
    status: number;
    QTime: number;
  };
  response: {
    numFound: number;
    start: number;
    docs: T[];
  };
}

export interface SolrUpdateResponse {
  responseHeader: {
    status: number;
    QTime: number;
  };
}

// ---------------------------------------------------------------------------
// Config builder — reads from env with sensible defaults
// ---------------------------------------------------------------------------

export function buildConfig(overrides?: Partial<SolrConfig>): SolrConfig {
  return {
    baseUrl: process.env['SOLR_URL'] ?? 'http://localhost:8984/solr',
    searchCore: process.env['SOLR_SEARCH_CORE'] ?? 'search',
    clinicalCore: process.env['SOLR_CLINICAL_CORE'] ?? 'clinical',
    authUser: process.env['SOLR_AUTH_USER'] ?? 'medgnosis',
    authPassword: process.env['SOLR_AUTH_PASSWORD'] ?? 'devsecret',
    timeoutMs: Number(process.env['SOLR_TIMEOUT_MS'] ?? '5000'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SolrClient
// ---------------------------------------------------------------------------

export class SolrClient {
  private readonly config: SolrConfig;
  private readonly authHeader: string;

  constructor(config?: Partial<SolrConfig>) {
    this.config = buildConfig(config);
    this.authHeader =
      'Basic ' +
      Buffer.from(`${this.config.authUser}:${this.config.authPassword}`).toString('base64');
  }

  // -------------------------------------------------------------------------
  // Query — GET /<core>/select
  // -------------------------------------------------------------------------

  async query<T>(core: string, params: SolrQueryParams): Promise<SolrResponse<T>> {
    const url = new URL(`${this.config.baseUrl}/${core}/select`);

    url.searchParams.set('q', params.q);
    url.searchParams.set('wt', params.wt ?? 'json');

    if (params.fq !== undefined) {
      const filters = Array.isArray(params.fq) ? params.fq : [params.fq];
      for (const f of filters) {
        url.searchParams.append('fq', f);
      }
    }
    if (params.fl !== undefined) url.searchParams.set('fl', params.fl);
    if (params.sort !== undefined) url.searchParams.set('sort', params.sort);
    if (params.start !== undefined) url.searchParams.set('start', String(params.start));
    if (params.rows !== undefined) url.searchParams.set('rows', String(params.rows));

    const { statusCode, body } = await request(url.toString(), {
      method: 'GET',
      headers: { Authorization: this.authHeader },
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const json = (await body.json()) as SolrResponse<T>;

    if (statusCode !== 200) {
      throw new Error(`Solr query failed: HTTP ${statusCode} on core "${core}"`);
    }

    return json;
  }

  // -------------------------------------------------------------------------
  // Update — POST /<core>/update
  // -------------------------------------------------------------------------

  async update<T extends Record<string, unknown>>(
    core: string,
    docs: T[],
  ): Promise<SolrUpdateResponse> {
    const url = `${this.config.baseUrl}/${core}/update`;

    const { statusCode, body } = await request(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(docs),
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const json = (await body.json()) as SolrUpdateResponse;

    if (statusCode !== 200) {
      const errorMsg = (json as unknown as Record<string, unknown>)?.error
        ?? JSON.stringify(json).slice(0, 500);
      throw new Error(`Solr update failed: HTTP ${statusCode} on core "${core}": ${JSON.stringify(errorMsg)}`);
    }

    return json;
  }

  // -------------------------------------------------------------------------
  // Delete by query — POST /<core>/update with { delete: { query } }
  // -------------------------------------------------------------------------

  async deleteByQuery(core: string, query: string): Promise<SolrUpdateResponse> {
    const url = `${this.config.baseUrl}/${core}/update`;

    const { statusCode, body } = await request(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ delete: { query } }),
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const json = (await body.json()) as SolrUpdateResponse;

    if (statusCode !== 200) {
      throw new Error(`Solr deleteByQuery failed: HTTP ${statusCode} on core "${core}"`);
    }

    return json;
  }

  // -------------------------------------------------------------------------
  // Commit — POST /<core>/update?commit=true
  // -------------------------------------------------------------------------

  async commit(core: string): Promise<SolrUpdateResponse> {
    const url = `${this.config.baseUrl}/${core}/update?commit=true`;

    const { statusCode, body } = await request(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const json = (await body.json()) as SolrUpdateResponse;

    if (statusCode !== 200) {
      throw new Error(`Solr commit failed: HTTP ${statusCode} on core "${core}"`);
    }

    return json;
  }

  // -------------------------------------------------------------------------
  // Soft commit — POST /<core>/update?softCommit=true
  // -------------------------------------------------------------------------

  async softCommit(core: string): Promise<SolrUpdateResponse> {
    const url = `${this.config.baseUrl}/${core}/update?softCommit=true`;

    const { statusCode, body } = await request(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const json = (await body.json()) as SolrUpdateResponse;

    if (statusCode !== 200) {
      throw new Error(`Solr softCommit failed: HTTP ${statusCode} on core "${core}"`);
    }

    return json;
  }

  // -------------------------------------------------------------------------
  // Ping — GET /<core>/admin/ping
  // -------------------------------------------------------------------------

  async ping(core: string): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl}/${core}/select?q=*:*&rows=0&wt=json`;

      const { statusCode, body } = await request(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader },
        headersTimeout: this.config.timeoutMs,
        bodyTimeout: this.config.timeoutMs,
      });

      // Consume the body to avoid memory leaks
      await body.text();

      return statusCode === 200;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Core status — GET /admin/cores?action=STATUS&core=<core>
  // -------------------------------------------------------------------------

  async coreStatus(core: string): Promise<Record<string, unknown>> {
    // Note: admin/cores is at the Solr root, not under a core path
    const baseWithoutTrailing = this.config.baseUrl.replace(/\/+$/, '');
    const url = `${baseWithoutTrailing}/admin/cores?action=STATUS&core=${encodeURIComponent(core)}&wt=json`;

    const { statusCode, body } = await request(url, {
      method: 'GET',
      headers: { Authorization: this.authHeader },
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const json = (await body.json()) as Record<string, unknown>;

    if (statusCode !== 200) {
      throw new Error(`Solr coreStatus failed: HTTP ${statusCode} for core "${core}"`);
    }

    return json;
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  get searchCore(): string {
    return this.config.searchCore;
  }

  get clinicalCore(): string {
    return this.config.clinicalCore;
  }
}
