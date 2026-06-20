# FHIR→EDW Ingestion Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the FHIR→`phm_edw` hydration pipeline from 8 resource types to a clinically complete set (add DiagnosticReport, DocumentReference, ServiceRequest, CarePlan, Goal, CareTeam, Coverage, plus Practitioner/Organization/Location reference dimensions), add vital-sign dual-write, add soft-delete / entered-in-error handling, and extend QDM + the SMART/Bulk surface (scopes, CapabilityStatement, `$export` `_type`) to match.

**Architecture:** The existing two-stage pipeline is unchanged — `resourceStaging.ts` lands raw FHIR into `phm_edw.fhir_ingest_staging`; `edwHydration.ts` maps staged rows into EDW clinical tables via `phm_edw.ehr_resource_crosswalk` (insert-or-update keyed on tenant+resourceType+resourceId). This plan adds new `hydrate*` branches that follow the **exact** existing pattern (`findExistingLocalTarget` → insert/update branch → `upsertResourceCrosswalk`), adds two new EDW tables for resources with no existing home, and threads reference-dimension get-or-create so FKs stop being null. Per the 2026-06-20 design decisions: dedicated tables for DiagnosticReport/DocumentReference, dual-write vitals (`observation` + `vital_sign`), soft-delete via `active_ind='N'`, reference dimensions included.

**Tech Stack:** TypeScript (strict, ESM, `.js` import suffixes), `postgres` (porsager) with `sql.begin`/`tx.unsafe` parameterized queries, Vitest, SQL migrations in `packages/db/migrations/` applied by `npm run db:migrate`. PostgreSQL 17, schema `phm_edw`.

---

## Pre-flight: house rules for every task

These are the codebase conventions (verified against `apps/api/src/services/ehr/edwHydration.ts`). Every hydrator task obeys them — they are NOT repeated per task:

- **File under change:** `apps/api/src/services/ehr/edwHydration.ts`. New hydrators are added here and dispatched from `hydrateByResourceType`.
- **Reuse existing module helpers** already in `edwHydration.ts`: `firstConcept`, `conceptLabel`, `codingCode`, `cleanString`, `truncate`, `truncateNullable`, `datePart`, `record`, `recordArray`, `referenceId`, `periodStart`, `periodEnd`, `optionalNumber`, `optionalPositiveNumber`, `edwConditionCodeSystem`/`edwProcedureCodeSystem`/`edwGeneralCodeSystem`, `messageFromError`. Do NOT re-implement them.
- **SQL:** child-resource hydrators run inside the surrounding `tx` (a `postgres.TransactionSql`) using `tx.unsafe<Row[]>(\`...$1...\`, [params])`. Always parameterize. Set `active_ind='Y'`, `created_date=NOW()`, `updated_date=NOW()` on insert; `updated_date=NOW()` on update.
- **Insert/update selection:** call `findExistingLocalTarget(tx, row)` (already exists). If `existing.localTable === '<target table>' && existing.localId !== null` → UPDATE branch returning `operation: 'updated'`; else INSERT returning `operation: 'inserted'`.
- **Crosswalk:** `hydrateStagedResource` already calls `upsertResourceCrosswalk(tx, row, patientId, target)` after `hydrateByResourceType`. New hydrators just return a `HydratedResourceTarget` — they do NOT call the crosswalk themselves.
- **Test file:** `apps/api/src/services/ehr/edwHydration.test.ts` (already exists, uses Vitest). Tests run with `npm run test --workspace=apps/api -- edwHydration`.
- **Gates after every code task:** `npm run typecheck --workspace=apps/api` then `npm run test --workspace=apps/api -- edwHydration`. Frontend is untouched.

### Test harness (REQUIRED pattern — do NOT use a real DB)

`edwHydration.test.ts` **mocks `@medgnosis/db`** — there is NO database connection. `mockSql` is a `vi.hoisted` mock whose `.unsafe(query, params)` and tagged-template calls funnel into one `vi.fn()`. Tests drive behavior with `mockSql.mockImplementation((strings) => ...)` that matches on **query-text substrings** and returns canned rows, then assert on the emitted SQL and parameters via `mockSql.mock.calls`. Reuse the module-level fixtures (`encounter`, `condition`, …) and the `stagedRow(id, type, id, resource)` helper already in the file.

**Canonical hydrator test template** (every hydrator/dimension test in this plan follows it — swap the fixture, the matched query substrings, and the asserted columns):

```typescript
it('hydrates a <Resource> into phm_edw.<table> (insert path)', async () => {
  mockSql.mockImplementation((strings: TemplateStringsArray) => {
    const text = strings.join('');
    if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
      return Promise.resolve([stagedRow(1, '<Resource>', '<res-id>', <fixture>)]);
    }
    if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
    if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]); // no existing -> insert
    // canned lookups this hydrator performs (encounter resolve, master get-or-create, etc.):
    if (text.includes("resource_type = 'Encounter'") && text.includes("local_table = 'phm_edw.encounter'")) {
      return Promise.resolve([{ local_id: 456 }]);
    }
    if (text.includes('INSERT INTO phm_edw.<table>')) return Promise.resolve([{ <pk>: 999 }]);
    return Promise.resolve([]); // crosswalk upsert + any other writes
  });

  const result = await hydrateStagedRunToEdw({ ingestRunId });

  expect(result.rowsInserted).toBe(1);
  expect(result.byResourceType['<Resource>']).toMatchObject({ hydrated: 1 });
  // assert the INSERT carried the mapped values:
  const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.<table>'));
  expect(insert).toBeDefined();
  expect(insert!.slice(1)).toEqual(expect.arrayContaining([/* expected params, e.g. */ 123 /* patientId */]));
});
```

For an **update-path** test, return `[{ local_table: 'phm_edw.<table>', local_id: 777 }]` from the `SELECT local_table, local_id` branch and assert an `UPDATE phm_edw.<table>` call was emitted (and no `INSERT`). For **get-or-create masters/dimensions**, add a branch for the `SELECT <pk> FROM phm_edw.<master>` returning `[]` (create) or `[{ <pk>: N }]` (reuse). The reference-dimension helpers (B1–B3) are unit-tested by calling them directly with a hand-built `mockSql`-typed `tx` and asserting the SELECT-then-INSERT call sequence — they do NOT go through `hydrateStagedRunToEdw`.

> Because the harness is mock-based, `npm run test` NEVER touches the production DB — it is safe to run freely. Only `npm run db:migrate` (Phase A) mutates the database, and that is run by the orchestrator, not subagents.
- **Commit style:** conventional commits, no attribution (repo global setting). Example: `feat(ehr): hydrate ServiceRequest into phm_edw.clinical_order`.

### Shared types already defined in `edwHydration.ts` (do not redefine)

```typescript
type Tx = postgres.TransactionSql;
interface StagedFhirResourceRow { id; org_id; ehr_tenant_id; ingest_run_id; resource_type;
  resource_id; patient_ref; resource: FhirResource; source_version_id; source_last_updated;
  content_hash; received_at; }
interface LocalTarget { localTable: string | null; localId: number | null; }
interface HydratedResourceTarget { localTable: string; localId: number; operation: 'inserted' | 'updated'; }
interface CodeConcept { system: string | null; code: string | null; display: string | null; text: string | null; }
```

---

## File Structure (what this plan creates / modifies)

**Create:**
- `packages/db/migrations/089_ehr_diagnostic_report_document_reference.sql` — two new EDW tables.
- `packages/db/migrations/090_ehr_resource_crosswalk_soft_delete.sql` — adds `deleted_at`/`deleted_reason` to `ehr_resource_crosswalk` for delete audit.

**Modify:**
- `apps/api/src/services/ehr/edwHydration.ts` — `SUPPORTED_RESOURCE_TYPES`, dispatch, ~10 new hydrators, reference-dim get-or-create, vital dual-write, soft-delete pass.
- `apps/api/src/services/ehr/edwHydration.test.ts` — tests for all of the above.
- `apps/api/src/services/ehr/bulkData.ts` — extend default `_type` list + `deleted`-manifest processing.
- `apps/api/src/services/ehr/scopePolicy.ts` — add new resources to default scope sets.
- `apps/api/src/services/fhir/capabilityStatement.ts` — advertise new resource types + search params.
- `apps/api/src/services/qdm/model.ts` — extend `QdmDatatype` union.
- `apps/api/src/services/qdm/fhirToQdm.ts` — add DiagnosticReport / ServiceRequest / DocumentReference / CarePlan / Goal normalizers + switch cases.
- `apps/api/src/services/qdm/qdmToQiCore.ts` — map the new QDM datatypes to QI-Core.
- `docs/superpowers/devlogs/` — closeout devlog.

---

## Phase A — New EDW tables (migration)

### Task A1: DiagnosticReport + DocumentReference tables

