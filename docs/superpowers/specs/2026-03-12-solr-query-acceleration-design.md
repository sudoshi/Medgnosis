# Solr Query Acceleration — Design Spec

**Date:** 2026-03-12
**Status:** Approved
**Author:** Claude (with user direction)

---

## Overview

Integrate Apache Solr 9.7 into the Medgnosis platform to accelerate search and filter queries across all entity types. Solr handles search/filter workloads while PostgreSQL retains aggregation and detail queries.

## Decisions

| Decision | Choice |
|---|---|
| Entities indexed | All — patients, care gaps, encounters, conditions, observations, medications (~200M+ docs) |
| Deployment | Single Solr instance via Docker Compose |
| Sync strategy | Hybrid — CDC via PG LISTEN/NOTIFY + nightly full reindex |
| Query routing | Solr for search/filter, PG for aggregations/detail |
| JVM heap | 16GB (`-Xms8g -Xmx16g`) |
| Graceful degradation | Solr failure falls back to existing PG queries |
| Frontend changes | None — API contract unchanged |

---

## 1. Infrastructure & Docker Setup

### Docker Compose

- **Image:** `solr:9.7`
- **Container name:** `medgnosis-solr`
- **Ports:** `8983:8983` (admin UI + API)
- **JVM:** `-Xms8g -Xmx16g`
- **Volumes:** `solr_data:/var/solr/data` (persistent index storage)
- **Cores:** `search` (patients + care_gaps), `clinical` (encounters + conditions + observations + medications)
- **Health check:** `curl http://localhost:8983/solr/search/admin/ping`
- **Depends on:** postgres
- **Network:** Docker internal only in production (no published port). Dev mode publishes 8983.
- **Authentication:** Solr BasicAuth plugin enabled with `SOLR_AUTH_USER` / `SOLR_AUTH_PASSWORD` env vars
- **Dev mode:** `-Xms2g -Xmx4g` (override via `SOLR_JAVA_MEM`). Production uses `-Xms8g -Xmx16g`.
- **Minimum host RAM:** 32GB recommended (16GB Solr + PG + Node.js + OS)

### New Package: `packages/solr`

```
packages/solr/
  package.json
  tsconfig.json
  src/
    client.ts              — Solr HTTP client (query, update, delete, commit)
    schemas/
      search.ts            — Search core field definitions
      clinical.ts          — Clinical core field definitions
    indexers/
      patients.ts          — Patient batch indexer
      care-gaps.ts         — Care gap batch indexer
      encounters.ts        — Encounter batch indexer
      conditions.ts        — Condition batch indexer
      observations.ts      — Observation batch indexer
      medications.ts       — Medication batch indexer
    sync/
      cdc-listener.ts      — PG LISTEN/NOTIFY handler
      full-reindex.ts      — Nightly full reindex script
    query/
      search-query.ts      — Build Solr queries for search core
      clinical-query.ts    — Build Solr queries for clinical core
    index.ts               — Package exports
```

### Environment Variables

```
SOLR_URL=http://localhost:8983/solr
SOLR_SEARCH_CORE=search
SOLR_CLINICAL_CORE=clinical
SOLR_ENABLED=true                    # Feature flag: set false to disable Solr entirely
SOLR_AUTH_USER=medgnosis              # BasicAuth username
SOLR_AUTH_PASSWORD=<from-secret-mgr>  # BasicAuth password (never hardcode)
SOLR_JAVA_MEM=-Xms2g -Xmx4g          # Dev default; production: -Xms8g -Xmx16g
```

---

## 2. Solr Schemas

### Search Core (`search`)

| Field | Type | Indexed | Stored | Notes |
|---|---|---|---|---|
| id | string | yes | yes | Unique: `{type}_{pk}` |
| doc_type | string | yes | yes | `patient` or `care_gap` |
| patient_id | long | yes | yes | |
| mrn | string | yes | yes | |
| first_name | text_general | yes | yes | |
| last_name | text_general | yes | yes | |
| full_name | text_general | yes | yes | copyField: first+last |
| date_of_birth | pdate | yes | yes | |
| gender | string | yes | yes | |
| primary_phone | string | no | yes | |
| email | string | no | yes | |
| active_ind | string | yes | no | |
| risk_tier | string | yes | yes | |
| risk_score | pint | yes | yes | |
| provider_id | long | yes | no | Provider scoping from JWT |
| org_id | long | yes | no | |
| care_gap_id | long | yes | no | |
| gap_status | string | yes | yes | |
| gap_priority | string | yes | yes | |
| measure_id | long | yes | no | |
| measure_name | text_general | yes | yes | |
| measure_code | string | yes | yes | |
| identified_date | pdate | yes | yes | |
| resolved_date | pdate | yes | yes | |
| patient_name | text_general | yes | yes | Denormalized on care_gap docs |
| _text_ | text_general | yes | no | Explicit copyField sources (see below) |
| updated_at | pdate | yes | no | CDC delta tracking |

