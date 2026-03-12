# Solr Query Acceleration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Apache Solr 9.7 to accelerate all search/filter endpoints from 200-2000ms to <50ms, with graceful PG fallback.

**Architecture:** Two Solr cores (search: patients+care_gaps, clinical: encounters+conditions+observations+medications) deployed via Docker Compose. CDC via PG LISTEN/NOTIFY for real-time sync, nightly full reindex as safety net. API routes query Solr first, fall back to PG if unavailable. Feature flag `SOLR_ENABLED` for instant rollback.

**Tech Stack:** Solr 9.7, undici (HTTP client), PostgreSQL LISTEN/NOTIFY, Redis (CDC queue), Fastify plugin, Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-12-solr-query-acceleration-design.md`

---

## Chunk 1: Infrastructure & Package Scaffolding

### Task 1: Add Solr to Docker Compose

**Files:**
- Modify: `docker-compose.demo.yml`

- [ ] **Step 1: Add Solr service and volume to docker-compose.demo.yml**

Add after the `mailhog` service block:

```yaml
  solr:
    image: solr:9.7-slim
    container_name: medgnosis-demo-solr
    ports:
      - '8983:8983'
    volumes:
      - medgnosis-demo-solrdata:/var/solr/data
      - ./solr/search:/var/solr/data/search
      - ./solr/clinical:/var/solr/data/clinical
    environment:
      SOLR_JAVA_MEM: '${SOLR_JAVA_MEM:--Xms2g -Xmx4g}'
      SOLR_AUTH_TYPE: basic
      SOLR_AUTHENTICATION_OPTS: '-Dbasicauth=${SOLR_AUTH_USER:-medgnosis}:${SOLR_AUTH_PASSWORD:-devsecret}'
    healthcheck:
      test: ['CMD-SHELL', 'curl -sf http://localhost:8983/solr/admin/info/system | grep -q status']
      interval: 10s
      timeout: 5s
      retries: 10
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
```

Add to volumes section:
```yaml
  medgnosis-demo-solrdata:
    name: medgnosis-demo-solrdata
```

- [ ] **Step 2: Create Solr core config directories**

```bash
mkdir -p solr/search/conf solr/clinical/conf
```

- [ ] **Step 3: Create search core schema (`solr/search/conf/managed-schema.xml`)**

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<schema name="search" version="1.6">
  <uniqueKey>id</uniqueKey>

  <!-- Field types -->
  <fieldType name="string" class="solr.StrField" sortMissingLast="true"/>
  <fieldType name="plong" class="solr.LongPointField" docValues="true"/>
  <fieldType name="pint" class="solr.IntPointField" docValues="true"/>
  <fieldType name="pdouble" class="solr.DoublePointField" docValues="true"/>
  <fieldType name="pdate" class="solr.DatePointField" docValues="true"/>
  <fieldType name="text_general" class="solr.TextField" positionIncrementGap="100">
    <analyzer type="index">
      <tokenizer class="solr.StandardTokenizerFactory"/>
      <filter class="solr.LowerCaseFilterFactory"/>
      <filter class="solr.StopFilterFactory" ignoreCase="true" words="stopwords.txt"/>
    </analyzer>
    <analyzer type="query">
      <tokenizer class="solr.StandardTokenizerFactory"/>
      <filter class="solr.LowerCaseFilterFactory"/>
      <filter class="solr.StopFilterFactory" ignoreCase="true" words="stopwords.txt"/>
      <filter class="solr.SynonymGraphFilterFactory" synonyms="synonyms.txt" ignoreCase="true" expand="true"/>
    </analyzer>
  </fieldType>

  <!-- Shared fields -->
  <field name="id" type="string" indexed="true" stored="true" required="true"/>
  <field name="doc_type" type="string" indexed="true" stored="true"/>
  <field name="updated_at" type="pdate" indexed="true" stored="false"/>

  <!-- Patient fields -->
  <field name="patient_id" type="plong" indexed="true" stored="true"/>
  <field name="mrn" type="string" indexed="true" stored="true"/>
  <field name="first_name" type="text_general" indexed="true" stored="true"/>
  <field name="last_name" type="text_general" indexed="true" stored="true"/>
  <field name="full_name" type="text_general" indexed="true" stored="true"/>
  <field name="date_of_birth" type="pdate" indexed="true" stored="true"/>
  <field name="gender" type="string" indexed="true" stored="true"/>
  <field name="primary_phone" type="string" indexed="false" stored="true"/>
  <field name="email" type="string" indexed="false" stored="true"/>
  <field name="active_ind" type="string" indexed="true" stored="false"/>
  <field name="risk_tier" type="string" indexed="true" stored="true"/>
  <field name="risk_score" type="pint" indexed="true" stored="true"/>
  <field name="provider_id" type="plong" indexed="true" stored="false"/>
  <field name="org_id" type="plong" indexed="true" stored="false"/>

  <!-- Care gap fields -->
  <field name="care_gap_id" type="plong" indexed="true" stored="false"/>
  <field name="gap_status" type="string" indexed="true" stored="true"/>
  <field name="gap_priority" type="string" indexed="true" stored="true"/>
  <field name="measure_id" type="plong" indexed="true" stored="false"/>
  <field name="measure_name" type="text_general" indexed="true" stored="true"/>
  <field name="measure_code" type="string" indexed="true" stored="true"/>
  <field name="identified_date" type="pdate" indexed="true" stored="true"/>
  <field name="resolved_date" type="pdate" indexed="true" stored="true"/>
  <field name="due_date" type="pdate" indexed="true" stored="true"/>
  <field name="patient_name" type="text_general" indexed="true" stored="true"/>

  <!-- Catch-all: explicit sources only (no wildcard) -->
  <field name="_text_" type="text_general" indexed="true" stored="false" multiValued="true"/>
  <copyField source="full_name" dest="_text_"/>
  <copyField source="mrn" dest="_text_"/>
  <copyField source="measure_name" dest="_text_"/>
  <copyField source="measure_code" dest="_text_"/>
  <copyField source="patient_name" dest="_text_"/>
</schema>
```

- [ ] **Step 4: Create clinical core schema (`solr/clinical/conf/managed-schema.xml`)**

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<schema name="clinical" version="1.6">
  <uniqueKey>id</uniqueKey>

  <!-- Field types (same as search core) -->
  <fieldType name="string" class="solr.StrField" sortMissingLast="true"/>
  <fieldType name="plong" class="solr.LongPointField" docValues="true"/>
  <fieldType name="pint" class="solr.IntPointField" docValues="true"/>
  <fieldType name="pdouble" class="solr.DoublePointField" docValues="true"/>
  <fieldType name="pdate" class="solr.DatePointField" docValues="true"/>
  <fieldType name="text_general" class="solr.TextField" positionIncrementGap="100">
    <analyzer type="index">
      <tokenizer class="solr.StandardTokenizerFactory"/>
      <filter class="solr.LowerCaseFilterFactory"/>
    </analyzer>
    <analyzer type="query">
      <tokenizer class="solr.StandardTokenizerFactory"/>
      <filter class="solr.LowerCaseFilterFactory"/>
    </analyzer>
  </fieldType>

  <!-- Shared fields -->
  <field name="id" type="string" indexed="true" stored="true" required="true"/>
  <field name="doc_type" type="string" indexed="true" stored="true"/>
  <field name="patient_id" type="plong" indexed="true" stored="true"/>
  <field name="provider_id" type="plong" indexed="true" stored="false"/>
  <field name="updated_at" type="pdate" indexed="true" stored="false"/>

  <!-- Encounter fields -->
  <field name="encounter_id" type="plong" indexed="true" stored="false"/>
  <field name="encounter_datetime" type="pdate" indexed="true" stored="true"/>
  <field name="encounter_type" type="string" indexed="true" stored="true"/>
  <field name="discharge_disposition" type="string" indexed="false" stored="true"/>
  <field name="facility_name" type="text_general" indexed="false" stored="true"/>

  <!-- Condition fields -->
  <field name="condition_id" type="plong" indexed="true" stored="false"/>
  <field name="condition_name" type="text_general" indexed="true" stored="true"/>
  <field name="icd10_code" type="string" indexed="true" stored="true"/>
  <field name="diagnosis_status" type="string" indexed="true" stored="true"/>
  <field name="onset_date" type="pdate" indexed="true" stored="true"/>

  <!-- Observation fields -->
  <field name="observation_id" type="plong" indexed="true" stored="false"/>
  <field name="observation_code" type="string" indexed="true" stored="true"/>
  <field name="observation_name" type="text_general" indexed="true" stored="true"/>
  <field name="value_numeric" type="pdouble" indexed="true" stored="true"/>
  <field name="value_text" type="text_general" indexed="false" stored="true"/>
  <field name="units" type="string" indexed="false" stored="true"/>
  <field name="observation_datetime" type="pdate" indexed="true" stored="true"/>

  <!-- Medication fields -->
  <field name="medication_order_id" type="plong" indexed="true" stored="false"/>
  <field name="medication_name" type="text_general" indexed="true" stored="true"/>
  <field name="prescription_status" type="string" indexed="true" stored="true"/>

  <!-- Catch-all: explicit sources only -->
  <field name="_text_" type="text_general" indexed="true" stored="false" multiValued="true"/>
  <copyField source="condition_name" dest="_text_"/>
  <copyField source="icd10_code" dest="_text_"/>
  <copyField source="observation_name" dest="_text_"/>
  <copyField source="observation_code" dest="_text_"/>
  <copyField source="medication_name" dest="_text_"/>
  <copyField source="encounter_type" dest="_text_"/>
