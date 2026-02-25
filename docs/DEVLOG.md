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
- [Bug Fix Log](#bug-fix-log)
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
| `src/seed-demo.ts` | Demo data seeder (stub — `insertMinimalDemoData()` is empty) |
| `src/index.ts` | Barrel export of `sql` client |
| `migrations/001_initial_edw.sql` | 3NF Enterprise Data Warehouse: 14 tables (organization, provider, patient, encounter, condition, observation, medication_order, procedure, lab_result, vital_sign, immunization, allergy, care_team, care_plan) |
| `migrations/002_star_schema.sql` | Kimball Star Schema: 15 dimension + fact tables (dim_date, dim_patient, dim_provider, dim_organization, dim_condition, dim_medication, dim_measure, dim_payer, fact_encounter, fact_condition, fact_medication, fact_lab_result, fact_vital_sign, fact_measure_result, fact_care_gap) |
| `migrations/003_measures.sql` | eCQM measure definitions + 48 CMS measures seeded (CMS2–CMS951) |
| `migrations/004_app_tables.sql` | Application tables: app_users (with MFA fields), refresh_tokens, audit_log, ai_interactions, alert_rules, alerts, patient_risk_scores |
| `migrations/005_etl_functions.sql` | ETL stored procedures: `etl_population_to_edw()` (Synthea→EDW), `etl_edw_to_star()` (EDW→Star Schema), `run_full_etl()` |

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
| `measureEngine.ts` | eCQM execution engine: runs measure SQL against EDW, calculates performance rates, manages initial/eligible/exclusion/exception/numerator populations. Batch recalculation for all active measures. |
| `cohortQueryEngine.ts` | Dynamic cohort builder: age range, gender, conditions (ICD-10), medications (RxNorm), lab value ranges, encounter recency. Builds parameterized SQL from filter criteria. |
| `fhir/mappers.ts` | FHIR R4 resource mappers: Patient, Condition (SNOMED CT), Observation (LOINC), MedicationRequest (RxNorm), Bundle (searchset/collection). |
| `omopExport.ts` | OMOP CDM export: maps EDW to OMOP persons, condition_occurrence, measurement. De-identified cohort generation with age bucketing and ID stripping. |

#### Middleware — `apps/api/src/middleware/`

| File | Description |
|------|-------------|
| `aiGate.ts` | Checks `app_users.ai_consent_given_at`; returns 403 `AI_CONSENT_REQUIRED` if null. Used by `/insights` routes. |
| `audit.ts` | Auto-logs all mutations (POST/PUT/PATCH/DELETE) to `audit_log` table. Extracts resource type/ID from URL. Redacts password, tokens from body. Async — never fails the request. |

#### Workers — `apps/api/src/workers/`

| File | Description |
|------|-------------|
| `rules-engine.ts` | Clinical alert rules: evaluates care gap detection, risk threshold alerts, measure compliance. Fires on patient data changes. Creates alerts + broadcasts via WebSocket. |
| `ai-insights-worker.ts` | Weekly AI-generated summaries per patient. Uses LLM client with clinical context. Checks BAA status before processing. Stores results in `ai_interactions`. |
| `measure-calculator.ts` | Nightly eCQM recalculation: iterates all active measures, runs SQL definitions against EDW, updates `fact_measure_result` in star schema. |
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
| `vite.config.ts` | Vite 6 with React plugin, `@/` path alias to `src/`, proxy `/api` to localhost:3001 |
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
| `playwright.config.ts` | Chromium only, base URL localhost:5173, auto-start Vite dev server |
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

- [ ] **Password hashing uses SHA256** — `apps/api/src/routes/auth/index.ts` uses `crypto.createHash('sha256')` instead of bcrypt/argon2. This is a placeholder and must be replaced before any real use.
- [ ] **Measure calculator eCQM execution is a TODO stub** — `apps/api/src/workers/measure-calculator.ts` calls `measureEngine.executeMeasure()` but the engine's SQL execution against real measure definitions is partially stubbed.
- [ ] **OMOP concept ID mappings hardcoded to 0** — `apps/api/src/services/omopExport.ts` maps all `condition_concept_id`, `measurement_concept_id` etc. to `0` instead of proper OMOP vocabulary lookups.

### Moderate

- [ ] **SettingsPage is entirely UI-only** — No API calls; toggles, dropdowns, and profile form have no backend integration.
- [ ] **`seed-demo.ts` `insertMinimalDemoData()` is empty** — The demo seeder function body is not implemented.
- [ ] **`seed.ts` only inserts one organization** — Minimal seeding; no sample patients, encounters, or clinical data.
- [ ] **Dashboard/measures routes have silent failures** — Some queries use `.catch(() => [])` which swallows errors silently.
- [ ] **AI insights worker BAA check** — May incorrectly block Ollama usage (local LLM doesn't need a BAA).

### Minor

- [ ] **"Forgot password" link** on LoginPage is non-functional (no route or handler).
- [ ] **"Remember me" checkbox** on LoginPage is not wired to anything.
- [ ] **"Create List" button** on CareListsPage has no handler.
- [ ] **No npm install has been run** — `node_modules` don't exist yet; build has not been verified.

---

## Next Phases Checklist

### Phase 5 — Build & Startup Verification

Goal: Get the entire monorepo building and running locally.

- [ ] **5.1** Run `npm install` at root — resolve any dependency conflicts
- [ ] **5.2** Run `npx turbo run build` — fix any TypeScript compilation errors
- [ ] **5.3** Run `npx turbo run typecheck` — fix strict mode type errors
- [ ] **5.4** Run `npx turbo run lint` — fix ESLint issues
- [ ] **5.5** Start Docker infrastructure: `docker compose -f docker-compose.demo.yml up -d`
- [ ] **5.6** Run database migrations: `npm run demo:migrate`
- [ ] **5.7** Run seed scripts: `npm run demo:seed`
- [ ] **5.8** Start API server: verify `http://localhost:3001/health` returns OK
- [ ] **5.9** Start web dev server: verify `http://localhost:5173` loads login page
- [ ] **5.10** Verify API proxy: web app can call API through Vite proxy
- [ ] **5.11** Test login flow end-to-end: login → JWT issued → dashboard loads
- [ ] **5.12** Verify WebSocket connection establishes after login

### Phase 6 — Critical Bug Fixes

Goal: Fix security issues and critical stubs before any deployment.

- [ ] **6.1** Replace SHA256 password hashing with bcrypt (`bcrypt` or `argon2` package)
- [ ] **6.2** Update seed scripts to hash passwords with bcrypt
- [ ] **6.3** Implement `seed-demo.ts` — insert sample patients, encounters, conditions, observations, medications, care gaps, and alerts
- [ ] **6.4** Wire up measure calculator to actually execute eCQM SQL from `measures` table
- [ ] **6.5** Fix OMOP concept ID mappings — add a lookup table or at minimum map common ICD-10/LOINC codes to OMOP vocabulary IDs
- [ ] **6.6** Fix AI insights worker BAA check to not block local Ollama usage
- [ ] **6.7** Fix silent `.catch(() => [])` in dashboard and measures routes — log errors properly
- [ ] **6.8** Add JWT refresh token rotation (current refresh may not invalidate old tokens)

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

Goal: Production-ready deployment configuration.

- [ ] **8.1** Create `apps/api/Dockerfile` — multi-stage build (Node 20 alpine, install, build, run)
- [ ] **8.2** Create `apps/web/Dockerfile` — multi-stage build (Node 20 for build, nginx for serve)
- [ ] **8.3** Create `docker-compose.prod.yml` — API + Web + Postgres + Redis with:
  - [ ] Health checks on all services
  - [ ] Volume mounts for Postgres data persistence
  - [ ] Environment variable files (.env.production)
  - [ ] Restart policies
  - [ ] Network isolation
- [ ] **8.4** Create `.env.example` with all 45 environment variables documented
- [ ] **8.5** Update `.github/workflows/deploy.yml`:
  - [ ] Docker build + push to registry
  - [ ] Environment-specific deployments (staging/production)
  - [ ] Database migration step in deployment pipeline
  - [ ] Rollback strategy
- [ ] **8.6** Add nginx configuration for web app:
  - [ ] SPA fallback (all routes → index.html)
  - [ ] API proxy pass to Fastify
  - [ ] Gzip compression
  - [ ] Security headers
  - [ ] SSL/TLS configuration template
- [ ] **8.7** Create startup script (`scripts/start.sh`):
  - [ ] Check prerequisites (Docker, Node)
  - [ ] Start infrastructure
  - [ ] Run migrations
  - [ ] Seed data (if first run)
  - [ ] Start services
- [ ] **8.8** Document deployment in README or separate deployment guide

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

## Bug Fix Log

| Date | Issue | Resolution | Files Changed |
|------|-------|------------|---------------|
| | | | |

*This section tracks bugs found and fixed during development. Add entries as bugs are resolved.*

---

## Architecture Reference

### Monorepo Structure

```
Medgnosis/
├── apps/
│   ├── api/                    # Fastify 5 TypeScript API (port 3001)
│   │   └── src/
│   │       ├── app.ts          # App factory
│   │       ├── server.ts       # Entry point
│   │       ├── config.ts       # Typed env config
│   │       ├── worker.ts       # BullMQ worker entry
│   │       ├── sentry.ts       # Error tracking
│   │       ├── plugins/        # Fastify plugins (auth, error-handler, websocket)
│   │       ├── middleware/      # Request middleware (aiGate, audit)
│   │       ├── routes/         # 10 route modules
│   │       ├── services/       # Business logic (risk scoring, LLM, FHIR, OMOP, measures, cohorts)
│   │       └── workers/        # BullMQ workers (rules, AI, measures, ETL, scheduler)
│   └── web/                    # Vite 6 + React 19 SPA (port 5173)
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
├── docker-compose.demo.yml     # Dev infrastructure
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

### Key URLs (Local Development)

| Service | URL |
|---------|-----|
| Web App | http://localhost:5173 |
| API | http://localhost:3001 |
| API Health | http://localhost:3001/health |
| API Docs | http://localhost:3001/api/v1/* |
| MailHog UI | http://localhost:8025 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### Default Test Credentials (from seed.ts)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@medgnosis.com | admin123 |
| Provider | provider@medgnosis.com | provider123 |
| Analyst | analyst@medgnosis.com | analyst123 |

> **Warning:** These use SHA256 hashing (placeholder). Must be replaced with bcrypt before any real deployment.
