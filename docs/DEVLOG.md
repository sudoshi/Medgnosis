# Medgnosis Modernization — Development Log

> **Started:** February 2026
> **Objective:** Modernize Medgnosis from Laravel 11 (PHP) + Next.js 14 to a TypeScript-native Turborepo monorepo matching (and exceeding) MindLog's architecture.
> **Decisions:** Clean cutover to Fastify API, Vite+React SPA, no mobile this phase, preserve 54+ UI components' look and feel.

---

## Table of Contents

- [Accomplishments](#accomplishments)
  - [Phase 0 — Monorepo Foundation](#phase-0--monorepo-foundation)
  - [Phase 1 — Fastify API](#phase-1--fastify-api)
  - [Phase 2 — Modern Web Frontend](#phase-2--modern-web-frontend)
  - [Phase 3 — Enhanced Capabilities](#phase-3--enhanced-capabilities)
  - [Phase 4 — CI/CD](#phase-4--cicd)
  - [Phase 10 — Core Clinical Workspace](#phase-10--core-clinical-workspace)
- [Codebase Inventory](#codebase-inventory)
- [Known Issues & Stubs](#known-issues--stubs)
- [Next Phases Checklist](#next-phases-checklist)
  - [Phase 5 — Build & Startup Verification](#phase-5--build--startup-verification)
  - [Phase 6 — Critical Bug Fixes](#phase-6--critical-bug-fixes)
  - [Phase 7 — Integration Testing](#phase-7--integration-testing)
  - [Phase 8 — Deployment](#phase-8--deployment)
  - [Phase 9 — Polish & Hardening](#phase-9--polish--hardening)
- [Session Log](#session-log)
  - [Session 2 — Build, Restore & Startup](#session-2--build-restore--startup-feb-25-2026)
  - [Session 3 — E2E Verification & Critical Bug Fixes](#session-3--e2e-verification--critical-bug-fixes-feb-25-2026)
  - [Session 4 — Production Deployment](#session-4--production-deployment-feb-25-2026)
  - [Session 5 — Core Clinical Workspace (Phase 10)](#session-5--core-clinical-workspace-phase-10-feb-25-2026)
  - [Session 6 — Bundles 16-45 + Encounter Note AI Scribe](#session-6--bundles-16-45--encounter-note-ai-scribe-feb-25-2026)
  - [Session 7 — Patient-Context Abby Chat](#session-7--patient-context-abby-chat-feb-26-2026)
  - [Session 8 — Demo Environment ETL Complete](#session-8--demo-environment-etl-complete-feb-26-2026)
  - [Session 9 — Star Schema v2 Consolidation + Phase D Verification](#session-9--star-schema-v2-consolidation--phase-d-verification-feb-26-2026)
  - [Session 10 — Tier 2: Wire Real Data to Frontend](#session-10--tier-2-wire-real-data-to-frontend-feb-26-2026)
  - [Session 11 — Tier 3: AI Morning Briefing + Auth + Settings](#session-11--tier-3-ai-morning-briefing--auth--settings-feb-26-2026)
  - [Session 12 — Tier 4: Schedule Config + Care Gap Enhancements](#session-12--tier-4-schedule-config--care-gap-enhancements-feb-26-2026)
  - [Session 13 — Tier 5: Dashboard Trends](#session-13--tier-5-dashboard-trends-feb-26-2026)
  - [Session 14 — Performance: Missing EDW Indexes + Query Optimizations](#session-14--performance-missing-edw-indexes--query-optimizations-feb-26-2026)
  - [Session 15 — Provider Scoping: JWT + All Query Endpoints](#session-15--provider-scoping-jwt--all-query-endpoints-feb-26-2026)
  - [Session 16 — Mock Schedule: 18 Real Patients with Past-Appointment Graying](#session-16--mock-schedule-18-real-patients-with-past-appointment-graying-feb-26-2026)
- [Architecture Reference](#architecture-reference)

---

## Accomplishments

### Phase 0 — Monorepo Foundation

**Status: COMPLETE**

Established a Turborepo monorepo with npm workspaces, shared packages, and Docker infrastructure.

| File | Description |
|------|-------------|
| `package.json` | Root workspace with `apps/*` + `packages/*`, shared dev dependencies, convenience scripts (`dev`, `build`, `test`, `lint`, `typecheck`, `demo:*`) |
| `turbo.json` | Task pipeline: build → typecheck/lint/test, with caching and proper dependency chains |
| `tsconfig.base.json` | Shared TypeScript config: strict mode, ES2022, NodeNext module resolution |
| `tsconfig.json` | Root project references to all packages and apps |
| `.prettierrc` | Formatting: 100 char width, single quotes, trailing commas |
| `.eslintrc.cjs` | Root ESLint config extending TypeScript recommended rules |
| `docker-compose.demo.yml` | PostgreSQL 15 (port 5432), Redis 7 (port 6379), MailHog (SMTP 1025, Web 8025) |

#### `packages/shared` (`@medgnosis/shared`) — 16 files, ~929 lines

Shared types, Zod validation schemas, and constants used by both API and web.

| File | Contents |
|------|----------|
| `src/types/user.ts` | `UserRole` enum (provider, analyst, admin, care_coordinator), `User`, `AuthTokens`, `LoginRequest/Response` |
| `src/types/patient.ts` | `Patient`, `PatientSummary`, `RiskBand` enum (low/moderate/high/critical), `PatientSearchParams` |
| `src/types/clinical.ts` | `Encounter`, `Condition`, `Observation`, `Medication`, `CareGap`, `CareGapStatus` |
| `src/types/measure.ts` | `Measure`, `MeasureResult`, `MeasureDomain`, `MeasurePerformance` |
| `src/types/alert.ts` | `Alert`, `AlertSeverity` (info/warning/critical), `AlertCategory`, `CreateAlertRequest` |
| `src/types/dashboard.ts` | `DashboardAnalytics`, `RiskDistribution`, `CareGapSummary`, `RecentActivity` |
| `src/types/fhir.ts` | `FHIRResource`, `FHIRBundle`, `FHIRPatient`, `FHIRCondition`, `FHIRObservation` |
| `src/schemas/auth.ts` | Zod schemas: `loginSchema`, `registerSchema`, `mfaVerifySchema` with runtime validation |
| `src/schemas/patient.ts` | Zod schemas: `patientSearchSchema`, `patientCreateSchema` with pagination defaults |
| `src/schemas/clinical.ts` | Zod schemas: `careGapUpdateSchema`, `observationCreateSchema`, `encounterCreateSchema` |
| `src/constants/index.ts` | `API_PREFIX` (/api/v1), `WS_EVENTS`, `ALERT_THRESHOLDS`, `RISK_BANDS`, `MEASURE_DOMAINS` |
| `src/index.ts` | Barrel export for all types, schemas, and constants |

#### `packages/db` (`@medgnosis/db`) — 5 files + 5 SQL migrations, ~224 TS + 2,362 SQL lines

PostgreSQL client, migration runner, and seed scripts.

| File | Description |
|------|-------------|
| `src/client.ts` | PostgreSQL client via `postgres` library, connection from `DATABASE_URL` env var |
| `src/migrate.ts` | Migration runner: reads `migrations/` dir, tracks in `schema_migrations` table, runs in order |
| `src/seed.ts` | Seeds `app_users` (admin, provider, analyst) and `organizations` |
| `src/seed-demo.ts` | Demo data seeder: 4 users (provider, analyst, care_coordinator, admin), 300 care gaps, 30 clinical alerts, 10 AI insights, 650 risk history records. Idempotent (checks existing counts). |
| `src/index.ts` | Barrel export of `sql` client |
| `migrations/001_phm_edw_schema.sql` | 3NF Enterprise Data Warehouse: 23 tables (organization, provider, patient, encounter, condition, condition_diagnosis, observation, medication, medication_order, procedure, procedure_performed, etc.) — **pre-registered as applied** (schema exists from legacy restore) |
| `migrations/002_phm_star_schema.sql` | Kimball Star Schema: 15 dimension + fact tables — **pre-registered as applied** |
| `migrations/003_etl_synthea_to_edw.sql` | ETL: Synthea→EDW pipeline — **pre-registered as applied** |
| `migrations/004_etl_edw_to_star.sql` | ETL: EDW→Star Schema — **pre-registered as applied** |
| `migrations/005_auth_alerts_system.sql` | **NEW (applied)**: app_users, refresh_tokens, clinical_alerts, audit_log, ai_insights, patient_risk_history tables + pgcrypto/pg_trgm extensions + trigram index + admin user seed |

---

### Phase 1 — Fastify API

**Status: COMPLETE**

Full Fastify 5 TypeScript API with plugin architecture, 10 route modules, 6 services, 5 workers.

#### Core Application — `apps/api/src/`

| File | Description |
|------|-------------|
| `app.ts` | Fastify app factory: registers CORS, Helmet (HSTS, no-sniff, frameguard), rate limiting (200/min), JWT auth, error handler, WebSocket, audit middleware, all routes |
| `server.ts` | Server entry: starts on `PORT` (default 3001), graceful shutdown handler |
| `config.ts` | Typed config from env vars: database, Redis, JWT, AI provider (anthropic/ollama), Sentry DSN, SMTP |
| `worker.ts` | BullMQ worker entry: starts rules engine, AI insights, measure calculator, nightly scheduler |
| `sentry.ts` | Sentry initialization with PHI scrubbing (redacts email, name, SSN, MRN patterns from events) |

#### Plugins — `apps/api/src/plugins/`

| File | Description |
|------|-------------|
| `auth.ts` | JWT auth decorators: `app.authenticate` (verify token), `app.requireRole(roles)` (role-based access), `app.optionalAuth` (soft auth) |
| `error-handler.ts` | Structured error responses: validation errors, JWT errors, rate limit errors, generic errors with correlation IDs |
| `websocket.ts` | WebSocket server with Redis pub/sub: `broadcastAlert()` and `broadcastCareGapUpdate()` helpers, token-authenticated connections |
| `audit.ts` | (Registered in app.ts via middleware) |

#### Routes — `apps/api/src/routes/` (10 modules)

| Route | Prefix | Key Endpoints |
|-------|--------|---------------|
| `health.ts` | `/health` | GET / — uptime, version, timestamp (no auth) |
| `auth/index.ts` | `/auth` | POST /login, POST /logout, POST /refresh, POST /mfa/setup, POST /mfa/verify |
| `patients/index.ts` | `/patients` | GET / (search+paginate), GET /:id, GET /:id/risk-score, GET /:id/care-gaps, GET /:id/encounters, GET /:id/observations, GET /:id/conditions, GET /:id/medications |
| `dashboard/index.ts` | `/dashboard` | GET / (aggregated metrics: risk distribution, care gaps, encounters, quality scores) |
| `measures/index.ts` | `/measures` | GET / (list+filter by domain), GET /:id, GET /:id/results, GET /:id/cohort |
| `care-gaps/index.ts` | `/care-gaps` | GET / (list+filter by status/priority), GET /:id, PATCH /:id (update status), GET /summary |
| `alerts/index.ts` | `/alerts` | GET / (list+filter), POST / (create), PATCH /:id/acknowledge, PATCH /:id/resolve, GET /unacknowledged/count |
| `insights/index.ts` | `/insights` | POST /chat (AI chat with consent gate), GET /patient/:id/summary, POST /patient/:id/risk-narrative |
| `search/index.ts` | `/search` | GET /?q= (full-text patient search via pg_trgm on name, MRN, DOB) |
| `fhir/index.ts` | `/fhir` | GET /Patient, GET /Patient/:id, GET /Condition, GET /Observation, GET /MedicationRequest, GET /Patient/:id/$everything |
| `admin/index.ts` | `/admin` | GET /omop/persons, GET /omop/conditions, GET /omop/measurements, POST /omop/cohort, GET /users, PATCH /users/:id, GET /audit-log, GET /analytics/overview |

#### Services — `apps/api/src/services/`

| File | Description |
|------|-------------|
| `riskScoring.ts` | Evidence-based 7-factor risk scoring (0–100): age, active conditions, vital signs, lab values, care gaps, encounter recency, medications. Returns score + band + factor breakdown. Persists to `patient_risk_scores` table with history. |
| `llmClient.ts` | Provider-agnostic LLM client: Anthropic Claude (via SDK) or Ollama (HTTP). HIPAA preamble injected into all prompts. Cost tracking logged to `ai_interactions` table. Streaming support for both providers. |
| `measureEngine.ts` | eCQM execution engine: loads SQL files from `archive/backend/database/Measures/`, executes via `sql.unsafe()`, calculates performance rates from `initial_population`, `excluded_count`, `numerator_count`. Batch execution with star schema persistence via `dim_measure`/`dim_date` lookups. |
| `cohortQueryEngine.ts` | Dynamic cohort builder: age range, gender, conditions (ICD-10), medications (RxNorm), lab value ranges, encounter recency. Builds parameterized SQL from filter criteria. |
| `fhir/mappers.ts` | FHIR R4 resource mappers: Patient, Condition (SNOMED CT), Observation (LOINC), MedicationRequest (RxNorm), Bundle (searchset/collection). |
| `omopExport.ts` | OMOP CDM export: maps EDW to OMOP persons, condition_occurrence, measurement. SNOMED-to-OMOP and LOINC-to-OMOP concept ID lookups with race/ethnicity mapping. De-identified cohort generation with age bucketing and ID stripping. |

#### Middleware — `apps/api/src/middleware/`

| File | Description |
|------|-------------|
| `aiGate.ts` | Checks `app_users.ai_consent_given_at`; returns 403 `AI_CONSENT_REQUIRED` if null. Used by `/insights` routes. |
| `audit.ts` | Auto-logs all mutations (POST/PUT/PATCH/DELETE) to `audit_log` table. Extracts resource type/ID from URL. Redacts password, tokens from body. Async — never fails the request. |

#### Workers — `apps/api/src/workers/`

| File | Description |
|------|-------------|
| `rules-engine.ts` | Clinical alert rules: evaluates care gap detection, risk threshold alerts, measure compliance. Fires on patient data changes. Creates alerts + broadcasts via WebSocket. |
| `ai-insights-worker.ts` | AI-generated care gap analysis per patient. Uses LLM client with clinical context. BAA check only for Anthropic provider (Ollama passes through). Stores results in `ai_insights`. |
| `measure-calculator.ts` | Nightly eCQM recalculation via `measureEngine.ts`: loads SQL files from `archive/backend/database/Measures/`, executes against EDW, calculates performance rates. Supports single measure or batch execution. |
| `etl-worker.ts` | ETL orchestration: calls `run_full_etl()` stored procedure (Synthea→EDW→Star). Logs step timings. |
| `nightly-scheduler.ts` | Cron-like scheduler: queues measure recalculation, ETL refresh, risk score recalculation, AI insight generation at configurable times. |

---

### Phase 2 — Modern Web Frontend

**Status: COMPLETE**

Vite 6 + React 19 + React Router 7 SPA with Zustand state management and TanStack React Query.

#### Core Application — `apps/web/`

| File | Description |
|------|-------------|
| `package.json` | Dependencies: React 19, React Router 7, TanStack React Query 5, Zustand, Recharts 2, Zod, lucide-react, @tiptap/* |
| `vite.config.ts` | Vite 6 with React plugin, `@/` path alias to `src/`, proxy `/api` to localhost:3002, `/ws` to ws://localhost:3002 |
| `tailwind.config.ts` | Ported from legacy: custom dark/light color palettes, accent colors, gradient backgrounds, glow shadows, fade/slide/pulse animations |
| `postcss.config.js` | Standard PostCSS with tailwindcss + autoprefixer |
| `index.html` | SPA entry with dark mode class on `<html>` |
| `src/main.tsx` | React DOM root with QueryClientProvider + BrowserRouter + App |
| `src/App.tsx` | AppProviders wrapper (useTheme, useKeyboardShortcuts, useAlertSocket), GlobalSearch, React Router routes |
| `src/styles/globals.css` | Ported from legacy: CSS variables, panel component layers (panel-base, panel-stat, panel-analytics, panel-detail, panel-filter), scrollbar styling, modal animations |

#### Pages — `apps/web/src/pages/` (9 pages)

| Page | Source | Key Features |
|------|--------|--------------|
| `LoginPage.tsx` | Ported from Next.js | Email/password form, error display, loading spinner, gradient background. Uses `api.post('/auth/login')` + `useAuthStore().setAuth()`. |
| `DashboardPage.tsx` | Ported from Next.js | 4 stat cards, risk distribution bars, care gap summary, recent activity timeline, quality performance with trend indicators. Uses `useQuery` to fetch from `/dashboard`. |
| `PatientsPage.tsx` | Ported from Next.js | Search input, sortable table with risk badges, pagination. Uses paginated API query to `/patients`. |
| `PatientDetailPage.tsx` | Ported from Next.js | Demographics, risk score gauge, unified timeline (encounters + observations + conditions + care gaps sorted by date), care gaps sidebar, active conditions. Uses `useParams()`. |
| `MeasuresPage.tsx` | Ported from Next.js | Three-panel layout: domain filter sidebar, search + measure list, measure details panel. Performance cards with color-coded indicators. |
| `CareListsPage.tsx` | Ported from Next.js | Stats grid, search (Ctrl+K shortcut), status filter, care gap cards with priority badges. |
| `AlertsPage.tsx` | NEW | Filter buttons (All/Active/Acknowledged), severity-coded alert cards, acknowledge mutation, 30s auto-polling, unacknowledged count badge. |
| `SettingsPage.tsx` | Ported from Next.js | Notification toggles, data management, schedule dropdowns, security (2FA), profile form. Internal `Toggle` and `SettingsSection` components. |
| `NotFoundPage.tsx` | NEW | Simple 404 with link to dashboard. |

#### State Management — `apps/web/src/stores/`

| Store | Description |
|-------|-------------|
| `auth.ts` | Zustand: user, tokens, `setAuth()`, `logout()`, `isAuthenticated` getter. Persists to localStorage. |
| `theme.ts` | Zustand: theme (light/dark/system), `setTheme()`, `effectiveTheme` getter. Persists to localStorage. |
| `ui.ts` | Zustand: sidebarOpen, searchOpen, globalLoading, activeModal. Toggle methods. |

#### Hooks — `apps/web/src/hooks/`

| Hook | Description |
|------|-------------|
| `useAlertSocket.ts` | WebSocket connection to `/ws?token=...`. Handles `alert:new` and `care-gap:closed` messages by invalidating React Query caches. Auto-reconnects after 5s. |
| `useKeyboardShortcuts.ts` | Ctrl/Cmd+K toggles search, Alt+1-5 navigates (Dashboard/Patients/Measures/CareLists/Alerts). Ignores shortcuts in input/textarea/contentEditable. |
| `useTheme.ts` | Syncs Zustand theme store with `<html>` class. Handles dark/light/system with `matchMedia` listener. |
| `useApi.ts` | TanStack React Query hooks for all endpoints: `useDashboard()`, `usePatients(params)`, `usePatient(id)`, `useMeasures(params)`, `useCareGaps(params)`, `useAlerts()` (30s refetch), `useSearch(query)`, `useAiChat()`, plus mutation hooks. |

#### Components — `apps/web/src/components/`

| Component | Description |
|-----------|-------------|
| `AuthGuard.tsx` | Route protection: redirects to `/login` if not authenticated. Optional `requiredRoles` prop for role-based access. |
| `AppShell.tsx` | Sidebar + topbar layout. Collapsible sidebar with navigation links. User menu with logout. Responsive. |
| `GlobalSearch.tsx` | Command palette modal (Ctrl+K). Debounced search (300ms) to `/search?q=...`. Shows patient name/MRN/DOB. Click navigates to patient detail. |

#### API Service — `apps/web/src/services/`

| File | Description |
|------|-------------|
| `api.ts` | Typed fetch wrapper with auth interceptor. Methods: `get<T>()`, `post<T>()`, `patch<T>()`, `delete<T>()`. Auto-attaches JWT from auth store. Handles 401 by clearing auth state. Base URL from `VITE_API_URL` or default `/api/v1`. |

#### Testing — `apps/web/`

| File | Description |
|------|-------------|
| `vitest.config.ts` | jsdom environment, globals, `@/` path alias |
| `playwright.config.ts` | Chromium only, base URL localhost:5175, auto-start Vite dev server |
| `src/test/setup.ts` | Imports `@testing-library/jest-dom/vitest` |
| `e2e/auth.spec.ts` | 3 tests: redirect to login, form elements present, error on invalid credentials |
| `e2e/navigation.spec.ts` | 2 tests: login page branding, 404 page rendering |

---

### Phase 3 — Enhanced Capabilities

**Status: COMPLETE**

FHIR R4 interoperability, OMOP CDM export, AI consent gating, audit middleware, admin panel.

- **FHIR R4 routes** — 6 endpoints mapping PHM EDW to FHIR resources (Patient, Condition, Observation, MedicationRequest, $everything bundle)
- **OMOP CDM export** — Persons, conditions, measurements export + de-identified cohort generation
- **AI consent gate** — Middleware checking `ai_consent_given_at` before allowing `/insights` access
- **Audit trail** — Auto-logs all mutations with resource type extraction and field redaction
- **Admin panel** — OMOP export endpoints, user management, audit log viewer, analytics overview

---

### Phase 4 — CI/CD

**Status: COMPLETE**

GitHub Actions workflows for continuous integration and deployment.

- **CI workflow** (`.github/workflows/ci.yml`) — Two jobs:
  1. `build-and-test`: Postgres 15 + Redis 7 services → npm ci → turbo build/typecheck/lint/test → db:migrate
  2. `e2e`: Depends on build-and-test → Playwright install → build → migrate+seed → test:e2e → upload artifacts on failure
- **Deploy workflow** (`.github/workflows/deploy.yml`) — Build pipeline with Docker build placeholder (to be configured per hosting provider)

---

### Phase 10 — Core Clinical Workspace

**Status: COMPLETE**

Transforms Medgnosis from a population health analytics dashboard into a clinical workspace with patient-centric tabbed charts, condition-based care gap bundles, and a clinician morning view.

#### Module 10.1 — Clinician Morning View Dashboard

Rewrote `DashboardPage.tsx` from a pure population analytics view to a clinician-first morning briefing:

- **Greeting header** — "Good morning, Dr. {lastName}" with time-aware greeting
- **3-column clinician row** — Today's Schedule (encounter list), Urgent Alerts (severity-colored cards), Abigail AI Briefing (Phase 11 placeholder)
- **Quick stats row** — Total Patients, Active Patients, Open Care Gaps, High Risk (badge-colored)
- **Collapsible Population Health** — Existing charts moved to expandable section (starts collapsed)
- **Backend additions** — 3 new parallel queries in `dashboard/index.ts`: today's encounters, urgent alerts, critical alert count

#### Module 10.2 — Patient Summary Chart (Tabbed Layout)

Rewrote `PatientDetailPage.tsx` (687 → 218 lines) from a flat scrollable layout to a tabbed clinical chart:

- **PatientBanner** — sticky header with demographics, PCP, insurance, allergy badges, "New Note" button
- **TabBar** — 7 tabs: Overview, Encounters, Conditions, Medications, Labs & Vitals, Allergies, Care Gaps
- **OverviewTab** — 2-column at-a-glance summary (conditions + encounters + recent results | meds + care bundles)
- **EncountersTab** — Paginated encounter list with provider/facility, fetches own data
- **ConditionsTab** — Active/resolved condition cards with ICD-10 codes and onset dates
- **MedicationsTab** — Active medication orders with dosage, frequency, route, prescriber
- **AllergiesTab** — Allergy cards with severity badges and reaction details

#### Module 10.4 + 10.5 — Flowsheets & Lab Trending

- **FlowsheetGrid** — Dense clinical table of observations by LOINC category (vitals, BMP, CBC, lipids)
- **ObservationTrendChart** — Recharts time-series line chart with reference range bands
- **LabsVitalsTab** — Toggle between list and flowsheet view, click-to-trend any observation code
- **Backend** — `GET /patients/:id/flowsheet` with LOINC category filtering, `GET /patients/:id/observations/trending` for time-series data

#### Module 10.6 — Care Gap Bundles

Full-stack implementation of condition-based care gap bundles sourced from `docs/Medgnosis_CareGap_Bundles.xlsx` — 15 chronic conditions, 106 evidence-based quality measures, 16 cross-condition deduplication rules.

##### Database (2 migrations)

| Migration | Purpose |
|-----------|---------|
| `006_care_gap_bundles.sql` | DDL: 3 new tables (`condition_bundle`, `bundle_measure`, `bundle_overlap_rule`) + ALTER `care_gap` with `bundle_id`, `due_date`, `gap_priority` |
| `007_seed_bundles_v1.sql` | Seed: 15 bundles, 106 measures into `measure_definition`, 106 `bundle_measure` links, 16 overlap rules. Repeatable CTE pattern for easy bulk extension |

15 condition bundles: DM (8 measures), HTN (6), CAD (8), HF (7), COPD (8), ASTH (7), CKD (9), AFIB (6), MDD (7), OSTEO (6), OB (6), CLD (7), RA (8), PAD (7), HYPO (6).

16 overlap rules: BP Control, Statin Therapy, Smoking Cessation, Antiplatelet, RAAS Inhibitors, SGLT2 Inhibitors, UACR, eGFR, Lipid Panel, Flu Vaccine, Pneumococcal Vaccine, DXA Scan, Fall Risk, Hep B/C Screening, ASCVD Risk, PHQ-9.

##### Shared Types & Schemas

| File | Changes |
|------|---------|
| `packages/shared/src/types/bundle.ts` | New — `BundleGapStatus`, `ConditionBundle`, `BundleMeasure`, `PatientBundleMeasure`, `PatientBundle`, `PatientCareBundleResponse`, `BundleComplianceSummary`, `OverlapDeduction`, `OverlapRule` |
| `packages/shared/src/index.ts` | Added `export type * from './types/bundle.js'` |
| `packages/shared/src/schemas/index.ts` | Extended `careGapUpdateSchema` status enum with 8 new values: `met`, `not_met`, `overdue`, `due_soon`, `due`, `ongoing`, `na`, `at_risk` |

##### Backend API

| Route | Endpoint | Purpose |
|-------|----------|---------|
| `bundles/index.ts` | `GET /bundles` | List all active condition bundles with measure counts |
| | `GET /bundles/:bundleCode` | Single bundle with all measures |
| | `GET /bundles/overlaps` | All deduplication rules |
| `patients/index.ts` | `GET /patients/:id/care-bundle` | Core composition endpoint — matches ICD-10 codes to bundles, fetches measures, applies overlap dedup rules, computes compliance % |

The `/patients/:id/care-bundle` endpoint:
1. Fetches patient's active ICD-10 codes from `condition_diagnosis`
2. Matches against `condition_bundle.icd10_pattern` using SQL `LIKE ANY(string_to_array(...))`
3. Loads all `bundle_measure` rows for matched bundles
4. Applies overlap rules for shared domains where patient has 2+ applicable bundles
5. Computes per-bundle and overall compliance percentages

##### Frontend

| Component | Description |
|-----------|-------------|
| `CareGapsTab.tsx` | Complete rewrite — from flat open/closed list to bundle-grouped view. Fetches own data via `usePatientCareBundle(patientId)`. Components: `ComplianceRing` (SVG donut), `BundleAccordion` (collapsible per condition), `MeasureRow` (status badge + frequency + dedup indicator), overlap summary |
| `OverviewTab.tsx` | Replaced flat care gap list with bundle compliance mini-summary (condition name + compliance progress bar, color-coded by threshold) |
| `PatientDetailPage.tsx` | CareGapsTab now receives `patientId` prop (self-fetching) instead of `careGaps` array |
| `useApi.ts` | Added `usePatientCareBundle`, `useConditionBundles`, `useConditionBundle` hooks |

Status badge color mapping (Clinical Obsidian v2): met/closed → emerald, overdue → crimson, not_met/at_risk → amber, due_soon → amber/light, due/ongoing → dim, na → dim+opacity. Deduplicated measures shown at 50% opacity with violet "Dedup" badge and source reference.

#### Module 10.6b-d — Care Gap Bundles 16-45 (Bulk Extension)

Extended the bundle system from 15 to 45 condition bundles via programmatic SQL generation from two additional spreadsheets:

| Migration | Source | Bundles | Measures | Overlap Rules |
|-----------|--------|---------|----------|---------------|
| `008_seed_bundles_v2.sql` | `docs/Medgnosis_CareGap_Bundles_16-30.xlsx` | 15 (ALZ, STR, PAIN, OA, GERD, BPH, MIG, EPI, HIV, HCV, SCD, SLE, GOUT, OSA, GAD) | 118 | 18 updates + 7 new |
| `009_seed_bundles_v3.sql` | `docs/Medgnosis_CareGap_Bundles_31-45.xlsx` | 15 (T1D, IBD, MS, PD, PSO, HBV, PAH, ANEM, LIPID, PTSD, BP, TOB, AUD, VTE, WND) | 130 | 18 updates + 7 new |

**Totals after all seeds:** 45 bundles, 354 bundle_measures, 399 measure_definitions, 30 overlap rules.

SQL generated via Python/openpyxl scripts with `ON CONFLICT DO NOTHING` idempotency. Smart quote (U+2018/2019) and stray header row issues resolved during generation.

#### Module 10.3 — Encounter Note with AI Scribe

Full-stack SOAP note editor with AI-powered content generation via Ollama/MedGemma.

##### Database

| Migration | Purpose |
|-----------|---------|
| `012_clinical_notes.sql` | `clinical_note` table: UUID PK, SOAP text columns, `ai_generated` JSONB provenance, status workflow (draft→finalized→amended), `chief_complaint`, indexes on patient/author/status |

##### Shared Types & Schemas

| File | Changes |
|------|---------|
| `packages/shared/src/types/encounter-note.ts` | New — `ClinicalNote`, `NoteStatus`, `SOAPSection`, `AiProvenance`, `ScribeRequest`, `ScribeResponse` |
| `packages/shared/src/schemas/index.ts` | Added `clinicalNoteCreateSchema`, `clinicalNoteUpdateSchema`, `scribeRequestSchema` Zod validators |
| `packages/shared/src/index.ts` | Added encounter-note type + schema exports |

##### Backend API (8 endpoints)

| Route | Endpoint | Purpose |
|-------|----------|---------|
| `clinical-notes/index.ts` | `POST /clinical-notes` | Create draft note |
| | `GET /clinical-notes/:noteId` | Get note with author name |
| | `PATCH /clinical-notes/:noteId` | Auto-save SOAP sections (drafts only) |
| | `POST /clinical-notes/:noteId/finalize` | Lock and sign |
| | `POST /clinical-notes/:noteId/amend` | Amend with reason (finalized notes only) |
| | `DELETE /clinical-notes/:noteId` | Soft-delete (drafts only) |
| | `POST /clinical-notes/scribe` | AI Scribe — generates SOAP via Ollama |
| `patients/index.ts` | `GET /patients/:id/notes` | List notes for patient |

**AI Scribe endpoint** gathers patient context (conditions, medications, vitals, allergies, care gaps, recent encounters), builds a structured clinical prompt, and calls `generateCompletion()` with `jsonMode: true`. Returns per-section HTML strings. Gated by `aiGateMiddleware` (consent check) + `config.aiInsightsEnabled`.

##### Frontend

| Component | Description |
|-----------|-------------|
| `EncounterNotePage.tsx` | Full-page SOAP editor: visit type selector, chief complaint input, "AI Scribe All" button, 4 TipTap editors, auto-save (3s debounce), finalize dialog, delete draft |
| `SOAPSectionEditor.tsx` | TipTap editor per SOAP section: formatting toolbar (lucide-react), per-section AI button, "AI-assisted" teal badge, loading overlay during generation |
| `App.tsx` | Added `/patients/:patientId/encounter-note` route |
| `useApi.ts` | Added `useCreateClinicalNote`, `useUpdateClinicalNote`, `useFinalizeClinicalNote`, `useAiScribe`, `usePatientNotes` hooks |

TipTap extensions: StarterKit, Highlight, Typography, Link, TaskList, TaskItem. Toolbar adapted from archive `rich-text-editor.tsx` with lucide-react icons and Clinical Obsidian v2 dark theme styling.

---

## Codebase Inventory

### File Counts

| Package | Files | Lines (approx) |
|---------|-------|-----------------|
| `apps/api/src/` | 33 | ~3,350 |
| `apps/web/src/` | 27 | ~3,800 |
| `packages/shared/src/` | 17 | ~1,050 |
| `packages/db/src/` | 5 | ~224 |
| `packages/db/migrations/` | 10 SQL | ~4,600 |
| E2E tests | 2 | ~80 |
| **Total** | **94** | **~13,104** |

### Environment Variables (45 total)

| Category | Variables |
|----------|-----------|
| Database | `DATABASE_URL` |
| Redis | `REDIS_URL` |
| Auth | `JWT_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `MFA_ISSUER` |
| AI | `AI_PROVIDER` (anthropic/ollama), `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`, `AI_MODEL` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Sentry | `SENTRY_DSN` |
| App | `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `LOG_LEVEL` |
| Web (Vite) | `VITE_API_URL` |

---

## Known Issues & Stubs

### Critical

- [x] ~~**Password hashing uses SHA256**~~ — **Fixed (Phase 6.1).** Replaced with bcrypt (cost factor 12). Both `hashPassword()` and `verifyPassword()` use `bcrypt` package.
- [x] ~~**Measure calculator eCQM execution is a TODO stub**~~ — **Fixed (Phase 6.4).** `measureEngine.ts` loads and executes eCQM SQL files from `archive/backend/database/Measures/` via `sql.unsafe()`.
- [x] ~~**OMOP concept ID mappings hardcoded to 0**~~ — **Fixed (Phase 6.5).** Added SNOMED-to-OMOP, LOINC-to-OMOP, race, and ethnicity concept lookup maps with fallback to `0` for unmapped codes.

### Moderate

- [ ] **SettingsPage is entirely UI-only** — No API calls; toggles, dropdowns, and profile form have no backend integration.
- [x] ~~**`seed-demo.ts` `insertMinimalDemoData()` is empty**~~ — **Fixed (Phase 6.3).** Seeds 4 demo users, 300 care gaps, 30 clinical alerts, 10 AI insights, 650 risk history records.
- [ ] **`seed.ts` only inserts one organization** — Minimal seeding; no sample patients, encounters, or clinical data (production restore provides real data).
- [x] ~~**Dashboard/measures routes have silent failures**~~ — **Fixed (Phase 6.7).** All `.catch(() => [])` replaced with proper error logging via `fastify.log.error` / `console.error`.
- [x] ~~**AI insights worker BAA check**~~ — **Fixed (Phase 6.6).** Changed condition to only check BAA for `anthropic` provider. Ollama (local LLM) is no longer blocked.

### Minor

- [ ] **"Forgot password" link** on LoginPage is non-functional (no route or handler).
- [ ] **"Remember me" checkbox** on LoginPage is not wired to anything.
- [ ] **"Create List" button** on CareListsPage has no handler.
- [x] ~~**No npm install has been run**~~ — Resolved 2026-02-25. All packages build cleanly.

---

## Next Phases Checklist

### Phase 5 — Build & Startup Verification

**Status: COMPLETE** (Session 2 + Session 3)

- [x] **5.1** Run `npm install` — 709 packages, clean
- [x] **5.2** Run `npx turbo run build` — 20+ TS errors fixed, all 4 packages pass
- [x] **5.3** Run `npx turbo run typecheck` — passes
- [x] **5.4** Docker skipped — Postgres/Redis/MailHog running natively (shared with MindLog)
- [x] **5.5** Database restored from 31GB production backup (1M+ patients, 195M+ procedures)
- [x] **5.6** Migrations applied — 001-004 pre-registered, 005 applied (auth + alerts tables)
- [x] **5.7** Seed scripts run — admin user + demo data
- [x] **5.8** API running on port 3002 (port 3000 used by MindLog)
- [x] **5.9** Web running on port 5175 (port 5173 used by MindLog)
- [x] **5.10** Vite proxy verified — login through web to API works
- [x] **5.11** Full login flow verified — JWT issued, dashboard loads
- [x] **5.12** WebSocket connection — Redis pub/sub connected
- [x] **5.13** Full E2E test — all 17 API endpoints verified (Session 3)

### Phase 6 — Critical Bug Fixes

**Status: COMPLETE** (Session 3)

- [x] **6.1** Replace SHA256 password hashing with bcrypt (cost factor 12)
- [x] **6.2** Update seed scripts + migration 005 to use bcrypt hashes
- [x] **6.3** Implement `seed-demo.ts` — 4 users, 300 care gaps, 30 alerts, 10 AI insights, 650 risk history records
- [x] **6.4** Wire measure calculator to `measureEngine.ts` — loads and executes eCQM SQL files from archive
- [x] **6.5** Fix OMOP concept ID mappings — SNOMED-to-OMOP, LOINC-to-OMOP, race, ethnicity lookups
- [x] **6.6** Fix AI insights worker BAA check — only requires BAA for `anthropic` provider, Ollama passes through
- [x] **6.7** Replace all silent `.catch(() => [])` with proper error logging (4 instances across 3 files)
- [x] **6.8** Add JWT refresh token rotation with replay detection (revoked token reuse revokes all user sessions)

### Phase 7 — Integration Testing

Goal: Comprehensive test coverage matching MindLog's test suite.

- [ ] **7.1** API unit tests with Vitest + Supertest:
  - [ ] Auth routes (login, logout, refresh, MFA)
  - [ ] Patient routes (CRUD, search, pagination)
  - [ ] Dashboard routes (aggregation)
  - [ ] Measure routes (list, filter, results)
  - [ ] Care gap routes (list, update status)
  - [ ] Alert routes (create, acknowledge, resolve)
  - [ ] FHIR routes (resource mapping, bundles)
  - [ ] Admin routes (OMOP export, user management)
- [ ] **7.2** Web unit tests with Vitest + React Testing Library:
  - [ ] Auth store (setAuth, logout, persistence)
  - [ ] Theme store (setTheme, effectiveTheme, system detection)
  - [ ] UI store (toggle methods)
  - [ ] API service (auth header injection, 401 handling)
  - [ ] useAlertSocket hook (connection, message handling)
  - [ ] GlobalSearch component (debounce, navigation)
- [ ] **7.3** E2E tests with Playwright (expand from current 5 tests):
  - [ ] Full login flow (valid + invalid credentials)
  - [ ] Dashboard data loading and display
  - [ ] Patient list search and pagination
  - [ ] Patient detail navigation and data display
  - [ ] Measures filtering and selection
  - [ ] Care gap status updates
  - [ ] Alert acknowledgment
  - [ ] Settings page navigation
  - [ ] Theme switching (dark/light)
  - [ ] Keyboard shortcuts (Ctrl+K, Alt+1-5)
  - [ ] 404 page handling
- [ ] **7.4** Run full CI pipeline locally: `npx turbo run build typecheck lint test`

### Phase 8 — Deployment

**Status: COMPLETE** (Session 4) — Deployed to `https://medgnosis.acumenus.net`

Approach changed from Docker-based to **Apache reverse proxy + systemd services + auto-deploy daemon**, matching MindLog's proven production pattern on the same host.

- [x] **8.1** Create `.env.production` — port 3081, CORS for medgnosis.acumenus.net, production JWT secret
- [x] **8.2** Create systemd services — `medgnosis-api.service`, `medgnosis-worker.service`, `medgnosis-auto-deploy.service`
- [x] **8.3** Create Apache virtual host — HTTP→HTTPS redirect, reverse proxy (API + WebSocket), SPA fallback, security headers
- [x] **8.4** SSL/TLS via Let's Encrypt (Certbot) — auto-renewal configured
- [x] **8.5** Create `scripts/deploy-production.sh` — manual deploy: build + restart + health check
- [x] **8.6** Create `scripts/auto-deploy.sh` — watches source files every 60s, auto-rebuilds and restarts on change
- [x] **8.7** Create `scripts/setup-production.sh` — one-time setup: installs systemd units, Apache vhost, SSL cert
- [x] **8.8** Health check verified — `https://medgnosis.acumenus.net/health` returns `{"status":"healthy"}`

### Phase 9 — Polish & Hardening

Goal: Production-grade reliability and compliance.

- [ ] **9.1** Wire SettingsPage to API endpoints (profile update, notification preferences, 2FA setup)
- [ ] **9.2** Implement "Forgot password" flow (email via MailHog in dev, Resend in prod)
- [ ] **9.3** Implement "Remember me" with extended JWT refresh expiry
- [ ] **9.4** Add rate limiting per-route (stricter on /auth/login: 10/min)
- [ ] **9.5** Add IP allowlisting for admin routes (configurable)
- [ ] **9.6** Implement proper session timeout per role (configurable in config.ts)
- [ ] **9.7** Add PHI access logging (log all reads of patient data, not just mutations)
- [ ] **9.8** Port remaining legacy UI components:
  - [x] Super Note (TipTap SOAP note editor) — **Done (Module 10.3)** with AI Scribe
  - [ ] Cohort Creator (dynamic population filter builder)
  - [ ] MIPS reporting page
  - [ ] Population analytics page
  - [ ] Trends visualization page
  - [ ] Reports generation page
- [ ] **9.9** Add Sentry integration to web app (`@sentry/react`)
- [ ] **9.10** Performance optimization: React.lazy() for page code splitting
- [ ] **9.11** Add service worker for offline capability / PWA support
- [ ] **9.12** Comprehensive README.md update with architecture diagram

---

## Session Log

---

### Session 2 — Build, Restore & Startup (Feb 25, 2026)

### Overview

Got the full modernized stack building, connected to the legacy 1M+ patient production database, and started both servers. This session focused on Phase 5 (Build & Startup Verification) — fixing compilation errors, restoring the production database, fixing schema mismatches, and getting the API + Web servers running.

### Completed Work

#### 5.1 — Dependency Installation
- `npm install` — 709 packages installed cleanly (6 moderate vulnerabilities, all in dev deps)

#### 5.2 — Docker Infrastructure (Skipped)
- PostgreSQL, Redis, and MailHog already running natively on the host (shared with MindLog project)
- No Docker needed for local dev — services at their standard ports

#### 5.3 — Environment Configuration
- Created `.env` from `.env.example`
- `DATABASE_URL=postgres://smudoshi:acumenus@localhost:5432/medgnosis`
- **Port conflict resolution**: MindLog actively uses ports 3000 (API) and 5173 (Vite), so Medgnosis was reconfigured:
  - API: **port 3002** (was 3000)
  - Web: **port 5175** (was 5173)
  - Updated `.env`, `.env.example`, and `apps/web/vite.config.ts`

#### 5.4 — TypeScript Build Fixes (20+ errors across 4 packages)

All packages now build cleanly via `npx turbo run build`.

| File | Error | Fix |
|------|-------|-----|
| `packages/db/src/client.ts` | Unused `connection` param (TS6133) | Renamed to `_connection` |
| `packages/db/src/migrate.ts` | `tx` tagged template not callable (TS2349) | Changed to `tx.unsafe()` with params array |
| `packages/shared/tsconfig.json` | Missing `composite: true` (TS6306) | Added for project references |
| `packages/db/tsconfig.json` | Missing `composite: true` (TS6306) | Added for project references |
| `apps/web/src/pages/DashboardPage.tsx` | 12+ type errors — `DashboardAnalytics` mismatch | Complete rewrite with local `DashboardResponse` matching actual API shape |
| `apps/web/src/pages/AlertsPage.tsx` | Unused `Filter` import (TS6133) | Removed import |
| `apps/web/src/pages/SettingsPage.tsx` | Unused `Key` import (TS6133) | Removed import |
| `apps/web/src/components/GlobalSearch.tsx` | `useRef()` needs arg in React 19 (TS2554) | Changed to `useRef<T>(undefined)` |
| `apps/web/postcss.config.js` | Missing file — Tailwind not processed | Created with ESM format |
| `apps/api/src/app.ts` | Rate limit `allowList` callback type (TS2769) | Used `FastifyRequest` type directly |
| `apps/api/src/middleware/aiGate.ts` | JwtPayload direct cast rejected (TS2352) | Used `as unknown as { id: number }` |
| `apps/api/src/plugins/error-handler.ts` | `error` typed as `unknown` (TS18046) | Imported and used `FastifyError` type |
| `apps/api/src/plugins/audit.ts` | `decorateRequest('auditLog', null)` (TS2345) | Changed to dummy async function, per-request closure in onRequest hook |
| `apps/api/src/plugins/websocket.ts` | Redis hard crash on connect failure | Added try/catch with graceful degradation (`redisAvailable` flag) |
| `apps/api/src/plugins/auth.ts` | Missing `optionalAuth` decorator | Added with try/catch jwtVerify |
| `apps/api/src/routes/auth/index.ts` | `role` string not assignable to `UserRole` (TS2345) | Added `as UserRole` cast |
| `apps/api/src/routes/fhir/index.ts` | Unused `req` param | Renamed to `_req` |
| `apps/api/src/routes/measures/index.ts` | Unused `_params` variable | Removed |
| `apps/api/src/routes/patients/index.ts` | Unused `PAGINATION` import, unused `risk_level` | Removed import, renamed to `_risk_level` |
| `apps/api/src/services/omopExport.ts` | Unused vars `cohortCriteria`, `query` | Removed |
| `apps/api/src/workers/measure-calculator.ts` | Unused `sql` import | Removed |

#### 5.5 — Legacy Database Restoration

Restored the full production database from backup at `/media/smudoshi/DATA/backups/postgres/20250419`.

**Process:**
1. Backup is ~30GB gzip-compressed pg_dump custom format
2. Decompressed to `/tmp/medgnosis_restore.dump` (31GB)
3. `pg_restore -j 4 --no-owner --no-privileges` with 4 parallel workers
4. Restoration takes a very long time due to data volume — system hit load average 17+ and 800MB free RAM during bulk COPY phase

**Data volume in restored database:**

| Table | Row Count |
|-------|-----------|
| `phm_edw.procedure_performed` | 195,017,344 |
| `phm_edw.condition_diagnosis` | 42,432,016 |
| `phm_edw.encounter` | 28,689,392 |
| `phm_edw.address` | 1,008,435 |
| `phm_edw.patient` | 1,005,791 |
| `phm_edw.provider` | 2,815 |
| `phm_edw.organization` | 2,736 |

**Schemas restored:** `phm_edw` (23 tables), `phm_star` (15 tables)

#### 5.6 — Non-Destructive Migration Strategy

Migrations 001-004 contain destructive DDL (`DROP SCHEMA IF EXISTS phm_edw CASCADE`, `TRUNCATE`) that would destroy restored data. Strategy:

1. Created `_migrations` tracking table
2. Pre-registered migrations 001-004 as "already applied"
3. Migration runner skips them and only applies 005

**Critical fix in migration 005:** The `app_users.org_id` FK referenced `phm_edw.organization(organization_id)` but the actual column is `org_id`. Fixed to `REFERENCES phm_edw.organization(org_id)`.

Migration 005 applied successfully (2.7s) — created 6 new tables in `public` schema:
- `app_users`, `refresh_tokens`, `clinical_alerts`, `audit_log`, `ai_insights`, `patient_risk_history`
- Plus `_migrations` tracking table
- Seeded default admin user: `admin@medgnosis.app` / `password`
- Created trigram index on `phm_edw.patient(first_name || last_name)` for fuzzy search

#### 5.7 — SQL Column Name Fixes (23+ mismatches)

The API SQL queries were written against assumed column names that didn't match the actual restored database schema. An audit of all 10+ route/service files found and fixed 23+ mismatches:

| Assumed Name | Actual Name | Table |
|-------------|-------------|-------|
| `medical_record_number` | `mrn` | patient |
| `ssn_encrypted` | `ssn` | patient |
| `phone_encrypted` | `primary_phone` | patient |
| `email_encrypted` | `email` | patient |
| `encounter_date` | `encounter_datetime` | encounter |
| `observation_type` | `observation_code` | observation |
| `observation_value` | `COALESCE(value_numeric::text, value_text)` | observation |
| `observation_unit` | `units` | observation |
| `observation_date` | `observation_datetime` | observation |
| `condition_status` | `diagnosis_status` | condition_diagnosis |
| `diagnosis_date` | `onset_date` | condition_diagnosis |
| `due_date` | `identified_date` | care_gap |
| `closed_date` | `resolved_date` | care_gap |
| `organization_id` | `org_id` | organization |
| `order_status` | `prescription_status` | medication_order |
| `phm_edw.condition` | `phm_edw.condition_diagnosis` JOIN `phm_edw.condition` | (table structure) |
| `phm_edw.medication` | `phm_edw.medication_order` JOIN `phm_edw.medication` | (table structure) |
| `numerator_flag = 'Y'` | `numerator_flag = TRUE` | measure results (boolean) |

**Files modified:** `routes/patients/index.ts`, `routes/dashboard/index.ts`, `routes/care-gaps/index.ts`, `routes/search/index.ts`, `routes/measures/index.ts`, `routes/admin/index.ts`, `routes/fhir/index.ts`, `services/fhir/mappers.ts`, `services/riskScoring.ts`, `services/omopExport.ts`

#### 5.8 — Turbo Pipeline Fix

`db:migrate` and `db:seed` tasks failed because Turbo doesn't auto-pass `.env` to workspaces. Added `passThroughEnv: ["DATABASE_URL"]` to both tasks in `turbo.json`.

#### 5.9 — Server Startup

Both servers start and respond correctly:

| Service | URL | Status |
|---------|-----|--------|
| API (Fastify) | http://localhost:3002 | Running, healthy |
| Web (Vite) | http://localhost:5175 | Running, serving SPA |
| Redis pub/sub | localhost:6379 | Connected to WebSocket plugin |

#### 5.10 — Endpoint Verification

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /health` | Working | `{"status":"healthy","services":{"database":"up"}}` |
| `POST /api/v1/auth/login` | Working | JWT issued for admin@medgnosis.app |
| `GET /api/v1/auth/me` | Working | Returns user profile with role |
| `GET /api/v1/alerts` | Working | Returns empty list (correct) |
| `GET /api/v1/search?q=Smith` | Working | Returns real patient data from 1M+ patients |
| `GET /api/v1/dashboard` | Blocked | Waiting on pg_restore table locks |
| `GET /api/v1/patients/:id` | Blocked | Waiting on pg_restore table locks |
| Vite proxy to API | Working | Login through web proxy verified |

### Key Learnings

1. **Fastify `decorateRequest` pattern**: Cannot use `null` as initial value for typed decorators in Fastify 5. Must use a dummy function, then reassign per-request in an `onRequest` hook. Using `this` binding is unreliable because Fastify shares the function reference on the prototype.

2. **`postgres` library TransactionSql**: Inside `sql.begin(async (tx) => { ... })`, the `tx` object is a `TransactionSql` — it does NOT support tagged template syntax for arbitrary SQL. Use `tx.unsafe(sql, params)` for dynamic SQL like `INSERT INTO _migrations`.

3. **React 19 strict `useRef`**: `useRef<T>()` without an argument is a type error in React 19. Must use `useRef<T>(undefined)` or `useRef<T>(null)`.

4. **TypeScript project references require `composite: true`**: When package A depends on package B via project references, B's `tsconfig.json` must have `"composite": true` or `tsc` will error with TS6306.

5. **pg_restore of large databases**: A 31GB dump with 195M+ rows across tables takes significant time and system resources. The constraint-building phase (PRIMARY KEYs, FOREIGN KEYs) locks tables and blocks queries. Plan for this during development setup.

6. **Redis graceful degradation**: The WebSocket plugin should wrap Redis connect in try/catch and set a `redisAvailable` flag. Publish helpers check the flag and silently skip if Redis is down. The API continues without real-time alerts.

7. **Condition/Medication table structure**: The PHM EDW uses a normalized design where `condition_diagnosis` (junction) references `condition` (definition), and `medication_order` (junction) references `medication` (definition). Queries need JOIN patterns, not direct table access.

8. **Turbo `passThroughEnv`**: Turbo intentionally does NOT pass environment variables to workspace scripts by default. Use `passThroughEnv` in `turbo.json` task config to explicitly allow specific vars through.

---

### Session 3 — E2E Verification & Critical Bug Fixes (Feb 25, 2026)

#### Overview

Completed the pg_restore verification, ran a full 17-endpoint E2E smoke test, fixed a Zustand hydration bug that caused an infinite loading spinner on the login page, cleaned up a 31GB temp file that caused system OOM, and executed all 8 items in Phase 6 (Critical Bug Fixes). The monorepo builds cleanly after all changes.

#### Completed Work

##### pg_restore Completion & OOM Recovery

- pg_restore completed after extended FK constraint-building phase (195M `procedure_performed` rows)
- The 31GB decompressed dump at `/tmp/medgnosis_restore.dump` combined with PostgreSQL's shared buffer cache exhausted the system's 64GB RAM
- All running processes received SIGABRT (exit code 134) — API server, Vite dev server, and shell processes all crashed
- Recovery: deleted the dump file (no longer needed), freeing 28GB; restarted both servers

##### Login Page Infinite Spinner Fix

**Root cause:** Zustand auth store initialized `isLoading: true`, but the `persist` middleware's `partialize` config excluded `isLoading` from localStorage. After rehydration, `isLoading` stayed `true` forever because nothing set it to `false`. The `AuthGuard` component showed a spinner while `isLoading === true`.

**Fix:** Added `onRehydrateStorage` callback to the Zustand persist config:
```typescript
onRehydrateStorage: () => (state) => {
  state?.setLoading(false);
},
```
**File:** `apps/web/src/stores/auth.ts`

##### Full E2E Smoke Test — 17/17 Endpoints Passing

| # | Endpoint | Status | Notes |
|---|----------|--------|-------|
| 1 | `POST /auth/login` | Pass | 171ms, JWT issued |
| 2 | `GET /auth/me` | Pass | Returns user profile |
| 3 | `POST /auth/refresh` | Pass | New token pair issued |
| 4 | `GET /dashboard` | Pass | Risk distribution, care gaps, encounters, quality metrics |
| 5 | `GET /patients?page=1&limit=5` | Pass | Paginated, 1M+ patients |
| 6 | `GET /patients/:id` | Pass | Demographics + risk score |
| 7 | `GET /patients/:id/care-gaps` | Pass | Active care gaps |
| 8 | `GET /patients/:id/encounters` | Pass | Encounter history |
| 9 | `GET /patients/:id/conditions` | Pass | Active diagnoses |
| 10 | `GET /patients/:id/observations` | Pass | Lab values + vitals |
| 11 | `GET /patients/:id/medications` | Pass | Active prescriptions |
| 12 | `GET /measures` | Pass | eCQM definitions |
| 13 | `GET /care-gaps` | Pass | Gap list with pagination |
| 14 | `GET /alerts` | Pass | Clinical alerts |
| 15 | `GET /search?q=Smith` | Pass | pg_trgm fuzzy search |
| 16 | `GET /fhir/Patient/:id` | Pass | FHIR R4 resource |
| 17 | `GET /fhir/Condition?patient=:id` | Pass | FHIR search parameters |

**Bug found during testing:** Measures route returned 500 — column `measure_description` doesn't exist on `measure_definition` table (actual column is `description`). Fixed in `routes/measures/index.ts`.

##### Phase 6.1 — bcrypt Password Hashing

Replaced `crypto.createHash('sha256')` with `bcrypt` (cost factor 12).

| File | Change |
|------|--------|
| `apps/api/src/routes/auth/index.ts` | New `verifyPassword()` uses `bcrypt.compare()`, new exported `hashPassword()` uses `bcrypt.hash()` |
| `apps/api/package.json` | Added `bcrypt` ^6.0.0 + `@types/bcrypt` ^6.0.0 |

##### Phase 6.2 — Seed Scripts Updated for bcrypt

| File | Change |
|------|--------|
| `packages/db/src/seed.ts` | Imports bcrypt, hashes passwords with cost 12, uses `ON CONFLICT (email) DO UPDATE SET password_hash` |
| `packages/db/migrations/005_auth_alerts_system.sql` | Updated admin seed with proper bcrypt hash (`$2b$12$...`) |
| `packages/db/package.json` | Added `bcrypt` ^6.0.0 + `@types/bcrypt` ^6.0.0 |

##### Phase 6.3 — Demo Data Seeder

Implemented `seed-demo.ts` with production-realistic sample data. Idempotent — checks existing row counts before inserting.

| Data | Count | Details |
|------|-------|---------|
| Demo users | 4 | provider, analyst, care_coordinator (all bcrypt-hashed) + existing admin |
| Care gaps | 300 | Spread across active patients, randomized measures and statuses |
| Clinical alerts | 30 | Mix of severities (info/warning/critical) and alert types |
| AI insights | 10 | Sample care_recommendation and risk_analysis entries |
| Risk history | 650 | Distributed across patients with low/moderate/high/critical bands |

**Column name mismatches discovered during implementation:**

| Table | Assumed | Actual |
|-------|---------|--------|
| `clinical_alerts` | `message` | `body` |
| `clinical_alerts` | `status` column | Derived from `acknowledged_at`/`resolved_at` |
| `clinical_alerts` | free-text `alert_type` | CHECK constraint with specific values |
| `patient_risk_history` | `risk_band` | `band` |
| `patient_risk_history` | `calculated_at` | `computed_at` |
| `patient_risk_history` | `minimal` band | Only `low`/`moderate`/`high`/`critical` allowed |
| `ai_insights` | `risk_stratification` type | `risk_analysis` (CHECK constraint) |
| `ai_insights` | `population_summary` type | `trend_narrative` (CHECK constraint) |

##### Phase 6.4 — Measure Calculator Wired to eCQM SQL

Created `apps/api/src/services/measureEngine.ts`:
- `listAvailableMeasures()` — reads SQL files from `archive/backend/database/Measures/`
- `executeMeasure(measureCode)` — looks up measure in DB, loads SQL file, executes via `sql.unsafe()`, parses `initial_population`/`excluded_count`/`numerator_count`
- `executeMeasureAndPersist(measureCode)` — executes + looks up `dim_measure`/`dim_date` keys for star schema persistence
- `executeAllMeasures()` — batch execution of all available eCQM SQL files

Updated `measure-calculator.ts` worker to use `measureEngine` instead of placeholder logic.

##### Phase 6.5 — OMOP Concept ID Mappings

Added lookup maps and helper functions to `apps/api/src/services/omopExport.ts`:

| Map | Purpose | Example |
|-----|---------|---------|
| `RACE_CONCEPT` | Race string → OMOP concept ID | `'white' → 8527` |
| `ETHNICITY_CONCEPT` | Ethnicity → OMOP concept ID | `'hispanic' → 38003563` |
| `SNOMED_TO_OMOP` | SNOMED CT → OMOP condition concept | `'44054006' → 201826` (Diabetes) |
| `LOINC_TO_OMOP` | LOINC → OMOP measurement concept | `'8480-6' → 3004249` (Systolic BP) |

Replaced all hardcoded `0` concept IDs with lookup function calls. Unknown codes fall back to `0`.

##### Phase 6.6 — AI Insights BAA Check Fix

**File:** `apps/api/src/workers/ai-insights-worker.ts`

**Before:** `if (config.aiProvider !== 'ollama' && !config.anthropicBaaSigned) return;`
**After:** `if (config.aiProvider === 'anthropic' && !config.anthropicBaaSigned) return;`

Also fixed `cg.due_date` → `cg.identified_date` in the care gap query (same column mismatch found in Session 2).

##### Phase 6.7 — Silent Error Catch Replacement

Replaced 4 instances of `.catch(() => [])` with proper error logging:

| File | Change |
|------|--------|
| `routes/dashboard/index.ts` | `fastify.log.error({ err }, 'Dashboard: recent encounters query failed')` |
| `routes/measures/index.ts` | `fastify.log.error({ err, measureId: id }, 'Measures: population stats query failed')` |
| `services/measureEngine.ts` (×2) | `console.error('[measure-engine] dim_measure lookup failed: ...')` and `console.error('[measure-engine] dim_date lookup failed: ...')` |

All instances now log the error while still returning graceful fallback values to avoid breaking the response.

##### Phase 6.8 — JWT Refresh Token Rotation with Replay Detection

**File:** `apps/api/src/routes/auth/index.ts`

The existing refresh endpoint already had basic rotation (revoke old token, issue new pair). Added **replay detection** as a security enhancement:

**How it works:**
1. When a refresh token is used, it gets revoked and a new pair is issued (existing behavior)
2. If a **revoked** token is reused (indicating potential token theft), **all** refresh tokens for that user are revoked
3. Returns `TOKEN_REUSE` error code with message "Token reuse detected. All sessions have been revoked."
4. Logs a `WARN` with the affected `userId`

**New error codes:**
- `TOKEN_REUSE` — Revoked token replayed; all user sessions killed
- `TOKEN_EXPIRED` — Token past expiry (previously lumped into generic `INVALID_TOKEN`)

**Verified end-to-end:**
```
Login → RT1 issued
Refresh(RT1) → RT1 revoked, RT2 issued
Replay(RT1) → TOKEN_REUSE, ALL tokens revoked
Use(RT2) → TOKEN_REUSE (also revoked by replay detection)
```

#### Build Verification

All 4 packages build cleanly after Phase 6 changes:
```
@medgnosis/shared:build  — cache hit
@medgnosis/db:build      — pass (bcrypt types)
@medgnosis/web:build     — cache hit (374KB gzip)
@medgnosis/api:build     — pass (bcrypt, measureEngine, replay detection)
Total: 4 successful, 2.4s
```

#### Key Learnings

1. **Zustand `persist` + `partialize` trap**: If `partialize` excludes a field from persistence but the store initializes it to a blocking value (like `isLoading: true`), rehydration will never override it. Use `onRehydrateStorage` to reset transient state after rehydration completes.

2. **OOM from temp files**: Large database dumps left in `/tmp` compete with PostgreSQL shared buffers for RAM. A 31GB dump + 40GB PG cache on a 64GB machine leaves no room for the OS or Node processes. Delete temp files as soon as they're no longer needed.

3. **CHECK constraints as documentation**: PostgreSQL CHECK constraints on columns like `alert_type`, `insight_type`, and `band` serve as enforced documentation of valid values. Always verify against the migration DDL before inserting test data — schema introspection catches mismatches that TypeScript types don't.

4. **Refresh token replay detection pattern**: The standard rotation flow (revoke-on-use) only prevents reuse of consumed tokens. To detect theft, check if a revoked token is presented — if so, the attacker is replaying a stolen token while the legitimate user already consumed it. Revoking all tokens for the user forces re-authentication everywhere.

5. **`sql.unsafe()` for trusted SQL files**: The `postgres` library's tagged templates prevent SQL injection but don't support multi-statement SQL. For trusted internal SQL files (eCQM definitions with CTEs), `sql.unsafe(fileContents)` executes them as-is. This is safe because the SQL files are part of the codebase, not user input.

6. **FHIR search parameters vs nested routes**: FHIR R4 uses search parameters (`/Condition?patient=123`) rather than nested REST routes (`/Patient/123/Condition`). This is a common gotcha when testing FHIR endpoints manually.

7. **OMOP vocabulary mapping is an approximation**: A full OMOP ETL requires the ATHENA vocabulary download (2GB+). For MVP, static lookup maps covering the most common SNOMED/LOINC codes (top ~20 each) with fallback to `concept_id = 0` is a pragmatic compromise. The maps can be extended incrementally as needed.

9. **Port coexistence with MindLog**: When running alongside MindLog (which uses standard ports 3000/5173), Medgnosis must use alternate ports. This affects `.env`, `.env.example`, `vite.config.ts`, and the `CORS_ORIGIN` setting.

---

### Session 4 — Production Deployment (Feb 25, 2026)

#### Overview

Deployed Medgnosis to `https://medgnosis.acumenus.net` as a production virtual host on the same machine running MindLog. The deployment follows MindLog's proven pattern: Apache reverse proxy with Let's Encrypt SSL, systemd services for the API + worker, and an auto-deploy daemon that watches for source code changes and automatically rebuilds/restarts every 60 seconds.

#### Completed Work

##### Infrastructure Analysis

Explored the existing production infrastructure to understand the deployment pattern:
- **Apache 2.4** with mod_proxy, mod_ssl, mod_proxy_wstunnel, mod_rewrite, mod_headers
- **MindLog** already deployed at `mindlog.acumenus.net` using 3 systemd services (API on port 3080, worker, auto-deploy)
- **Let's Encrypt** SSL via Certbot with auto-renewal for existing sites
- **Node.js v22.22.0**, **PostgreSQL 17**, **Redis 7** all running natively

##### Production Environment — `.env.production`

Created production environment config with key differences from development:

| Variable | Dev Value | Production Value |
|----------|-----------|-----------------|
| `API_PORT` | 3002 | 3081 |
| `API_HOST` | 0.0.0.0 | 127.0.0.1 (internal only) |
| `NODE_ENV` | development | production |
| `CORS_ORIGIN` | http://localhost:5175 | https://medgnosis.acumenus.net |
| `WEB_APP_URL` | http://localhost:5175 | https://medgnosis.acumenus.net |
| `JWT_SECRET` | dev placeholder | Cryptographically random 48-byte base64 string |

Port 3081 chosen to coexist alongside MindLog's production API on port 3080.

##### Systemd Services (3 units)

| Service | File | Purpose | Binding |
|---------|------|---------|---------|
| `medgnosis-api` | `scripts/medgnosis-api.service` | Fastify API server | 127.0.0.1:3081 |
| `medgnosis-worker` | `scripts/medgnosis-worker.service` | BullMQ background worker | N/A |
| `medgnosis-auto-deploy` | `scripts/medgnosis-auto-deploy.service` | File watcher + auto-rebuild | N/A |

All services include security hardening: `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths` scoped to repo directory.

##### Apache Virtual Host Configuration

Two config files mirroring MindLog's pattern:

**HTTP** (`medgnosis.acumenus.net.conf`): Redirects all traffic to HTTPS via 301.

**HTTPS** (`medgnosis.acumenus.net-le-ssl.conf`):
- `DocumentRoot` → `/home/smudoshi/Github/Medgnosis/apps/web/dist` (Vite production build)
- `FallbackResource /index.html` for SPA client-side routing
- Reverse proxy: `/api/*` → `http://127.0.0.1:3081/api/`
- WebSocket proxy: `/api/v1/ws` → `ws://127.0.0.1:3081/api/v1/ws` (via mod_rewrite + mod_proxy_wstunnel)
- Health endpoint: `/health` → `http://127.0.0.1:3081/health`
- Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- SSL via Let's Encrypt (auto-renewed by Certbot)

##### Deployment Scripts

| Script | Purpose |
|--------|---------|
| `scripts/deploy-production.sh` | Manual deploy: `npm run build` → restart services → health check |
| `scripts/auto-deploy.sh` | Auto-deploy daemon: polls source files every 60s, rebuilds on change |
| `scripts/setup-production.sh` | One-time setup: installs systemd units + Apache vhost + SSL cert |

##### Build Fix

Fixed unused `ChevronRight` import in `apps/web/src/pages/CareListsPage.tsx` that blocked the production build (TS6133 error).

##### Verification

All three services running and healthy:
```
medgnosis-api:         active
medgnosis-worker:      active
medgnosis-auto-deploy: active

Health: {"status":"healthy","version":"1.0.0","services":{"database":"up"}}
Site:   https://medgnosis.acumenus.net
```

#### Files Created

| File | Description |
|------|-------------|
| `.env.production` | Production environment config (port 3081, production JWT secret, CORS for HTTPS domain) |
| `scripts/deploy-production.sh` | Manual deploy script: build → restart → verify |
| `scripts/auto-deploy.sh` | Auto-deploy daemon: watch source → rebuild → restart (60s interval) |
| `scripts/setup-production.sh` | One-time setup: systemd + Apache + SSL |
| `scripts/medgnosis-api.service` | systemd unit: Fastify API on 127.0.0.1:3081 |
| `scripts/medgnosis-worker.service` | systemd unit: BullMQ worker |
| `scripts/medgnosis-auto-deploy.service` | systemd unit: auto-deploy daemon (runs as root for systemctl) |
| `scripts/medgnosis.acumenus.net.conf` | Apache HTTP vhost: redirect to HTTPS |
| `scripts/medgnosis.acumenus.net-le-ssl.conf` | Apache HTTPS vhost: SSL + reverse proxy + SPA + security headers |

#### Key Learnings

1. **Apache over nginx for consistency**: Since MindLog already uses Apache with a proven reverse proxy + SSL + WebSocket pattern, replicating it for Medgnosis was straightforward. The same Apache modules (proxy, proxy_http, proxy_wstunnel, ssl, rewrite, headers) serve both apps.

2. **systemd over PM2**: Native systemd services provide better OS integration than PM2 — journal logging, dependency ordering (After=postgresql), security sandboxing (NoNewPrivileges, ProtectSystem), and automatic restart. No extra process manager to install.

3. **Auto-deploy via file watching**: The `auto-deploy.sh` daemon uses `find -newer` against a hash file to detect source changes. This is simpler than git hooks or CI/CD for a single-machine deployment. The 60-second polling interval provides near-instant deploys with negligible CPU cost.

4. **Production API binds to 127.0.0.1**: Unlike dev mode (0.0.0.0), production binds to localhost only. Apache handles all public traffic and proxies to the internal port. This prevents direct access to the Node.js server bypassing SSL and security headers.

5. **Port allocation strategy**: MindLog production uses 3080, Medgnosis uses 3081. Development uses separate ports (3002/5175). This allows dev servers and production services to coexist on the same machine without conflicts.

---

### Session 5 — Core Clinical Workspace (Phase 10) (Feb 25, 2026)

#### Overview

Transformed Medgnosis from a population health analytics dashboard into a clinical workspace. Built 6 modules across 2 sessions (context continuation): tabbed patient chart, clinician dashboard, flowsheets, lab trending, and condition-based care gap bundles with deduplication.

#### Completed Work

##### Module 10.2: Patient Summary Chart

Rewrote `PatientDetailPage.tsx` from a 687-line flat layout to a tabbed clinical chart with `PatientBanner`, `TabBar`, and 7 tab components. Each clinical tab is a self-contained component that fetches its own sub-resource data.

##### Module 10.4 + 10.5: Flowsheets & Lab Trending

Built `FlowsheetGrid` (dense LOINC-categorized observation table), `ObservationTrendChart` (Recharts time-series with reference ranges), and `LabsVitalsTab` (list/flowsheet toggle with click-to-trend). Backend: two new endpoints for flowsheet data and observation trending.

##### Module 10.1: Clinician Morning View

Enhanced dashboard backend with 3 new parallel queries (today's encounters, urgent alerts, critical count). Rewrote `DashboardPage.tsx` with morning greeting, 3-column clinician row (schedule, alerts, Abigail AI placeholder), quick stats, and collapsible population health section.

##### Module 10.6: Care Gap Bundles (5-step implementation)

Incorporated `docs/Medgnosis_CareGap_Bundles.xlsx` — a clinical reference defining 15 chronic conditions with 106 evidence-based quality measures and 16 cross-condition deduplication rules.

**Step 1 — Database migrations:**
- `006_care_gap_bundles.sql`: 3 new tables + ALTER care_gap
- `007_seed_bundles_v1.sql`: Seed 15 bundles, 106 measures, 16 overlap rules
- Verified: 15 condition_bundles, 151 measure_definitions (106 new + 45 pre-existing), 106 bundle_measures, 16 overlap rules

**Step 2 — Shared types + schemas:**
- Created `packages/shared/src/types/bundle.ts` (10 interfaces/types)
- Extended `careGapUpdateSchema` with 8 new status values

**Step 3 — Backend API:**
- Created `apps/api/src/routes/bundles/index.ts` (3 endpoints)
- Added `GET /patients/:id/care-bundle` composition endpoint to patients route
- Registered `/bundles` prefix in route registry
- Added 3 React Query hooks (`usePatientCareBundle`, `useConditionBundles`, `useConditionBundle`)

**Step 4 — Frontend rewrite:**
- Rewrote `CareGapsTab.tsx` from flat open/closed list to bundle-grouped view
- Components: `ComplianceRing`, `BundleAccordion`, `MeasureRow`, overlap summary
- Status badge color mapping per Clinical Obsidian v2

**Step 5 — Integration:**
- Updated `PatientDetailPage.tsx` to pass `patientId` to self-fetching CareGapsTab
- Replaced flat care gap list in `OverviewTab.tsx` with bundle compliance progress bars

#### Files Created (6 files)

| File | Description |
|------|-------------|
| `packages/db/migrations/006_care_gap_bundles.sql` | DDL: condition_bundle, bundle_measure, bundle_overlap_rule tables + ALTER care_gap |
| `packages/db/migrations/007_seed_bundles_v1.sql` | Seed: 15 bundles, 106 measures, 16 overlap rules |
| `packages/shared/src/types/bundle.ts` | TypeScript interfaces for all bundle-related types |
| `apps/api/src/routes/bundles/index.ts` | Bundle CRUD API: list, detail, overlap rules |
| `apps/web/src/components/patient/PatientBanner.tsx` | Sticky patient header with demographics/PCP/insurance/allergies |
| `apps/web/src/components/patient/TabBar.tsx` | Tab navigation with badge counts |

#### Files Modified (10 files)

| File | Changes |
|------|---------|
| `apps/web/src/pages/PatientDetailPage.tsx` | Rewritten: flat layout → tabbed clinical chart |
| `apps/web/src/pages/DashboardPage.tsx` | Rewritten: analytics dashboard → clinician morning view |
| `apps/api/src/routes/dashboard/index.ts` | Added clinician queries (encounters, alerts, Abby placeholder) |
| `apps/api/src/routes/patients/index.ts` | Added `GET /:id/care-bundle` composition endpoint |
| `apps/api/src/routes/index.ts` | Registered `/bundles` route prefix |
| `apps/web/src/hooks/useApi.ts` | Added 3 bundle hooks |
| `apps/web/src/components/patient/CareGapsTab.tsx` | Rewritten: flat gaps → bundle-grouped view with dedup |
| `apps/web/src/components/patient/OverviewTab.tsx` | Replaced care gap list with bundle compliance bars |
| `packages/shared/src/index.ts` | Added bundle type exports |
| `packages/shared/src/schemas/index.ts` | Extended careGapUpdateSchema with bundle statuses |

#### Key Design Decisions

1. **Bundle schema designed for bulk extension**: The seed migration uses a repeatable CTE pattern per bundle — adding 30 more bundles is copy-paste. `icd10_pattern` uses comma-separated LIKE patterns for flexible ICD-10 matching without a range table.

2. **Overlap deduplication at API layer**: Rules stored as CSV bundle codes in `applicable_bundles` for simple bulk loading. The `/care-bundle` endpoint splits and applies rules at runtime — only when a patient has 2+ applicable bundles for a given rule.

3. **Self-fetching tab components**: CareGapsTab and OverviewTab fetch their own bundle data via `usePatientCareBundle` React Query hook, rather than receiving pre-fetched data as props. This keeps the parent page clean and enables independent cache invalidation.

4. **Backward compatibility**: All new `care_gap` columns (bundle_id, due_date, gap_priority) are nullable. Legacy 'open'/'closed' statuses remain valid alongside new bundle statuses.

---

### Session 6 — Bundles 16-45 + Encounter Note AI Scribe (Feb 25, 2026)

#### Overview

Extended care gap bundles from 15 to 45 conditions (bulk SQL generation from spreadsheets), then built the clinical encounter note system with AI-powered SOAP generation via Ollama. Phase 10 is now complete.

#### Completed Work

##### Phase 10.6b-d: Care Gap Bundles 16-45

Used Python/openpyxl to programmatically generate two seed migrations from `docs/Medgnosis_CareGap_Bundles_16-30.xlsx` and `docs/Medgnosis_CareGap_Bundles_31-45.xlsx`. Each migration follows the same `DO $` block pattern as `007_seed_bundles_v1.sql`.

- `008_seed_bundles_v2.sql` — 15 bundles (ALZ through GAD), 118 measures, 18 overlap rule updates + 7 new rules
- `009_seed_bundles_v3.sql` — 15 bundles (T1D through WND), 130 measures, 18 overlap rule updates + 7 new rules
- Fixed stray "Post-Traumatic Stress Disorder" header parsed as measure code (bundle_prefix validation)
- Fixed Unicode smart quotes (U+2018/2019) not caught by SQL escaping
- Verified: 45 bundles, 354 bundle_measures, 399 measure_definitions, 30 overlap rules — all `bundle_size` counts match

##### Module 10.3: Encounter Note with AI Scribe

Built the full encounter note system from database to UI:

1. **Migration 012**: `clinical_note` table with UUID PK, SOAP columns, AI provenance JSONB, status workflow
2. **Shared types**: `ClinicalNote`, `ScribeRequest/Response`, Zod schemas for create/update/scribe
3. **Backend**: 8 API endpoints — CRUD + finalize/amend + AI scribe (gathers patient context, calls `generateCompletion()` with `jsonMode: true`)
4. **Frontend**: `EncounterNotePage` with 4 independent TipTap SOAP editors, per-section and "Scribe All" AI buttons, auto-save, finalize dialog

#### Files Created (7 files)

| File | Description |
|------|-------------|
| `packages/db/migrations/008_seed_bundles_v2.sql` | Seed: bundles 16-30 (15 bundles, 118 measures) |
| `packages/db/migrations/009_seed_bundles_v3.sql` | Seed: bundles 31-45 (15 bundles, 130 measures) |
| `packages/db/migrations/012_clinical_notes.sql` | DDL: clinical_note table + indexes |
| `packages/shared/src/types/encounter-note.ts` | Encounter note TypeScript types |
| `apps/api/src/routes/clinical-notes/index.ts` | CRUD + AI Scribe API routes (8 endpoints) |
| `apps/web/src/pages/EncounterNotePage.tsx` | Full encounter note page with SOAP editors |
| `apps/web/src/components/encounter/SOAPSectionEditor.tsx` | TipTap editor per SOAP section with AI button |

#### Files Modified (7 files)

| File | Changes |
|------|---------|
| `packages/shared/src/index.ts` | Added encounter-note type + schema exports |
| `packages/shared/src/schemas/index.ts` | Added clinical note + scribe Zod schemas |
| `apps/api/src/routes/index.ts` | Registered `/clinical-notes` route prefix |
| `apps/api/src/routes/patients/index.ts` | Added `GET /:id/notes` endpoint |
| `apps/web/src/App.tsx` | Added `/patients/:patientId/encounter-note` route |
| `apps/web/src/hooks/useApi.ts` | Added 5 clinical note hooks |
| `apps/web/src/pages/AppShell.tsx` | Removed unused `Wifi` import (pre-existing TS error) |

#### Key Design Decisions

1. **AI Scribe gathers real patient context**: The `/clinical-notes/scribe` endpoint queries 6 DB tables in parallel (conditions, meds, vitals, allergies, care gaps, encounters) to build a context-rich clinical prompt, not just generate from the chief complaint alone.

2. **Per-section and bulk AI generation**: Each SOAP section has its own AI button for targeted generation, plus a "Scribe All" button for full-note generation. Existing content from other sections is passed as context.

3. **AI provenance tracking**: The `ai_generated` JSONB column records which sections were AI-generated, the model used, and when — supporting audit trails and clinician review workflows.

4. **Status workflow protection**: Only drafts can be edited or deleted. Finalized notes are immutable except through the amend flow (requires a reason). This matches clinical documentation standards.

### Session 7 — Patient-Context Abby Chat (Feb 26, 2026)

#### Overview

Built a full patient-context AI clinical assistant ("Abby Chat") powered by Ollama/MedGemma, integrated as a new tab in the patient chart. Clinicians can now have multi-turn conversations about a specific patient with full EHR context (conditions, medications, vitals, allergies, care gaps, encounters) automatically injected into the LLM system prompt. Also fixed a pre-existing Dashboard chat bug and extracted shared infrastructure.

#### Completed Work

##### Patient Context Service (Backend Refactor)

Extracted the 6-table parallel SQL query pattern from the AI Scribe endpoint into a shared `patientContext.ts` service. Both the scribe (`POST /clinical-notes/scribe`) and chat (`POST /insights/chat`) endpoints now use the same `getPatientClinicalContext()` function, eliminating ~100 lines of code duplication.

##### Enhanced Chat Endpoint

Rewrote `POST /insights/chat` to accept an optional `patient_id`. When provided:
- Verifies the patient exists in `phm_edw.patient`
- Fetches full clinical context via the shared helper
- Builds an enriched system prompt with the patient's conditions, meds, vitals, allergies, care gaps, and recent encounters
- Returns `context_summary` for UI display
- Caps history at 16 turns for gemma:7b token budget (4K context)
- Added `aiGateMiddleware` for AI consent gating

##### AbbyTab (Frontend)

Full chat tab component (~300 lines) in the PatientDetailPage tab system:
- Violet top-border + Sparkles icon branding (Abby's visual identity)
- Initial chart review: on mount, sends an intro request that returns both a welcome message and the clinical context summary
- Collapsible context panel showing the patient's raw EHR summary
- Quick-action suggestion chips: "Summarize care gaps", "Drug interaction check", "Quality measures", "Risk assessment"
- Multi-turn conversation with full history sent per request
- Auto-scroll, thinking spinner, clinical decision support disclaimer

##### Bug Fixes

- Dashboard `AbbyChat` was reading `data.reply` but API returns `data.response` — never worked before this fix
- `useAiChat` hook was sending hardcoded `provider: 'ollama'` and not accepting `history` parameter

#### Files Created (2 files)

| File | Description |
|------|-------------|
| `apps/api/src/services/patientContext.ts` | Shared patient context fetcher (6 parallel SQL queries + formatting) |
| `apps/web/src/components/patient/AbbyTab.tsx` | Full Abby AI chat tab for PatientDetailPage |

#### Files Modified (5 files)

| File | Changes |
|------|---------|
| `apps/api/src/routes/insights/index.ts` | Added patient_id handling, context injection, enriched system prompt, aiGateMiddleware |
| `apps/api/src/routes/clinical-notes/index.ts` | Refactored scribe to use shared `getPatientClinicalContext()` |
| `apps/web/src/pages/PatientDetailPage.tsx` | Added 'abby' tab (8th tab, Sparkles icon via Tab interface) |
| `apps/web/src/pages/DashboardPage.tsx` | Fixed `data.reply` → `data.response` bug |
| `apps/web/src/hooks/useApi.ts` | Enhanced `useAiChat` with `history` param, removed hardcoded provider |

#### Key Design Decisions

1. **Shared patient context helper**: The same 6-query pattern is used by both AI Scribe and Abby Chat, so extracting it prevents drift and ensures consistency.

2. **Token budget management**: gemma:7b has a 4K context window. System prompt (~150 tokens) + patient context (~500 tokens) + history (capped at 16 turns, ~1500 tokens) + response (768 tokens) = ~2918 tokens. Fits comfortably.

3. **No conversation persistence**: Messages are stored in React component state. Switching tabs resets the conversation. Acceptable for v1 — persistence would add DB complexity without clear clinical value.

---

### Session 8 — Demo Environment ETL Complete (Feb 26, 2026)

#### Overview

Fixed all 8+ errors in migration `014_etl_steps_16_27.sql` to fully populate the PHM star schema. The demo environment for Dr. Sanjay Udoshi (provider_id = 2816) is now 100% operational with all EDW + star schema tables seeded and validated.

#### Final Star Schema Counts

| Table | Rows |
|-------|------|
| `dim_care_gap_bundle` | 45 bundles |
| `dim_payer` | 10 payers |
| `bridge_bundle_measure` | 354 bundle→measure links |
| `fact_patient_bundle` | 3,698 patient×bundle rows |
| `fact_patient_bundle_detail` | 26,967 detail rows |
| `fact_patient_composite` | 1,288 rows (1 per patient) |
| `fact_ai_risk_score` | 760 rows |
| `fact_population_snapshot` | 54 rows |
| `mv_population_by_condition` | 27 rows |
| `mv_provider_scorecard` | 1 row |
| `mv_patient_risk_tier` | 4 rows |

#### Bugs Fixed in Migration 014

1. **LATERAL after WHERE clause** (syntax error): Moved `LEFT JOIN LATERAL` for gap_stats before the WHERE clause. SQL requires JOINs before WHERE.
2. **Missing dim rows**: Added pre-steps 15, 15a, 15b to sync `measure_definition → dim_measure`, insert org 2738 and provider 2816 before star ETL runs.
3. **`diagnosis_status = 'ACTIVE'` filter**: Synthea data has NULL for this field. Removed all occurrences — 0 rows otherwise.
4. **`ON CONFLICT (patient_key, bundle_key)`**: No unique constraint on that tuple in `fact_patient_bundle` (only serial PK). Changed to `ON CONFLICT DO NOTHING`.
5. **Interval→int cast**: `(CURRENT_DATE - cg.identified_date)::INT` fails when `identified_date` is TIMESTAMP. Fixed: `(CURRENT_DATE - cg.identified_date::DATE)::INT`.
6. **SDOH columns** (`sa.domain`, `sa.risk_level`): Changed to `sa.food_insecurity_ind = 'Y'`, `sa.transportation_ind = 'Y'`, `sa.housing_status IN (...)`.
7. **`patient_risk_history` columns**: `calculated_at` → `computed_at`, `risk_score` → `score` (integer 0–100, not float 0.0–1.0). Fixed thresholds to `>= 80/60/30`.
8. **`etl_log` columns**: `step_name/status/rows_affected` → `source_system/load_status/rows_inserted`.
9. **`bridge_bundle_measure.frequency` truncation**: Source values up to 63 chars. Fixed with `LEFT(bm.frequency, 50)`.
10. **Performance**: Rewrote Steps 20 and 22 from LATERAL-per-row to set-based CTEs (BOOL_OR + UNION ALL pattern). Reduced runtime from timeout to ~30 seconds.
11. **Gap status case**: Source data uses lowercase `'open'/'closed'/'excluded'`; fixed all references.

#### Validation Results (migration 023)

- V1: 1,288 patients ✓ — V2: Provider + org ✓ — V3: 4,414 clinical records ✓
- V4: 26,967 care gaps (65% open, 25% closed, 10% excluded) ✓
- V6: 15 today appointments ✓ — V10: 192 AI insights, 50 priority queue ✓
- V11: 600 billing claims, 400 e-Rx, 40 care plans ✓ — V12: 5 cancer patients ✓
- V15: All star schema tables populated ✓ — V16: All materialized views refreshed ✓

4. **Context summary returned on first call**: The API returns a `context_summary` field so the frontend can display the raw clinical data the AI is working with, providing transparency into what the model "sees."

---

### Session 9 — Star Schema v2 Consolidation + Phase D Verification (Feb 26, 2026)

#### Overview

Resolved critical migration conflict: two parallel tracks of star schema migrations (Track A: 010/011/013_star, Track B: 013_enhancement/014_etl) had overlapping table definitions with incompatible column schemas. Consolidated into a single coherent migration path, registered 17 previously-applied migrations, and applied new `024_star_v2_enhancements.sql` to add the missing pieces. Completed Phase D verification.

#### Problem

| Item | Track A (010_star_schema_v2) | Track B (013_star_schema_enhancement) |
|------|------------------------------|---------------------------------------|
| dim_payer | effective_start_date, no payer_code | payer_code, is_government, effective_start |
| dim_allergy | allergy_id, allergy_name only | + allergy_code, code_system, category |
| fact_patient_bundle_detail | days_since_last_action | days_overdue |
| Materialized views | 4 views (dashboard, compliance, population, worklist) | 3 different views (condition, scorecard, risk_tier) |

Running both tracks in lexicographic order would fail: `010_star` creates tables without `IF NOT EXISTS`, `013_star` gets silently skipped, then `014_etl` references Track B columns that don't exist.

#### Resolution

1. **Archived** Track A files (010_star_schema_v2, 011_seed_star_bundles, 013_etl_star_v2) to `_archive/`
2. **Enhanced** 013_star_schema_enhancement.sql with Track A's unique pieces (ALTER dim_measure, ALTER fact_care_gap, fact_immunization/insurance/sdoh, 4 additional mat views, performance indexes)
3. **Registered** 17 already-applied migrations in `_migrations` (010–023 were executed directly to the DB in previous sessions but never tracked)
4. **Created** `024_star_v2_enhancements.sql` — applies only the delta: 7 new dim_measure columns, 4 new fact_care_gap columns + FKs, 3 new fact tables, 25+ performance indexes, 4 new materialized views
5. **Updated** `refresh_star_views.sql` to include all 7 materialized views

#### Phase D Verification Results

| Check | Result |
|-------|--------|
| D1: DDL errors | None — all 25 migrations clean |
| D2: dim_care_gap_bundle rows | 45 bundles ✓ |
| D3: bridge_bundle_measure rows | 354 links ✓ |
| D4: fact_patient_composite rows | 1,288 ✓ |
| D5: 7 materialized views | All present with data ✓ |
| D6: FK integrity | 0 orphaned bundle_keys, 0 orphaned patient_keys ✓ |
| D7: Dashboard query (risk_tier filter) | 0.191ms (index-only scan) ✓ |
| D7: Composite query (Critical risk) | 0.085ms (index scan) ✓ |
| D8: Build verification | All 4 packages clean ✓ |

#### Materialized View Row Counts

| View | Rows |
|------|------|
| mv_patient_dashboard | 1,288 |
| mv_bundle_compliance_by_provider | 27 |
| mv_population_overview | 54 |
| mv_care_gap_worklist | 0 (no open non-deduped gaps) |
| mv_population_by_condition | 27 |
| mv_provider_scorecard | 1 |
| mv_patient_risk_tier | 4 |

#### Files Changed

| Action | File |
|--------|------|
| Archived | `packages/db/migrations/010_star_schema_v2.sql` → `_archive/` |
| Archived | `packages/db/migrations/011_seed_star_bundles.sql` → `_archive/` |
| Archived | `packages/db/migrations/013_etl_star_v2.sql` → `_archive/` |
| Enhanced | `packages/db/migrations/013_star_schema_enhancement.sql` (consolidated) |
| Created | `packages/db/migrations/024_star_v2_enhancements.sql` |
| Updated | `packages/db/scripts/refresh_star_views.sql` (7 mat views) |

---

### Session 10 — Tier 2: Wire Real Data to Frontend (Feb 26, 2026)

#### Overview

Wired Dashboard and Settings pages to live data. Dashboard now displays real risk stratification, care gap priority breakdown, encounter counts, and high-risk patient statistics from the star schema. Settings profile save persists to the database, and notification/data toggles are stored as user preferences via a new JSONB column.

#### Dashboard API Enhancements

Replaced 3 placeholder queries in `GET /dashboard` with real data:

| Metric | Before | After |
|--------|--------|-------|
| Risk Stratification | `Promise.resolve([])` | `fact_patient_composite` GROUP BY `risk_tier` |
| Care Gap Priority | `{ high: 0, medium: 0, low: 0 }` | `phm_edw.care_gap` GROUP BY priority |
| Encounter Count | `{ value: 0, trend: 0 }` | COUNT encounters in last 30 days |
| High Risk Stats | `{ high_risk_count: 0, high_risk_percentage: 0 }` | Derived from risk distribution |

#### Settings API + Persistence

- **`PATCH /auth/me`**: Dynamic SET clause (only provided fields), parameterized queries, audit log
- **`GET /auth/me/preferences`**: Returns `app_users.preferences` JSONB column
- **`PATCH /auth/me/preferences`**: Shallow merge via `||` operator
- **Migration 025**: `ALTER TABLE app_users ADD COLUMN preferences JSONB DEFAULT '{}'`
- Frontend: profile save updates auth store; notification/data toggles debounced (400ms) persist

#### Files Changed

| Action | File |
|--------|------|
| Modified | `apps/api/src/routes/dashboard/index.ts` — 3 new queries, risk_score derived |
| Modified | `apps/api/src/routes/auth/index.ts` — PATCH /me + GET/PATCH /me/preferences |
| Modified | `apps/web/src/hooks/useApi.ts` — useUpdateProfile, useUserPreferences, useSavePreferences |
| Modified | `apps/web/src/pages/SettingsPage.tsx` — wired profile save + preference persistence |
| Created | `packages/db/migrations/025_user_preferences.sql` |

---

### Session 11 — Tier 3: AI Morning Briefing + Auth + Settings (Feb 26, 2026)

#### Overview

Three high-impact features: AI-generated morning briefing for clinicians, server-side token revocation on logout, and live database statistics in Settings.

#### AI Morning Briefing

- **Endpoint:** `POST /insights/morning-briefing` in `apps/api/src/routes/insights/index.ts`
- Fetches top 5 high-risk patients from `phm_star.fact_patient_composite` (by `abigail_priority_score DESC`)
- Parallel queries for today's schedule count + critical alert count
- Builds clinician-personalized prompt with patient summaries
- Calls `generateCompletion()` (512 tokens, temperature 0.4)
- Returns structured response: `{ briefing, generated_at, high_risk_count, schedule_count, critical_alerts }`
- Dashboard `abby_briefing.enabled` changed from `false` to `true`
- Frontend: `useMorningBriefing()` hook (staleTime 30min, retry false), briefing replaces Abby widget greeting

#### Auth Token Revocation Fix

- **Bug:** AppShell logout only called `clearAuth()` (local state) — never told the server to revoke tokens
- **Fix:** `handleLogout()` now calls `POST /auth/logout` before clearing local state
- Settings SecuritySection "Sign out all devices" button wired to same endpoint with loading state
- 2FA button disabled with "coming soon" note

#### Settings Database Overview

- **Endpoint:** `GET /auth/me/db-overview` returns live COUNT(*) from patient, encounter, procedure, care_gap
- `DbOverviewPanel` component replaces hardcoded "~1M records" strings with real data
- `useDbOverview()` hook with 5-minute staleTime

#### Files Changed

| Action | File |
|--------|------|
| Modified | `apps/api/src/routes/insights/index.ts` — POST /insights/morning-briefing |
| Modified | `apps/api/src/routes/dashboard/index.ts` — abby_briefing.enabled = true |
| Modified | `apps/api/src/routes/auth/index.ts` — GET /auth/me/db-overview |
| Modified | `apps/web/src/hooks/useApi.ts` — useMorningBriefing, useDbOverview |
| Modified | `apps/web/src/pages/DashboardPage.tsx` — morning briefing auto-fetch |
| Modified | `apps/web/src/pages/SettingsPage.tsx` — SecuritySection wired, DbOverviewPanel |
| Modified | `apps/web/src/components/AppShell.tsx` — logout calls POST /auth/logout |

### Session 12 — Tier 4: Schedule Config + Care Gap Enhancements (Feb 26, 2026)

#### Overview

Provider schedule management in Settings + comprehensive care gap workflow enhancements (bug fixes, search, priority, filtering).

#### Schedule Config (Settings)

- **Endpoints:** `GET /auth/me/schedule` + `PATCH /auth/me/schedule` in `apps/api/src/routes/auth/index.ts`
- Provider resolved via `app_users.org_id` → `provider.org_id` → `provider_id` lookup chain
- GET returns weekly schedule (from `provider_schedule`) + clinic resources (from `clinic_resource`)
- PATCH accepts array of slot updates, uses `sql.unsafe()` dynamic SET pattern (same as PATCH /auth/me)
- **ScheduleSection rewrite:** 3 panels — Weekly Clinic Hours (editable time inputs per slot, schedule_type dropdowns with colored badges, Save button), Automated Tasks (ETL/reports dropdowns persisted via preferences), Clinic Resources (read-only list with type badges)
- Hooks: `useProviderSchedule()` + `useSaveProviderSchedule()`

#### Care Gap Enhancements

- **Dashboard bug fix:** `priority` → `gap_priority` column name (query was silently failing via `.catch()`)
- **Zod schema fix:** Added `'resolved'` to `careGapUpdateSchema` (frontend sent 'resolved' but schema rejected it)
- **Migration 026:** Backfill `gap_priority` (15% high, 35% medium, 50% low) + `due_date` for open care gaps
- **API search:** Server-side ILIKE search on patient name + measure name (was ignored despite frontend sending `search` param)
- **Priority filter:** `AND cg.gap_priority = ${query.priority}` in both data + count queries
- **Status mismatch fix:** `'resolved'` mapped to `'closed'` in DB, `resolved_date` set for both
- **Notes persistence:** PATCH now writes `notes` → `comments` column via `COALESCE(${notes}, comments)`
- **Response enrichment:** Added `gap_priority AS priority` + `due_date` to GET response
- **Priority-first ordering:** `CASE gap_priority WHEN 'high' THEN 0 ... END, due_date ASC NULLS LAST`
- **CareListsPage UI:** Priority column (crimson/amber/emerald badges), Due Date column, priority filter button group, updated table header + skeleton layout

#### Files Changed

| Action | File |
|--------|------|
| Modified | `apps/api/src/routes/dashboard/index.ts` — priority → gap_priority |
| Modified | `packages/shared/src/schemas/index.ts` — added 'resolved' to enum |
| Created | `packages/db/migrations/026_backfill_care_gap_priority.sql` |
| Modified | `apps/api/src/routes/care-gaps/index.ts` — search, priority, notes, status fix |
| Modified | `apps/api/src/routes/auth/index.ts` — GET + PATCH /auth/me/schedule |
| Modified | `apps/web/src/hooks/useApi.ts` — useProviderSchedule, useSaveProviderSchedule |
| Modified | `apps/web/src/pages/SettingsPage.tsx` — ScheduleSection rewrite |
| Modified | `apps/web/src/pages/CareListsPage.tsx` — priority, due_date, filter |

### Session 13 — Tier 5: Dashboard Trends (Feb 26, 2026)

#### Overview

Replace hardcoded `trend: 0` values on the dashboard with real month-over-month trend calculations.

#### Dashboard Trends

- **Trend query:** Added 10th parallel query to `GET /dashboard` with 6 subqueries comparing 30-day rolling windows:
  - Patient registrations: `created_date` in last 30d vs previous 30d
  - Encounters: `encounter_datetime` in last 30d vs previous 30d
  - Care gap net change: `gaps_opened_30d` + `gaps_closed_30d` → approximate prior open count
- **`calcTrend()` helper:** `((current - prior) / prior) * 100`, rounded, handles zero-division (returns 100 if prior=0 and current>0, else 0)
- **Care gap approximation:** `prior_open ≈ current_open + closed_in_30d - opened_in_30d`, clamped to `Math.max(0)`
- **Wired into response:** `total_patients.trend`, `care_gaps.trend`, `encounters.trend` now return computed percentages
- **`risk_score.trend`** remains 0 — no historical risk snapshots available for comparison
- **Zero frontend changes needed:** `TrendBadge` component already renders green ↑ / red ↓ arrows with percentages for non-zero values

#### Files Changed

| Action | File |
|--------|------|
| Modified | `apps/api/src/routes/dashboard/index.ts` — trend query + calcTrend helper + wired response |

---

## Bug Fix Log

| Date | Issue | Resolution | Files Changed |
|------|-------|------------|---------------|
| 2026-02-25 | `packages/db` build fails — unused `connection` param | Renamed to `_connection` | `packages/db/src/client.ts` |
| 2026-02-25 | `packages/db` build fails — `tx` tagged template not callable | Used `tx.unsafe(sql, params)` | `packages/db/src/migrate.ts` |
| 2026-02-25 | TS6306 project reference errors | Added `composite: true` to tsconfigs | `packages/shared/tsconfig.json`, `packages/db/tsconfig.json` |
| 2026-02-25 | DashboardPage 12+ type errors | Complete rewrite with local interface | `apps/web/src/pages/DashboardPage.tsx` |
| 2026-02-25 | React 19 `useRef()` type error | Added `undefined` argument | `apps/web/src/components/GlobalSearch.tsx` |
| 2026-02-25 | PostCSS config missing | Created `postcss.config.js` (ESM) | `apps/web/postcss.config.js` |
| 2026-02-25 | Fastify decorateRequest null type error | Changed to dummy async fn + per-request hook | `apps/api/src/plugins/audit.ts` |
| 2026-02-25 | Redis hard crash on connect failure | Added try/catch with graceful degradation | `apps/api/src/plugins/websocket.ts` |
| 2026-02-25 | Missing `optionalAuth` decorator | Added with try/catch jwtVerify | `apps/api/src/plugins/auth.ts` |
| 2026-02-25 | Rate limit allowList callback type | Used `FastifyRequest` type | `apps/api/src/app.ts` |
| 2026-02-25 | 23+ SQL column name mismatches | Fixed all queries to match actual DB schema | 10+ route/service files |
| 2026-02-25 | Migration 005 FK references wrong column | Changed `organization_id` to `org_id` | `packages/db/migrations/005_auth_alerts_system.sql` |
| 2026-02-25 | Turbo doesn't pass DATABASE_URL to workspaces | Added `passThroughEnv` to turbo.json | `turbo.json` |
| 2026-02-25 | Port conflict with MindLog | Changed to API:3002, Web:5175 | `.env`, `.env.example`, `vite.config.ts` |
| 2026-02-25 | Login page infinite spinner (Zustand isLoading) | Added `onRehydrateStorage` callback to persist config | `apps/web/src/stores/auth.ts` |
| 2026-02-25 | Measures 500 — `measure_description` undefined column | Changed to `md.description` | `apps/api/src/routes/measures/index.ts` |
| 2026-02-25 | Measures detail — `active_ind` filter on fact table | Removed non-existent column filter from `fact_measure_result` | `apps/api/src/routes/measures/index.ts` |
| 2026-02-25 | SHA256 password hashing (Phase 6.1) | Replaced with bcrypt cost 12 | `apps/api/src/routes/auth/index.ts` |
| 2026-02-25 | Seed scripts use plaintext passwords (Phase 6.2) | Updated to bcrypt hashing | `packages/db/src/seed.ts`, `migrations/005` |
| 2026-02-25 | Empty demo seeder (Phase 6.3) | Implemented full demo data seeder | `packages/db/src/seed-demo.ts` |
| 2026-02-25 | Measure calculator stubbed (Phase 6.4) | Wired to eCQM SQL engine | `services/measureEngine.ts`, `workers/measure-calculator.ts` |
| 2026-02-25 | OMOP concept IDs hardcoded to 0 (Phase 6.5) | Added SNOMED/LOINC/race/ethnicity lookups | `services/omopExport.ts` |
| 2026-02-25 | AI insights BAA blocks Ollama (Phase 6.6) | Only check BAA for `anthropic` provider | `workers/ai-insights-worker.ts` |
| 2026-02-25 | Silent `.catch(() => [])` (Phase 6.7) | Added `fastify.log.error`/`console.error` | 3 files (dashboard, measures, measureEngine) |
| 2026-02-25 | No refresh token replay detection (Phase 6.8) | Revoked token reuse revokes all user sessions | `apps/api/src/routes/auth/index.ts` |
| 2026-02-25 | Unused `ChevronRight` import blocks production build (TS6133) | Removed unused import | `apps/web/src/pages/CareListsPage.tsx` |
| 2026-02-25 | Unused `Wifi` import (TS6133) | Removed from lucide-react imports | `apps/web/src/components/AppShell.tsx` |
| 2026-02-25 | Unused `useMemo` import (TS6133) | Removed from React imports | `apps/web/src/pages/CareListsPage.tsx` |
| 2026-02-25 | `AbbyChat` function declaration flagged as unused (TS6133) | Converted to const arrow function | `apps/web/src/pages/DashboardPage.tsx` |
| 2026-02-25 | Unicode smart quotes (U+2019) in SQL seed data | Post-processing to replace with SQL-escaped ASCII | `008_seed_bundles_v2.sql`, `009_seed_bundles_v3.sql` |
| 2026-02-25 | Stray "Post-Traumatic Stress Disorder" parsed as measure code | Added bundle_prefix validation + numeric suffix check | Python SQL generator |
| 2026-02-25 | `app_users.id` is UUID, not INT — FK type mismatch in migration | Changed `author_user_id` from INT to UUID | `012_clinical_notes.sql` |
| 2026-02-25 | `sql` tagged template returns `Row[]` — explicit type annotations conflict | Used `Record<string, unknown>` casts in `.map()` callbacks | `clinical-notes/index.ts` |
| 2026-02-26 | Dashboard AbbyChat expects `data.reply` but API returns `data.response` | Changed `reply` → `response` in mutation handler | `DashboardPage.tsx` |
| 2026-02-26 | `useAiChat` sends hardcoded `provider: 'ollama'` and no history | Removed hardcoded provider, added `history` param | `useApi.ts` |
| 2026-02-26 | `ApiResponse<unknown>` can't cast directly to `Record<string, unknown>` | Cast through `unknown` first: `res as unknown as Record<string, unknown>` | `AbbyTab.tsx` |
| 2026-02-26 | PatientDetailPage tabs array type doesn't include `icon` field | Used `Tab & { id: TabId }` type from TabBar interface | `PatientDetailPage.tsx` |
| 2026-02-26 | Duplicate star schema migrations (010/013) with incompatible column schemas | Archived Track A, consolidated into Track B, created 024 delta migration | `013_star_schema_enhancement.sql`, `024_star_v2_enhancements.sql` |
| 2026-02-26 | `clinical_note.note_type` index fails — table already exists from 012 with `visit_type` | Registered 17 pre-applied migrations, created delta migration for remaining changes | `_migrations` table, `024_star_v2_enhancements.sql` |
| 2026-02-26 | Frontend logout never calls server — tokens remain valid | Added `api.post('/auth/logout')` before `clearAuth()` | `AppShell.tsx` |
| 2026-02-26 | `unknown[]` not assignable to `ParameterOrJSON<never>[]` in `sql.unsafe()` | Changed values array type to `string[]` | `auth/index.ts` |
| 2026-02-26 | `Record<string, unknown>` not assignable to `JSONValue` in `sql.json()` | Used `JSON.stringify(body)` + `::jsonb` cast instead | `auth/index.ts` |
| 2026-02-26 | React 19 `useRef()` requires initial argument (no zero-arg overload) | Added `undefined` as initial value | `SettingsPage.tsx` |
| 2026-02-26 | Dashboard care gap priority query references non-existent `priority` column | Changed `priority` → `gap_priority` (actual column name from migration 006) | `dashboard/index.ts` |
| 2026-02-26 | Frontend sends `status: 'resolved'` but Zod schema rejects it | Added `'resolved'` to `careGapUpdateSchema` enum | `schemas/index.ts` |
| 2026-02-26 | Care gaps API ignores `search` query param sent by frontend | Added ILIKE search on patient name + measure name to both data and count queries | `care-gaps/index.ts` |
| 2026-02-26 | `Partial<ScheduleSlot>` has `notes: string | null` — incompatible with mutation's `string | undefined` | Built explicit update object with null-to-undefined mapping | `SettingsPage.tsx` |

---

## Session 14 — Performance: Missing EDW Indexes + Query Optimizations (Feb 26, 2026)

### Root Cause Analysis

Profiled dashboard and patient detail pages with `EXPLAIN (ANALYZE, BUFFERS)`. Found zero `patient_id` indexes on every high-cardinality EDW table — causing full sequential scans on:

| Table | Rows | Measured query time |
|---|---|---|
| `observation` | 1.01 billion | **77–81 seconds** |
| `medication_order` | 72.6 million | several seconds |
| `condition_diagnosis` | 42.4 million | **426 ms** |
| `encounter` | 28.7 million | **3.6–4.7 seconds** |
| `patient_allergy` | 896K | hundreds of ms |

Dashboard also had a `::date` type cast on `encounter_datetime` that prevented index use even after indexing, and the care-gaps list ran its COUNT and data queries sequentially instead of in parallel.

### Changes Made

**Migration 027** (`packages/db/migrations/027_missing_edw_indexes.sql`):
- `idx_encounter_patient_datetime` — composite `(patient_id, encounter_datetime DESC) WHERE active_ind='Y'`
- `idx_encounter_datetime_active` — partial `(encounter_datetime DESC) WHERE active_ind='Y'` for dashboard ORDER BY / LIMIT
- `idx_condition_diagnosis_patient` — `(patient_id) WHERE active_ind='Y'`
- `idx_medication_order_patient` — `(patient_id) WHERE active_ind='Y'`
- `idx_patient_allergy_patient` — `(patient_id) WHERE active_ind='Y'`
- `idx_patient_insurance_patient` — `(patient_id) WHERE active_ind='Y'`
- `idx_care_gap_patient_status` — `(patient_id, gap_status) WHERE active_ind='Y'`
- `idx_observation_patient_datetime` — composite `(patient_id, observation_datetime DESC) WHERE active_ind='Y'`

**All indexes built CONCURRENTLY** (live, no table locks). Script: `packages/db/scripts/027_observation_index_concurrent.sql` for re-running on live systems (1B row observation table takes 30–90 min).

**API query rewrites:**
- `dashboard/index.ts`: Fixed `encounter_datetime::date = CURRENT_DATE` → range predicate `>= CURRENT_DATE::timestamp AND < (CURRENT_DATE+1)::timestamp`
- `care-gaps/index.ts`: Parallelized data + COUNT queries with `Promise.all()`
- `patients/index.ts`: Parallelized patient list COUNT + data; folded patient existence check into the sub-resource parallel fan-out on detail endpoint

**Frontend caching (`useApi.ts`):**
- `useDashboard` — `staleTime: 5 min` (was refetching on every tab navigation)
- `usePatient` — `staleTime: 2 min`
- `useMeasures` / `useConditionBundles` — `staleTime: 10 min` (static reference data)
- All patient clinical workspace sub-resources — `staleTime: 2 min`

### Index Build Status (as of session end)

All indexes launched with `CREATE INDEX CONCURRENTLY` — no table locks, no downtime. Status at session end (`indisvalid=false` = still building):

| Index | Table | Written so far | Valid |
|---|---|---|---|
| `idx_observation_patient_datetime` | observation (1.01B rows) | **9.4 GB** | ⏳ building |
| `idx_encounter_patient_datetime` | encounter (28.7M rows) | 861 MB | ⏳ building |
| `idx_medication_order_patient` | medication_order (72.6M rows) | 505 MB | ⏳ building |
| `idx_condition_diagnosis_patient` | condition_diagnosis (42.4M rows) | 295 MB | ⏳ building |
| `idx_patient_allergy_patient` | patient_allergy (896K rows) | 10 MB | ⏳ building |
| `idx_encounter_datetime_active` | encounter | — | ⏳ queued |
| `idx_patient_insurance_patient` | patient_insurance_coverage | — | ⏳ queued |
| `idx_care_gap_patient_status` | care_gap | — | ⏳ queued |

Observation index estimated completion: 30–60 more minutes (9.4 GB written, ~20 GB total). All others expected within 5–15 minutes. Code and query rewrites are already deployed and will activate automatically as each index reaches `indisvalid=true`.

Monitor with:
```sql
SELECT relname, indisvalid, pg_size_pretty(pg_relation_size(oid))
FROM pg_class WHERE relname LIKE 'idx_%patient%' OR relname LIKE 'idx_encounter%';
```

### Expected Impact (after indexes complete)
- Patient detail page: 77s (observations) + multiple seq scans → **<200ms total**
- Dashboard recent encounters: 4.7s → **<20ms**
- Dashboard today's schedule: 3.6s → **<20ms** (index + cast fix)
- Care-gap list: COUNT + data now run in parallel, ~2× faster
- Repeated navigations to same pages: served from React Query cache, **0 API calls**

---

## Session 15 — Provider Scoping: JWT + All Query Endpoints (Feb 26, 2026)

### Problem

Logged-in as `dr.udoshi@medgnosis.app` (provider_id = 2816, panel = 1,288 patients), every page was showing the full 1M-patient population. Dashboard stats, care gap counts, patient list, morning briefing — all unfiltered.

### Root Cause

- `app_users` has an `org_id` column but **no `provider_id`**
- The JWT payload only carried `sub`, `email`, `role`, `org_id` — no `provider_id`
- All route handlers ran queries against the full population with no conditional filter
- Admin users (no linked provider) are the intended "see everything" role, but provider users must see only their panel

### Fix: Four-File Change

**1. `apps/api/src/plugins/auth.ts`** — Extended `JwtPayload` interface:
```ts
provider_id?: number; // phm_edw.provider.provider_id — null for admin/non-provider users
```

**2. `apps/api/src/routes/auth/index.ts`** — Provider lookup at login + refresh:
```ts
let providerId: number | undefined;
if (user.org_id) {
  const [prov] = await sql`
    SELECT provider_id FROM phm_edw.provider
    WHERE org_id = ${user.org_id} AND active_ind = 'Y' LIMIT 1
  `.catch(() => []);
  providerId = prov?.provider_id;
}
// Embed in JWT payload + login response
```

**3. `apps/api/src/routes/dashboard/index.ts`** — Full provider scoping:
```ts
const providerId = request.user.provider_id;
const scoped = providerId !== undefined;
// Every query conditionally adds provider filter:
${scoped ? sql`AND p.pcp_provider_id = ${providerId}` : sql``}
// Star schema scoped via dim_provider → provider_key subquery
// Today's schedule scoped to encounter.provider_id (treating provider)
// All trend sub-queries carry the same conditional JOINs
```

**4. `apps/api/src/routes/patients/index.ts`** — Patient list scoped to PCP panel:
```ts
${scoped ? sql`AND p.pcp_provider_id = ${providerId}` : sql``}
```
Both the data query and the parallel COUNT query receive the filter.

**5. `apps/api/src/routes/care-gaps/index.ts`** — Care gap list scoped to provider's patients:
```ts
${scoped ? sql`AND p.pcp_provider_id = ${providerId}` : sql``}
```
Applied to both data + COUNT in the `Promise.all()`. Also added `AND p.active_ind = 'Y'` guard.

**6. `apps/api/src/routes/insights/index.ts`** — Morning briefing scoped:
- High-risk patients: scoped via `fpc.provider_key` (star schema subquery)
- Schedule count: scoped to `encounter.provider_id = ${providerId}`, also fixed `::date` cast → range predicate
- Critical alert count: scoped via `pcp_provider_id` JOIN on patient

### Scoping Pattern (used consistently across all routes)

```ts
const providerId = request.user.provider_id;   // undefined for admin
const scoped = providerId !== undefined;
// In queries:
${scoped ? sql`AND p.pcp_provider_id = ${providerId}` : sql``}
// Star schema:
${scoped ? sql`AND fpc.provider_key = (SELECT provider_key FROM phm_star.dim_provider WHERE provider_id = ${providerId} LIMIT 1)` : sql``}
```

Admin role: `provider_id` absent from JWT → `scoped = false` → full population view.
Provider role: `provider_id` present → all queries filter to that panel automatically.

### Activation

Re-login required after this change — existing JWTs lack `provider_id`. After re-login, the 1,288-patient panel populates immediately across all pages.

---

## Session 16 — Mock Schedule: 18 Real Patients with Past-Appointment Graying (Feb 26, 2026)

### Context

Today's Schedule panel was showing 0 visits because no real `encounter` rows exist for today's date. Rather than seed synthetic encounters, a static mock was wired in temporarily so the clinician workspace looks populated during demos.

### Implementation

**`apps/web/src/pages/DashboardPage.tsx`**:

- Added `USE_MOCK_SCHEDULE = true` flag — flip to `false` to restore live data
- `todayAt(h, m)` helper builds ISO timestamps for today's date at a given hour/minute, so graying logic stays correct regardless of when the page is viewed
- `MOCK_SCHEDULE` — 18 real patients queried from `phm_edw.patient WHERE pcp_provider_id = 2816`, covering a realistic adult clinic day:
  - Morning block: 8:00–11:40 AM (12 appointments, 20-min slots, lunch break at noon)
  - Afternoon block: 1:00–2:40 PM (6 appointments)
  - Mix of visit types: Office Visit, Follow-up, Preventive, New Patient
  - Clinically realistic RFVs: DM2 management, HTN, COPD, CHF, CKD, osteoporosis, cognitive screening, cancer screening, sports physicals, anxiety, depression, back pain, new patient
  - Age range: 18–87, mix of M/F
- Extended `todays_schedule` type with `gender?: string`
- **Past-appointment graying**: each row checks `new Date(enc.date) < new Date()` at render time
  - Past rows: `opacity-40` on entire row
  - Past time label: `text-ghost` (was teal)
  - Past rows show a small `CheckCircle2` icon below the time
- Added age + sex display: `· 52y M` in the secondary line (was age-only)
- Increased schedule scroll container from `max-h-[340px]` → `max-h-[480px]` to show ~9 rows before scrolling

### To Activate Real Data

Once today's encounter rows exist (via ETL or seed), set `USE_MOCK_SCHEDULE = false` at line 298 of `DashboardPage.tsx`. The live `clinician.todays_schedule` from the dashboard API will take over.

---

## Architecture Reference

### Monorepo Structure

```
Medgnosis/
├── apps/
│   ├── api/                    # Fastify 5 TypeScript API (port 3002)
│   │   └── src/
│   │       ├── app.ts          # App factory
│   │       ├── server.ts       # Entry point
│   │       ├── config.ts       # Typed env config
│   │       ├── worker.ts       # BullMQ worker entry
│   │       ├── sentry.ts       # Error tracking
│   │       ├── plugins/        # Fastify plugins (auth, error-handler, websocket, audit)
│   │       ├── middleware/      # Request middleware (aiGate, audit)
│   │       ├── routes/         # 12 route modules (+ bundles, clinical-notes)
│   │       ├── services/       # Business logic (risk scoring, LLM, FHIR, OMOP, measures, cohorts, patientContext)
│   │       └── workers/        # BullMQ workers (rules, AI, measures, ETL, scheduler)
│   └── web/                    # Vite 6 + React 19 SPA (port 5175)
│       └── src/
│           ├── App.tsx         # Router + providers
│           ├── main.tsx        # React DOM entry
│           ├── pages/          # 10 page components (+ EncounterNotePage)
│           ├── components/     # AuthGuard, AppShell, GlobalSearch, patient/*, encounter/*
│           ├── hooks/          # useAlertSocket, useKeyboardShortcuts, useTheme, useApi
│           ├── stores/         # Zustand (auth, theme, ui)
│           ├── services/       # API client
│           └── styles/         # Global CSS + Tailwind
├── packages/
│   ├── shared/                 # @medgnosis/shared — types, Zod schemas, constants
│   └── db/                     # @medgnosis/db — Postgres client, migrations, seeds
├── scripts/                    # Deployment & operations
│   ├── deploy-production.sh    # Manual deploy: build + restart + verify
│   ├── auto-deploy.sh          # Auto-deploy daemon (60s file watch)
│   ├── setup-production.sh     # One-time setup: systemd + Apache + SSL
│   ├── medgnosis-api.service   # systemd unit: Fastify API (port 3081)
│   ├── medgnosis-worker.service# systemd unit: BullMQ worker
│   ├── medgnosis-auto-deploy.service # systemd unit: auto-deploy daemon
│   ├── medgnosis.acumenus.net.conf   # Apache HTTP→HTTPS redirect
│   └── medgnosis.acumenus.net-le-ssl.conf # Apache HTTPS vhost
├── docker-compose.demo.yml     # Dev infrastructure
├── .env                        # Dev environment config
├── .env.production             # Production environment config (port 3081)
├── turbo.json                  # Task pipeline
├── tsconfig.base.json          # Shared TS config
└── archive/                    # Archived Laravel + Next.js code
    ├── backend/                # Laravel 11 PHP
    ├── frontend/               # Next.js 14
    ├── apache-config/          # Apache configs
    ├── *.sh                    # Legacy deploy/test shell scripts
    ├── *.php                   # Standalone PHP files
    └── *.md                    # Old deployment docs
```

### Data Flow

```
Browser (React SPA)
  ↓ HTTP/WS
Fastify API (JWT auth → route → service → SQL)
  ↓
PostgreSQL
  ├── phm_edw schema   (3NF EDW — 14 tables)
  ├── phm_star schema  (Star Schema — 15 tables)
  └── public schema    (App tables — users, audit, alerts, etc.)

BullMQ Workers (Redis-backed)
  ├── Rules Engine     → evaluates clinical rules → creates alerts
  ├── AI Insights      → LLM summaries → stores in ai_interactions
  ├── Measure Calc     → runs eCQM SQL → updates fact_measure_result
  ├── ETL Worker       → Synthea→EDW→Star pipeline
  └── Nightly Scheduler→ cron-like job dispatch

WebSocket (Redis pub/sub)
  → Real-time alert notifications to connected clients
```

### Key URLs

#### Production (`https://medgnosis.acumenus.net`)

| Service | URL | Notes |
|---------|-----|-------|
| Web App | https://medgnosis.acumenus.net | Apache serves Vite build from `apps/web/dist` |
| API | https://medgnosis.acumenus.net/api/v1/* | Apache reverse proxies to 127.0.0.1:3081 |
| Health | https://medgnosis.acumenus.net/health | Database + version check |
| WebSocket | wss://medgnosis.acumenus.net/api/v1/ws | Apache proxies via mod_proxy_wstunnel |

#### Local Development

| Service | URL | Notes |
|---------|-----|-------|
| Web App | http://localhost:5175 | Vite dev server |
| API | http://localhost:3002 | Fastify API |
| API Health | http://localhost:3002/health | Database + version check |
| API Routes | http://localhost:3002/api/v1/* | All versioned routes |
| MailHog UI | http://localhost:8025 | Email capture |
| PostgreSQL | localhost:5432 | Database: `medgnosis` |
| Redis | localhost:6379 | Shared with MindLog |

> **Note:** Ports 3000/5173 are reserved for MindLog dev. Port 3080 is MindLog production. Medgnosis uses 3002/5175 (dev) and 3081 (production).

### Production Deployment

| Component | Configuration |
|-----------|--------------|
| Reverse proxy | Apache 2.4 with mod_proxy, mod_ssl, mod_proxy_wstunnel |
| SSL/TLS | Let's Encrypt via Certbot (auto-renewal) |
| Process manager | systemd (3 services: api, worker, auto-deploy) |
| API binding | 127.0.0.1:3081 (internal only, Apache proxies public traffic) |
| Auto-deploy | Watches source files every 60s, auto-rebuilds on change |
| Logs | `journalctl -u medgnosis-api -f` / `journalctl -u medgnosis-auto-deploy -f` |
| Manual deploy | `./scripts/deploy-production.sh` |

### Default Test Credentials

| Role | Email | Password | Source |
|------|-------|----------|--------|
| Admin | admin@medgnosis.app | password | Migration 005 seed (bcrypt hash, cost 12) |
| Provider | dr.sarah@medgnosis.app | password | seed-demo.ts (bcrypt hash, cost 12) |
| Analyst | analyst.mike@medgnosis.app | password | seed-demo.ts (bcrypt hash, cost 12) |
| Care Coord | cc.lisa@medgnosis.app | password | seed-demo.ts (bcrypt hash, cost 12) |
| Provider | dr.udoshi@medgnosis.app | password | Manual insert (Session 3). Dr. Sanjay Udoshi, Internal Medicine, 1,288 assigned patients |

> Password verification uses `bcrypt.compare()` (Phase 6.1). All seeded passwords are bcrypt hashed with cost factor 12.

### Database Credentials (Local)

| Parameter | Value |
|-----------|-------|
| Host | localhost:5432 |
| Database | medgnosis |
| User | smudoshi |
| Password | acumenus |
| Schemas | `phm_edw` (23 tables), `phm_star` (15 tables), `public` (7 app tables) |
| Data volume | ~1M patients, 28M encounters, 42M diagnoses, 195M procedures |