</schema>
```

- [ ] **Step 5: Create solrconfig.xml for each core with cache warming**

Create `solr/search/conf/solrconfig.xml` and `solr/clinical/conf/solrconfig.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<config>
  <luceneMatchVersion>9.7</luceneMatchVersion>

  <dataDir>${solr.data.dir:}</dataDir>

  <directoryFactory name="DirectoryFactory" class="${solr.directoryFactory:solr.NRTCachingDirectoryFactory}"/>

  <schemaFactory class="ClassicIndexSchemaFactory"/>

  <updateHandler class="solr.DirectUpdateHandler2">
    <autoCommit>
      <maxTime>60000</maxTime>
      <openSearcher>false</openSearcher>
    </autoCommit>
    <autoSoftCommit>
      <maxTime>5000</maxTime>
    </autoSoftCommit>
  </updateHandler>

  <query>
    <filterCache class="solr.CaffeineCache" size="4096" initialSize="512" autowarmCount="128"/>
    <queryResultCache class="solr.CaffeineCache" size="2048" initialSize="256" autowarmCount="128"/>
    <documentCache class="solr.CaffeineCache" size="4096" initialSize="512"/>
  </query>

  <requestHandler name="/select" class="solr.SearchHandler">
    <lst name="defaults">
      <str name="echoParams">explicit</str>
      <str name="wt">json</str>
      <str name="indent">false</str>
      <str name="df">_text_</str>
    </lst>
  </requestHandler>

  <requestHandler name="/update" class="solr.UpdateRequestHandler"/>

  <requestHandler name="/admin/ping" class="solr.PingRequestHandler">
    <lst name="invariants">
      <str name="q">*:*</str>
    </lst>
    <lst name="defaults">
      <str name="echoParams">all</str>
    </lst>
  </requestHandler>