**Files:**
- Create: `packages/db/migrations/089_ehr_diagnostic_report_document_reference.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- 089: DiagnosticReport + DocumentReference EDW landing tables
--
-- FHIR DiagnosticReport and DocumentReference have no faithful home in the
-- existing phm_edw clinical model (clinical_note requires author_user_id, an
-- app-user FK that bulk/SMART FHIR ingestion cannot supply). These additive,
-- non-destructive tables give the hydrator a lossless target and let the
-- ehr_resource_crosswalk point at a real local row. Mirrors the column idiom of
-- phm_edw.observation (code/desc/status/datetime + active_ind + audit dates).
-- =============================================================================

CREATE TABLE phm_edw.diagnostic_report (
  report_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id           INTEGER NOT NULL REFERENCES phm_edw.patient(patient_id),
  encounter_id         INTEGER REFERENCES phm_edw.encounter(encounter_id),
  report_code          VARCHAR(50) NOT NULL,
  report_name          VARCHAR(255),
  code_system          VARCHAR(20),
  category             VARCHAR(100),
  status               VARCHAR(50),
  effective_datetime   TIMESTAMP,
  issued_datetime      TIMESTAMP,
  performer            VARCHAR(255),
  conclusion           TEXT,
  active_ind           CHAR(1) NOT NULL DEFAULT 'Y',
  created_date         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_diagnostic_report_patient ON phm_edw.diagnostic_report(patient_id);
CREATE INDEX ix_diagnostic_report_encounter ON phm_edw.diagnostic_report(encounter_id);

CREATE TABLE phm_edw.document_reference (
  document_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id           INTEGER NOT NULL REFERENCES phm_edw.patient(patient_id),
  encounter_id         INTEGER REFERENCES phm_edw.encounter(encounter_id),
  doc_type_code        VARCHAR(50),
  doc_type_name        VARCHAR(255),
  code_system          VARCHAR(20),
  category             VARCHAR(100),
  status               VARCHAR(50),
  doc_status           VARCHAR(50),
  content_type         VARCHAR(100),
  content_url          TEXT,
  content_title        VARCHAR(255),
  author_display       VARCHAR(255),
  document_datetime    TIMESTAMP,
  active_ind           CHAR(1) NOT NULL DEFAULT 'Y',
  created_date         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_document_reference_patient ON phm_edw.document_reference(patient_id);
CREATE INDEX ix_document_reference_encounter ON phm_edw.document_reference(encounter_id);
```

- [ ] **Step 2: Apply the migration**

Run: `npm run db:migrate` (per memory: the host needs `DATABASE_URL` pointing at `localhost`, e.g. run with `--env-file=.env.production`; confirm `_migrations` registers 089).
Expected: `089_ehr_diagnostic_report_document_reference.sql` applied, no error.

- [ ] **Step 3: Verify tables exist**

Run: `psql -U claude_dev -h localhost -d medgnosis -tAc "SELECT to_regclass('phm_edw.diagnostic_report'), to_regclass('phm_edw.document_reference')"`
Expected: both names returned (not null).

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/089_ehr_diagnostic_report_document_reference.sql
git commit -m "feat(edw): add diagnostic_report + document_reference landing tables"
```

### Task A2: Soft-delete audit columns on the crosswalk

**Files:**
- Create: `packages/db/migrations/090_ehr_resource_crosswalk_soft_delete.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- 090: Soft-delete audit on ehr_resource_crosswalk
--
-- Records when/why a source resource was deleted or marked entered-in-error so
-- the EDW row (active_ind='N') retains an auditable provenance link. Additive.
-- =============================================================================

ALTER TABLE phm_edw.ehr_resource_crosswalk
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_reason  VARCHAR(50);
```

- [ ] **Step 2: Apply + verify**

Run: `npm run db:migrate` then
`psql -U claude_dev -h localhost -d medgnosis -tAc "SELECT column_name FROM information_schema.columns WHERE table_schema='phm_edw' AND table_name='ehr_resource_crosswalk' AND column_name IN ('deleted_at','deleted_reason')"`
Expected: both columns listed.

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/090_ehr_resource_crosswalk_soft_delete.sql
git commit -m "feat(edw): add soft-delete audit columns to ehr_resource_crosswalk"
```

---

## Phase B — Reference dimensions (get-or-create)

These functions are added to `edwHydration.ts` and called by later clinical hydrators to resolve FKs. They are get-or-create against existing tables (`provider`, `organization`, `clinic_resource`). They are NOT dispatched as standalone staged resources first (Practitioner/Organization rarely arrive patient-scoped in `$export`); instead they resolve inline from references. Add a standalone dispatch (Task G) so they also hydrate when present as top-level resources.

### Task B1: Practitioner get-or-create (`phm_edw.provider`)

**Files:**
- Modify: `apps/api/src/services/ehr/edwHydration.ts`
- Test: `apps/api/src/services/ehr/edwHydration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { upsertProviderFromReference } from './edwHydration.js'; // add to exports

describe('upsertProviderFromReference', () => {
  it('creates a provider from a Practitioner resource and reuses it by NPI', async () => {
    await sql.begin(async (tx) => {
      const practitioner = {
        resourceType: 'Practitioner',
        id: 'prac-1',
        identifier: [{ system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567893' }],
        name: [{ family: 'Wells', given: ['Sarah'] }],
      };
      const id1 = await upsertProviderFromReference(tx, practitioner);
      const id2 = await upsertProviderFromReference(tx, practitioner);
      expect(id1).not.toBeNull();
      expect(id2).toBe(id1);
      await tx`ROLLBACK`.catch(() => undefined);
    }).catch(() => undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api -- edwHydration -t upsertProviderFromReference`
Expected: FAIL — `upsertProviderFromReference is not a function`.

- [ ] **Step 3: Implement**

```typescript
export async function upsertProviderFromReference(
  tx: Tx,
  practitioner: FhirResource | null,
): Promise<number | null> {
  if (!practitioner) return null;
  const name = firstRecord(practitioner['name']);
  const family = truncateNullable(cleanString(name?.['family']), 100);
  const given = Array.isArray(name?.['given']) ? cleanString(name?.['given']?.[0]) : null;
  const npi = practitionerNpi(practitioner);
  if (!family && !npi) return null;

  if (npi) {
    const found = await tx.unsafe<Array<{ provider_id: number | string }>>(
      `SELECT provider_id FROM phm_edw.provider WHERE npi_number = $1 ORDER BY provider_id LIMIT 1`,
      [npi],
    );
    if (found[0]) return Number(found[0].provider_id);
  }

  const inserted = await tx.unsafe<Array<{ provider_id: number | string }>>(
    `
    INSERT INTO phm_edw.provider
      (first_name, last_name, display_name, npi_number, active_ind, created_date, updated_date)
    VALUES ($1, $2, $3, $4, 'Y', NOW(), NOW())
    RETURNING provider_id
    `,
    [
      truncate(given ?? 'Unknown', 100),
      truncate(family ?? 'Unknown', 100),
      truncateNullable(cleanString(name?.['text']) ?? joinName(given, family), 200),
      npi,
    ],
  );
  return Number(inserted[0]!.provider_id);
}

function practitionerNpi(resource: FhirResource): string | null {
  const identifiers = recordArray(resource['identifier']);
  const npi = identifiers.find((id) => cleanString(id['system'])?.includes('us-npi'));
  return truncateNullable(cleanString(npi?.['value']), 50);
}

function joinName(given: string | null, family: string | null): string | null {
  const parts = [given, family].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' ') : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/api -- edwHydration -t upsertProviderFromReference`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/ehr/edwHydration.ts apps/api/src/services/ehr/edwHydration.test.ts
git commit -m "feat(ehr): add Practitioner->provider get-or-create"
```

### Task B2: Organization get-or-create (`phm_edw.organization`)

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { upsertOrganizationFromReference } from './edwHydration.js';

it('creates an organization and reuses it by name', async () => {
  await sql.begin(async (tx) => {
    const org = { resourceType: 'Organization', id: 'org-1', name: 'Mercy Clinic' };
    const a = await upsertOrganizationFromReference(tx, org);
    const b = await upsertOrganizationFromReference(tx, org);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  }).catch(() => undefined);
});
```

- [ ] **Step 2: Run to verify it fails** — `npm run test --workspace=apps/api -- edwHydration -t Organization` → FAIL (not a function).

- [ ] **Step 3: Implement**

```typescript
export async function upsertOrganizationFromReference(
  tx: Tx,
  organization: FhirResource | null,
): Promise<number | null> {
  if (!organization) return null;
  const name = truncateNullable(cleanString(organization['name']), 200);
  if (!name) return null;
  const orgType = truncateNullable(conceptLabel(firstConcept(organization['type'])), 50);

  const found = await tx.unsafe<Array<{ org_id: number | string }>>(
    `SELECT org_id FROM phm_edw.organization WHERE organization_name = $1 ORDER BY org_id LIMIT 1`,
    [name],
  );
  if (found[0]) return Number(found[0].org_id);

  const inserted = await tx.unsafe<Array<{ org_id: number | string }>>(
    `
    INSERT INTO phm_edw.organization
      (organization_name, organization_type, active_ind, created_date, updated_date)
    VALUES ($1, $2, 'Y', NOW(), NOW())
    RETURNING org_id
    `,
    [name, orgType],
  );
  return Number(inserted[0]!.org_id);
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): add Organization->organization get-or-create`