**`_text_` copyField sources (search core):** `full_name`, `mrn`, `measure_name`, `measure_code`, `patient_name`. Excludes `email`, `primary_phone`, `date_of_birth` to prevent unintended PHI leakage via global search.

### Clinical Core (`clinical`)

| Field | Type | Indexed | Stored | Notes |
|---|---|---|---|---|
| id | string | yes | yes | Unique: `{type}_{pk}` |
| doc_type | string | yes | yes | encounter/condition/observation/medication |
| patient_id | long | yes | yes | Primary filter |
| provider_id | long | yes | no | |
| encounter_id | long | yes | no | |
| encounter_datetime | pdate | yes | yes | |
| encounter_type | string | yes | yes | |
| discharge_disposition | string | no | yes | |
| facility_name | text_general | no | yes | |
| condition_id | long | yes | no | |
| condition_name | text_general | yes | yes | |
| icd10_code | string | yes | yes | |
| diagnosis_status | string | yes | yes | |
| onset_date | pdate | yes | yes | |
| observation_id | long | yes | no | |
| observation_code | string | yes | yes | |
| observation_name | text_general | yes | yes | |
| value_numeric | pdouble | yes | yes | |
| value_text | text_general | no | yes | |
| units | string | no | yes | |
| observation_datetime | pdate | yes | yes | |
| medication_order_id | long | yes | no | |
| medication_name | text_general | yes | yes | |
| prescription_status | string | yes | yes | |
| _text_ | text_general | yes | no | Explicit copyField sources (see below) |
| updated_at | pdate | yes | no | |

**`_text_` copyField sources (clinical core):** `condition_name`, `icd10_code`, `observation_name`, `observation_code`, `medication_name`, `encounter_type`, `facility_name`. Excludes `value_text` to prevent PHI leakage.

---

## 3. Data Sync

### CDC via PG LISTEN/NOTIFY

**Migration `029_solr_cdc_triggers.sql`:**
- Creates trigger function `notify_solr_sync()` that sends JSON payload: `{"table":"...", "id":..., "op":"INSERT|UPDATE|DELETE"}`
- Attaches AFTER INSERT/UPDATE/DELETE triggers to 6 tables: `patient`, `care_gap`, `encounter`, `condition_diagnosis`, `observation`, `medication_order`
- Adds `updated_at` columns where missing (DEFAULT `NOW()`, auto-updated via trigger)

**CDC Listener (`cdc-listener.ts`):**
- Runs as a **singleton worker** — dedicated process via `npm run cdc:start`, NOT inside the API process
- Connects via `LISTEN solr_sync` on its own PG connection
- Batches notifications: 100ms debounce window or 500 docs (whichever first)
- Fetches full row from PG, transforms to Solr doc, sends batch update
- Soft commit every 5 seconds, hard commit every 60 seconds
- Overflow queue backed by Redis list (`solr:cdc:queue`, max 50K entries) — survives restarts
- On startup, drains Redis queue first, then runs delta reindex (last 15 min by `updated_at`)
- Singleton enforced via PG advisory lock (`pg_advisory_lock(hashtext('solr_cdc'))`) — second instance waits

**Reindex/CDC coordination:** During full reindex, CDC listener pauses consumption (holds notifications in Redis queue). Reindex script acquires a second PG advisory lock (`pg_advisory_lock(hashtext('solr_reindex'))`). CDC listener checks this lock before processing batches. After reindex completes, CDC drains any queued notifications to apply changes that occurred during the reindex window.

### Full Reindex (`full-reindex.ts`)

- Cursor-based pagination, batch size 5,000 rows
- Parallel streams per entity type (6 workers)
- Hard commit + optimize after completion
- Logs to `etl_log` table
- Estimated runtime: ~45 minutes (parallel) to ~3 hours (serial)

**npm scripts:**
```json
{
  "reindex:search": "tsx src/sync/full-reindex.ts --core=search",
  "reindex:clinical": "tsx src/sync/full-reindex.ts --core=clinical",
  "reindex:all": "npm run reindex:search && npm run reindex:clinical",
  "cdc:start": "tsx src/sync/cdc-listener.ts"
}
```

---

## 4. Query Routing

### Solr Endpoints

| Endpoint | Core | Filter |
|---|---|---|
| `GET /search?q=` | search | `_text_`, all doc types |
| `GET /patients?search=` | search | `doc_type:patient` |
| `GET /care-gaps?search=` | search | `doc_type:care_gap` |
| `GET /patients/:id/conditions` | clinical | `doc_type:condition`, `patient_id` |
| `GET /patients/:id/observations` | clinical | `doc_type:observation`, `patient_id` |
| `GET /patients/:id/medications` | clinical | `doc_type:medication`, `patient_id` |
| `GET /patients/:id/encounters` | clinical | `doc_type:encounter`, `patient_id` |

### PG Endpoints (unchanged)