</config>
```

- [ ] **Step 6: Create stopwords.txt and synonyms.txt for search core**

`solr/search/conf/stopwords.txt`:
```
# Standard English stopwords
a an and are as at be but by for if in into is it no not of on or such that the their then there these they this to was will with
```

`solr/search/conf/synonyms.txt`:
```
# Medical synonyms (extend as needed)
DM,diabetes mellitus,diabetes
HTN,hypertension,high blood pressure
CHF,congestive heart failure,heart failure
COPD,chronic obstructive pulmonary disease
MI,myocardial infarction,heart attack
```

- [ ] **Step 7: Start Solr and verify cores load**

```bash
npm run demo:infra
# Wait for Solr healthy
curl -sf http://localhost:8983/solr/admin/cores?action=STATUS | head -20
```

Expected: Both `search` and `clinical` cores listed with status.

- [ ] **Step 8: Commit infrastructure**

```bash
git add docker-compose.demo.yml solr/
git commit -m "feat: add Solr 9.7 to Docker Compose with search and clinical cores"
```

---

### Task 2: Scaffold `packages/solr` Package

**Files:**
- Create: `packages/solr/package.json`
- Create: `packages/solr/tsconfig.json`
- Create: `packages/solr/src/index.ts`
- Create: `packages/solr/src/client.ts`
- Modify: `turbo.json`
- Modify: `apps/api/tsconfig.json`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Create `packages/solr/package.json`**

```json
{
  "name": "@medgnosis/solr",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc --project tsconfig.json",
    "typecheck": "tsc --project tsconfig.json --noEmit",
    "test": "vitest run",
    "reindex:search": "node --import tsx/esm src/sync/full-reindex.ts --core=search",
    "reindex:clinical": "node --import tsx/esm src/sync/full-reindex.ts --core=clinical",
    "reindex:all": "npm run reindex:search && npm run reindex:clinical",
    "cdc:start": "node --import tsx/esm src/sync/cdc-listener.ts",
    "benchmark": "node --import tsx/esm src/benchmark/run.ts"
  },
  "dependencies": {
    "@medgnosis/db": "*",
    "undici": "^7.0.0",
    "ioredis": "^5.4.1"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/solr/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create Solr HTTP client (`packages/solr/src/client.ts`)**

```typescript
// =============================================================================
// Medgnosis Solr — HTTP client wrapping undici for Solr REST API
// =============================================================================

import { request as httpRequest } from 'undici';

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
  fq?: string[];
  fl?: string;
  sort?: string;
  start?: number;
  rows?: number;
  wt?: string;
}

export interface SolrResponse<T = Record<string, unknown>> {
  responseHeader: { status: number; QTime: number };
  response: { numFound: number; start: number; docs: T[] };
}

export interface SolrUpdateResponse {
  responseHeader: { status: number; QTime: number };
}

function buildConfig(): SolrConfig {
  return {
    baseUrl: process.env['SOLR_URL'] ?? 'http://localhost:8983/solr',
    searchCore: process.env['SOLR_SEARCH_CORE'] ?? 'search',
    clinicalCore: process.env['SOLR_CLINICAL_CORE'] ?? 'clinical',
    authUser: process.env['SOLR_AUTH_USER'] ?? 'medgnosis',
    authPassword: process.env['SOLR_AUTH_PASSWORD'] ?? 'devsecret',
    timeoutMs: Number(process.env['SOLR_TIMEOUT_MS'] ?? '10000'),
  };
}

export class SolrClient {
  readonly config: SolrConfig;

  constructor(config?: SolrConfig) {
    this.config = config ?? buildConfig();
  }

  private authHeader(): string {
    const creds = Buffer.from(
      `${this.config.authUser}:${this.config.authPassword}`,
    ).toString('base64');
    return `Basic ${creds}`;
  }

  private coreUrl(core: 'search' | 'clinical'): string {
    const coreName =
      core === 'search' ? this.config.searchCore : this.config.clinicalCore;
    return `${this.config.baseUrl}/${coreName}`;
  }

  async query<T = Record<string, unknown>>(
    core: 'search' | 'clinical',
    params: SolrQueryParams,
  ): Promise<SolrResponse<T>> {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    searchParams.set('wt', params.wt ?? 'json');
    if (params.fl) searchParams.set('fl', params.fl);
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.start !== undefined)
      searchParams.set('start', String(params.start));
    if (params.rows !== undefined)
      searchParams.set('rows', String(params.rows));
    if (params.fq) {
      for (const f of params.fq) {
        searchParams.append('fq', f);
      }
    }

    const url = `${this.coreUrl(core)}/select?${searchParams.toString()}`;
    const { statusCode, body } = await httpRequest(url, {
      method: 'GET',
      headers: { Authorization: this.authHeader() },
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const text = await body.text();
    if (statusCode !== 200) {
      throw new Error(`Solr query failed (${statusCode}): ${text.substring(0, 500)}`);
    }
    return JSON.parse(text) as SolrResponse<T>;
  }

  async update(
    core: 'search' | 'clinical',
    docs: Record<string, unknown>[],
  ): Promise<SolrUpdateResponse> {
    const url = `${this.coreUrl(core)}/update?wt=json`;
    const { statusCode, body } = await httpRequest(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(docs),
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const text = await body.text();
    if (statusCode !== 200) {
      throw new Error(`Solr update failed (${statusCode}): ${text.substring(0, 500)}`);
    }
    return JSON.parse(text) as SolrUpdateResponse;
  }

  async deleteByQuery(
    core: 'search' | 'clinical',
    query: string,
  ): Promise<SolrUpdateResponse> {
    const url = `${this.coreUrl(core)}/update?wt=json`;
    const { statusCode, body } = await httpRequest(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ delete: { query } }),
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const text = await body.text();
    if (statusCode !== 200) {
      throw new Error(`Solr delete failed (${statusCode}): ${text.substring(0, 500)}`);
    }
    return JSON.parse(text) as SolrUpdateResponse;
  }

  async commit(core: 'search' | 'clinical'): Promise<SolrUpdateResponse> {
    const url = `${this.coreUrl(core)}/update?commit=true&wt=json`;
    const { statusCode, body } = await httpRequest(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: '{}',
      headersTimeout: this.config.timeoutMs,
      bodyTimeout: this.config.timeoutMs,
    });

    const text = await body.text();
    if (statusCode !== 200) {
      throw new Error(`Solr commit failed (${statusCode}): ${text.substring(0, 500)}`);
    }
    return JSON.parse(text) as SolrUpdateResponse;
  }

  async ping(core: 'search' | 'clinical'): Promise<boolean> {
    try {
      const url = `${this.coreUrl(core)}/admin/ping?wt=json`;
      const { statusCode } = await httpRequest(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader() },
        headersTimeout: 3000,
        bodyTimeout: 3000,
      });
      return statusCode === 200;
    } catch {
      return false;
    }
  }

  async coreStatus(core: 'search' | 'clinical'): Promise<Record<string, unknown>> {
    const coreName =
      core === 'search' ? this.config.searchCore : this.config.clinicalCore;
    const url = `${this.config.baseUrl}/admin/cores?action=STATUS&core=${coreName}&wt=json`;
    const { body } = await httpRequest(url, {
      method: 'GET',
      headers: { Authorization: this.authHeader() },
      headersTimeout: 5000,
      bodyTimeout: 5000,
    });
    return JSON.parse(await body.text()) as Record<string, unknown>;
  }
}
```

- [ ] **Step 4: Create package index (`packages/solr/src/index.ts`)**

```typescript
export { SolrClient } from './client.js';
export type { SolrConfig, SolrQueryParams, SolrResponse, SolrUpdateResponse } from './client.js';
export { buildSearchCoreQuery } from './query/search-query.js';
export { buildClinicalCoreQuery } from './query/clinical-query.js';
```

- [ ] **Step 5: Add `@medgnosis/solr` dependency to API**

In `apps/api/package.json`, add to dependencies:
```json
"@medgnosis/solr": "*"
```

In `apps/api/tsconfig.json`, add to references:
```json
{ "path": "../../packages/solr" }
```

- [ ] **Step 6: Add Solr env vars to API config**

In `apps/api/src/config.ts`, add after `redisUrl`:
```typescript
  // Solr (full-text search acceleration)
  solrEnabled: optionalBool('SOLR_ENABLED', true),
  solrUrl: optional('SOLR_URL', 'http://localhost:8983/solr'),
  solrSearchCore: optional('SOLR_SEARCH_CORE', 'search'),
  solrClinicalCore: optional('SOLR_CLINICAL_CORE', 'clinical'),
  solrAuthUser: optional('SOLR_AUTH_USER', 'medgnosis'),
  solrAuthPassword: optional('SOLR_AUTH_PASSWORD', 'devsecret'),
```

- [ ] **Step 7: Add solr tasks to turbo.json**

In `turbo.json`, add after `db:seed`:
```json
    "solr:reindex": {
      "cache": false,
      "passThroughEnv": ["DATABASE_URL", "SOLR_URL", "SOLR_AUTH_USER", "SOLR_AUTH_PASSWORD"]
    },
    "solr:cdc": {
      "cache": false,
      "persistent": true,
      "passThroughEnv": ["DATABASE_URL", "SOLR_URL", "REDIS_URL", "SOLR_AUTH_USER", "SOLR_AUTH_PASSWORD"]
    }
```

- [ ] **Step 8: Install dependencies and verify build**

```bash
cd /home/smudoshi/Github/Medgnosis && npm install
cd packages/solr && npx tsc --noEmit
```

Expected: Clean build, no errors.

- [ ] **Step 9: Commit scaffolding**

```bash
git add packages/solr/ apps/api/package.json apps/api/tsconfig.json apps/api/src/config.ts turbo.json
git commit -m "feat: scaffold @medgnosis/solr package with HTTP client"
```

---

## Chunk 2: Solr Query Builders

### Task 3: Search Core Query Builder

**Files:**
- Create: `packages/solr/src/query/search-query.ts`
- Create: `packages/solr/src/query/__tests__/search-query.test.ts`

- [ ] **Step 1: Write failing tests for search query builder**

Create `packages/solr/src/query/__tests__/search-query.test.ts`:

```typescript
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

  it('builds global search (no doc_type filter) with wildcard query', () => {
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

  it('returns correct sort for patients', () => {
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
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /home/smudoshi/Github/Medgnosis/packages/solr && npx vitest run src/query/__tests__/search-query.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement search query builder**

Create `packages/solr/src/query/search-query.ts`:

```typescript
import type { SolrQueryParams } from '../client.js';

export interface SearchCoreQueryOptions {
  searchTerm: string;
  docType?: 'patient' | 'care_gap';
  providerId?: number;
  filters?: Record<string, string>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit: number;
  offset: number;
  fields?: string;
}

const PATIENT_FIELDS =
  'id,patient_id,mrn,first_name,last_name,full_name,date_of_birth,gender,risk_tier,risk_score,doc_type';
const CARE_GAP_FIELDS =
  'id,care_gap_id,patient_id,patient_name,measure_name,measure_code,gap_status,gap_priority,due_date,identified_date,resolved_date,doc_type';
const ALL_FIELDS = `${PATIENT_FIELDS},${CARE_GAP_FIELDS}`;

function buildSort(
  docType?: string,
  sortBy?: string,
  sortOrder?: string,
): string {
  if (sortBy === 'name') return `last_name ${sortOrder ?? 'asc'}`;
  if (sortBy === 'mrn') return `mrn ${sortOrder ?? 'asc'}`;
  if (sortBy === 'risk_score') return `risk_score ${sortOrder ?? 'desc'}`;
  if (docType === 'care_gap') return 'gap_priority asc, due_date asc';
  return 'score desc';
}

export function buildSearchCoreQuery(
  opts: SearchCoreQueryOptions,
): SolrQueryParams {
  const fq: string[] = [];

  if (opts.docType) fq.push(`doc_type:${opts.docType}`);
  if (opts.providerId) fq.push(`provider_id:${opts.providerId}`);
  if (opts.docType === 'patient') fq.push('active_ind:Y');

  if (opts.filters) {
    for (const [key, value] of Object.entries(opts.filters)) {
      if (value) fq.push(`${key}:${value}`);
    }
  }

  const fl =
    opts.fields ??
    (opts.docType === 'patient'
      ? PATIENT_FIELDS
      : opts.docType === 'care_gap'
        ? CARE_GAP_FIELDS
        : ALL_FIELDS);

  return {
    q: opts.searchTerm,
    fq: fq.length > 0 ? fq : undefined,
    fl,
    sort: buildSort(opts.docType, opts.sortBy, opts.sortOrder),
    start: opts.offset,
    rows: opts.limit,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /home/smudoshi/Github/Medgnosis/packages/solr && npx vitest run src/query/__tests__/search-query.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/solr/src/query/
git commit -m "feat: add search core Solr query builder with tests"
```

---

### Task 4: Clinical Core Query Builder

**Files:**
- Create: `packages/solr/src/query/clinical-query.ts`
- Create: `packages/solr/src/query/__tests__/clinical-query.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/solr/src/query/__tests__/clinical-query.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildClinicalCoreQuery } from '../clinical-query.js';

describe('buildClinicalCoreQuery', () => {
  it('builds conditions query for a patient', () => {
    const result = buildClinicalCoreQuery({
      patientId: 123,
      docType: 'condition',
      limit: 500,
      offset: 0,
    });
    expect(result.fq).toContain('patient_id:123');
    expect(result.fq).toContain('doc_type:condition');
    expect(result.q).toBe('*:*');
    expect(result.rows).toBe(500);
  });

  it('builds observation query with search term', () => {
    const result = buildClinicalCoreQuery({
      patientId: 123,
      docType: 'observation',
      searchTerm: 'blood pressure',
      limit: 100,
      offset: 0,
    });
    expect(result.q).toBe('blood pressure');
    expect(result.fq).toContain('doc_type:observation');
  });

  it('builds encounter query sorted by date desc', () => {
    const result = buildClinicalCoreQuery({
      patientId: 456,
      docType: 'encounter',
      limit: 50,
      offset: 0,
    });
    expect(result.sort).toBe('encounter_datetime desc');
  });

  it('builds medication query with status filter', () => {
    const result = buildClinicalCoreQuery({
      patientId: 789,
      docType: 'medication',
      filters: { prescription_status: 'active' },
      limit: 100,
      offset: 0,
    });
    expect(result.fq).toContain('prescription_status:active');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /home/smudoshi/Github/Medgnosis/packages/solr && npx vitest run src/query/__tests__/clinical-query.test.ts
```

- [ ] **Step 3: Implement clinical query builder**

Create `packages/solr/src/query/clinical-query.ts`:

```typescript
import type { SolrQueryParams } from '../client.js';

export type ClinicalDocType = 'encounter' | 'condition' | 'observation' | 'medication';

export interface ClinicalCoreQueryOptions {
  patientId: number;
  docType: ClinicalDocType;
  searchTerm?: string;
  filters?: Record<string, string>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit: number;
  offset: number;
  fields?: string;
}

const FIELD_MAP: Record<ClinicalDocType, string> = {
  encounter:
    'id,encounter_id,patient_id,encounter_datetime,encounter_type,discharge_disposition,facility_name,doc_type',
  condition:
    'id,condition_id,patient_id,condition_name,icd10_code,diagnosis_status,onset_date,doc_type',
  observation:
    'id,observation_id,patient_id,observation_code,observation_name,value_numeric,value_text,units,observation_datetime,doc_type',
  medication:
    'id,medication_order_id,patient_id,medication_name,prescription_status,doc_type',
};

const DEFAULT_SORT: Record<ClinicalDocType, string> = {
  encounter: 'encounter_datetime desc',
  condition: 'condition_name asc',
  observation: 'observation_datetime desc',
  medication: 'medication_name asc',
};

export function buildClinicalCoreQuery(
  opts: ClinicalCoreQueryOptions,
): SolrQueryParams {
  const fq: string[] = [
    `patient_id:${opts.patientId}`,
    `doc_type:${opts.docType}`,
  ];

  if (opts.filters) {
    for (const [key, value] of Object.entries(opts.filters)) {
      if (value) fq.push(`${key}:${value}`);
    }
  }

  return {
    q: opts.searchTerm ?? '*:*',
    fq,
    fl: opts.fields ?? FIELD_MAP[opts.docType],
    sort: DEFAULT_SORT[opts.docType],
    start: opts.offset,
    rows: opts.limit,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /home/smudoshi/Github/Medgnosis/packages/solr && npx vitest run src/query/__tests__/clinical-query.test.ts
```

- [ ] **Step 5: Update index.ts exports and commit**

Verify `packages/solr/src/index.ts` exports both builders, then:

```bash
git add packages/solr/src/query/ packages/solr/src/index.ts
git commit -m "feat: add clinical core Solr query builder with tests"
```

---

## Chunk 3: Benchmark Framework (Before/After)

### Task 5: Create Baseline Benchmark Script

**Files:**
- Create: `packages/solr/src/benchmark/run.ts`
- Create: `packages/solr/src/benchmark/types.ts`

The benchmark measures latency for each endpoint with PG (baseline), then after Solr integration compares. The user wants to see before/after results.

- [ ] **Step 1: Create benchmark types**

Create `packages/solr/src/benchmark/types.ts`:

```typescript
export interface BenchmarkResult {
  endpoint: string;
  method: string;
  source: 'pg' | 'solr';
  samples: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
}

export interface BenchmarkSuite {
  timestamp: string;
  mode: 'baseline' | 'solr';
  results: BenchmarkResult[];
}
```

- [ ] **Step 2: Create benchmark runner**

Create `packages/solr/src/benchmark/run.ts`:

```typescript
// =============================================================================
// Medgnosis Solr — Benchmark runner
// Usage: npm run benchmark -- --mode=baseline|solr
// Requires: API running on localhost:3002, valid JWT token
// =============================================================================

import { request } from 'undici';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BenchmarkResult, BenchmarkSuite } from './types.js';

const API_BASE = process.env['API_BASE'] ?? 'http://localhost:3002';
const SAMPLES = Number(process.env['BENCH_SAMPLES'] ?? '20');
const WARMUP = 3;
const RESULTS_DIR = resolve(import.meta.dirname, '../../benchmark-results');

// Parse --mode=baseline|solr from argv
const modeArg = process.argv.find((a) => a.startsWith('--mode='));
const mode = (modeArg?.split('=')[1] ?? 'baseline') as 'baseline' | 'solr';

// Endpoints to benchmark — requires a known patient_id and auth token
const ENDPOINTS = [
  { name: 'Global search', method: 'GET', path: '/search?q=john&limit=20' },
  { name: 'Patient list search', method: 'GET', path: '/patients?search=smith&page=1&per_page=25' },
  { name: 'Care gaps search', method: 'GET', path: '/care-gaps?search=diabetes&status=open&page=1&per_page=25' },
  { name: 'Patient conditions', method: 'GET', path: '/patients/1/conditions' },
  { name: 'Patient observations', method: 'GET', path: '/patients/1/observations' },
  { name: 'Patient medications', method: 'GET', path: '/patients/1/medications?limit=100' },
  { name: 'Patient encounters', method: 'GET', path: '/patients/1/encounters?limit=50' },
  { name: 'Dashboard', method: 'GET', path: '/dashboard' },
];

async function getAuthToken(): Promise<string> {
  const { body } = await request(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dr.udoshi@medgnosis.app', password: 'password' }),
  });
  const data = (await body.json()) as { data?: { accessToken?: string } };
  const token = data.data?.accessToken;
  if (!token) throw new Error('Failed to get auth token');
  return token;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

async function benchmarkEndpoint(
  ep: (typeof ENDPOINTS)[0],
  token: string,
): Promise<BenchmarkResult> {
  const timings: number[] = [];
  const url = `${API_BASE}${ep.path}`;

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    const { body } = await request(url, {
      method: ep.method as 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    await body.text(); // drain
  }

  // Measured runs
  for (let i = 0; i < SAMPLES; i++) {
    const start = performance.now();
    const { body, headers } = await request(url, {
      method: ep.method as 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    await body.text(); // drain
    const elapsed = performance.now() - start;
    timings.push(elapsed);

    const source = headers['x-query-source'];
    if (mode === 'solr' && source && source !== 'solr') {
      console.warn(`  [!] ${ep.name}: expected Solr but got ${source}`);
    }
  }

  timings.sort((a, b) => a - b);
  const sum = timings.reduce((a, b) => a + b, 0);

  return {
    endpoint: ep.path,
    method: ep.method,
    source: mode === 'baseline' ? 'pg' : 'solr',
    samples: SAMPLES,
    p50Ms: Math.round(percentile(timings, 50) * 100) / 100,
    p95Ms: Math.round(percentile(timings, 95) * 100) / 100,
    p99Ms: Math.round(percentile(timings, 99) * 100) / 100,
    meanMs: Math.round((sum / timings.length) * 100) / 100,
    minMs: Math.round(timings[0]! * 100) / 100,
    maxMs: Math.round(timings[timings.length - 1]! * 100) / 100,
  };
}

function printTable(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(100));
  console.log(`BENCHMARK RESULTS (${mode.toUpperCase()}) — ${SAMPLES} samples per endpoint`);
  console.log('='.repeat(100));
  console.log(
    'Endpoint'.padEnd(35) +
    'Source'.padEnd(8) +
    'P50'.padStart(10) +
    'P95'.padStart(10) +
    'P99'.padStart(10) +
    'Mean'.padStart(10) +
    'Min'.padStart(10) +
    'Max'.padStart(10),
  );
  console.log('-'.repeat(100));
  for (const r of results) {
    console.log(
      r.endpoint.substring(0, 34).padEnd(35) +
      r.source.padEnd(8) +
      `${r.p50Ms}ms`.padStart(10) +
      `${r.p95Ms}ms`.padStart(10) +
      `${r.p99Ms}ms`.padStart(10) +
      `${r.meanMs}ms`.padStart(10) +
      `${r.minMs}ms`.padStart(10) +
      `${r.maxMs}ms`.padStart(10),
    );
  }
  console.log('='.repeat(100));
}

function printComparison(baseline: BenchmarkSuite, solr: BenchmarkSuite): void {
  console.log('\n' + '='.repeat(110));
  console.log('BEFORE vs AFTER COMPARISON');
  console.log('='.repeat(110));
  console.log(
    'Endpoint'.padEnd(35) +
    'PG P50'.padStart(10) +
    'Solr P50'.padStart(10) +
    'Speedup'.padStart(10) +
    'PG P95'.padStart(10) +
    'Solr P95'.padStart(10) +
    'Speedup'.padStart(10),
  );
  console.log('-'.repeat(110));

  for (const sr of solr.results) {
    const br = baseline.results.find((b) => b.endpoint === sr.endpoint);
    if (!br) continue;
    const p50Speedup = br.p50Ms / Math.max(sr.p50Ms, 0.01);
    const p95Speedup = br.p95Ms / Math.max(sr.p95Ms, 0.01);
    console.log(
      sr.endpoint.substring(0, 34).padEnd(35) +
      `${br.p50Ms}ms`.padStart(10) +
      `${sr.p50Ms}ms`.padStart(10) +
      `${p50Speedup.toFixed(1)}x`.padStart(10) +
      `${br.p95Ms}ms`.padStart(10) +
      `${sr.p95Ms}ms`.padStart(10) +
      `${p95Speedup.toFixed(1)}x`.padStart(10),
    );
  }
  console.log('='.repeat(110));
}

async function main(): Promise<void> {
  console.log(`Benchmarking in ${mode} mode (${SAMPLES} samples, ${WARMUP} warmup)...`);
  const token = await getAuthToken();

  const results: BenchmarkResult[] = [];
  for (const ep of ENDPOINTS) {
    process.stdout.write(`  ${ep.name}...`);
    const result = await benchmarkEndpoint(ep, token);
    results.push(result);
    console.log(` ${result.p50Ms}ms (p50)`);
  }

  const suite: BenchmarkSuite = {
    timestamp: new Date().toISOString(),
    mode,
    results,
  };

  printTable(results);

  // Save results
  const { mkdirSync } = await import('node:fs');
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = resolve(RESULTS_DIR, `${mode}-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(suite, null, 2));
  console.log(`\nResults saved to: ${outPath}`);

  // If Solr mode, load latest baseline and print comparison
  if (mode === 'solr') {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(RESULTS_DIR)
      .filter((f) => f.startsWith('baseline-'))
      .sort()
      .reverse();
    if (files.length > 0) {
      const baselinePath = resolve(RESULTS_DIR, files[0]!);
      const baseline = JSON.parse(
        readFileSync(baselinePath, 'utf-8'),
      ) as BenchmarkSuite;
      printComparison(baseline, suite);
    } else {
      console.log('\nNo baseline found — run with --mode=baseline first for comparison.');
    }
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Run baseline benchmark (requires API running)**

```bash
cd /home/smudoshi/Github/Medgnosis/packages/solr && npm run benchmark -- --mode=baseline
```

Expected: Table of PG baseline latencies printed. JSON saved to `benchmark-results/`.

- [ ] **Step 4: Commit**

```bash
git add packages/solr/src/benchmark/ packages/solr/benchmark-results/
git commit -m "feat: add benchmark framework with baseline PG measurements"
```

---

## Chunk 4: Indexers & Full Reindex

### Task 6: Entity Indexers

**Files:**
- Create: `packages/solr/src/indexers/patients.ts`
- Create: `packages/solr/src/indexers/care-gaps.ts`
- Create: `packages/solr/src/indexers/encounters.ts`
- Create: `packages/solr/src/indexers/conditions.ts`
- Create: `packages/solr/src/indexers/observations.ts`
- Create: `packages/solr/src/indexers/medications.ts`

Each indexer exports a `reindex(client, batchSize)` function that cursor-paginates through PG and pushes batches to Solr.

- [ ] **Step 1: Create patients indexer**

Create `packages/solr/src/indexers/patients.ts`:

```typescript
import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';

export async function reindexPatients(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: (indexed: number) => void,
): Promise<number> {
  let lastId = 0;
  let totalIndexed = 0;

  while (true) {
    const rows = await sql`
      SELECT
        p.patient_id,
        p.mrn,
        p.first_name,
        p.last_name,
        p.first_name || ' ' || p.last_name AS full_name,
        p.date_of_birth,
        p.gender,
        p.primary_phone,
        p.email,
        p.active_ind,
        p.pcp_provider_id AS provider_id,
        p.org_id,
        prh.risk_tier,
        prh.score AS risk_score
      FROM phm_edw.patient p
      LEFT JOIN LATERAL (
        SELECT risk_tier, score
        FROM phm_edw.patient_risk_history
        WHERE patient_id = p.patient_id
        ORDER BY computed_at DESC
        LIMIT 1
      ) prh ON true
      WHERE p.patient_id > ${lastId}
      ORDER BY p.patient_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map((r) => ({
      id: `patient_${r.patient_id}`,
      doc_type: 'patient',
      patient_id: r.patient_id,
      mrn: r.mrn,
      first_name: r.first_name,
      last_name: r.last_name,
      full_name: r.full_name,
      date_of_birth: r.date_of_birth
        ? new Date(r.date_of_birth as string).toISOString()
        : null,
      gender: r.gender,
      primary_phone: r.primary_phone,
      email: r.email,
      active_ind: r.active_ind,
      provider_id: r.provider_id,
      org_id: r.org_id,
      risk_tier: r.risk_tier ?? 'unknown',
      risk_score: r.risk_score ?? 0,
      updated_at: new Date().toISOString(),
    }));

    await solr.update('search', docs);
    totalIndexed += docs.length;
    lastId = rows[rows.length - 1]!.patient_id as number;
    onProgress?.(totalIndexed);
  }

  return totalIndexed;
}
```

- [ ] **Step 2: Create care-gaps indexer**

Create `packages/solr/src/indexers/care-gaps.ts`:

```typescript
import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';

export async function reindexCareGaps(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: (indexed: number) => void,
): Promise<number> {
  let lastId = 0;
  let totalIndexed = 0;

  while (true) {
    const rows = await sql`
      SELECT
        cg.care_gap_id,
        cg.patient_id,
        p.first_name || ' ' || p.last_name AS patient_name,
        p.pcp_provider_id AS provider_id,
        md.measure_name,
        md.measure_code,
        cg.measure_id,
        cg.gap_status,
        cg.gap_priority,
        cg.due_date,
        cg.identified_date,
        cg.resolved_date,
        cg.active_ind
      FROM phm_edw.care_gap cg
      JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
      LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      WHERE cg.care_gap_id > ${lastId}
      ORDER BY cg.care_gap_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map((r) => ({
      id: `care_gap_${r.care_gap_id}`,
      doc_type: 'care_gap',
      care_gap_id: r.care_gap_id,
      patient_id: r.patient_id,
      patient_name: r.patient_name,
      provider_id: r.provider_id,
      measure_name: r.measure_name,
      measure_code: r.measure_code,
      measure_id: r.measure_id,
      gap_status: r.gap_status,
      gap_priority: r.gap_priority,
      due_date: r.due_date ? new Date(r.due_date as string).toISOString() : null,
      identified_date: r.identified_date
        ? new Date(r.identified_date as string).toISOString()
        : null,
      resolved_date: r.resolved_date
        ? new Date(r.resolved_date as string).toISOString()
        : null,
      active_ind: r.active_ind,
      updated_at: new Date().toISOString(),
    }));

    await solr.update('search', docs);
    totalIndexed += docs.length;
    lastId = rows[rows.length - 1]!.care_gap_id as number;
    onProgress?.(totalIndexed);
  }

  return totalIndexed;
}
```

- [ ] **Step 3: Create encounters indexer**

Create `packages/solr/src/indexers/encounters.ts`:

```typescript
import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';

export async function reindexEncounters(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: (indexed: number) => void,
): Promise<number> {
  let lastId = 0;
  let totalIndexed = 0;

  while (true) {
    const rows = await sql`
      SELECT
        e.encounter_id,
        e.patient_id,
        e.provider_id,
        e.encounter_datetime,
        e.encounter_type,
        e.discharge_disposition,
        o.org_name AS facility_name
      FROM phm_edw.encounter e
      LEFT JOIN phm_edw.organization o ON o.org_id = e.facility_id
      WHERE e.encounter_id > ${lastId}
        AND e.active_ind = 'Y'
      ORDER BY e.encounter_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map((r) => ({
      id: `encounter_${r.encounter_id}`,
      doc_type: 'encounter',
      encounter_id: r.encounter_id,
      patient_id: r.patient_id,
      provider_id: r.provider_id,
      encounter_datetime: r.encounter_datetime
        ? new Date(r.encounter_datetime as string).toISOString()
        : null,
      encounter_type: r.encounter_type,
      discharge_disposition: r.discharge_disposition,
      facility_name: r.facility_name,
      updated_at: new Date().toISOString(),
    }));

    await solr.update('clinical', docs);
    totalIndexed += docs.length;
    lastId = rows[rows.length - 1]!.encounter_id as number;
    onProgress?.(totalIndexed);
  }

  return totalIndexed;
}
```

- [ ] **Step 4: Create conditions indexer**

Create `packages/solr/src/indexers/conditions.ts`:

```typescript
import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';

export async function reindexConditions(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: (indexed: number) => void,
): Promise<number> {
  let lastId = 0;
  let totalIndexed = 0;

  while (true) {
    const rows = await sql`
      SELECT
        cd.condition_diagnosis_id,
        cd.patient_id,
        cd.provider_id,
        c.condition_name,
        c.icd10_code,
        cd.diagnosis_status,
        cd.onset_date
      FROM phm_edw.condition_diagnosis cd
      JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
      WHERE cd.condition_diagnosis_id > ${lastId}
        AND cd.active_ind = 'Y'
      ORDER BY cd.condition_diagnosis_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map((r) => ({
      id: `condition_${r.condition_diagnosis_id}`,
      doc_type: 'condition',
      condition_id: r.condition_diagnosis_id,
      patient_id: r.patient_id,
      provider_id: r.provider_id,
      condition_name: r.condition_name,
      icd10_code: r.icd10_code,
      diagnosis_status: r.diagnosis_status,
      onset_date: r.onset_date
        ? new Date(r.onset_date as string).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    }));

    await solr.update('clinical', docs);
    totalIndexed += docs.length;
    lastId = rows[rows.length - 1]!.condition_diagnosis_id as number;
    onProgress?.(totalIndexed);
  }

  return totalIndexed;
}
```

- [ ] **Step 5: Create observations indexer**

Create `packages/solr/src/indexers/observations.ts`:

```typescript
import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';

export async function reindexObservations(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: (indexed: number) => void,
): Promise<number> {
  let lastId = 0;
  let totalIndexed = 0;

  while (true) {
    const rows = await sql`
      SELECT
        ob.observation_id,
        ob.patient_id,
        ob.provider_id,
        ob.observation_code,
        ob.observation_name,
        ob.value_numeric,
        ob.value_text,
        ob.units,
        ob.observation_datetime
      FROM phm_edw.observation ob
      WHERE ob.observation_id > ${lastId}
        AND ob.active_ind = 'Y'
      ORDER BY ob.observation_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map((r) => ({
      id: `observation_${r.observation_id}`,
      doc_type: 'observation',
      observation_id: r.observation_id,
      patient_id: r.patient_id,
      provider_id: r.provider_id,
      observation_code: r.observation_code,
      observation_name: r.observation_name,
      value_numeric: r.value_numeric,
      value_text: r.value_text,
      units: r.units,
      observation_datetime: r.observation_datetime
        ? new Date(r.observation_datetime as string).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    }));

    await solr.update('clinical', docs);
    totalIndexed += docs.length;
    lastId = rows[rows.length - 1]!.observation_id as number;
    onProgress?.(totalIndexed);
  }

  return totalIndexed;
}
```

- [ ] **Step 6: Create medications indexer**

Create `packages/solr/src/indexers/medications.ts`:

```typescript
import { sql } from '@medgnosis/db';
import type { SolrClient } from '../client.js';

export async function reindexMedications(
  solr: SolrClient,
  batchSize = 5000,
  onProgress?: (indexed: number) => void,
): Promise<number> {
  let lastId = 0;
  let totalIndexed = 0;

  while (true) {
    const rows = await sql`
      SELECT
        mo.medication_order_id,
        mo.patient_id,
        mo.provider_id,
        m.medication_name,
        mo.prescription_status
      FROM phm_edw.medication_order mo
      JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
      WHERE mo.medication_order_id > ${lastId}
        AND mo.active_ind = 'Y'
      ORDER BY mo.medication_order_id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    const docs = rows.map((r) => ({
      id: `medication_${r.medication_order_id}`,
      doc_type: 'medication',
      medication_order_id: r.medication_order_id,
      patient_id: r.patient_id,
      provider_id: r.provider_id,
      medication_name: r.medication_name,
      prescription_status: r.prescription_status,
      updated_at: new Date().toISOString(),
    }));

    await solr.update('clinical', docs);
    totalIndexed += docs.length;
    lastId = rows[rows.length - 1]!.medication_order_id as number;
    onProgress?.(totalIndexed);
  }

  return totalIndexed;
}
```

- [ ] **Step 7: Commit indexers**

```bash
git add packages/solr/src/indexers/
git commit -m "feat: add batch indexers for all 6 entity types"
```

---

### Task 7: Full Reindex Script

**Files:**
- Create: `packages/solr/src/sync/full-reindex.ts`

- [ ] **Step 1: Create full reindex script**

Create `packages/solr/src/sync/full-reindex.ts`:

```typescript
// =============================================================================
// Medgnosis Solr — Full reindex script
// Usage: npm run reindex:all (or reindex:search / reindex:clinical)
// =============================================================================

import { sql } from '@medgnosis/db';
import { SolrClient } from '../client.js';
import { reindexPatients } from '../indexers/patients.js';
import { reindexCareGaps } from '../indexers/care-gaps.js';
import { reindexEncounters } from '../indexers/encounters.js';
import { reindexConditions } from '../indexers/conditions.js';
import { reindexObservations } from '../indexers/observations.js';
import { reindexMedications } from '../indexers/medications.js';

const coreArg = process.argv.find((a) => a.startsWith('--core='));
const targetCore = coreArg?.split('=')[1] as 'search' | 'clinical' | undefined;

async function logToEtl(
  sourceSystem: string,
  rowsInserted: number,
  loadStatus: string,
): Promise<void> {
  try {
    await sql`
      INSERT INTO phm_edw.etl_log (source_system, rows_inserted, load_status)
      VALUES (${sourceSystem}, ${rowsInserted}, ${loadStatus})
    `;
  } catch {
    console.warn('Failed to write etl_log entry');
  }
}

function progress(label: string) {
  return (count: number) => {
    process.stdout.write(`\r  ${label}: ${count.toLocaleString()} docs indexed`);
  };
}

async function reindexSearchCore(solr: SolrClient): Promise<void> {
  console.log('\n[search core] Starting full reindex...');
  const start = performance.now();

  // Clear existing docs
  await solr.deleteByQuery('search', '*:*');
  await solr.commit('search');

  const patients = await reindexPatients(solr, 5000, progress('Patients'));
  console.log('');
  const careGaps = await reindexCareGaps(solr, 5000, progress('Care Gaps'));
  console.log('');

  await solr.commit('search');
  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  const total = patients + careGaps;
  console.log(
    `[search core] Complete: ${total.toLocaleString()} docs in ${elapsed}s`,
  );

  await logToEtl('solr-reindex-search', total, 'success');
}

async function reindexClinicalCore(solr: SolrClient): Promise<void> {
  console.log('\n[clinical core] Starting full reindex...');
  const start = performance.now();

  await solr.deleteByQuery('clinical', '*:*');
  await solr.commit('clinical');

  const encounters = await reindexEncounters(solr, 5000, progress('Encounters'));
  console.log('');
  const conditions = await reindexConditions(solr, 5000, progress('Conditions'));
  console.log('');
  const observations = await reindexObservations(
    solr,
    5000,
    progress('Observations'),
  );
  console.log('');
  const medications = await reindexMedications(
    solr,
    5000,
    progress('Medications'),
  );
  console.log('');

  await solr.commit('clinical');
  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  const total = encounters + conditions + observations + medications;
  console.log(
    `[clinical core] Complete: ${total.toLocaleString()} docs in ${elapsed}s`,
  );

  await logToEtl('solr-reindex-clinical', total, 'success');
}

async function main(): Promise<void> {
  const solr = new SolrClient();

  // Verify Solr is reachable
  const searchOk = await solr.ping('search');
  const clinicalOk = await solr.ping('clinical');
  if (!searchOk || !clinicalOk) {
    console.error('Solr is not reachable. Ensure Solr is running.');
    process.exit(1);
  }

  if (!targetCore || targetCore === 'search') {
    await reindexSearchCore(solr);
  }
  if (!targetCore || targetCore === 'clinical') {
    await reindexClinicalCore(solr);
  }

  console.log('\nFull reindex complete.');
  // Close DB connection
  await sql.end();
}

main().catch((err) => {
  console.error('Reindex failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Test full reindex against running Solr**

```bash
cd /home/smudoshi/Github/Medgnosis/packages/solr && npm run reindex:all
```

Expected: All 6 entities indexed with progress output and doc counts.

- [ ] **Step 3: Verify doc counts via Solr admin**

```bash
curl -s "http://medgnosis:devsecret@localhost:8983/solr/search/select?q=*:*&rows=0&wt=json" | jq '.response.numFound'
curl -s "http://medgnosis:devsecret@localhost:8983/solr/clinical/select?q=*:*&rows=0&wt=json" | jq '.response.numFound'
```

Expected: Non-zero counts matching PG row counts.

- [ ] **Step 4: Commit**

```bash
git add packages/solr/src/sync/full-reindex.ts
git commit -m "feat: add full reindex script for search and clinical Solr cores"
```

---

## Chunk 5: CDC Sync & Migration

### Task 8: PG CDC Triggers Migration

**Files:**
- Create: `packages/db/migrations/029_solr_cdc_triggers.sql`

- [ ] **Step 1: Create migration**

Create `packages/db/migrations/029_solr_cdc_triggers.sql`:

```sql
-- =============================================================================
-- Migration 029: Solr CDC triggers for real-time index sync
-- Adds LISTEN/NOTIFY triggers on 6 EDW tables + updated_at columns
-- =============================================================================

-- 1. Add updated_at columns where missing
DO $$
BEGIN
  -- patient
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'phm_edw' AND table_name = 'patient' AND column_name = 'updated_at')
  THEN
    ALTER TABLE phm_edw.patient ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- care_gap
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'phm_edw' AND table_name = 'care_gap' AND column_name = 'updated_at')
  THEN
    ALTER TABLE phm_edw.care_gap ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- encounter
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'phm_edw' AND table_name = 'encounter' AND column_name = 'updated_at')
  THEN
    ALTER TABLE phm_edw.encounter ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- condition_diagnosis
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'phm_edw' AND table_name = 'condition_diagnosis' AND column_name = 'updated_at')
  THEN
    ALTER TABLE phm_edw.condition_diagnosis ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- observation
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'phm_edw' AND table_name = 'observation' AND column_name = 'updated_at')
  THEN
    ALTER TABLE phm_edw.observation ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- medication_order
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'phm_edw' AND table_name = 'medication_order' AND column_name = 'updated_at')
  THEN
    ALTER TABLE phm_edw.medication_order ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- 2. Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION phm_edw.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach updated_at triggers
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'patient', 'care_gap', 'encounter',
    'condition_diagnosis', 'observation', 'medication_order'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON phm_edw.%I', tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON phm_edw.%I
       FOR EACH ROW EXECUTE FUNCTION phm_edw.set_updated_at()',
      tbl, tbl
    );
  END LOOP;
END $$;

-- 3. CDC notification function
CREATE OR REPLACE FUNCTION phm_edw.notify_solr_sync()
RETURNS TRIGGER AS $$
DECLARE
  pk_value BIGINT;
  payload JSON;
BEGIN
  -- Determine PK value based on table
  CASE TG_TABLE_NAME
    WHEN 'patient' THEN pk_value := COALESCE(NEW.patient_id, OLD.patient_id);
    WHEN 'care_gap' THEN pk_value := COALESCE(NEW.care_gap_id, OLD.care_gap_id);
    WHEN 'encounter' THEN pk_value := COALESCE(NEW.encounter_id, OLD.encounter_id);
    WHEN 'condition_diagnosis' THEN pk_value := COALESCE(NEW.condition_diagnosis_id, OLD.condition_diagnosis_id);
    WHEN 'observation' THEN pk_value := COALESCE(NEW.observation_id, OLD.observation_id);
    WHEN 'medication_order' THEN pk_value := COALESCE(NEW.medication_order_id, OLD.medication_order_id);
    ELSE pk_value := 0;
  END CASE;

  payload := json_build_object(
    'table', TG_TABLE_NAME,
    'id', pk_value,
    'op', TG_OP
  );

  PERFORM pg_notify('solr_sync', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4. Attach CDC triggers to all 6 tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'patient', 'care_gap', 'encounter',
    'condition_diagnosis', 'observation', 'medication_order'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_solr_sync ON phm_edw.%I', tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_solr_sync
       AFTER INSERT OR UPDATE OR DELETE ON phm_edw.%I
       FOR EACH ROW EXECUTE FUNCTION phm_edw.notify_solr_sync()',
      tbl, tbl
    );
  END LOOP;
END $$;
```

- [ ] **Step 2: Run migration**

```bash
npm run db:migrate
```

Expected: Migration 029 applied successfully.

- [ ] **Step 3: Verify triggers exist**

```bash
psql -U smudoshi -d medgnosis -c "SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'phm_edw' AND trigger_name LIKE '%solr%' ORDER BY event_object_table;"
```

Expected: 6 triggers listed (one per table).

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/029_solr_cdc_triggers.sql
git commit -m "feat: add PG CDC triggers for Solr real-time sync (migration 029)"
```

---

### Task 9: CDC Listener

**Files:**
- Create: `packages/solr/src/sync/cdc-listener.ts`

- [ ] **Step 1: Create CDC listener**

Create `packages/solr/src/sync/cdc-listener.ts`:

```typescript
// =============================================================================
// Medgnosis Solr — CDC listener (singleton worker process)
// Listens for PG NOTIFY events and pushes changes to Solr in batches.
// Usage: npm run cdc:start
// =============================================================================

import postgres from 'postgres';
import Redis from 'ioredis';
import { SolrClient } from '../client.js';
import { sql as dbSql } from '@medgnosis/db';

// --- Config ---
const DATABASE_URL = process.env['DATABASE_URL']!;
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const BATCH_DEBOUNCE_MS = 100;
const BATCH_MAX_SIZE = 500;
const HARD_COMMIT_INTERVAL_MS = 60_000;
const SOFT_COMMIT_INTERVAL_MS = 5_000;
const QUEUE_KEY = 'solr:cdc:queue';
const MAX_QUEUE_SIZE = 50_000;
const ADVISORY_LOCK_CDC = "hashtext('solr_cdc')";
const ADVISORY_LOCK_REINDEX = "hashtext('solr_reindex')";

interface CdcEvent {
  table: string;
  id: number;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
}

// Table → Solr core mapping
const TABLE_CORE_MAP: Record<string, 'search' | 'clinical'> = {
  patient: 'search',
  care_gap: 'search',
  encounter: 'clinical',
  condition_diagnosis: 'clinical',
  observation: 'clinical',
  medication_order: 'clinical',
};

// Table → Solr doc_type mapping
const TABLE_DOCTYPE_MAP: Record<string, string> = {
  patient: 'patient',
  care_gap: 'care_gap',
  encounter: 'encounter',
  condition_diagnosis: 'condition',
  observation: 'observation',
  medication_order: 'medication',
};

// Table → PK column mapping
const TABLE_PK_MAP: Record<string, string> = {
  patient: 'patient_id',
  care_gap: 'care_gap_id',
  encounter: 'encounter_id',
  condition_diagnosis: 'condition_diagnosis_id',
  observation: 'observation_id',
  medication_order: 'medication_order_id',
};

const solr = new SolrClient();
const redis = new Redis(REDIS_URL);

let pendingBatch: CdcEvent[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let running = true;

async function fetchAndIndex(event: CdcEvent): Promise<void> {
  const core = TABLE_CORE_MAP[event.table];
  const docType = TABLE_DOCTYPE_MAP[event.table];
  const pk = TABLE_PK_MAP[event.table];
  if (!core || !docType || !pk) return;

  if (event.op === 'DELETE') {
    await solr.deleteByQuery(core, `id:${docType}_${event.id}`);
    return;
  }

  // Fetch fresh row from PG — use unsafe for dynamic table/column
  const rows = await dbSql.unsafe(
    `SELECT * FROM phm_edw.${event.table} WHERE ${pk} = $1 LIMIT 1`,
    [event.id],
  );
  if (rows.length === 0) return;

  const row = rows[0] as Record<string, unknown>;

  // Build Solr doc (simplified — real indexer has JOINs; CDC uses denormalized fields)
  const doc: Record<string, unknown> = {
    id: `${docType}_${event.id}`,
    doc_type: docType,
    updated_at: new Date().toISOString(),
  };

  // Copy all non-null fields
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined) {
      if (value instanceof Date) {
        doc[key] = value.toISOString();
      } else {
        doc[key] = value;
      }
    }
  }

  await solr.update(core, [doc]);
}

async function processBatch(batch: CdcEvent[]): Promise<void> {
  // Check if reindex is running — if so, queue to Redis
  const reindexLockRows = await dbSql.unsafe(
    `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_REINDEX}) AS locked`,
  );
  const reindexLocked = !(reindexLockRows[0] as { locked: boolean }).locked;

  if (reindexLocked) {
    // Reindex is running — push to Redis queue
    const pipeline = redis.pipeline();
    for (const event of batch) {
      pipeline.rpush(QUEUE_KEY, JSON.stringify(event));
    }
    await pipeline.exec();
    console.log(
      `[cdc] Reindex in progress — queued ${batch.length} events to Redis`,
    );
    return;
  }

  // Release the advisory lock we just acquired for the check
  await dbSql.unsafe(
    `SELECT pg_advisory_unlock(${ADVISORY_LOCK_REINDEX})`,
  );

  // Process batch
  for (const event of batch) {
    try {
      await fetchAndIndex(event);
    } catch (err) {
      console.error(`[cdc] Failed to index ${event.table}:${event.id}:`, err);
      // Push failed event to Redis for retry
      await redis.rpush(QUEUE_KEY, JSON.stringify(event));
    }
  }
}

function scheduleBatch(): void {
  if (batchTimer) clearTimeout(batchTimer);

  if (pendingBatch.length >= BATCH_MAX_SIZE) {
    flushBatch();
    return;
  }

  batchTimer = setTimeout(flushBatch, BATCH_DEBOUNCE_MS);
}

function flushBatch(): void {
  if (pendingBatch.length === 0) return;
  const batch = [...pendingBatch];
  pendingBatch = [];
  batchTimer = null;
  processBatch(batch).catch((err) =>
    console.error('[cdc] Batch processing failed:', err),
  );
}

async function drainRedisQueue(): Promise<void> {
  let drained = 0;
  while (true) {
    const item = await redis.lpop(QUEUE_KEY);
    if (!item) break;
    try {
      const event = JSON.parse(item) as CdcEvent;
      await fetchAndIndex(event);
      drained++;
    } catch (err) {
      console.error('[cdc] Failed to drain Redis event:', err);
    }
  }
  if (drained > 0) {
    console.log(`[cdc] Drained ${drained} events from Redis queue`);
  }
}

async function main(): Promise<void> {
  console.log('[cdc] Starting Solr CDC listener...');

  // Acquire advisory lock — ensures singleton
  const listenSql = postgres(DATABASE_URL, { max: 1 });

  const lockResult = await listenSql.unsafe(
    `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_CDC}) AS locked`,
  );
  if (!(lockResult[0] as { locked: boolean }).locked) {
    console.error('[cdc] Another CDC listener is already running. Exiting.');
    await listenSql.end();
    process.exit(1);
  }

  console.log('[cdc] Advisory lock acquired (singleton)');

  // Drain any Redis queue from previous run
  await drainRedisQueue();

  // Subscribe to PG notifications
  await listenSql.listen('solr_sync', (payload) => {
    try {
      const event = JSON.parse(payload) as CdcEvent;
      pendingBatch.push(event);
      scheduleBatch();
    } catch (err) {
      console.error('[cdc] Failed to parse notification:', err);
    }
  });

  console.log('[cdc] Listening on channel: solr_sync');

  // Periodic commits
  const softCommitTimer = setInterval(async () => {
    try {
      await solr.commit('search');
      await solr.commit('clinical');
    } catch {
      // Solr may be down — no-op
    }
  }, SOFT_COMMIT_INTERVAL_MS);

  const hardCommitTimer = setInterval(async () => {
    try {
      await solr.commit('search');
      await solr.commit('clinical');
    } catch {
      // Solr may be down — no-op
    }
  }, HARD_COMMIT_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[cdc] Shutting down...');
    running = false;
    clearInterval(softCommitTimer);
    clearInterval(hardCommitTimer);
    flushBatch();
    await listenSql.unsafe(
      `SELECT pg_advisory_unlock(${ADVISORY_LOCK_CDC})`,
    );
    await listenSql.end();
    await dbSql.end();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[cdc] CDC listener running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error('[cdc] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Test CDC listener**

```bash
# Terminal 1: Start CDC listener
cd /home/smudoshi/Github/Medgnosis/packages/solr && npm run cdc:start

# Terminal 2: Insert a test row and verify notification
psql -U smudoshi -d medgnosis -c "UPDATE phm_edw.patient SET first_name = first_name WHERE patient_id = 1;"
```

Expected: CDC listener logs batch processing activity.

- [ ] **Step 3: Commit**

```bash
git add packages/solr/src/sync/cdc-listener.ts
git commit -m "feat: add CDC listener with PG LISTEN/NOTIFY, Redis queue, and advisory lock singleton"
```

---

## Chunk 6: API Integration

### Task 10: Solr Fastify Plugin

**Files:**
- Create: `apps/api/src/plugins/solr.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create Solr Fastify plugin**

Create `apps/api/src/plugins/solr.ts`:

```typescript
// =============================================================================
// Medgnosis API — Solr plugin (graceful degradation)
// Mirrors the redisAvailable pattern from websocket.ts
// =============================================================================

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { SolrClient } from '@medgnosis/solr';
import { config } from '../config.js';

let solrClient: SolrClient | null = null;
let solrAvailable = false;

export function getSolrClient(): SolrClient | null {
  if (!solrAvailable || !solrClient) return null;
  return solrClient;
}

export function isSolrAvailable(): boolean {
  return solrAvailable;
}

async function solrPlugin(fastify: FastifyInstance): Promise<void> {
  if (!config.solrEnabled) {
    fastify.log.info('[solr] Disabled via SOLR_ENABLED=false');
    return;
  }

  try {
    solrClient = new SolrClient({
      baseUrl: config.solrUrl,
      searchCore: config.solrSearchCore,
      clinicalCore: config.solrClinicalCore,
      authUser: config.solrAuthUser,
      authPassword: config.solrAuthPassword,
      timeoutMs: 10000,
    });

    const searchOk = await solrClient.ping('search');
    const clinicalOk = await solrClient.ping('clinical');

    if (searchOk && clinicalOk) {
      solrAvailable = true;
      fastify.log.info('[solr] Connected — both cores healthy');
    } else {
      solrAvailable = false;
      solrClient = null;
      fastify.log.warn(
        `[solr] Cores not healthy (search: ${searchOk}, clinical: ${clinicalOk}) — falling back to PG`,
      );
    }
  } catch (err) {
    solrAvailable = false;
    solrClient = null;
    fastify.log.warn(
      { err },
      '[solr] Connection failed — all queries will use PG',
    );
  }

  // Periodic health check every 30s — re-enable if Solr comes back
  const healthCheckTimer = setInterval(async () => {
    if (solrAvailable || !config.solrEnabled) return;
    try {
      const client = new SolrClient({
        baseUrl: config.solrUrl,
        searchCore: config.solrSearchCore,
        clinicalCore: config.solrClinicalCore,
        authUser: config.solrAuthUser,
        authPassword: config.solrAuthPassword,
        timeoutMs: 5000,
      });
      const ok = await client.ping('search');
      if (ok) {
        solrClient = client;
        solrAvailable = true;
        fastify.log.info('[solr] Reconnected — Solr is healthy again');
      }
    } catch {
      // Still down — no-op
    }
  }, 30_000);

  fastify.addHook('onClose', async () => {
    clearInterval(healthCheckTimer);
    solrAvailable = false;
    solrClient = null;
  });
}

export default fp(solrPlugin, { name: 'solr' });
```

- [ ] **Step 2: Register Solr plugin in app.ts**

In `apps/api/src/app.ts`, add import:

```typescript
import solrPlugin from './plugins/solr.js';
```

Add registration after `websocketPlugin`:

```typescript
  await fastify.register(solrPlugin);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/plugins/solr.ts apps/api/src/app.ts
git commit -m "feat: add Solr Fastify plugin with graceful degradation and auto-reconnect"
```

---

### Task 11: Integrate Solr into Search Route

**Files:**
- Modify: `apps/api/src/routes/search/index.ts`

- [ ] **Step 1: Update search route with Solr-first, PG-fallback**

Replace `apps/api/src/routes/search/index.ts`:

```typescript
// =============================================================================
// Medgnosis API — Global search routes (Solr-accelerated, PG fallback)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { getSolrClient } from '../plugins/solr.js';
import { buildSearchCoreQuery } from '@medgnosis/solr';

export default async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const searchTerm = query.q ?? '';
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 50);

    if (searchTerm.length < 2) {
      return reply.send({ success: true, data: { patients: [] } });
    }

    const startedAt = process.hrtime.bigint();
    const solr = getSolrClient();
    let source: 'solr' | 'pg' = 'pg';

    let patients: Record<string, unknown>[];

    if (solr) {
      try {
        const solrQuery = buildSearchCoreQuery({
          searchTerm,
          providerId: request.user.provider_id,
          limit,
          offset: 0,
        });

        const result = await solr.query<{
          patient_id: number;
          first_name: string;
          last_name: string;
          mrn: string;
          date_of_birth: string;
          doc_type: string;
        }>('search', solrQuery);

        patients = result.response.docs
          .filter((d) => d.doc_type === 'patient')
          .map((d) => ({
            id: d.patient_id,
            first_name: d.first_name,
            last_name: d.last_name,
            mrn: d.mrn,
            date_of_birth: d.date_of_birth,
            relevance: 1, // Solr already sorted by relevance
          }));
        source = 'solr';
      } catch (err) {
        request.log.warn({ err }, '[search] Solr query failed — falling back to PG');
        patients = await pgSearch(searchTerm, limit);
      }
    } else {
      patients = await pgSearch(searchTerm, limit);
    }

    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    request.log.info(
      { route: '/search', source, duration_ms: Math.round(durationMs * 100) / 100 },
      'Route timing',
    );

    reply.header('X-Query-Source', source);
    return reply.send({ success: true, data: { patients } });
  });
}

async function pgSearch(
  searchTerm: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  return sql`
    SELECT
      p.patient_id AS id,
      p.first_name,
      p.last_name,
      p.mrn,
      p.date_of_birth,
      similarity(p.first_name || ' ' || p.last_name, ${searchTerm}) AS relevance
    FROM phm_edw.patient p
    WHERE p.active_ind = 'Y'
      AND (
        (p.first_name || ' ' || p.last_name) ILIKE ${`%${searchTerm}%`}
        OR p.mrn ILIKE ${`%${searchTerm}%`}
        OR similarity(p.first_name || ' ' || p.last_name, ${searchTerm}) > 0.3
      )
    ORDER BY relevance DESC, p.last_name ASC
    LIMIT ${limit}
  `;
}
```

- [ ] **Step 2: Verify API starts and search works**

```bash
cd /home/smudoshi/Github/Medgnosis && npm run dev --workspace=apps/api
# In another terminal:
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/search?q=john" | jq '.data.patients | length'
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/search/index.ts
git commit -m "feat: integrate Solr into global search with PG fallback"
```

---

### Task 12: Integrate Solr into Patient List Route

**Files:**
- Modify: `apps/api/src/routes/patients/index.ts`

- [ ] **Step 1: Add Solr integration to patient list endpoint**

At the top of `apps/api/src/routes/patients/index.ts`, add imports:

```typescript
import { getSolrClient } from '../plugins/solr.js';
import { buildSearchCoreQuery, buildClinicalCoreQuery } from '@medgnosis/solr';
```

Then modify the `GET /` handler to use Solr when searching, falling back to PG. The key change is wrapping the patient list query:

For the patient list (search mode), add a Solr path before the existing PG query. For clinical sub-routes (`/conditions`, `/observations`, `/medications`, `/encounters`), add Solr clinical core queries with PG fallback.

**Note:** This is a large file modification. The pattern for each sub-route is:
1. Check `getSolrClient()`
2. If available, build query with `buildClinicalCoreQuery()`, execute, map results
3. If unavailable or error, fall through to existing PG query
4. Set `X-Query-Source` header

- [ ] **Step 2: Test patient routes with Solr**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/patients?search=smith" | jq '.meta'
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/patients/1/conditions" | jq '.data | length'
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/patients/index.ts
git commit -m "feat: integrate Solr into patient list and clinical tab routes"
```

---

### Task 13: Integrate Solr into Care Gaps Route

**Files:**
- Modify: `apps/api/src/routes/care-gaps/index.ts`

- [ ] **Step 1: Add Solr to care gaps list endpoint**

Same pattern: import Solr client, build query with `buildSearchCoreQuery()` using `docType: 'care_gap'`, map results to match existing response shape, PG fallback on error.

Add at top:
```typescript
import { getSolrClient } from '../plugins/solr.js';
import { buildSearchCoreQuery } from '@medgnosis/solr';
```

Wrap the existing `GET /` handler with Solr-first logic for the search case. Non-search (filter-only) requests can also use Solr filter queries.

- [ ] **Step 2: Test**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/care-gaps?search=diabetes&status=open" | jq '.meta'
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/care-gaps/index.ts
git commit -m "feat: integrate Solr into care gaps search with PG fallback"
```

---

### Task 14: Add Solr Status Admin Endpoint

**Files:**
- Modify: `apps/api/src/routes/admin/index.ts`

- [ ] **Step 1: Add `/admin/solr-status` endpoint**

Add to admin routes:

```typescript
import { getSolrClient, isSolrAvailable } from '../plugins/solr.js';

// GET /admin/solr-status
fastify.get('/solr-status', async (request, reply) => {
  const solr = getSolrClient();
  if (!solr) {
    return reply.send({
      success: true,
      data: {
        available: false,
        enabled: config.solrEnabled,
        message: 'Solr is not available',
      },
    });
  }

  const [searchStatus, clinicalStatus, searchPing, clinicalPing] =
    await Promise.all([
      solr.coreStatus('search').catch(() => null),
      solr.coreStatus('clinical').catch(() => null),
      solr.ping('search'),
      solr.ping('clinical'),
    ]);

  return reply.send({
    success: true,
    data: {
      available: isSolrAvailable(),
      searchCore: { healthy: searchPing, status: searchStatus },
      clinicalCore: { healthy: clinicalPing, status: clinicalStatus },
    },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/admin/index.ts
git commit -m "feat: add /admin/solr-status health endpoint"
```

---

## Chunk 7: Testing & After Benchmarks

### Task 15: Integration Tests

**Files:**
- Create: `packages/solr/src/__tests__/integration.test.ts`

- [ ] **Step 1: Write integration tests**

Create `packages/solr/src/__tests__/integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SolrClient } from '../client.js';

const solr = new SolrClient();

describe('Solr Integration', () => {
  beforeAll(async () => {
    const ok = await solr.ping('search');
    if (!ok) {
      console.warn('Solr not available — skipping integration tests');
      return;
    }
  });

  it('pings search core', async () => {
    const ok = await solr.ping('search');
    expect(ok).toBe(true);
  });

  it('pings clinical core', async () => {
    const ok = await solr.ping('clinical');
    expect(ok).toBe(true);
  });

  it('indexes and queries a test patient doc', async () => {
    const testDoc = {
      id: 'patient_test_999999',
      doc_type: 'patient',
      patient_id: 999999,
      first_name: 'Test',
      last_name: 'Solr',
      full_name: 'Test Solr',
      mrn: 'TST999999',
      active_ind: 'Y',
      updated_at: new Date().toISOString(),
    };

    await solr.update('search', [testDoc]);
    await solr.commit('search');

    const result = await solr.query('search', {
      q: 'Test Solr',
      fq: ['doc_type:patient', 'patient_id:999999'],
      rows: 1,
    });

    expect(result.response.numFound).toBe(1);
    expect(result.response.docs[0]!.mrn).toBe('TST999999');

    // Cleanup
    await solr.deleteByQuery('search', 'id:patient_test_999999');
    await solr.commit('search');
  });

  it('falls back gracefully when Solr is unreachable', async () => {
    const badClient = new SolrClient({
      baseUrl: 'http://localhost:9999/solr',
      searchCore: 'search',
      clinicalCore: 'clinical',
      authUser: 'x',
      authPassword: 'x',
      timeoutMs: 1000,
    });
    const ok = await badClient.ping('search');
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
cd /home/smudoshi/Github/Medgnosis/packages/solr && npx vitest run src/__tests__/integration.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/solr/src/__tests__/
git commit -m "test: add Solr integration tests for ping, index, query, and fallback"
```

---

### Task 16: Run After Benchmarks and Generate Comparison

- [ ] **Step 1: Ensure Solr is indexed and API is running with Solr enabled**

```bash
# Ensure Solr is running
docker compose -f docker-compose.demo.yml up -d solr

# Ensure data is indexed
cd /home/smudoshi/Github/Medgnosis/packages/solr && npm run reindex:all

# Start API
cd /home/smudoshi/Github/Medgnosis && npm run dev --workspace=apps/api
```

- [ ] **Step 2: Run Solr benchmark**

```bash
cd /home/smudoshi/Github/Medgnosis/packages/solr && npm run benchmark -- --mode=solr
```

Expected: Table showing Solr latencies + before/after comparison table with speedup multipliers.

- [ ] **Step 3: Save benchmark results and commit**

```bash
git add packages/solr/benchmark-results/
git commit -m "perf: add before/after Solr benchmark results showing query acceleration"
```

---

### Task 17: Final Commit, Push, and Verification

- [ ] **Step 1: Run full type check**

```bash
cd /home/smudoshi/Github/Medgnosis && npx turbo run typecheck
```

- [ ] **Step 2: Run all tests**

```bash
cd /home/smudoshi/Github/Medgnosis && npx turbo run test
```

- [ ] **Step 3: Verify Solr fallback (stop Solr, test API still works)**

```bash
docker compose -f docker-compose.demo.yml stop solr
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3002/search?q=john" | jq '.success'
# Expected: true (PG fallback)
docker compose -f docker-compose.demo.yml start solr
```

- [ ] **Step 4: Push to remote**

```bash
git push -u origin modernize/g3-devops-polish
```

- [ ] **Step 5: Verify all endpoints respond with X-Query-Source header**

```bash
for path in "/search?q=john" "/patients?search=smith" "/care-gaps?status=open"; do
  echo "=== $path ==="
  curl -sI -H "Authorization: Bearer $TOKEN" "http://localhost:3002$path" | grep -i x-query-source
done
```

Expected: All show `X-Query-Source: solr`.