### Task B3: Location get-or-create (`phm_edw.clinic_resource`)

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { upsertLocationFromReference } from './edwHydration.js';

it('creates a clinic_resource from a Location and reuses by name', async () => {
  await sql.begin(async (tx) => {
    const loc = { resourceType: 'Location', id: 'loc-1', name: 'Room 4B', mode: 'instance' };
    const a = await upsertLocationFromReference(tx, loc);
    const b = await upsertLocationFromReference(tx, loc);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
  }).catch(() => undefined);
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement**

```typescript
export async function upsertLocationFromReference(
  tx: Tx,
  location: FhirResource | null,
): Promise<number | null> {
  if (!location) return null;
  const name = truncateNullable(cleanString(location['name']), 100);
  if (!name) return null;
  const physType = truncateNullable(conceptLabel(firstConcept(location['physicalType'])), 50) ?? 'location';

  const found = await tx.unsafe<Array<{ resource_id: number | string }>>(
    `SELECT resource_id FROM phm_edw.clinic_resource WHERE resource_name = $1 ORDER BY resource_id LIMIT 1`,
    [name],
  );
  if (found[0]) return Number(found[0].resource_id);

  const inserted = await tx.unsafe<Array<{ resource_id: number | string }>>(
    `
    INSERT INTO phm_edw.clinic_resource
      (resource_name, resource_type, capacity, active_ind, created_date, updated_date)
    VALUES ($1, $2, 0, 'Y', NOW(), NOW())
    RETURNING resource_id
    `,
    [name, truncate(physType, 50)],
  );
  return Number(inserted[0]!.resource_id);
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): add Location->clinic_resource get-or-create`

### Task B4: Encounter FK backfill (provider/org from references)

Wire the new dimension helpers into the existing `hydrateEncounter`, which currently sets `org_id` from `row.org_id` only and never sets `provider_id`.

**Files:** Modify `edwHydration.ts` (`hydrateEncounter`); Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('hydrateEncounter backfills provider_id from participant.individual', async () => {
  // stage an Encounter referencing a contained/served Practitioner; assert encounter.provider_id is set.
  // Use the existing test harness pattern in this file (stage row -> hydrateStagedRunToEdw -> query encounter).
  // Assert: SELECT provider_id FROM phm_edw.encounter WHERE encounter_id = <hydrated id> IS NOT NULL.
});
```

> NOTE for implementer: follow the existing Encounter hydration test in `edwHydration.test.ts` for the staging+run harness; the assertion is `provider_id IS NOT NULL`. Replace the comment body with the concrete arrange/act/assert copied from the nearest existing Encounter test.

- [ ] **Step 2: Run to verify it fails** — provider_id is null → FAIL.

- [ ] **Step 3: Implement** — inside `hydrateEncounter`, before the insert/update, resolve dimensions from inline contained resources or references:

```typescript
  // Resolve provider/org dimensions (best-effort; references that point at
  // separate resources resolve to null and are backfilled when those arrive).
  const participantRef = referenceId(
    firstRecord(resource['participant'])?.['individual'] ?? resource['participant'],
    'Practitioner',
  );
  const providerId = participantRef
    ? await resolveProviderId(tx, row, participantRef)
    : await upsertProviderFromReference(tx, containedResource(resource, 'Practitioner', participantRef));
  const serviceOrgRef = referenceId(resource['serviceProvider'], 'Organization');
  const resolvedOrgId =
    (serviceOrgRef ? await resolveOrgId(tx, row, serviceOrgRef) : null)
    ?? await upsertOrganizationFromReference(tx, containedResource(resource, 'Organization', serviceOrgRef))
    ?? orgId;
```

Then change both the INSERT and UPDATE column lists to set `provider_id = providerId` and `org_id = resolvedOrgId` (replace the existing `org_id` param). Add the crosswalk-based resolvers + contained helper:

```typescript
async function resolveProviderId(tx: Tx, row: StagedFhirResourceRow, ref: string): Promise<number | null> {
  const rows = await tx.unsafe<Array<{ local_id: number | string | null }>>(
    `SELECT local_id FROM phm_edw.ehr_resource_crosswalk
     WHERE ehr_tenant_id = $1 AND resource_type = 'Practitioner' AND ehr_resource_id = $2
       AND local_table = 'phm_edw.provider' AND local_id IS NOT NULL
     ORDER BY last_seen_at DESC LIMIT 1`,
    [Number(row.ehr_tenant_id), ref],
  );
  return optionalPositiveNumber(rows[0]?.local_id);
}

async function resolveOrgId(tx: Tx, row: StagedFhirResourceRow, ref: string): Promise<number | null> {
  const rows = await tx.unsafe<Array<{ local_id: number | string | null }>>(
    `SELECT local_id FROM phm_edw.ehr_resource_crosswalk
     WHERE ehr_tenant_id = $1 AND resource_type = 'Organization' AND ehr_resource_id = $2
       AND local_table = 'phm_edw.organization' AND local_id IS NOT NULL
     ORDER BY last_seen_at DESC LIMIT 1`,
    [Number(row.ehr_tenant_id), ref],
  );
  return optionalPositiveNumber(rows[0]?.local_id);
}

function containedResource(resource: FhirResource, type: string, ref: string | null): FhirResource | null {
  const contained = recordArray(resource['contained']).find(
    (r) => cleanString(r['resourceType']) === type && (!ref || cleanString(r['id']) === ref),
  );
  return contained ? (contained as FhirResource) : null;
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): backfill encounter provider_id/org_id from FHIR references`

---

## Phase C — Clinical resource hydrators

All of these add a `case` to `hydrateByResourceType` and a new `hydrate*` function, plus the resource type to `SUPPORTED_RESOURCE_TYPES` and the `ORDER BY CASE resource_type` ladder in `findHydratableStagedResources` (so they hydrate after Encounter, which they FK to). For each task: add the resource to `SUPPORTED_RESOURCE_TYPES`, give it an ordinal in the ORDER BY ladder (after Encounter=1), add the dispatch case, add the function.

### Task C1: ServiceRequest → `phm_edw.clinical_order`

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('hydrates a ServiceRequest into clinical_order (insert then update)', async () => {
  // Stage Patient (so patient resolves) + ServiceRequest referencing that patient.
  // Run hydrateStagedRunToEdw; assert one clinical_order row with order_name set,
  // order_status mapped from ServiceRequest.status, and order_type from category.
  // Re-stage the same ServiceRequest with a changed status; assert UPDATE (same order_id).
});
```

> Implementer: copy the Patient+child staging harness from the existing Condition test in this file. Assert `SELECT order_name, order_status FROM phm_edw.clinical_order` reflects the resource; second run asserts row count stays 1.

- [ ] **Step 2: Run to verify it fails** — `ServiceRequest` not in `SUPPORTED_RESOURCE_TYPES` → 0 hydrated → FAIL.

- [ ] **Step 3: Implement**

Add `'ServiceRequest'` to `SUPPORTED_RESOURCE_TYPES`, add `WHEN 'ServiceRequest' THEN 2` (and bump following ordinals so each is distinct) in the ORDER BY, add the dispatch case `case 'ServiceRequest': return hydrateServiceRequest(tx, row, patientId, existing);`, and:

```typescript
async function hydrateServiceRequest(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const code = firstConcept(resource['code']);
  const encounterId = await resolveEncounterId(tx, row, referenceId(resource['encounter'], 'Encounter'));
  const providerId = await resolveProviderId(tx, row, referenceId(resource['requester'], 'Practitioner') ?? '')
    ?? await upsertProviderFromReference(tx, containedResource(resource, 'Practitioner', referenceId(resource['requester'], 'Practitioner')));
  const orderName = truncate(conceptLabel(code) ?? code.code ?? `ServiceRequest ${row.resource_id}`, 255);
  const orderType = truncate(conceptLabel(firstConcept(resource['category'])) ?? 'PROCEDURE', 30);
  const orderStatus = truncate(cleanString(resource['status']) ?? 'unknown', 30);
  const priority = truncate(cleanString(resource['priority']) ?? 'routine', 20);
  const orderedAt = cleanString(resource['authoredOn']) ?? row.source_last_updated ?? row.received_at;
  const loinc = code.system?.toLowerCase().includes('loinc') ? truncateNullable(code.code, 20) : null;
  const instructions = truncateNullable(cleanString(firstRecord(resource['note'])?.['text']), 1000);

  if (existing.localTable === 'phm_edw.clinical_order' && existing.localId !== null) {
    const rows = await tx.unsafe<{ order_id: number | string }[]>(
      `UPDATE phm_edw.clinical_order
       SET patient_id=$2, encounter_id=$3, ordering_provider_id=$4, order_type=$5, order_name=$6,
           loinc_code=$7, priority=$8, order_datetime=$9::timestamp, order_status=$10, instructions=$11,
           updated_date=NOW()
       WHERE order_id=$1 RETURNING order_id`,
      [existing.localId, patientId, encounterId, providerId, orderType, orderName, loinc, priority, orderedAt, orderStatus, instructions],
    );
    return { localTable: 'phm_edw.clinical_order', localId: Number(rows[0]?.order_id ?? existing.localId), operation: 'updated' };
  }

  const rows = await tx.unsafe<{ order_id: number | string }[]>(
    `INSERT INTO phm_edw.clinical_order
       (patient_id, encounter_id, ordering_provider_id, order_type, order_name, loinc_code,
        priority, order_datetime, order_status, instructions, fasting_required, order_source,
        active_ind, created_date, updated_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamp,$9,$10, false, 'FHIR', 'Y', NOW(), NOW())
     RETURNING order_id`,
    [patientId, encounterId, providerId, orderType, orderName, loinc, priority, orderedAt, orderStatus, instructions],
  );
  return { localTable: 'phm_edw.clinical_order', localId: Number(rows[0]!.order_id), operation: 'inserted' };
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): hydrate ServiceRequest into clinical_order`

### Task C2: DiagnosticReport → `phm_edw.diagnostic_report`

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test** — stage Patient + DiagnosticReport; assert one `diagnostic_report` row with `report_code`, `status`, `conclusion`; second run updates in place.

- [ ] **Step 2: Run to verify it fails** — FAIL (unsupported type).

- [ ] **Step 3: Implement** — add `'DiagnosticReport'` to supported types + ORDER BY ordinal (after Observation), dispatch case, and:

```typescript
async function hydrateDiagnosticReport(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const code = firstConcept(resource['code']);
  const encounterId = await resolveEncounterId(tx, row, referenceId(resource['encounter'], 'Encounter'));
  const reportCode = truncate(code.code ?? `FHIR-${row.resource_id}`, 50);
  const reportName = truncateNullable(conceptLabel(code) ?? reportCode, 255);
  const codeSystem = edwGeneralCodeSystem(code.system);
  const category = truncateNullable(conceptLabel(firstConcept(resource['category'])), 100);
  const status = truncateNullable(cleanString(resource['status']), 50);
  const effective = cleanString(resource['effectiveDateTime']) ?? periodStart(resource['effectivePeriod']);
  const issued = cleanString(resource['issued']) ?? row.source_last_updated ?? row.received_at;
  const performer = truncateNullable(cleanString(firstRecord(resource['performer'])?.['display']), 255);
  const conclusion = cleanString(resource['conclusion']);

  if (existing.localTable === 'phm_edw.diagnostic_report' && existing.localId !== null) {
    const rows = await tx.unsafe<{ report_id: number | string }[]>(
      `UPDATE phm_edw.diagnostic_report
       SET patient_id=$2, encounter_id=$3, report_code=$4, report_name=$5, code_system=$6,
           category=$7, status=$8, effective_datetime=$9::timestamp, issued_datetime=$10::timestamp,
           performer=$11, conclusion=$12, updated_date=NOW()
       WHERE report_id=$1 RETURNING report_id`,
      [existing.localId, patientId, encounterId, reportCode, reportName, codeSystem, category, status, effective, issued, performer, conclusion],
    );
    return { localTable: 'phm_edw.diagnostic_report', localId: Number(rows[0]?.report_id ?? existing.localId), operation: 'updated' };
  }

  const rows = await tx.unsafe<{ report_id: number | string }[]>(
    `INSERT INTO phm_edw.diagnostic_report
       (patient_id, encounter_id, report_code, report_name, code_system, category, status,
        effective_datetime, issued_datetime, performer, conclusion, active_ind, created_date, updated_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamp,$9::timestamp,$10,$11,'Y',NOW(),NOW())
     RETURNING report_id`,
    [patientId, encounterId, reportCode, reportName, codeSystem, category, status, effective, issued, performer, conclusion],
  );
  return { localTable: 'phm_edw.diagnostic_report', localId: Number(rows[0]!.report_id), operation: 'inserted' };
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): hydrate DiagnosticReport into diagnostic_report`

### Task C3: DocumentReference → `phm_edw.document_reference`

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test** — stage Patient + DocumentReference with one `content.attachment` (contentType, url, title); assert one `document_reference` row with `content_url`, `content_type`, `doc_type_name`; second run updates.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — add supported type + ordinal + dispatch + :

```typescript
async function hydrateDocumentReference(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const type = firstConcept(resource['type']);
  const encounterId = await resolveEncounterId(
    tx, row, referenceId(firstRecord(resource['context'])?.['encounter'] ?? resource['encounter'], 'Encounter'),
  );
  const attachment = record(firstRecord(resource['content'])?.['attachment']);
  const docTypeCode = truncateNullable(type.code, 50);
  const docTypeName = truncateNullable(conceptLabel(type), 255);
  const codeSystem = edwGeneralCodeSystem(type.system);
  const category = truncateNullable(conceptLabel(firstConcept(resource['category'])), 100);
  const status = truncateNullable(cleanString(resource['status']), 50);
  const docStatus = truncateNullable(cleanString(resource['docStatus']), 50);
  const contentType = truncateNullable(cleanString(attachment?.['contentType']), 100);
  const contentUrl = cleanString(attachment?.['url']);
  const contentTitle = truncateNullable(cleanString(attachment?.['title']), 255);
  const authorDisplay = truncateNullable(cleanString(firstRecord(resource['author'])?.['display']), 255);
  const docDate = cleanString(resource['date']) ?? cleanString(attachment?.['creation']) ?? row.source_last_updated ?? row.received_at;

  if (existing.localTable === 'phm_edw.document_reference' && existing.localId !== null) {
    const rows = await tx.unsafe<{ document_id: number | string }[]>(
      `UPDATE phm_edw.document_reference
       SET patient_id=$2, encounter_id=$3, doc_type_code=$4, doc_type_name=$5, code_system=$6,
           category=$7, status=$8, doc_status=$9, content_type=$10, content_url=$11, content_title=$12,
           author_display=$13, document_datetime=$14::timestamp, updated_date=NOW()
       WHERE document_id=$1 RETURNING document_id`,
      [existing.localId, patientId, encounterId, docTypeCode, docTypeName, codeSystem, category, status, docStatus, contentType, contentUrl, contentTitle, authorDisplay, docDate],
    );
    return { localTable: 'phm_edw.document_reference', localId: Number(rows[0]?.document_id ?? existing.localId), operation: 'updated' };
  }

  const rows = await tx.unsafe<{ document_id: number | string }[]>(
    `INSERT INTO phm_edw.document_reference
       (patient_id, encounter_id, doc_type_code, doc_type_name, code_system, category, status,
        doc_status, content_type, content_url, content_title, author_display, document_datetime,
        active_ind, created_date, updated_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamp,'Y',NOW(),NOW())
     RETURNING document_id`,
    [patientId, encounterId, docTypeCode, docTypeName, codeSystem, category, status, docStatus, contentType, contentUrl, contentTitle, authorDisplay, docDate],
  );
  return { localTable: 'phm_edw.document_reference', localId: Number(rows[0]!.document_id), operation: 'inserted' };
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): hydrate DocumentReference into document_reference`

### Task C4: CarePlan → `phm_edw.care_plan`

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test** — stage Patient + CarePlan; assert one `care_plan` row with `plan_name`, `status`, `effective_date`; second run updates.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — supported type + ordinal + dispatch + :

```typescript
async function hydrateCarePlan(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const planName = truncate(
    conceptLabel(firstConcept(resource['category']))
      ?? cleanString(resource['title'])
      ?? `CarePlan ${row.resource_id}`,
    200,
  );
  const planType = truncate(conceptLabel(firstConcept(resource['category'])) ?? 'GENERAL', 50);
  const status = truncate(cleanString(resource['status']) ?? 'unknown', 20);
  const period = record(resource['period']);
  const effective = datePart(cleanString(period?.['start']) ?? row.source_last_updated ?? row.received_at) ?? datePart(row.received_at);
  const review = datePart(cleanString(period?.['end']));
  const notes = truncateNullable(cleanString(firstRecord(resource['note'])?.['text']), 2000);

  if (existing.localTable === 'phm_edw.care_plan' && existing.localId !== null) {
    const rows = await tx.unsafe<{ care_plan_id: number | string }[]>(
      `UPDATE phm_edw.care_plan
       SET patient_id=$2, plan_name=$3, plan_type=$4, effective_date=$5::date, review_date=$6::date,
           status=$7, notes=$8, updated_date=NOW()
       WHERE care_plan_id=$1 RETURNING care_plan_id`,
      [existing.localId, patientId, planName, planType, effective, review, status, notes],
    );
    return { localTable: 'phm_edw.care_plan', localId: Number(rows[0]?.care_plan_id ?? existing.localId), operation: 'updated' };
  }

  const rows = await tx.unsafe<{ care_plan_id: number | string }[]>(
    `INSERT INTO phm_edw.care_plan
       (patient_id, plan_name, plan_type, effective_date, review_date, status, notes,
        active_ind, created_date, updated_date)
     VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,'Y',NOW(),NOW())
     RETURNING care_plan_id`,
    [patientId, planName, planType, effective, review, status, notes],
  );
  return { localTable: 'phm_edw.care_plan', localId: Number(rows[0]!.care_plan_id), operation: 'inserted' };
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): hydrate CarePlan into care_plan`

### Task C5: Goal → `phm_edw.care_plan_item` (synthetic per-patient plan)

`care_plan_item.care_plan_id` is NOT NULL. FHIR Goal is patient-scoped, not always tied to a CarePlan. Get-or-create a per-patient synthetic "Imported FHIR Goals" care_plan and attach the goal as an item with `item_category='GOAL'`.

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test** — stage Patient + Goal; assert a `care_plan` named `Imported FHIR Goals` exists and one `care_plan_item` with `item_category='GOAL'`, `description` from `Goal.description.text`; second run updates the item.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — supported type + ordinal + dispatch + :

```typescript
async function hydrateGoal(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const carePlanId = await getOrCreateImportedGoalsPlan(tx, patientId);
  const description = truncate(
    conceptLabel(firstConcept(resource['description'])) ?? cleanString(record(resource['description'])?.['text']) ?? `Goal ${row.resource_id}`,
    2000,
  );
  const target = firstRecord(resource['target']);
  const targetValue = truncateNullable(
    conceptLabel(firstConcept(target?.['measure']))
      ?? cleanString(record(target?.['detailQuantity'])?.['value']),
    100,
  );
  const status = truncate(cleanString(resource['lifecycleStatus']) ?? 'active', 20);
  const dueDate = datePart(cleanString(target?.['dueDate']));

  if (existing.localTable === 'phm_edw.care_plan_item' && existing.localId !== null) {
    const rows = await tx.unsafe<{ item_id: number | string }[]>(
      `UPDATE phm_edw.care_plan_item
       SET care_plan_id=$2, patient_id=$3, description=$4, target_value=$5, due_date=$6::date,
           status=$7, updated_date=NOW()
       WHERE item_id=$1 RETURNING item_id`,
      [existing.localId, carePlanId, patientId, description, targetValue, dueDate, status],
    );
    return { localTable: 'phm_edw.care_plan_item', localId: Number(rows[0]?.item_id ?? existing.localId), operation: 'updated' };
  }

  const rows = await tx.unsafe<{ item_id: number | string }[]>(
    `INSERT INTO phm_edw.care_plan_item
       (care_plan_id, patient_id, item_category, description, target_value, due_date, status, ordinal,
        active_ind, created_date, updated_date)
     VALUES ($1,$2,'GOAL',$3,$4,$5::date,$6,0,'Y',NOW(),NOW())
     RETURNING item_id`,
    [carePlanId, patientId, description, targetValue, dueDate, status],
  );
  return { localTable: 'phm_edw.care_plan_item', localId: Number(rows[0]!.item_id), operation: 'inserted' };
}

async function getOrCreateImportedGoalsPlan(tx: Tx, patientId: number): Promise<number> {
  const found = await tx.unsafe<{ care_plan_id: number | string }[]>(
    `SELECT care_plan_id FROM phm_edw.care_plan
     WHERE patient_id=$1 AND plan_name='Imported FHIR Goals' ORDER BY care_plan_id LIMIT 1`,
    [patientId],
  );
  if (found[0]) return Number(found[0].care_plan_id);
  const inserted = await tx.unsafe<{ care_plan_id: number | string }[]>(
    `INSERT INTO phm_edw.care_plan
       (patient_id, plan_name, plan_type, effective_date, status, active_ind, created_date, updated_date)
     VALUES ($1,'Imported FHIR Goals','GOAL',CURRENT_DATE,'active','Y',NOW(),NOW())
     RETURNING care_plan_id`,
    [patientId],
  );
  return Number(inserted[0]!.care_plan_id);
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): hydrate Goal into care_plan_item`

### Task C6: CareTeam → `phm_edw.care_team` (+ `care_team_member`)

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test** — stage Patient + CareTeam with two `participant`s; assert one `care_team` row and two `care_team_member` rows (member_name + role); second run does not duplicate members.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — supported type + ordinal + dispatch + :

```typescript
async function hydrateCareTeam(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const orgId = optionalPositiveNumber(row.org_id);
  const teamName = truncate(cleanString(resource['name']) ?? `Care Team ${row.resource_id}`, 200);
  const teamType = truncate(conceptLabel(firstConcept(resource['category'])) ?? 'GENERAL', 50);

  let careTeamId: number;
  let operation: 'inserted' | 'updated';
  if (existing.localTable === 'phm_edw.care_team' && existing.localId !== null) {
    const rows = await tx.unsafe<{ care_team_id: number | string }[]>(
      `UPDATE phm_edw.care_team SET team_name=$2, org_id=$3, team_type=$4, updated_date=NOW()
       WHERE care_team_id=$1 RETURNING care_team_id`,
      [existing.localId, teamName, orgId, teamType],
    );
    careTeamId = Number(rows[0]?.care_team_id ?? existing.localId);
    operation = 'updated';
  } else {
    const rows = await tx.unsafe<{ care_team_id: number | string }[]>(
      `INSERT INTO phm_edw.care_team (team_name, org_id, team_type, active_ind, created_date, updated_date)
       VALUES ($1,$2,$3,'Y',NOW(),NOW()) RETURNING care_team_id`,
      [teamName, orgId, teamType],
    );
    careTeamId = Number(rows[0]!.care_team_id);
    operation = 'inserted';
  }

  // Replace members idempotently: soft-delete prior, re-insert current set.
  await tx.unsafe(`UPDATE phm_edw.care_team_member SET active_ind='N', updated_date=NOW() WHERE care_team_id=$1`, [careTeamId]);
  for (const participant of recordArray(resource['participant'])) {
    const member = record(participant['member']);
    const name = truncate(cleanString(member?.['display']) ?? 'Unknown Member', 200);
    const role = truncate(conceptLabel(firstConcept(participant['role'])) ?? 'member', 100);
    await tx.unsafe(
      `INSERT INTO phm_edw.care_team_member
         (care_team_id, member_name, role, is_lead, joined_date, active_ind, created_date, updated_date)
       VALUES ($1,$2,$3,false,CURRENT_DATE,'Y',NOW(),NOW())`,
      [careTeamId, name, role],
    );
  }

  return { localTable: 'phm_edw.care_team', localId: careTeamId, operation };
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): hydrate CareTeam into care_team + members`

### Task C7: Coverage → `phm_edw.patient_insurance_coverage` (+ `payer`)

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test** — stage Patient + Coverage; assert a `payer` row created from `Coverage.payor.display` and one `patient_insurance_coverage` linking patient+payer with `policy_number`; second run updates.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — supported type + ordinal + dispatch + :

```typescript
async function hydrateCoverage(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  existing: LocalTarget,
): Promise<HydratedResourceTarget> {
  const resource = row.resource;
  const payerId = await upsertPayer(tx, resource);
  const policyNumber = truncateNullable(cleanString(resource['subscriberId']) ?? cleanString(resource['identifier'] && firstRecord(resource['identifier'])?.['value']), 50);
  const period = record(resource['period']);
  const start = datePart(cleanString(period?.['start'])) ?? datePart(row.received_at);
  const end = datePart(cleanString(period?.['end']));
  const isPrimary = cleanString(resource['order']) === '1' ? 'Y' : 'N';

  if (existing.localTable === 'phm_edw.patient_insurance_coverage' && existing.localId !== null) {
    const rows = await tx.unsafe<{ coverage_id: number | string }[]>(
      `UPDATE phm_edw.patient_insurance_coverage
       SET patient_id=$2, payer_id=$3, policy_number=$4, coverage_start_date=$5::date,
           coverage_end_date=$6::date, primary_indicator=$7, updated_date=NOW()
       WHERE coverage_id=$1 RETURNING coverage_id`,
      [existing.localId, patientId, payerId, policyNumber, start, end, isPrimary],
    );
    return { localTable: 'phm_edw.patient_insurance_coverage', localId: Number(rows[0]?.coverage_id ?? existing.localId), operation: 'updated' };
  }

  const rows = await tx.unsafe<{ coverage_id: number | string }[]>(
    `INSERT INTO phm_edw.patient_insurance_coverage
       (patient_id, payer_id, policy_number, coverage_start_date, coverage_end_date,
        primary_indicator, active_ind, created_date, updated_date)
     VALUES ($1,$2,$3,$4::date,$5::date,$6,'Y',NOW(),NOW())
     RETURNING coverage_id`,
    [patientId, payerId, policyNumber, start, end, isPrimary],
  );
  return { localTable: 'phm_edw.patient_insurance_coverage', localId: Number(rows[0]!.coverage_id), operation: 'inserted' };
}

async function upsertPayer(tx: Tx, coverage: FhirResource): Promise<number> {
  const name = truncate(cleanString(firstRecord(coverage['payor'])?.['display']) ?? 'Unknown Payer', 200);
  const found = await tx.unsafe<{ payer_id: number | string }[]>(
    `SELECT payer_id FROM phm_edw.payer WHERE payer_name=$1 ORDER BY payer_id LIMIT 1`,
    [name],
  );
  if (found[0]) return Number(found[0].payer_id);
  const inserted = await tx.unsafe<{ payer_id: number | string }[]>(
    `INSERT INTO phm_edw.payer (payer_name, active_ind, created_date, updated_date)
     VALUES ($1,'Y',NOW(),NOW()) RETURNING payer_id`,
    [name],
  );
  return Number(inserted[0]!.payer_id);
}
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): hydrate Coverage into patient_insurance_coverage + payer`

---

## Phase D — Vital-sign dual-write

FHIR vital-sign Observations (category `vital-signs`) continue to write flat into `phm_edw.observation` (unchanged) AND additionally fold into the wide `phm_edw.vital_sign` row keyed by (patient, encounter, recorded_datetime). LOINC→column mapping: 8480-6→bp_systolic, 8462-4→bp_diastolic, 8867-4→heart_rate, 8310-5→temperature_f, 9279-1→respiratory_rate, 2708-6/59408-5→spo2_percent, 29463-7→weight (kg→lbs), 8302-2→height (cm→in), 39156-5→bmi, 72514-3→pain_score.

### Task D1: Vital-sign fold into `phm_edw.vital_sign`

**Files:** Modify `edwHydration.ts` (`hydrateObservation`); Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test** — stage Patient + an Observation with `category=vital-signs` and `code=8867-4` (heart rate) value 72; run; assert BOTH an `observation` row exists AND a `vital_sign` row with `heart_rate=72` for that patient/time.

- [ ] **Step 2: Run to verify it fails** — `vital_sign` empty → FAIL.

- [ ] **Step 3: Implement** — after the existing `observation` insert/update in `hydrateObservation`, before `return`, call a fold helper. The Observation target stays `phm_edw.observation` (crosswalk continues to point there); the vital fold is a side-write keyed by encounter+time so multiple vitals at one encounter collapse into one row.

```typescript
  await foldVitalSign(tx, row, patientId, encounterId, code, value, observedAt);
```

```typescript
const VITAL_LOINC: Record<string, 'bp_systolic'|'bp_diastolic'|'heart_rate'|'temperature_f'|'respiratory_rate'|'spo2_percent'|'weight_lbs'|'height_in'|'bmi'|'pain_score'> = {
  '8480-6': 'bp_systolic', '8462-4': 'bp_diastolic', '8867-4': 'heart_rate',
  '8310-5': 'temperature_f', '9279-1': 'respiratory_rate', '2708-6': 'spo2_percent',
  '59408-5': 'spo2_percent', '29463-7': 'weight_lbs', '8302-2': 'height_in',
  '39156-5': 'bmi', '72514-3': 'pain_score',
};

async function foldVitalSign(
  tx: Tx,
  row: StagedFhirResourceRow,
  patientId: number,
  encounterId: number | null,
  code: CodeConcept,
  value: { numeric: number | null; text: string | null; unit: string | null },
  observedAt: string,
): Promise<void> {
  if (!isVitalSignObservation(row.resource)) return;
  const column = code.code ? VITAL_LOINC[code.code] : undefined;
  if (!column || value.numeric === null) {
    await foldComponentVitals(tx, patientId, encounterId, row.resource, observedAt);
    return;
  }
  const converted = convertVital(column, value.numeric, value.unit);
  await upsertVitalColumn(tx, patientId, encounterId, observedAt, column, converted);
}

async function upsertVitalColumn(
  tx: Tx, patientId: number, encounterId: number | null, observedAt: string,
  column: string, numeric: number,
): Promise<void> {
  const existing = await tx.unsafe<{ vital_id: number | string }[]>(
    `SELECT vital_id FROM phm_edw.vital_sign
     WHERE patient_id=$1 AND recorded_datetime=$2::timestamp
       AND (encounter_id=$3 OR ($3 IS NULL AND encounter_id IS NULL))
     ORDER BY vital_id LIMIT 1`,
    [patientId, observedAt, encounterId],
  );
  if (existing[0]) {
    await tx.unsafe(
      `UPDATE phm_edw.vital_sign SET ${column}=$2, updated_date=NOW() WHERE vital_id=$1`,
      [Number(existing[0].vital_id), numeric],
    );
    return;
  }
  await tx.unsafe(
    `INSERT INTO phm_edw.vital_sign (patient_id, encounter_id, recorded_datetime, ${column}, active_ind, created_date, updated_date)
     VALUES ($1,$2,$3::timestamp,$4,'Y',NOW(),NOW())`,
    [patientId, encounterId, observedAt, numeric],
  );
}

function isVitalSignObservation(resource: FhirResource): boolean {
  return recordArray(resource['category']).some((cat) =>
    recordArray(cat['coding']).some((c) => cleanString(c['code']) === 'vital-signs'),
  );
}

function convertVital(column: string, numeric: number, unit: string | null): number {
  const u = (unit ?? '').toLowerCase();
  if (column === 'weight_lbs' && (u === 'kg' || u === 'kilogram')) return Math.round(numeric * 2.20462 * 10) / 10;
  if (column === 'height_in' && (u === 'cm' || u === 'centimeter')) return Math.round(numeric / 2.54 * 10) / 10;
  if (column === 'temperature_f' && (u === 'cel' || u.includes('cel'))) return Math.round((numeric * 9 / 5 + 32) * 10) / 10;
  return numeric;
}

// BP often arrives as one Observation with systolic/diastolic components.
async function foldComponentVitals(
  tx: Tx, patientId: number, encounterId: number | null, resource: FhirResource, observedAt: string,
): Promise<void> {
  for (const component of recordArray(resource['component'])) {
    const ccode = firstConcept(component['code']);
    const column = ccode.code ? VITAL_LOINC[ccode.code] : undefined;
    const q = record(component['valueQuantity']);
    const num = optionalNumber(q?.['value']);
    if (column && num !== null) {
      await upsertVitalColumn(tx, patientId, encounterId, observedAt, column, convertVital(column, num, cleanString(q?.['unit'])));
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes** — PASS. Add a second test asserting a BP Observation with systolic+diastolic components produces `bp_systolic` and `bp_diastolic` on one row.

- [ ] **Step 5: Commit** — `feat(ehr): dual-write vital-sign Observations into vital_sign`

---

## Phase E — Soft-delete / entered-in-error

Two delete signals: (1) a resource arrives with `status='entered-in-error'` (most resources) — soft-delete the EDW row; (2) Bulk Data `$export` output includes a `deleted` entry (a Bundle of deletions) — process those references.

### Task E1: entered-in-error soft-delete in hydration

**Files:** Modify `edwHydration.ts` (`hydrateStagedResource`); Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test** — stage Patient + Condition (hydrates active); re-stage the same Condition with `verificationStatus=entered-in-error`; run; assert the `condition_diagnosis` row has `active_ind='N'` and the crosswalk has `deleted_reason='entered-in-error'`.

- [ ] **Step 2: Run to verify it fails** — row stays `active_ind='Y'` → FAIL.

- [ ] **Step 3: Implement** — in `hydrateStagedResource`, after resolving `existing` and BEFORE the normal hydrate, branch on entered-in-error:

```typescript
    if (isEnteredInError(row.resource) && existing.localTable && existing.localId !== null) {
      await softDeleteLocalRow(tx, existing.localTable, existing.localId);
      await markCrosswalkDeleted(tx, row, 'entered-in-error');
      return { localTable: existing.localTable, localId: existing.localId, operation: 'updated' };
    }
```

```typescript
function isEnteredInError(resource: FhirResource): boolean {
  if (cleanString(resource['status']) === 'entered-in-error') return true;
  const vs = firstConcept(resource['verificationStatus']).code;
  const cs = firstConcept(resource['clinicalStatus']).code;
  return vs === 'entered-in-error' || cs === 'entered-in-error';
}

const SOFT_DELETE_PK: Record<string, string> = {
  'phm_edw.encounter': 'encounter_id',
  'phm_edw.condition_diagnosis': 'condition_diagnosis_id',
  'phm_edw.observation': 'observation_id',
  'phm_edw.medication_order': 'medication_order_id',
  'phm_edw.procedure_performed': 'procedure_performed_id',
  'phm_edw.patient_allergy': 'patient_allergy_id',
  'phm_edw.immunization': 'immunization_id',
  'phm_edw.clinical_order': 'order_id',
  'phm_edw.diagnostic_report': 'report_id',
  'phm_edw.document_reference': 'document_id',
  'phm_edw.care_plan': 'care_plan_id',
  'phm_edw.care_plan_item': 'item_id',
  'phm_edw.care_team': 'care_team_id',
  'phm_edw.patient_insurance_coverage': 'coverage_id',
};

async function softDeleteLocalRow(tx: Tx, localTable: string, localId: number): Promise<void> {
  const pk = SOFT_DELETE_PK[localTable];
  if (!pk) return; // patient is never soft-deleted via this path
  await tx.unsafe(`UPDATE ${localTable} SET active_ind='N', updated_date=NOW() WHERE ${pk}=$1`, [localId]);
}

async function markCrosswalkDeleted(tx: Tx, row: StagedFhirResourceRow, reason: string): Promise<void> {
  await tx.unsafe(
    `UPDATE phm_edw.ehr_resource_crosswalk
     SET deleted_at=NOW(), deleted_reason=$4, last_seen_at=NOW()
     WHERE ehr_tenant_id=$1 AND resource_type=$2 AND ehr_resource_id=$3`,
    [Number(row.ehr_tenant_id), row.resource_type, row.resource_id, truncate(reason, 50)],
  );
}
```

> NOTE: `SOFT_DELETE_PK` uses `${localTable}`/`${pk}` interpolation — these are NOT user input (they come from the fixed map / our own crosswalk), so this is safe. Do not parameterize identifiers (Postgres can't bind them); the literal-allowlist map is the guard.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): soft-delete EDW rows on entered-in-error`

### Task E2: process Bulk `deleted` manifest entries

**Files:** Modify `apps/api/src/services/ehr/bulkData.ts`; new exported `processBulkDeletions`; Test `apps/api/src/services/ehr/bulkData.test.ts`

- [ ] **Step 1: Write the failing test** — given a completed bulk manifest containing a `deleted` array with `{ type: 'Bundle', url }` whose NDJSON yields a Bundle of `entry[].request.url = 'Condition/abc'`, assert `processBulkDeletions` calls soft-delete for tenant resource (`Condition`, `abc`).

- [ ] **Step 2: Run to verify it fails** — function missing → FAIL.

- [ ] **Step 3: Implement** — add `processBulkDeletions(input)` that downloads each `deleted` output file, parses the deletion Bundle entries (`request.url` = `ResourceType/id`), and for each calls a shared soft-delete-by-crosswalk that reuses `softDeleteLocalRow` + `markCrosswalkDeleted` (export those from `edwHydration.ts` and import here). Wire the call into `finishBulkJob`/import completion right after hydration (near `bulkData.ts:904`). Resource ids are resolved against `ehr_resource_crosswalk` to find `local_table`/`local_id`.

```typescript
export async function softDeleteByCrosswalk(
  ehrTenantId: number, resourceType: string, resourceId: string, reason: string,
): Promise<boolean> {
  return sql.begin(async (tx) => {
    const rows = await tx.unsafe<Array<{ local_table: string | null; local_id: number | string | null }>>(
      `SELECT local_table, local_id FROM phm_edw.ehr_resource_crosswalk
       WHERE ehr_tenant_id=$1 AND resource_type=$2 AND ehr_resource_id=$3 LIMIT 1`,
      [ehrTenantId, resourceType, resourceId],
    );
    const localTable = rows[0]?.local_table;
    const localId = rows[0]?.local_id != null ? Number(rows[0].local_id) : null;
    if (!localTable || localId === null) return false;
    await softDeleteLocalRow(tx, localTable, localId);
    await tx.unsafe(
      `UPDATE phm_edw.ehr_resource_crosswalk SET deleted_at=NOW(), deleted_reason=$4, last_seen_at=NOW()
       WHERE ehr_tenant_id=$1 AND resource_type=$2 AND ehr_resource_id=$3`,
      [ehrTenantId, resourceType, resourceId, reason.slice(0, 50)],
    );
    return true;
  });
}
```

(Export `softDeleteLocalRow` from `edwHydration.ts` for reuse here.)

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): process Bulk Data deleted manifest into EDW soft-deletes`

---

## Phase F — QDM bridge extension

So the new clinical resources also flow into `phm_edw.qdm_event` / `fhir_qdm_crosswalk` for measure analytics.

### Task F1: extend QdmDatatype union

**Files:** Modify `apps/api/src/services/qdm/model.ts`; Test `apps/api/src/services/qdm/fhirToQdm.test.ts`

- [ ] **Step 1: Write the failing test** (in fhirToQdm.test.ts, added with F2) asserting a DiagnosticReport normalizes to datatype `'Diagnostic Study, Performed'`.

- [ ] **Step 2: Run to verify it fails** — type/union error → FAIL.

- [ ] **Step 3: Implement** — extend the union:

```typescript
export type QdmDatatype =
  | 'Patient'
  | 'Encounter, Performed'
  | 'Diagnosis'
  | 'Laboratory Test, Performed'
  | 'Diagnostic Study, Performed'
  | 'Physical Exam, Performed'
  | 'Assessment, Performed'
  | 'Communication, Performed'
  | 'Intervention, Order'
  | 'Care Goal'
  | 'Medication, Order'
  | 'Medication, Not Ordered'
  | 'Medication, Administered'
  | 'Medication, Not Administered'
  | 'Procedure, Performed'
  | 'Procedure, Not Performed'
  | 'Device';
