# Phase 0 — Standards Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Medgnosis FHIR layer US Core 7.0.0 / QI-Core 7.0.2 conformant, stand up a VSAC-backed FHIR terminology service, and publish a `CapabilityStatement` — the two hard prerequisites that let QI-Core-authored CQL bind to the warehouse in Phase 1.

**Architecture:** Three loosely-coupled epics. **Epic A** fixes the read-only FHIR mappers (`fhir/mappers.ts`) so resources carry `meta.profile`, a non-lossy gender, US Core race/ethnicity/birthsex extensions, and the required `category`/`verificationStatus` elements — validated by golden-fixture unit tests and an HL7-validator CI job. **Epic B** loads VSAC data (the `load-vsac.sh` script already exists) and adds FHIR `ValueSet/$expand` + `$validate-code` operations plus an expansion-cache table. **Epic C** documents the EDW→QI-Core column projection and ships the negation helper + an integration smoke proving a CMS measure's value set resolves and a mapped Patient validates. All clinical logic stays read-only; no auth flow changes (per `.claude/rules/auth-system.md`).

**Tech Stack:** TypeScript 5.7, Fastify 5, `postgres` (postgres.js) tagged templates via `@medgnosis/db`, Vitest (unit, `vi.hoisted` mock of `sql`), plain-SQL migrations via `packages/db/src/migrate.ts`, HL7 FHIR Validator (`validator_cli.jar`) in GitHub Actions (Node 22 + Java 17), IG packages `hl7.fhir.us.core#7.0.0` and `hl7.fhir.us.qicore#7.0.2`.

---

## Scope & Decisions

- **This plan covers Phase 0 only.** Phase 1 (CQL engine behind the `measureEvaluator` seam, FHIR `Measure`/`MeasureReport`, QRDA III) is a **separate plan**, to be written after Phase 0 lands and the CQL-engine decision is made (`cqframework/clinical-reasoning` JVM sidecar vs `fqm-execution` JS). Phase 1 cannot be specified to TDD fidelity until then.
- **Roadmap deviation (documented):** `.well-known/smart-configuration` is **deferred to Phase 3**. It must advertise real OAuth `authorization_endpoint`/`token_endpoint`, which do not exist until SMART App Launch lands in Phase 3. Publishing it empty/early would be non-conformant. Phase 0 ships only the `CapabilityStatement` (`GET /api/fhir/metadata`).
- **Profile-assertion stance:** Resources claim **US Core 7.0.0** profiles in `meta.profile` (attainable, the base QI-Core builds on). The CI validator loads **both** `hl7.fhir.us.core#7.0.0` and `hl7.fhir.us.qicore#7.0.2` so QI-Core-derived constraints are exercised. Asserting QI-Core profiles directly is a Phase-1 increment once remaining must-support gaps close. The Phase 0 exit smoke proves QI-Core CQL `retrieve`s resolve against the projected data.
- **Engine-state uncertainty resolved by Task 0.** Project memory says "VSAC loaded (PR #1)"; the VSAC plan doc says "load pending." Task 0 checks the live DB and branches Epic B accordingly. No work is built on the unverified assumption.
- **DB safety (per global rules):** all DB checks are read-only and use the host Postgres via the repo `DATABASE_URL`. **Never** run `count(*)`/`GROUP BY` on `phm_edw.observation` (195M rows — saturates shared NVMe). Use `reltuples` for cardinality. `vsac_*` tables are small; exact counts there are fine.
- **Auth guardrail:** No changes to `plugins/auth.ts` login/register/`must_change_password` flow or any endpoint in `.claude/rules/auth-system.md`. All new FHIR endpoints reuse the existing `app.authenticate` preHandler.

---

## File Structure

**Create:**
- `apps/api/src/services/fhir/profiles.ts` — US Core profile canonical URLs + race/ethnicity OMB code maps + category/status code systems. One responsibility: terminology/profile constants.
- `apps/api/src/services/fhir/mappers.test.ts` — golden-fixture unit tests for the four mappers + gender/extension helpers.
- `apps/api/src/services/fhir/terminology.ts` — `expandValueSet()` + `validateCode()` services (read VSAC tables → FHIR resources).
- `apps/api/src/services/fhir/terminology.test.ts` — unit tests (mocked `sql`).
- `apps/api/src/services/fhir/capabilityStatement.ts` — pure builder for the FHIR `CapabilityStatement`.
- `apps/api/src/services/fhir/edwToQiCore.ts` — `negationToFhir()` helper + `conceptInValueSet()` membership resolver.
- `apps/api/src/services/fhir/edwToQiCore.test.ts` — unit tests.
- `apps/api/test-fixtures/fhir/patient.json`, `condition.json`, `observation.json` — golden resources the validator checks.
- `packages/db/migrations/055_vsac_expansion_cache.sql` — expansion cache + measurement-period pin table.
- `docs/edw-to-qicore-projection.md` — the EDW→QICore-ModelInfo 7.0.2 column map (Epic C deliverable).
- `scripts/fhir-validate.sh` — wrapper that runs `validator_cli.jar` over the fixtures.

**Modify:**
- `apps/api/src/config.ts` — add `fhirBaseUrl`.
- `apps/api/src/services/fhir/mappers.ts` — gender fix, `meta.profile`, US Core extensions, `category`/`verificationStatus`, `buildBundle` baseUrl.
- `apps/api/src/routes/fhir/index.ts` — pass `config.fhirBaseUrl` to `buildBundle`; add `GET /metadata`, `GET /ValueSet/$expand`, `GET /ValueSet/$validate-code`.
- `.github/workflows/ci.yml` — add `fhir-conformance` job.

---

## EPIC A — FHIR Layer → US Core 7.0.0 Conformance

### Task 0: Verify VSAC + migration baseline (read-only)

**Files:** none (investigation).

- [ ] **Step 1: Check applied migrations and VSAC row counts**

Run (from repo root; uses repo `DATABASE_URL`, overriding `host.docker.internal`→`localhost` if present per project memory):

```bash
DБURL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | sed 's#host.docker.internal#localhost#')"
psql "$DBURL" -c "SELECT name FROM _migrations WHERE name LIKE '05%' ORDER BY name;"
psql "$DBURL" -c "SELECT count(*) AS value_sets FROM phm_edw.vsac_value_set;"
psql "$DBURL" -c "SELECT count(*) AS codes FROM phm_edw.vsac_value_set_code;"
psql "$DBURL" -c "SELECT count(*) AS bridged_measures FROM phm_edw.measure_value_set;"
```

(Note: the heredoc var name above is intentionally ASCII `DBURL`; copy carefully.)

- [ ] **Step 2: Record the branch decision**

Expected one of:
- **Loaded:** `value_sets ≈ 1545`, `codes ≈ 225000`. → In Task B1, **skip** running `load-vsac.sh`; only verify/refresh.
- **Empty:** `0` rows. → In Task B1, **run** `packages/db/scripts/load-vsac.sh`.