| Endpoint | Reason |
|---|---|
| `GET /dashboard` | Aggregations on star schema mat views |
| `GET /patients/:id` | Single row by PK |
| `GET /patients/:id/care-bundle` | Complex bundle matching logic |
| `GET /bundles/*` | Materialized views |
| `GET /admin/*` | Admin operations |
| All POST/PUT/DELETE | Writes (trigger CDC) |

### Graceful Degradation

- **Feature flag:** `SOLR_ENABLED=false` skips Solr plugin registration entirely — all queries go to PG. Instant rollback without code changes.
- Fastify decorator `solrAvailable` (mirrors existing `redisAvailable` pattern)
- On Solr failure: log warning, execute existing PG query, return same response
- Response header `X-Query-Source: "solr" | "pg"` for debugging
- API contract unchanged — frontend unaware of query source

### Audit Trail Integration

All Solr-routed queries are captured in the existing audit system (`apps/api/src/plugins/audit.ts`):
- Audit log entries include `query_source: "solr" | "pg"` field
- Patient access via Solr search results is logged identically to PG-sourced access
- The audit hook fires in the route handler (before query routing decision), so source is transparent to audit

### Solr Query Builder

Provider scoping applied automatically from JWT `provider_id`:

```typescript
buildSearchQuery({
  q: "john smith",
  filters: {
    doc_type: "patient",
    provider_id: 2816,    // from JWT
    active_ind: "Y",
  },
  sort: "score desc, last_name asc",
  start: 0,
  rows: 25,
  fields: ["patient_id", "mrn", "first_name", "last_name", "risk_tier"]
})
```

---

## 5. Performance Targets

| Endpoint | Current (est.) | Target | Source |
|---|---|---|---|
| `GET /search?q=john` | 800-2000ms | <50ms | Solr search |
| `GET /patients?search=smith` | 500-1500ms | <50ms | Solr search |
| `GET /care-gaps?search=&status=open` | 300-800ms | <30ms | Solr search |
| `GET /patients/:id/conditions` | 200-500ms | <30ms | Solr clinical |
| `GET /patients/:id/observations` | 500-2000ms | <50ms | Solr clinical |
| `GET /patients/:id/medications` | 100-300ms | <20ms | Solr clinical |
| `GET /patients/:id/encounters` | 200-500ms | <30ms | Solr clinical |
| `GET /dashboard` | 1000-3000ms | Unchanged | PG |

**Cold-cache targets** (after restart/reindex): 2-3x above targets (e.g., <150ms for search). Solr cache warming configured with `autowarmCount=128` on `filterCache` and `queryResultCache` to pre-populate common provider-scoped filters on core reload.

## 6. Security & PHI Protection

- **Authentication:** Solr BasicAuth plugin enabled. Credentials stored in env vars (`SOLR_AUTH_USER`, `SOLR_AUTH_PASSWORD`), never in source code.
- **Network isolation:** Solr container on Docker internal network only. Port 8983 NOT published in production. Dev mode publishes for admin UI access.
- **PHI at rest:** `solr_data` volume on encrypted filesystem (host-level disk encryption required).
- **Admin UI:** Accessible only via Docker internal network or SSH tunnel. BasicAuth required.
- **Solr logs:** PHI redaction applied — query parameters logged at INFO level are sanitized to remove patient name/MRN values. Full query logged only at DEBUG level.
- **`_text_` field:** Explicitly defined copyField sources exclude email, phone, DOB, and observation values to prevent unintended PHI exposure via global search.

## 7. Monitoring

- **Solr Admin UI:** `http://localhost:8983/solr/`
- **API logging:** `X-Query-Source` header + response time per request
- **Health endpoint:** `GET /admin/solr-status` — core stats, doc counts, last reindex, CDC lag

## 8. Testing Strategy

1. **Unit tests** — Solr query builder produces correct Solr syntax
2. **Integration tests** — Index sample data, query via API, verify results match PG
3. **Fallback test** — Stop Solr, verify API degrades to PG without errors
4. **Reindex test** — Full reindex, verify doc counts match PG row counts
5. **CDC test** — Insert/update PG row, verify Solr doc updates within 5 seconds

## 9. Modified Files

### New files
- `docker-compose.solr.yml` (or added to existing compose)
- `packages/solr/` (entire new package)
- `packages/db/migrations/029_solr_cdc_triggers.sql`
- `apps/api/src/plugins/solr.ts`
- `solr/search/conf/managed-schema.xml`
- `solr/clinical/conf/managed-schema.xml`

### Modified files
- `apps/api/src/routes/search/index.ts` — Use Solr with PG fallback
- `apps/api/src/routes/patients/index.ts` — Patient list + clinical tabs via Solr
- `apps/api/src/routes/care-gaps/index.ts` — Care gap search via Solr
- `apps/api/src/routes/admin/index.ts` — Add `/admin/solr-status` endpoint
- `apps/api/src/app.ts` — Register Solr plugin
- `package.json` (root) — Add solr package to workspaces
- `turbo.json` — Add solr build task