```

- [ ] **Step 4: Run** — proceeds to F2.

- [ ] **Step 5: Commit** — `feat(qdm): extend QdmDatatype for diagnostic/intervention/goal/communication`

### Task F2: add fhirToQdm normalizers + switch cases

**Files:** Modify `apps/api/src/services/qdm/fhirToQdm.ts`; Test `apps/api/src/services/qdm/fhirToQdm.test.ts`

- [ ] **Step 1: Write the failing tests** — one per new type: DiagnosticReport→`'Diagnostic Study, Performed'`, ServiceRequest→`'Intervention, Order'`, DocumentReference→`'Communication, Performed'`, CarePlan→(skip, returns []), Goal→`'Care Goal'`. Assert `normalizeFhirToQdm(resource).map(e => e.datatype)`.

- [ ] **Step 2: Run to verify it fails** — default case returns `[]` → FAIL.

- [ ] **Step 3: Implement** — add normalizers mirroring `normalizeProcedure`/`normalizeObservation` (use `baseElement(resource, context, '<datatype>', effectiveTiming(...))`), and add cases:

```typescript
    case 'DiagnosticReport':
      return normalizeDiagnosticReport(resource, context);
    case 'ServiceRequest':
      return normalizeServiceRequest(resource, context);
    case 'DocumentReference':
      return normalizeDocumentReference(resource, context);
    case 'Goal':
      return normalizeGoal(resource, context);