Write the result as a one-line comment at the top of the Task B1 work (no commit; this is a gate).

---

### Task 1: FHIR profile + terminology constants

**Files:**
- Create: `apps/api/src/services/fhir/profiles.ts`
- Test: `apps/api/src/services/fhir/mappers.test.ts` (created in Task 2; constants exercised there)

- [ ] **Step 1: Write `profiles.ts`**

```typescript
// =============================================================================
// Medgnosis API — FHIR profile canonicals + US Core terminology constants
// Single source of truth for meta.profile assertions and coded concepts used
// by the read-only FHIR mappers. US Core 7.0.0 canonicals (QI-Core 7.0.2 base).
// =============================================================================

export const US_CORE = {
  patient: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
  conditionProblems:
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns',
  observationClinicalResult:
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-clinical-result',
  medicationRequest:
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest',
} as const;

export const US_CORE_EXT = {
  race: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
  ethnicity: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
  birthsex: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
} as const;

// CDC Race & Ethnicity code system (OMB categories live here).
export const CDC_RACE_SYSTEM = 'urn:oid:2.16.840.1.113883.6.238';

export const CONDITION_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/condition-category';
export const CONDITION_VER_STATUS_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/condition-ver-status';
export const OBSERVATION_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/observation-category';

// Free-text EDW race strings → OMB category {code, display}. Mirrors the
// concept buckets already used in services/omopExport.ts.
export const RACE_OMB: Record<string, { code: string; display: string }> = {
  white: { code: '2106-3', display: 'White' },
  black: { code: '2054-5', display: 'Black or African American' },
  'african american': { code: '2054-5', display: 'Black or African American' },
  asian: { code: '2028-9', display: 'Asian' },
  'american indian': { code: '1002-5', display: 'American Indian or Alaska Native' },
  'alaska native': { code: '1002-5', display: 'American Indian or Alaska Native' },
  'native hawaiian': { code: '2076-8', display: 'Native Hawaiian or Other Pacific Islander' },
  'pacific islander': { code: '2076-8', display: 'Native Hawaiian or Other Pacific Islander' },
};

export const ETHNICITY_OMB = {
  hispanic: { code: '2135-2', display: 'Hispanic or Latino' },
  nonHispanic: { code: '2186-5', display: 'Not Hispanic or Latino' },
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace=apps/api`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/fhir/profiles.ts
git commit -m "feat(fhir): add US Core profile + terminology constants"
```

---

### Task 2: Non-lossy gender mapper

**Files:**
- Modify: `apps/api/src/services/fhir/mappers.ts`
- Test: `apps/api/src/services/fhir/mappers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/services/fhir/mappers.test.ts
import { describe, it, expect } from 'vitest';
import { toFhirGender, mapPatientToFHIR } from './mappers.js';

describe('toFhirGender', () => {
  it('maps male variants to male', () => {
    expect(toFhirGender('Male')).toBe('male');
    expect(toFhirGender('M')).toBe('male');
    expect(toFhirGender('male')).toBe('male');
  });
  it('maps female variants to female', () => {
    expect(toFhirGender('Female')).toBe('female');
    expect(toFhirGender('F')).toBe('female');
  });
  it('maps non-binary and unknown values WITHOUT collapsing to female', () => {
    expect(toFhirGender('Non-binary')).toBe('other');
    expect(toFhirGender('X')).toBe('other');
    expect(toFhirGender(null)).toBe('unknown');
    expect(toFhirGender('')).toBe('unknown');
    expect(toFhirGender(undefined)).toBe('unknown');
  });
});

