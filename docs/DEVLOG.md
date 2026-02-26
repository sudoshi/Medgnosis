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

## Codebase Inventory

### File Counts

| Package | Files | Lines (approx) |
|---------|-------|-----------------|
| `apps/api/src/` | 30 | ~2,895 |
| `apps/web/src/` | 23 | ~2,955 |
| `packages/shared/src/` | 16 | ~929 |
| `packages/db/src/` | 5 | ~224 |
| `packages/db/migrations/` | 5 SQL | ~2,362 |
| E2E tests | 2 | ~80 |
| **Total** | **81** | **~9,445** |

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
  - [ ] Super Note (TipTap SOAP note editor)
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
│   │       ├── routes/         # 10 route modules
│   │       ├── services/       # Business logic (risk scoring, LLM, FHIR, OMOP, measures, cohorts)
│   │       └── workers/        # BullMQ workers (rules, AI, measures, ETL, scheduler)
│   └── web/                    # Vite 6 + React 19 SPA (port 5175)
│       └── src/
│           ├── App.tsx         # Router + providers
│           ├── main.tsx        # React DOM entry
│           ├── pages/          # 9 page components
│           ├── components/     # AuthGuard, AppShell, GlobalSearch
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