```

Each normalizer follows the existing `normalizeProcedure` shape — pull `code`/`category`, set `category` + the datatype above, derive timing from `effectiveDateTime`/`issued`/`authoredOn`/`date`. (CarePlan intentionally not mapped to QDM — it is an organizer, not a measurable event.) Copy `normalizeProcedure` (fhirToQdm.ts:417) as the template for each and swap the datatype + timing field.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(qdm): normalize DiagnosticReport/ServiceRequest/DocumentReference/Goal`

### Task F3: extend qdmToQiCore mapping

**Files:** Modify `apps/api/src/services/qdm/qdmToQiCore.ts`; Test `apps/api/src/services/qdm/qdmToQiCore.test.ts`

- [ ] **Step 1: Write the failing test** — a QDM element with datatype `'Diagnostic Study, Performed'` maps to a QI-Core `DiagnosticReport` (or the project's chosen profile); assert the produced `resourceType`/profile.

- [ ] **Step 2: Run to verify it fails** — unmapped datatype → FAIL (or falls through default).

- [ ] **Step 3: Implement** — add `case` arms in the datatype switch (qdmToQiCore.ts:180+) for the four new datatypes, mapping to the corresponding QI-Core resourceType + categoryCode handling, mirroring the existing `'Laboratory Test, Performed'` arm.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(qdm): map new QDM datatypes to QI-Core`

---

## Phase G — Surface wiring (scopes, capability, bulk, dispatch, onboarding)

### Task G1: standalone dispatch for reference dimensions

**Files:** Modify `edwHydration.ts`; Test `edwHydration.test.ts`

- [ ] **Step 1: Write the failing test** — stage a top-level Practitioner / Organization / Location (no patient_ref); run; assert a `provider`/`organization`/`clinic_resource` row and a crosswalk entry pointing at it.

- [ ] **Step 2: Run to verify it fails** — these resolve no patient and are skipped → FAIL.

- [ ] **Step 3: Implement** — in `hydrateStagedResource`, add a pre-branch for non-patient reference resources (they have no `patient_id`):

```typescript
    if (row.resource_type === 'Practitioner' || row.resource_type === 'Organization' || row.resource_type === 'Location') {
      const localId =
        row.resource_type === 'Practitioner' ? await upsertProviderFromReference(tx, row.resource)
        : row.resource_type === 'Organization' ? await upsertOrganizationFromReference(tx, row.resource)
        : await upsertLocationFromReference(tx, row.resource);
      if (localId === null) return null;
      const localTable = row.resource_type === 'Practitioner' ? 'phm_edw.provider'
        : row.resource_type === 'Organization' ? 'phm_edw.organization' : 'phm_edw.clinic_resource';
      const target: HydratedResourceTarget = { localTable, localId, operation: 'inserted' };
      await upsertResourceCrosswalk(tx, row, 0, target); // reference dims are not patient-scoped
      return target;
    }
```

Add `'Practitioner'`, `'Organization'`, `'Location'` to `SUPPORTED_RESOURCE_TYPES` and give them ORDER BY ordinals BEFORE Encounter (so encounters resolve their FKs): `WHEN 'Practitioner' THEN 1`, bump others down. Confirm `upsertResourceCrosswalk` tolerates `patientId=0` (it does — `COALESCE(EXCLUDED.patient_id, ...)`; pass `null` instead of `0` if the column is nullable — verify: change signature to accept `number | null` and bind null).

> Implementer: `upsertResourceCrosswalk` currently types `patientId: number`. Widen to `number | null` and bind null for reference dims so the crosswalk `patient_id` stays null.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): hydrate top-level Practitioner/Organization/Location dimensions`

### Task G2: extend default scope sets

**Files:** Modify `apps/api/src/services/ehr/scopePolicy.ts`; Test `apps/api/src/services/ehr/scopePolicy.test.ts` (if present; else add assertions in onboardingProfile.test.ts)

- [ ] **Step 1: Write the failing test** — assert `DEFAULT_BACKEND_SERVICE_RESOURCES` includes `DiagnosticReport`, `DocumentReference`, `ServiceRequest`, `CarePlan`, `CareTeam`, `Goal`, `Coverage`, and that `buildBackendServiceScopes()` emits `system/DiagnosticReport.rs` etc.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — extend the two constants:

```typescript
export const DEFAULT_PATIENT_LAUNCH_RESOURCES = [
  'Patient','Encounter','Condition','Observation','MedicationRequest',
  'AllergyIntolerance','Procedure','Immunization','DiagnosticReport',
  'DocumentReference','ServiceRequest','CarePlan','CareTeam','Goal','Coverage',
] as const;

export const DEFAULT_BACKEND_SERVICE_RESOURCES = [
  'Patient','Encounter','Condition','Observation','MedicationRequest',
  'AllergyIntolerance','Procedure','Immunization','DiagnosticReport',
  'DocumentReference','ServiceRequest','CarePlan','CareTeam','Goal','Coverage',
] as const;
```

(`patientAccessForResource` already returns `'r'` only for Patient; the rest get `.rs` — correct for the new ones.)

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(ehr): request scopes for expanded resource coverage`

### Task G3: advertise new resources in CapabilityStatement

**Files:** Modify `apps/api/src/services/fhir/capabilityStatement.ts`; Test `apps/api/src/services/fhir/capabilityStatement.test.ts` (or the route test)

- [ ] **Step 1: Write the failing test** — assert the generated CapabilityStatement `rest[0].resource[]` includes `type: 'DiagnosticReport'` (and the other 6) each with a `patient` search param.

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — add resource entries to the `resource: [...]` array (capabilityStatement.ts:40) mirroring the existing `Observation` entry, for `DiagnosticReport`, `DocumentReference`, `ServiceRequest`, `CarePlan`, `CareTeam`, `Goal`, `Coverage`, each with `interaction: [{ code: 'read' }, { code: 'search-type' }]` and `searchParam: [{ name: 'patient', type: 'reference' }]`.

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit** — `feat(fhir): advertise expanded resource coverage in CapabilityStatement`

### Task G4: extend default Bulk `$export` `_type` list

**Files:** Modify `apps/api/src/services/ehr/bulkData.ts`; Test `apps/api/src/services/ehr/bulkData.test.ts`

- [ ] **Step 1: Write the failing test** — assert that the default resource-type list used when a caller omits `_type` includes the new resources (or that `backendBulkImportScope` covers them). If the call sites already require explicit `_type`, instead assert that passing the new types is accepted by `normalizeResourceTypes` (already true) and that the import worker hydrates them (covered by edwHydration tests).

- [ ] **Step 2–4:** If there is a `DEFAULT_EXPORT_RESOURCE_TYPES` constant, extend it; otherwise document (in the function JSDoc) that callers must pass the expanded `_type` set, and update the Epic onboarding command (Task G5). Keep the change minimal — `normalizeResourceTypes` already accepts any valid type.

- [ ] **Step 5: Commit** — `chore(ehr): document/extend default bulk export resource types`

### Task G5: re-onboard Epic sandbox with expanded scopes + devlog

**Files:** none (operational) + Create devlog `docs/superpowers/devlogs/2026-06-20-fhir-edw-expansion-closeout.md`

- [ ] **Step 1:** Re-run onboarding to update the Epic sandbox tenant (id=2) backend + SMART scopes to the expanded set:

```bash
cd /home/smudoshi/Github/Medgnosis/apps/api && \
node --env-file=../../.env.production --import tsx/esm src/scripts/onboard-ehr-tenant.ts \
  --vendor epic --environment sandbox --name "Epic Sandbox" \
  --fhir-base-url https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4 \
  --api-base-url https://medgnosis.acumenus.net \
  --smart-client-id 2fe29423-25b7-46f8-a69e-454f4d3ead72 \
  --smart-redirect-uris https://medgnosis.acumenus.net/api/v1/ehr/launch/callback \
  --backend-client-id f9bbfd9b-c3dd-4aca-a040-de458de56e05 \
  --backend-jwks-url https://medgnosis.acumenus.net/.well-known/jwks.json \
  --backend-private-key-ref 'env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=medgnosis-prod-backend-20260617130907&alg=RS384' \
  --json
```

(Onboarding upserts the tenant/clients; scopes refresh from the extended `scopePolicy.ts`. NOTE: in the Epic app-registration UI the human must also check the new `system/*.rs` scopes for App A — Epic only grants scopes selected in the portal.)

- [ ] **Step 2:** Run the full gate suite: `npm run typecheck && npm run lint && npm run test && npm run build`. Expected: all green.

- [ ] **Step 3:** After Epic propagation, run a `$export` with the expanded `_type` and confirm new tables hydrate:

```bash
psql -U claude_dev -h localhost -d medgnosis -tAc \
 "SELECT 'diagnostic_report', count(*) FROM phm_edw.diagnostic_report
  UNION ALL SELECT 'document_reference', count(*) FROM phm_edw.document_reference
  UNION ALL SELECT 'clinical_order', count(*) FROM phm_edw.clinical_order
  UNION ALL SELECT 'care_plan', count(*) FROM phm_edw.care_plan
  UNION ALL SELECT 'vital_sign', count(*) FROM phm_edw.vital_sign"
```

- [ ] **Step 4:** Write the closeout devlog (resources added, tables created, soft-delete behavior, QDM coverage, scope changes, smoke evidence).

- [ ] **Step 5: Commit** — `docs(ehr): FHIR→EDW expansion closeout devlog`

---

## Self-Review (run before execution)

**1. Spec coverage** — every item from the design discussion maps to a task:
- New tables for DiagnosticReport/DocumentReference → A1, C2, C3 ✓
- Dual-write vitals → D1 ✓
- Soft-delete (active_ind='N') → A2, E1, E2 ✓
- Reference dims (Practitioner/Organization/Location) + FK backfill → B1–B4, G1 ✓
- ServiceRequest, CarePlan, Goal, CareTeam, Coverage → C1, C4–C7 ✓
- QDM coverage → F1–F3 ✓
- Scopes / Capability / Bulk → G2–G4 ✓
- Re-onboard Epic + verify → G5 ✓

**2. Placeholder scan** — code steps contain real SQL with real columns (verified against live `phm_edw` schema 2026-06-20). The two test bodies left as prose comments (B4, C1) explicitly instruct copying the nearest existing harness; the implementer must inline real arrange/act/assert before the task is "done" (call this out at execution).

**3. Type consistency** — `HydratedResourceTarget`/`LocalTarget`/`Tx`/`CodeConcept` reused verbatim from `edwHydration.ts`; helper names (`firstConcept`, `referenceId`, `truncate`, `resolveEncounterId`, `upsertResourceCrosswalk`, `findExistingLocalTarget`) match the existing module; new exports (`upsertProviderFromReference`, `softDeleteLocalRow`, `softDeleteByCrosswalk`) referenced consistently across E2/G1.

**Known follow-ups (out of scope, note at execution):** problem-list-category Conditions still route to `condition_diagnosis` (not `problem_list`); FamilyMemberHistory/RelatedPerson unmapped; DiagnosticReport.result→Observation linkage not persisted (the component Observations hydrate independently). These are deliberate deferrals, not gaps.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-fhir-edw-ingestion-expansion.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