describe('mapPatientToFHIR gender', () => {
  it('does not silently turn non-binary into female (regression for the data-loss bug)', () => {
    const r = mapPatientToFHIR({ patient_id: 1, first_name: 'A', last_name: 'B', gender: 'Non-binary' } as never);
    expect(r.gender).toBe('other');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/fhir/mappers.test.ts` (cwd `apps/api`)
Expected: FAIL — `toFhirGender` is not exported / not a function.

- [ ] **Step 3: Add `toFhirGender` and use it in `mapPatientToFHIR`**

In `apps/api/src/services/fhir/mappers.ts`, add near the top (after imports):

```typescript
export type FhirGender = 'male' | 'female' | 'other' | 'unknown';

export function toFhirGender(raw: unknown): FhirGender {
  if (raw == null) return 'unknown';
  const v = String(raw).trim().toLowerCase();
  if (v === '') return 'unknown';
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  return 'other';
}
```

Then replace line 39 (`gender: row.gender?.toLowerCase() === 'male' ? 'male' : 'female',`) with:

```typescript
    gender: toFhirGender(row.gender),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/fhir/mappers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/fhir/mappers.ts apps/api/src/services/fhir/mappers.test.ts
git commit -m "fix(fhir): map gender without data loss (non-binary/unknown no longer collapse to female)"
```

---

### Task 3: `meta.profile` + required US Core elements on all mappers

**Files:**
- Modify: `apps/api/src/services/fhir/mappers.ts`
- Test: `apps/api/src/services/fhir/mappers.test.ts`

- [ ] **Step 1: Add failing assertions**

Append to `mappers.test.ts`:

```typescript
import {
  mapConditionToFHIR,
  mapObservationToFHIR,
  mapMedicationToFHIR,
} from './mappers.js';
import { US_CORE } from './profiles.js';

describe('meta.profile assertions', () => {
  it('Patient claims us-core-patient', () => {
    const r = mapPatientToFHIR({ patient_id: 1, first_name: 'A', last_name: 'B', gender: 'M' } as never);
    expect(r.meta?.profile).toContain(US_CORE.patient);
  });
  it('Condition claims us-core-condition + carries category and verificationStatus', () => {
    const r = mapConditionToFHIR(
      { condition_diagnosis_id: 9, condition_name: 'DM2', condition_code: '44054006', diagnosis_status: 'active' } as never,
      '1',
    );
    expect(r.meta?.profile).toContain(US_CORE.conditionProblems);
    expect((r.category as unknown[]).length).toBeGreaterThan(0);
    expect(r.verificationStatus).toBeDefined();
  });
  it('Observation claims us-core-observation-clinical-result + carries category', () => {
    const r = mapObservationToFHIR(
      { observation_id: 7, observation_desc: 'A1c', observation_code: '4548-4', value_numeric: 8.1, units: '%' } as never,
      '1',
    );
    expect(r.meta?.profile).toContain(US_CORE.observationClinicalResult);
    expect((r.category as unknown[]).length).toBeGreaterThan(0);
  });
  it('MedicationRequest claims us-core-medicationrequest + reportedBoolean', () => {
    const r = mapMedicationToFHIR(
      { medication_order_id: 3, medication_name: 'Metformin', medication_code: '6809', prescription_status: 'active' } as never,
      '1',
    );
    expect(r.meta?.profile).toContain(US_CORE.medicationRequest);
    expect(r.reportedBoolean).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/fhir/mappers.test.ts`
Expected: FAIL — `meta.profile` undefined / `category` undefined.

- [ ] **Step 3: Implement**

In `mappers.ts` add the import:

```typescript
import {
  US_CORE,
  CONDITION_CATEGORY_SYSTEM,
  CONDITION_VER_STATUS_SYSTEM,
  OBSERVATION_CATEGORY_SYSTEM,
} from './profiles.js';
```

Patient `meta`: change `meta: { lastUpdated: new Date().toISOString() },` (line 25) to:

```typescript
    meta: { lastUpdated: new Date().toISOString(), profile: [US_CORE.patient] },
```

Condition: change its `meta` line to:

```typescript
    meta: { lastUpdated: new Date().toISOString(), profile: [US_CORE.conditionProblems] },
```

and add, immediately after the `clinicalStatus` block, these two elements:

```typescript
    verificationStatus: {
      coding: [{ system: CONDITION_VER_STATUS_SYSTEM, code: 'confirmed' }],
    },
    category: [
      {
        coding: [
          { system: CONDITION_CATEGORY_SYSTEM, code: 'problem-list-item', display: 'Problem List Item' },
        ],
      },
    ],
```

Observation: change its `meta` line to:

```typescript
    meta: { lastUpdated: new Date().toISOString(), profile: [US_CORE.observationClinicalResult] },
```

and add a `category` element right after `status: 'final',`:

```typescript
    category: [
      {
        coding: [
          { system: OBSERVATION_CATEGORY_SYSTEM, code: 'laboratory', display: 'Laboratory' },
        ],
      },
    ],
```

MedicationRequest: change its `meta` line to:

```typescript
    meta: { lastUpdated: new Date().toISOString(), profile: [US_CORE.medicationRequest] },
```

and add `reportedBoolean: false,` immediately after `intent: 'order',`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/fhir/mappers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/fhir/mappers.ts apps/api/src/services/fhir/mappers.test.ts
git commit -m "feat(fhir): assert US Core profiles + required category/verificationStatus elements"
```

---

### Task 4: US Core race / ethnicity / birthsex extensions on Patient

**Files:**
- Modify: `apps/api/src/services/fhir/mappers.ts`
- Test: `apps/api/src/services/fhir/mappers.test.ts`

- [ ] **Step 1: Add failing test**

Append to `mappers.test.ts`:

```typescript
import { usCoreRaceExtension, usCoreEthnicityExtension } from './mappers.js';
import { US_CORE_EXT } from './profiles.js';

describe('US Core demographic extensions', () => {
  it('builds a race extension with ombCategory + text', () => {
    const ext = usCoreRaceExtension('White');
    expect(ext?.url).toBe(US_CORE_EXT.race);
    const omb = ext?.extension.find((e) => e.url === 'ombCategory');
    expect(omb?.valueCoding?.code).toBe('2106-3');
  });
  it('returns undefined for an unmappable/empty race', () => {
    expect(usCoreRaceExtension(null)).toBeUndefined();
    expect(usCoreRaceExtension('Klingon')).toBeUndefined();
  });
  it('builds ethnicity extension and detects hispanic', () => {
    expect(usCoreEthnicityExtension('Hispanic or Latino')?.extension.find((e) => e.url === 'ombCategory')?.valueCoding?.code).toBe('2135-2');
    expect(usCoreEthnicityExtension('Not Hispanic')?.extension.find((e) => e.url === 'ombCategory')?.valueCoding?.code).toBe('2186-5');
  });
  it('Patient includes extensions when race/ethnicity present', () => {
    const r = mapPatientToFHIR({ patient_id: 1, first_name: 'A', last_name: 'B', gender: 'F', race: 'Black', ethnicity: 'Hispanic' } as never);
    const urls = (r.extension as Array<{ url: string }>).map((e) => e.url);
    expect(urls).toContain(US_CORE_EXT.race);
    expect(urls).toContain(US_CORE_EXT.ethnicity);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/fhir/mappers.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement helpers and wire into Patient**

In `mappers.ts` extend the profiles import to include `US_CORE_EXT, CDC_RACE_SYSTEM, RACE_OMB, ETHNICITY_OMB` and add:

```typescript
interface UsCoreOmbExtension {
  url: string;
  extension: Array<{
    url: 'ombCategory' | 'text';
    valueCoding?: { system: string; code: string; display: string };
    valueString?: string;
  }>;
}

export function usCoreRaceExtension(race: unknown): UsCoreOmbExtension | undefined {
  if (race == null) return undefined;
  const key = String(race).trim().toLowerCase();
  const omb = RACE_OMB[key];
  if (!omb) return undefined;
  return {
    url: US_CORE_EXT.race,
    extension: [
      { url: 'ombCategory', valueCoding: { system: CDC_RACE_SYSTEM, code: omb.code, display: omb.display } },
      { url: 'text', valueString: omb.display },
    ],
  };
}

export function usCoreEthnicityExtension(ethnicity: unknown): UsCoreOmbExtension | undefined {
  if (ethnicity == null) return undefined;
  const v = String(ethnicity).trim().toLowerCase();
  if (v === '') return undefined;
  const omb = v.includes('hispanic') && !v.includes('not')
    ? ETHNICITY_OMB.hispanic
    : ETHNICITY_OMB.nonHispanic;
  return {
    url: US_CORE_EXT.ethnicity,
    extension: [
      { url: 'ombCategory', valueCoding: { system: CDC_RACE_SYSTEM, code: omb.code, display: omb.display } },
      { url: 'text', valueString: omb.display },
    ],
  };
}
```

Then in `mapPatientToFHIR`, build and attach the extensions. Replace the `active: true,` tail of the returned object so it becomes:

```typescript
    active: true,
    extension: [
      usCoreRaceExtension(row.race),
      usCoreEthnicityExtension(row.ethnicity),
    ].filter((e): e is UsCoreOmbExtension => e !== undefined),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/fhir/mappers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/fhir/mappers.ts apps/api/src/services/fhir/mappers.test.ts
git commit -m "feat(fhir): add US Core race/ethnicity extensions to Patient"
```

---

### Task 5: Configurable FHIR base URL (remove `medgnosis.example.com`)

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/services/fhir/mappers.ts`
- Modify: `apps/api/src/routes/fhir/index.ts`
- Test: `apps/api/src/services/fhir/mappers.test.ts`
- Docs: `.env.example`

- [ ] **Step 1: Add failing test**

Append to `mappers.test.ts`:

```typescript
import { buildBundle } from './mappers.js';

describe('buildBundle base URL', () => {
  it('uses the provided base URL and never the example.com placeholder', () => {
    const b = buildBundle(
      [{ resourceType: 'Patient', id: '1' }],
      'searchset',
      'https://medgnosis.acumenus.net/api/fhir',
    );
    expect(b.entry[0].fullUrl).toBe('https://medgnosis.acumenus.net/api/fhir/Patient/1');
    expect(b.entry[0].fullUrl).not.toContain('example.com');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/fhir/mappers.test.ts`
Expected: PASS for the URL it passes explicitly, but the **default** still contains example.com. To make the regression explicit, also assert the default:

```typescript
  it('default base URL is not the example placeholder', () => {
    const b = buildBundle([{ resourceType: 'Patient', id: '1' }]);
    expect(b.entry[0].fullUrl).not.toContain('example.com');
  });
```

Re-run — Expected: FAIL on the default assertion.

- [ ] **Step 3: Add `fhirBaseUrl` to config**

In `apps/api/src/config.ts`, in the `// Server` block after `corsOrigin`, add:

```typescript
  fhirBaseUrl: optional('FHIR_BASE_URL', 'http://localhost:3000/api/fhir'),
```

In `.env.example`, add:

```
# Canonical base URL for FHIR fullUrl construction (no trailing slash)
FHIR_BASE_URL=http://localhost:3000/api/fhir
```

- [ ] **Step 4: Change the `buildBundle` default**

In `mappers.ts` change the signature default (line 148) from `baseUrl = 'https://medgnosis.example.com/fhir',` to:

```typescript
  baseUrl = 'http://localhost:3000/api/fhir',
```

(mappers.ts must stay free of `config` imports so unit tests don't trip `required('DATABASE_URL')`; the route passes the real value.)

- [ ] **Step 5: Pass config base URL from the route**

In `apps/api/src/routes/fhir/index.ts` add `import { config } from '../../config.js';` and update the three `buildBundle(resources)` call sites to `buildBundle(resources, 'searchset', config.fhirBaseUrl)`.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/services/fhir/mappers.test.ts && npm run typecheck --workspace=apps/api`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config.ts apps/api/src/services/fhir/mappers.ts apps/api/src/routes/fhir/index.ts .env.example
git commit -m "fix(fhir): drive Bundle fullUrl from FHIR_BASE_URL config (remove example.com placeholder)"
```

---

### Task 6: Golden fixtures + HL7 validator CI job

**Files:**
- Create: `apps/api/test-fixtures/fhir/patient.json`, `condition.json`, `observation.json`
- Create: `scripts/fhir-validate.sh`
- Modify: `apps/api/src/services/fhir/mappers.test.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a test asserting mapper output equals the golden fixtures (minus volatile `meta.lastUpdated`)**

Append to `mappers.test.ts`:

```typescript
import patientFixture from '../../../test-fixtures/fhir/patient.json' with { type: 'json' };

function stripVolatile(r: Record<string, unknown>) {
  const meta = { ...(r.meta as Record<string, unknown>) };
  delete meta.lastUpdated;
  return { ...r, meta };
}

describe('golden fixtures stay in sync with mappers', () => {
  it('Patient mapper output matches patient.json', () => {
    const r = mapPatientToFHIR({
      patient_id: 12345, mrn: 'MRN-12345', first_name: 'Ada', last_name: 'Lovelace',
      date_of_birth: '1980-12-10', gender: 'Female', race: 'White', ethnicity: 'Not Hispanic',
    } as never);
    expect(stripVolatile(r)).toEqual(stripVolatile(patientFixture as Record<string, unknown>));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/fhir/mappers.test.ts`
Expected: FAIL — fixture file does not exist.

- [ ] **Step 3: Create the golden Patient fixture**

`apps/api/test-fixtures/fhir/patient.json`:

```json
{
  "resourceType": "Patient",
  "id": "12345",
  "meta": { "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
  "identifier": [{ "system": "urn:medgnosis:mrn", "value": "MRN-12345" }],
  "name": [{ "family": "Lovelace", "given": ["Ada"], "use": "official" }],
  "gender": "female",
  "birthDate": "1980-12-10",
  "active": true,
  "extension": [
    {
      "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
      "extension": [
        { "url": "ombCategory", "valueCoding": { "system": "urn:oid:2.16.840.1.113883.6.238", "code": "2106-3", "display": "White" } },
        { "url": "text", "valueString": "White" }
      ]
    },
    {
      "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity",
      "extension": [
        { "url": "ombCategory", "valueCoding": { "system": "urn:oid:2.16.840.1.113883.6.238", "code": "2186-5", "display": "Not Hispanic or Latino" } },
        { "url": "text", "valueString": "Not Hispanic or Latino" }
      ]
    }
  ]
}
```

(Create `condition.json` and `observation.json` the same way: run the mapper mentally with the Step-1 inputs from Task 3's tests and serialize, omitting `meta.lastUpdated`. Add equivalent fixture assertions for both in `mappers.test.ts`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/fhir/mappers.test.ts`
Expected: PASS. If the deep-equal fails, the fixture is the source of truth for *shape* — reconcile by copying the actual mapper output (minus `lastUpdated`) into the fixture.

- [ ] **Step 5: Create the validator wrapper script**

`scripts/fhir-validate.sh` (mark executable):

```bash
#!/usr/bin/env bash
set -euo pipefail
VALIDATOR="${VALIDATOR_JAR:-validator_cli.jar}"
FIXTURES_DIR="apps/api/test-fixtures/fhir"
java -jar "$VALIDATOR" \
  "$FIXTURES_DIR"/*.json \
  -version 4.0.1 \
  -ig hl7.fhir.us.core#7.0.0 \
  -ig hl7.fhir.us.qicore#7.0.2 \
  -level error
```

Run: `chmod +x scripts/fhir-validate.sh`

- [ ] **Step 6: Add the `fhir-conformance` CI job**

In `.github/workflows/ci.yml`, add a job (sibling of `test`):

```yaml
  fhir-conformance:
    name: FHIR Conformance
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
      - name: Cache FHIR validator + packages
        uses: actions/cache@v4
        with:
          path: |
            validator_cli.jar
            ~/.fhir
          key: fhir-validator-uscore7-qicore702
      - name: Download HL7 validator
        run: test -f validator_cli.jar || curl -L -o validator_cli.jar https://github.com/hapifhir/org.hl7.fhir.core/releases/latest/download/validator_cli.jar
      - name: Validate FHIR fixtures (errors fail the build)
        run: ./scripts/fhir-validate.sh
```

- [ ] **Step 7: Run the validator locally (if Java available) and commit**

Run: `VALIDATOR_JAR=$(ls validator_cli.jar 2>/dev/null) ./scripts/fhir-validate.sh || echo "run in CI"`
Expected (in CI): `Success ... 0 errors`. Fix any error-level findings by adjusting the mapper + fixture together (re-run Task 3/4 tests after each change).

```bash
git add apps/api/test-fixtures/fhir scripts/fhir-validate.sh .github/workflows/ci.yml apps/api/src/services/fhir/mappers.test.ts
git commit -m "test(fhir): golden fixtures + HL7 validator CI gate (US Core 7.0.0 / QI-Core 7.0.2)"
```

---

## EPIC B — VSAC Load + FHIR Terminology Service

### Task 7: Load VSAC data (branch on Task 0)

**Files:** `packages/db/scripts/load-vsac.sh` (existing; run only).

- [ ] **Step 1: Apply pending migrations**

Run: `npm run db:migrate`
Expected: `All migrations are up to date.` or applies `050`–`054`.

- [ ] **Step 2: Load VSAC (only if Task 0 found tables empty)**

Run: `bash packages/db/scripts/load-vsac.sh`
Expected: completes; then verify:

```bash
psql "$DBURL" -c "SELECT count(*) FROM phm_edw.vsac_value_set;"
psql "$DBURL" -c "SELECT count(*) FROM phm_edw.vsac_value_set_code;"
```
Expected: ~1545 value sets / ~225k codes. (If Task 0 found data already loaded, skip this step and record "already loaded".)

- [ ] **Step 3: No commit** (data load is not source).

---

### Task 8: `expandValueSet()` terminology service

**Files:**
- Create: `apps/api/src/services/fhir/terminology.ts`
- Test: `apps/api/src/services/fhir/terminology.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/services/fhir/terminology.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { expandValueSet, oidFromCanonical } from './terminology.js';

beforeEach(() => vi.clearAllMocks());

describe('oidFromCanonical', () => {
  it('extracts the OID from a VSAC canonical url', () => {
    expect(oidFromCanonical('http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.464.1003.103.12.1001'))
      .toBe('2.16.840.1.113883.3.464.1003.103.12.1001');
  });
  it('passes a bare OID through', () => {
    expect(oidFromCanonical('2.16.840.1.113883.3.464.1003.103.12.1001'))
      .toBe('2.16.840.1.113883.3.464.1003.103.12.1001');
  });
});

describe('expandValueSet', () => {
  it('returns a FHIR ValueSet with expansion.contains from the code rows', async () => {
    mockSql.mockResolvedValueOnce([{ name: 'Diabetes', expansion_version: '2025-05' }]);
    mockSql.mockResolvedValueOnce([
      { code: '44054006', description: 'Diabetes mellitus type 2', code_system: 'SNOMEDCT' },
    ]);
    const vs = await expandValueSet('2.16.840.1.113883.3.464.1003.103.12.1001');
    expect(vs.resourceType).toBe('ValueSet');
    expect(vs.expansion?.total).toBe(1);
    expect(vs.expansion?.contains?.[0]?.code).toBe('44054006');
    expect(vs.expansion?.contains?.[0]?.system).toContain('snomed');
  });

  it('returns null when the OID is unknown', async () => {
    mockSql.mockResolvedValueOnce([]); // no value-set header row
    const vs = await expandValueSet('0.0.0');
    expect(vs).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/fhir/terminology.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `terminology.ts`**

```typescript
// =============================================================================
// Medgnosis API — FHIR terminology operations over the VSAC tables
// $expand / $validate-code, read-only. VSAC code_system labels (SNOMEDCT,
// RXNORM, LOINC, ICD10CM) are translated to FHIR system URIs for output.
// =============================================================================

import { sql } from '@medgnosis/db';

const VSAC_CANONICAL_PREFIX = 'http://cts.nlm.nih.gov/fhir/ValueSet/';

// VSAC code_system label -> FHIR system URI.
const SYSTEM_URI: Record<string, string> = {
  SNOMEDCT: 'http://snomed.info/sct',
  RXNORM: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  LOINC: 'http://loinc.org',
  ICD10CM: 'http://hl7.org/fhir/sid/icd-10-cm',
  CPT: 'http://www.ama-assn.org/go/cpt',
};

export interface FhirValueSetExpansion {
  resourceType: 'ValueSet';
  status: 'active';
  url: string;
  name?: string;
  version?: string;
  expansion?: {
    timestamp: string;
    total: number;
    contains: Array<{ system: string; code: string; display?: string }>;
  };
}

export function oidFromCanonical(urlOrOid: string): string {
  return urlOrOid.startsWith(VSAC_CANONICAL_PREFIX)
    ? urlOrOid.slice(VSAC_CANONICAL_PREFIX.length)
    : urlOrOid;
}

function toSystemUri(label: string): string {
  return SYSTEM_URI[label] ?? `urn:medgnosis:codesystem:${label}`;
}

export async function expandValueSet(
  urlOrOid: string,
): Promise<FhirValueSetExpansion | null> {
  const oid = oidFromCanonical(urlOrOid);

  const header = await sql<{ name: string; expansion_version: string | null }[]>`
    SELECT name, expansion_version
    FROM phm_edw.vsac_value_set
    WHERE value_set_oid = ${oid}
  `;
  if (header.length === 0) return null;

  const codes = await sql<{ code: string; description: string | null; code_system: string }[]>`
    SELECT code, description, code_system
    FROM phm_edw.vsac_value_set_code
    WHERE value_set_oid = ${oid}
    ORDER BY code_system, code
    LIMIT 12000
  `;

  return {
    resourceType: 'ValueSet',
    status: 'active',
    url: `${VSAC_CANONICAL_PREFIX}${oid}`,
    name: header[0]!.name,
    version: header[0]!.expansion_version ?? undefined,
    expansion: {
      timestamp: new Date().toISOString(),
      total: codes.length,
      contains: codes.map((c) => ({
        system: toSystemUri(c.code_system),
        code: c.code,
        display: c.description ?? undefined,
      })),
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/fhir/terminology.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/fhir/terminology.ts apps/api/src/services/fhir/terminology.test.ts
git commit -m "feat(fhir): ValueSet \$expand service over VSAC tables"
```

---

### Task 9: `validateCode()` terminology service

**Files:**
- Modify: `apps/api/src/services/fhir/terminology.ts`
- Test: `apps/api/src/services/fhir/terminology.test.ts`

- [ ] **Step 1: Add failing test**

Append to `terminology.test.ts`:

```typescript
import { validateCode } from './terminology.js';

describe('validateCode', () => {
  it('returns Parameters result=true when the code is a member', async () => {
    mockSql.mockResolvedValueOnce([{ found: 1 }]);
    const out = await validateCode('2.16.840.1.113883.3.464.1003.103.12.1001', 'http://snomed.info/sct', '44054006');
    expect(out.resourceType).toBe('Parameters');
    expect(out.parameter.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
  });
  it('returns result=false when not a member', async () => {
    mockSql.mockResolvedValueOnce([]); // no match
    const out = await validateCode('2.16.840.1.113883.3.464.1003.103.12.1001', 'http://snomed.info/sct', '99999999');
    expect(out.parameter.find((p) => p.name === 'result')?.valueBoolean).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/fhir/terminology.test.ts`
Expected: FAIL — `validateCode` not exported.

- [ ] **Step 3: Implement**

Append to `terminology.ts`:

```typescript
export interface FhirParameters {
  resourceType: 'Parameters';
  parameter: Array<{ name: string; valueBoolean?: boolean; valueString?: string }>;
}

// Reverse map: FHIR system URI -> VSAC label, for matching against stored codes.
const LABEL_FOR_URI: Record<string, string> = Object.fromEntries(
  Object.entries(SYSTEM_URI).map(([label, uri]) => [uri, label]),
);

export async function validateCode(
  urlOrOid: string,
  system: string,
  code: string,
): Promise<FhirParameters> {
  const oid = oidFromCanonical(urlOrOid);
  const label = LABEL_FOR_URI[system] ?? system;

  const rows = await sql<{ found: number }[]>`
    SELECT 1 AS found
    FROM phm_edw.vsac_value_set_code
    WHERE value_set_oid = ${oid}
      AND code = ${code}
      AND code_system = ${label}
    LIMIT 1
  `;
  const result = rows.length > 0;

  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'result', valueBoolean: result },
      { name: 'message', valueString: result
          ? `${code} is in ${oid}`
          : `${code} (${system}) not found in ${oid}` },
    ],
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/fhir/terminology.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/fhir/terminology.ts apps/api/src/services/fhir/terminology.test.ts
git commit -m "feat(fhir): ValueSet \$validate-code service over VSAC tables"
```

---

### Task 10: Wire terminology + metadata into the FHIR routes

**Files:**
- Create: `apps/api/src/services/fhir/capabilityStatement.ts`
- Modify: `apps/api/src/routes/fhir/index.ts`

- [ ] **Step 1: Write the CapabilityStatement builder**

`apps/api/src/services/fhir/capabilityStatement.ts`:

```typescript
// =============================================================================
// Medgnosis API — FHIR CapabilityStatement builder (read-only server)
// =============================================================================

export function buildCapabilityStatement(fhirBaseUrl: string) {
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    implementation: { description: 'Medgnosis FHIR R4 API', url: fhirBaseUrl },
    fhirVersion: '4.0.1',
    format: ['json'],
    instantiates: [
      'http://hl7.org/fhir/us/core/CapabilityStatement/us-core-server',
    ],
    rest: [
      {
        mode: 'server',
        resource: [
          { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }], supportedProfile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
          { type: 'Condition', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'Observation', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'MedicationRequest', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'ValueSet', interaction: [], operation: [{ name: 'expand', definition: 'http://hl7.org/fhir/OperationDefinition/ValueSet-expand' }, { name: 'validate-code', definition: 'http://hl7.org/fhir/OperationDefinition/ValueSet-validate-code' }] },
        ],
      },
    ],
  };
}
```

- [ ] **Step 2: Add the routes**

In `apps/api/src/routes/fhir/index.ts` add imports:

```typescript
import { expandValueSet, validateCode } from '../../services/fhir/terminology.js';
import { buildCapabilityStatement } from '../../services/fhir/capabilityStatement.js';
```

Then register (these are read-only metadata/terminology; keep the existing `app.authenticate` preHandler style, except `/metadata` which is conventionally open):

```typescript
  // FHIR capability statement (conventionally unauthenticated)
  app.get('/metadata', async () => buildCapabilityStatement(config.fhirBaseUrl));

  // ValueSet/$expand?url=<canonical-or-oid>
  app.get('/ValueSet/$expand', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) return reply.status(400).send({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'required', diagnostics: 'url parameter required' }] });
    const vs = await expandValueSet(url);
    if (!vs) return reply.status(404).send({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found', diagnostics: `Unknown value set ${url}` }] });
    return vs;
  });

  // ValueSet/$validate-code?url=...&system=...&code=...
  app.get('/ValueSet/$validate-code', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { url, system, code } = req.query as { url?: string; system?: string; code?: string };
    if (!url || !system || !code) return reply.status(400).send({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'required', diagnostics: 'url, system, code required' }] });
    return validateCode(url, system, code);
  });
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=apps/api`
Expected: PASS.

- [ ] **Step 4: Smoke test the endpoints (server running)**

Run (in one shell `npm run dev --workspace=apps/api`, in another, with a valid token from a login):

```bash
curl -s localhost:3000/api/fhir/metadata | head -c 200
TOKEN=...  # from POST /api/auth/login
curl -s -H "Authorization: Bearer $TOKEN" "localhost:3000/api/fhir/ValueSet/\$expand?url=2.16.840.1.113883.3.464.1003.103.12.1001" | head -c 300
```

Expected: `metadata` returns a CapabilityStatement; `$expand` returns a ValueSet with `expansion.contains`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/fhir/capabilityStatement.ts apps/api/src/routes/fhir/index.ts
git commit -m "feat(fhir): expose /metadata CapabilityStatement + ValueSet \$expand/\$validate-code routes"
```

---

### Task 11: Expansion-cache table + period-pinned expansion

**Files:**
- Create: `packages/db/migrations/055_vsac_expansion_cache.sql`
- Modify: `apps/api/src/services/fhir/terminology.ts`
- Test: `apps/api/src/services/fhir/terminology.test.ts`

- [ ] **Step 1: Write the migration**

`packages/db/migrations/055_vsac_expansion_cache.sql`:

```sql
-- =============================================================================
-- 055: VSAC expansion cache (per value set + measurement period)
-- Pre-expanded code lists pinned to a reporting period so CQL execution and
-- $expand return a stable, versioned expansion across a reporting year.
-- =============================================================================

CREATE TABLE phm_edw.vsac_expansion_cache (
  id                 BIGSERIAL PRIMARY KEY,
  value_set_oid      VARCHAR(120) NOT NULL
                     REFERENCES phm_edw.vsac_value_set (value_set_oid) ON DELETE CASCADE,
  measurement_period VARCHAR(20)  NOT NULL,        -- e.g. '2025'
  expansion_version  VARCHAR(120),
  expansion          JSONB        NOT NULL,        -- [{system,code,display}, ...]
  code_count         INT          NOT NULL,
  expanded_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vsac_expansion UNIQUE (value_set_oid, measurement_period)
);

CREATE INDEX idx_vsac_expansion_oid ON phm_edw.vsac_expansion_cache (value_set_oid);

COMMENT ON TABLE phm_edw.vsac_expansion_cache IS
  'Period-pinned pre-expanded VSAC value sets. Read by $expand when measurementPeriod is supplied.';
```

- [ ] **Step 2: Apply + verify**

Run: `npm run db:migrate`
Expected: `Applied: 055_vsac_expansion_cache.sql`.

```bash
psql "$DBURL" -c "\d phm_edw.vsac_expansion_cache"
```
Expected: table exists with the unique constraint.

- [ ] **Step 3: Add a failing test for the cached path**

Append to `terminology.test.ts`:

```typescript
describe('expandValueSet with measurementPeriod (cache hit)', () => {
  it('returns the cached expansion when a period row exists', async () => {
    mockSql.mockResolvedValueOnce([{ name: 'Diabetes', expansion_version: '2025-05' }]); // header
    mockSql.mockResolvedValueOnce([{ expansion: [{ system: 'http://snomed.info/sct', code: '44054006', display: 'DM2' }], expansion_version: '2025-05', code_count: 1 }]); // cache row
    const vs = await expandValueSet('2.16.840.1.113883.3.464.1003.103.12.1001', { measurementPeriod: '2025' });
    expect(vs?.expansion?.total).toBe(1);
    expect(vs?.expansion?.contains?.[0]?.code).toBe('44054006');
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/services/fhir/terminology.test.ts`
Expected: FAIL — `expandValueSet` takes one arg / ignores the option.

- [ ] **Step 5: Implement the cached path**

Change the `expandValueSet` signature and add the cache branch (after the header lookup, before the live code query):

```typescript
export async function expandValueSet(
  urlOrOid: string,
  opts: { measurementPeriod?: string } = {},
): Promise<FhirValueSetExpansion | null> {
  const oid = oidFromCanonical(urlOrOid);

  const header = await sql<{ name: string; expansion_version: string | null }[]>`
    SELECT name, expansion_version FROM phm_edw.vsac_value_set WHERE value_set_oid = ${oid}
  `;
  if (header.length === 0) return null;

  if (opts.measurementPeriod) {
    const cached = await sql<{ expansion: Array<{ system: string; code: string; display?: string }>; expansion_version: string | null; code_count: number }[]>`
      SELECT expansion, expansion_version, code_count
      FROM phm_edw.vsac_expansion_cache
      WHERE value_set_oid = ${oid} AND measurement_period = ${opts.measurementPeriod}
    `;
    if (cached.length > 0) {
      return {
        resourceType: 'ValueSet',
        status: 'active',
        url: `${VSAC_CANONICAL_PREFIX}${oid}`,
        name: header[0]!.name,
        version: cached[0]!.expansion_version ?? undefined,
        expansion: { timestamp: new Date().toISOString(), total: cached[0]!.code_count, contains: cached[0]!.expansion },
      };
    }
  }

  // ... existing live code query + return unchanged ...
```

- [ ] **Step 6: Run to verify it passes; add the `measurementPeriod` query param to the route**

Run: `npx vitest run src/services/fhir/terminology.test.ts`
Expected: PASS.

In `routes/fhir/index.ts` `$expand` handler, read `measurementPeriod` and pass it: `await expandValueSet(url, { measurementPeriod: (req.query as { measurementPeriod?: string }).measurementPeriod });`

- [ ] **Step 7: Commit**

```bash
git add packages/db/migrations/055_vsac_expansion_cache.sql apps/api/src/services/fhir/terminology.ts apps/api/src/services/fhir/terminology.test.ts apps/api/src/routes/fhir/index.ts
git commit -m "feat(fhir): period-pinned VSAC expansion cache for \$expand"
```

---

## EPIC C — EDW → QI-Core Projection

### Task 12: Document the EDW → QICore-ModelInfo 7.0.2 column map

**Files:** Create `docs/edw-to-qicore-projection.md`

- [ ] **Step 1: Write the projection map doc**

Create `docs/edw-to-qicore-projection.md` containing, at minimum, a table mapping each `phm_edw` source column to the **exact** QICore-ModelInfo 7.0.2 primary code/date path the CQL retrieve binds to. Seed rows (extend during execution):

```markdown
# EDW → QI-Core 7.0.2 Projection Map

CQL authored against QI-Core retrieves by primary code path + a temporal path.
This maps phm_edw columns to those exact paths so retrieves resolve.

| QI-Core resource | Primary code path | Temporal path | EDW source (table.column) | Code system |
|---|---|---|---|---|
| QICore Patient | (n/a) | birthDate | patient.date_of_birth | — |
| QICore Condition (problems) | Condition.code | Condition.onset[x] | condition_diagnosis ⨝ condition.condition_code | SNOMED CT |
| QICore Observation (lab/result) | Observation.code | Observation.effective[x] | observation.observation_code | LOINC |
| QICore MedicationRequest | MedicationRequest.medication.code | MedicationRequest.authoredOn | medication_order ⨝ medication.medication_code | RxNorm |
| QICore Procedure | Procedure.code | Procedure.performed[x] | procedure_performed ⨝ procedure.procedure_code | SNOMED CT |
| QICore Encounter | Encounter.type / class | Encounter.period | encounter.* | — |

Membership: an EDW code is "in" a value set iff (translated code_system, code)
exists in phm_edw.vsac_value_set_code for the value set OID. Translate the EDW
code_system label through EDW_TO_VSAC_CODE_SYSTEM (vsacService.ts) before matching.
Negation: see negationToFhir() in services/fhir/edwToQiCore.ts.
```

- [ ] **Step 2: Commit**

```bash
git add docs/edw-to-qicore-projection.md
git commit -m "docs(fhir): EDW to QI-Core 7.0.2 projection column map"
```

---

### Task 13: QI-Core negation helper + value-set membership resolver

**Files:**
- Create: `apps/api/src/services/fhir/edwToQiCore.ts`
- Test: `apps/api/src/services/fhir/edwToQiCore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/services/fhir/edwToQiCore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { negationToFhir, conceptInValueSet } from './edwToQiCore.js';

beforeEach(() => vi.clearAllMocks());

describe('negationToFhir', () => {
  it('emits the QI-Core "not done" negation shape for a Procedure', () => {
    const neg = negationToFhir('Procedure', { system: 'http://snomed.info/sct', code: '183932001', display: 'Procedure refused' });
    expect(neg.status).toBe('not-done');
    expect(neg.statusReason?.coding?.[0]?.code).toBe('183932001');
  });
  it('emits doNotPerform for a MedicationRequest', () => {
    const neg = negationToFhir('MedicationRequest', { system: 'http://snomed.info/sct', code: '183932001', display: 'Med not indicated' });
    expect(neg.doNotPerform).toBe(true);
    expect(neg.reasonCode?.[0]?.coding?.[0]?.code).toBe('183932001');
  });
});

describe('conceptInValueSet', () => {
  it('translates the EDW code system label and checks membership', async () => {
    mockSql.mockResolvedValueOnce([{ found: 1 }]);
    const inSet = await conceptInValueSet('2.16.840.1.113883.3.464.1003.103.12.1001', 'SNOMED', '44054006');
    expect(inSet).toBe(true);
  });
  it('returns false for an unmapped EDW code system (ICD-9)', async () => {
    const inSet = await conceptInValueSet('2.16.840.1.113883.3.464.1003.103.12.1001', 'ICD-9', '250.00');
    expect(inSet).toBe(false);
    expect(mockSql).not.toHaveBeenCalled(); // unmapped → never queries
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/fhir/edwToQiCore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// =============================================================================
// Medgnosis API — EDW → QI-Core projection helpers
// negationToFhir(): QI-Core negation pattern. conceptInValueSet(): VSAC
// membership using the EDW→VSAC code-system translation from vsacService.
// =============================================================================

import { sql } from '@medgnosis/db';
import { EDW_TO_VSAC_CODE_SYSTEM } from '../vsacService.js';

interface Coding { system: string; code: string; display?: string }

interface QiCoreNegation {
  status?: 'not-done';
  statusReason?: { coding: Coding[] };
  doNotPerform?: boolean;
  reasonCode?: Array<{ coding: Coding[] }>;
}

// Resources that use doNotPerform (request-type) vs status=not-done (event-type).
const DO_NOT_PERFORM_RESOURCES = new Set(['MedicationRequest', 'ServiceRequest']);

export function negationToFhir(resourceType: string, reason: Coding): QiCoreNegation {
  if (DO_NOT_PERFORM_RESOURCES.has(resourceType)) {
    return { doNotPerform: true, reasonCode: [{ coding: [reason] }] };
  }
  return { status: 'not-done', statusReason: { coding: [reason] } };
}

export async function conceptInValueSet(
  valueSetOid: string,
  edwCodeSystem: string,
  code: string,
): Promise<boolean> {
  const vsacLabel = EDW_TO_VSAC_CODE_SYSTEM[edwCodeSystem];
  if (!vsacLabel) return false; // unmapped by design (ICD-9, OTHER) — never join
  const rows = await sql<{ found: number }[]>`
    SELECT 1 AS found
    FROM phm_edw.vsac_value_set_code
    WHERE value_set_oid = ${valueSetOid} AND code = ${code} AND code_system = ${vsacLabel}
    LIMIT 1
  `;
  return rows.length > 0;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/fhir/edwToQiCore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/fhir/edwToQiCore.ts apps/api/src/services/fhir/edwToQiCore.test.ts
git commit -m "feat(fhir): QI-Core negation helper + VSAC value-set membership resolver"
```

---

### Task 14: Phase 0 exit smoke — a CMS measure value set resolves end-to-end

**Files:** Create `apps/api/src/services/fhir/__smoke__/phase0.smoke.test.ts` (gated; integration)

- [ ] **Step 1: Write the smoke test (skipped unless `PHASE0_SMOKE=1`)**

```typescript
// Integration smoke: requires a loaded VSAC DB. Run with PHASE0_SMOKE=1.
import { describe, it, expect } from 'vitest';
import { expandValueSet } from '../terminology.js';

const run = process.env.PHASE0_SMOKE === '1' ? describe : describe.skip;

run('Phase 0 exit: CMS measure value set resolves', () => {
  it('expands a known diabetes value set to >0 codes', async () => {
    // OID for a value set used by CMS122 (Diabetes: HbA1c Poor Control). Replace
    // with a confirmed-present OID from: SELECT value_set_oid FROM phm_edw.vsac_value_set LIMIT 1;
    const oid = process.env.SMOKE_VS_OID ?? '2.16.840.1.113883.3.464.1003.103.12.1001';
    const vs = await expandValueSet(oid);
    expect(vs).not.toBeNull();
    expect(vs!.expansion!.total).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the smoke against the live DB**

Run (with the API env loaded so `@medgnosis/db` connects):

```bash
SMOKE_VS_OID="$(psql "$DBURL" -tAc "SELECT value_set_oid FROM phm_edw.vsac_value_set LIMIT 1")"
PHASE0_SMOKE=1 SMOKE_VS_OID="$SMOKE_VS_OID" node --env-file=.env --import tsx/esm node_modules/.bin/vitest run apps/api/src/services/fhir/__smoke__/phase0.smoke.test.ts
```

Expected: PASS — the value set expands to >0 codes.

- [ ] **Step 3: Run the full unit suite + typecheck + lint (regression gate)**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all PASS. Then confirm CI `fhir-conformance` is green on the branch.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/fhir/__smoke__/phase0.smoke.test.ts
git commit -m "test(fhir): Phase 0 exit smoke — VSAC value set resolves end-to-end"
```

---

## Self-Review

**1. Spec coverage** (against roadmap Phase 0 epics & success criteria):
- *VSAC load + terminology service* → Tasks 7 ($expand), 9 ($validate-code), 11 (expansion cache + period pin). ✅ (`version_drift` alerting already exists in `getMeasureBridgeStatus`; surfacing it in the UI is deferred to Phase 2's dossier work — noted, not silently dropped.)
- *QI-Core/US Core profiling + gender fix + base URL + CapabilityStatement* → Tasks 2–6, 10. ✅
- *`.well-known/smart-configuration`* → **intentionally deferred to Phase 3** (documented in Scope & Decisions; needs real OAuth endpoints). ✅
- *OMOP/EDW → QI-Core projection + negation* → Tasks 12, 13. ✅
- *Success: `validator_cli.jar` passes in CI* → Task 6. ✅
- *Success: `$expand` returns version-pinned expansions for top 10 measure value sets* → Tasks 8/11; verified for ≥1 in Task 14 (extend the smoke to the top-10 list during execution). ✅
- *Success: gender data-loss bug eliminated* → Task 2. ✅
- *Success: a CMS QI-Core eCQM's CQL retrieves resolve against projected EDW data* → Task 14 proves value-set resolution; full CQL retrieve execution is Phase 1 (no engine yet) — the data-binding prerequisite is what Phase 0 proves. ✅ (boundary documented)

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Condition/Observation golden fixtures in Task 6 say "create the same way" but give the exact inputs and the rule (mapper output minus `lastUpdated`) — acceptable because the construction is mechanical and fully specified by Task 3/4 code. The projection-map doc (Task 12) is explicitly seeded "extend during execution" — a deliverable that grows, not a placeholder for missing logic.

**3. Type consistency:** `toFhirGender`, `usCoreRaceExtension`/`usCoreEthnicityExtension`, `expandValueSet(urlOrOid, opts?)`, `validateCode(urlOrOid, system, code)`, `oidFromCanonical`, `negationToFhir`, `conceptInValueSet`, `buildCapabilityStatement(fhirBaseUrl)`, `US_CORE`/`US_CORE_EXT`/`RACE_OMB`/`ETHNICITY_OMB` — names used identically across tasks. `EDW_TO_VSAC_CODE_SYSTEM` imported from `vsacService.ts` matches the verified export. ✅

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-phase-0-standards-foundation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. (Note: per project memory, background subagents cannot Write — so subagents would run read-only/verification and I apply edits in the foreground, or we run inline.)

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

**Which approach?**

> After Phase 0 is green (CI `fhir-conformance` passing, smoke resolving), I'll write the **Phase 1 plan** — but first we need one decision: **CQL runtime = `cqframework/clinical-reasoning` (JVM sidecar, reference-grade, adds a Java service) vs `fqm-execution` (pure JS, measure-only, no new runtime).** That choice shapes every Phase 1 task.
