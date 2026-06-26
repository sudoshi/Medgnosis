# Medgnosis

<img width="5120" height="2674" alt="image" src="https://github.com/user-attachments/assets/bb1a6e4b-bf4f-4498-8657-0b26bff374d2" />
<img width="5120" height="2674" alt="image" src="https://github.com/user-attachments/assets/bd6e7a06-07a9-4e6c-916d-cfba3f7d7222" />
<img width="5120" height="2674" alt="image" src="https://github.com/user-attachments/assets/5aba121f-200a-403b-989b-d4e728080185" />
<img width="5120" height="2674" alt="image" src="https://github.com/user-attachments/assets/c788d952-c10a-4707-90cb-86a8a31e632e" />
<img width="5120" height="2674" alt="image" src="https://github.com/user-attachments/assets/6f8820dc-62db-4843-8f47-18784c1af14a" />

Medgnosis is a population-health management platform for healthcare organizations. It tracks patient outcomes, closes care gaps, evaluates quality measures, supports value-based-care workflows, and exposes standards-oriented interoperability surfaces for FHIR, CDS Hooks, SMART launch, QDM/CQL, and DEQM.

The application is a TypeScript monorepo:

- Fastify 5 API
- Vite 8 and React 19 SPA
- PostgreSQL warehouse
- Redis and BullMQ workers
- Optional Solr search acceleration
- HAPI clinical-reasoning sidecar for CQL/Measure evaluation

## Current Status

The core app builds, tests, and runs. The current completion work is tracked in:

- [Application completion plan](docs/superpowers/plans/2026-06-18-medgnosis-application-completion-plan.md)
- [Current-state index](docs/superpowers/current-state.md)
- [Validation gates runbook](docs/superpowers/runbooks/validation-gates.md)

Implemented foundations include:

- Local JWT auth with access and refresh tokens.
- OIDC provider discovery, redirect, callback, exchange, and provider-admin foundation.
- Role-based access control for provider, analyst, admin, super-admin, and care-coordinator roles.
- FHIR R4 read APIs and validator-backed fixtures.
- CDS Hooks discovery/feedback and SMART Backend Services JWKS.
- EHR tenant registry, SMART launch groundwork, backend-services token groundwork, capability diagnostics, onboarding scripts, Bulk Data kickoff/poll/import orchestration, tenant-scoped recurring Bulk schedules, and NDJSON import worker support.
- QDM/FHIR bridge, CQL shadow evidence persistence, MeasureReport storage, reconciliation, semantic-drift dossiers, and measure-promotion governance.
- DEQM Gaps-in-Care bundle generation validated against Da Vinci DEQM 5.0.0 fixtures.
- QRDA Cat I/Cat III and QPP JSON serializer foundations.
- Admin surfaces for users, auth providers, system health, FHIR endpoints, EHR integrations, ETL, audit, roadmap, and measure governance.

Known incomplete areas:

- App-level TOTP MFA is implemented for local and OIDC sign-ins, including setup QR/manual secret delivery, challenge verification, hashed recovery codes, disable flow, and refresh-token gating.
- Admin-created users use tokenized invite activation with resend/revoke/status UX. Password reset uses one-time token links and revokes refresh tokens when complete.
- SMART launch now validates EHR issuer, OpenID ID-token claims, nonce, short-lived app handoff binding, initial launch Patient import/crosswalk, bounded staging for granted launch-context resources, first-pass EDW hydration for supported context resources, automatic QDM replay for callback-staged resources, and a backend-services BullMQ refresh path for broader supported patient-context pages.
- Bulk Data currently covers manual/admin kickoff, worker polling, manifest parsing, automatic import enqueue on completion, manual completed-job import replay, failed-file-only resume, BullMQ retry/failed-job retention for incomplete imports, active-job cancellation, tenant-specific recurring schedules, optional manifest checksum/size validation, PHI-safe audit entries for manual controls, file-level import ledgering, NDJSON streaming download/staging, EDW hydration, QDM replay, and admin job/file/schedule status visibility. Remaining gaps are deeper dead-letter runbooks, deleted-output/tombstone behavior, broader patient/resource last-success rollups, broader automated/tenant audit coverage, and vendor sandbox evidence.
- SQL remains the default authoritative measure evaluator. CQL/QDM output is available for shadow evaluation and governance, but promotion is per-measure and evidence-gated.
- The real-time surveillance lane is still simulated unless a real HL7/FHIR event feed is added.
- Playwright E2E is intentionally small. It now covers MFA login challenge, MFA setup/disable, invite activation, password reset, admin smoke, settings session management, and invite revoke UX, but not full authenticated product workflows.

## Architecture

```text
apps/
  api/       Fastify API, route modules, services, workers
  web/       Vite/React SPA, clinical workspace, admin UI

packages/
  db/        Postgres client, migrations, seed scripts
  shared/    Shared types, schemas, constants
  solr/      Solr query helpers

docker/
  api/
  nginx/
  cql-engine/
```

### Data Layer

Medgnosis uses a hybrid warehouse:

- Enterprise data warehouse: `phm_edw`
- Analytics star schema: `phm_star`
- Public auth/audit tables: `public`
- Migration metadata: `public._migrations`

The data model includes patient, encounter, observation, medication, measure, care-gap, EHR tenant, QDM bridge, MeasureReport, semantic-drift, and operational ledger tables. Migrations are checksum-tracked and serialized with a PostgreSQL advisory lock.

### API Surface

The public health and standards routes mount outside the versioned API prefix:

| Route | Description |
| --- | --- |
| `/health` | Health check |
| `/cds-services` | CDS Hooks discovery and feedback |
| `/.well-known/jwks.json` | SMART Backend Services public signing keys |

Versioned routes mount under `/api/v1`:

| Prefix | Description |
| --- | --- |
| `/auth` | Local login, MFA challenge/setup/verify/disable, refresh, session list/revoke, logout, OIDC discovery/redirect/callback/exchange, registration, invite activation, password reset, password change |
| `/patients` | Patient lists, patient detail, access-scoped clinical context |
| `/dashboard` | Population and clinician dashboard metrics |
| `/measures` | Quality measure catalog, population stats, strata, dossiers |
| `/bundles` | Bundle and care-program views |
| `/care-gaps` | Care-gap worklists and status updates |
| `/alerts` | Clinical alerts |
| `/cds` | CDS burden support routes |
| `/insights` | AI-assisted insights behind consent and provider policy gates |
| `/search` | Patient/search endpoints |
| `/fhir` | FHIR R4 resources, operations, and validation-backed fixtures |
| `/admin` | Users, auth providers, health, FHIR endpoints, audit, ETL, measure governance, QDM bridge operations |
| `/clinical-notes` | Clinical note workflows |
| `/orders` | Order and worklist workflows |
| `/rules` | Rule configuration/read surfaces |
| `/value-sets` | VSAC/value-set support |
| `/problem-list` | Problem-list analytics and CDS support |
| `/population-finder` | Cohort discovery |
| `/close-the-loop` | Gap closure and outreach workflows |
| `/risk-models` | Risk-model outputs |
| `/auto-orders` | Auto-order recommendation support |
| `/amp` | Appointment-management prioritization |
| `/mtm` | Medication therapy management/referral support |
| `/surveillance` | Real-time/simulated surveillance lane |
| `/glucometrics` | Glucose-management analytics |
| `/supernote` | Deterministic SuperNote assembly |
| `/data-quality` | Data-quality detectors |
| `/cohorts` | Cohort manager |
| `/coding` | Coding/HCC analytics |
| `/ehr` | EHR tenant admin, SMART launch, QDM replay/load |

### Background Workers

The worker entrypoint starts these BullMQ workers:

- Rules engine
- AI insights
- Measure calculator
- Population finder
- Close-the-loop
- Risk model
- Auto-orders
- AMP
- MTM
- Surveillance streamer
- Data-quality scan
- Cohort flags
- Nightly scheduler

The nightly scheduler currently queues patient rules, risk scoring, clinical exclusions, measure refresh, population finder, close-the-loop, risk model, AMP, MTM, monthly auto-orders, data quality, cohort flags, and due tenant Bulk Data schedules. The worker entrypoint also runs the EHR patient-context refresh queue for SMART/backend-services refresh jobs and the EHR Bulk queue for manual/admin kickoff, scheduled kickoff, vendor-safe polling, and completed NDJSON imports. QDM shadow refresh is not yet a scheduled worker.

### Frontend

The React SPA includes:

- Login, registration, OIDC callback, invite activation, and password reset
- Dashboard
- Patients and patient detail
- Encounter note and SuperNote
- Measures and bundles
- Care lists
- Population finder
- Close-the-loop
- Anticipatory care
- Surveillance
- Data quality
- Cohorts
- Coding
- Alerts
- Settings
- Admin

Frontend state is managed with TanStack Query and Zustand. The UI uses shared components, Radix primitives, lucide icons, and route-level lazy loading.

## Quick Start

Prerequisites:

- Node.js >= 20
- npm >= 10
- Docker, for local Postgres/Redis/Solr support

```bash
npm install
cp .env.example .env
npm run demo:infra
npm run demo:setup
npm run dev
```

Open http://localhost:5175.

### Demo Accounts

Seeded local/demo credentials are intended for development only.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@medgnosis.app` | `password` |
| Provider | `dr.chen@medgnosis.app` | `password` |
| Provider | `nurse.williams@medgnosis.app` | `password` |
| Analyst | `analyst@medgnosis.app` | `password` |
| Care Coordinator | `coordinator@medgnosis.app` | `password` |

### Individual Services

```bash
npm run demo:api
npm run demo:web
npm run dev --workspace=apps/api
npm run dev:worker --workspace=apps/api
npm run dev --workspace=apps/web
```

### Infrastructure

```bash
npm run demo:infra
npm run demo:infra:stop
npm run demo:infra:reset
```

## Development Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run format
```

Database commands require `DATABASE_URL` in the shell environment:

```bash
npm run db:migrate:list
npm run db:migrate:dry-run
npm run db:migrate
npm run db:seed
```

For production-env checks:

```bash
set -a
. ./.env.production
set +a
npm run db:migrate:list
npm run db:migrate:dry-run
```

EHR and QDM helper scripts:

```bash
npm run ehr:profile -- --help
npm run ehr:onboard -- --help
npm run ehr:smoke -- --help
npm run ehr:keygen -- --help
npm run qdm:shadow-refresh
```

## Validation

Current root gates:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```

Standards checks:

```bash
./scripts/fhir-validate.sh
./scripts/deqm-validate.sh
```

Web E2E:

```bash
npm run test:e2e --workspace=apps/web
```

See [validation-gates.md](docs/superpowers/runbooks/validation-gates.md) for the full release evidence matrix.

## Environment Variables

Copy `.env.example` to `.env`. Key settings:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis for BullMQ and WebSocket pub/sub |
| `JWT_SECRET` | JWT signing secret |
| `LOCAL_AUTH_ENABLED` | Enables local login fallback; defaults to enabled |
| `PUBLIC_REGISTRATION_ENABLED` | Controls public self-registration; defaults to disabled |
| `PUBLIC_REGISTRATION_ALLOW_PRODUCTION` | Second production opt-in required before public registration is exposed in production |
| `DEMO_QUICK_FILL_ENABLED` | Enables local/demo login quick-fill; suppressed when `NODE_ENV=production` |
| `AI_PROVIDER` | `ollama` or `anthropic` |
| `ANTHROPIC_API_KEY` | Required for Anthropic mode |
| `ANTHROPIC_BAA_SIGNED` | Must be true before cloud PHI use |
| `OLLAMA_BASE_URL` | Local Ollama endpoint |
| `SOLR_ENABLED` | Enables Solr search acceleration |
| `CDS_HOOKS_SECRET` | Shared secret for authenticated CDS Hooks POST handlers |
| `CQL_ENGINE_URL` | HAPI clinical-reasoning sidecar FHIR base |
| `MEASURE_EVALUATOR` | `sql` by default; `cql` only for controlled evaluator runs |
| `EHR_*` | EHR onboarding, SMART launch, backend services, JWKS, and smoke-test settings |
| `SENTRY_DSN` | Optional error tracking |

See [.env.example](.env.example) for the full template.

## Production Checklist

Before deploying:

- Replace demo credentials and localhost-only URLs.
- Set a high-entropy `JWT_SECRET`.
- Confirm `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `WEB_APP_URL`, `FHIR_BASE_URL`, and `CQL_ENGINE_URL`.
- Keep `PUBLIC_REGISTRATION_ENABLED=false` unless the inactive-user activation workflow is intentionally enabled for the environment; production exposure also requires `PUBLIC_REGISTRATION_ALLOW_PRODUCTION=true`.
- Keep `DEMO_QUICK_FILL_ENABLED=false` in shared or production env files; the API suppresses it when `NODE_ENV=production`.
- Leave `SWAGGER_ENABLED` unset or false in production for clarity; the API also suppresses Swagger when `NODE_ENV=production`.
- Set `CDS_HOOKS_SECRET` before accepting production POST hook traffic.
- Store EHR secrets as environment references, not raw values in database rows.
- Keep Redis and Solr internal-only in production Docker unless intentionally exposed.
- Run the validation gates and public-hostname health checks.

## Interoperability

### FHIR R4

The `/fhir` routes expose read-oriented FHIR R4 resources and operations for Medgnosis data, including Patient, Condition, Observation, MedicationRequest, and `$everything` style patient bundles.

### CDS Hooks And SMART

CDS Hooks discovery is public at `/cds-services`. SMART Backend Services signing keys are exposed at `/.well-known/jwks.json`. EHR tenant registration, SMART launch, initial launch Patient import/crosswalk, bounded launch-context resource staging with EDW hydration and QDM replay, backend-services patient-context refresh queue with continuation jobs, tenant ingest-run status API and recent-sync panel, backend-services client metadata, capability diagnostics, onboarding smoke scripts, Bulk kickoff/poll/import orchestration, recurring Bulk schedules, admin Bulk job/file/schedule status visibility, manual completed-job import replay, failed-file-only resume, PHI-safe manual Bulk audit, and active-job cancellation are present. Remaining production interoperability work is centered on all-domain EDW normalization for remaining resource families, vendor sandbox evidence, deeper Bulk replay/dead-letter runbooks, broader patient/resource last-success rollups, broader automated/tenant audit coverage, and alerting.

### QDM, CQL, And Measures

SQL star-schema measure results remain authoritative by default. The CQL/HAPI sidecar, MeasureReport persistence, QDM evidence, reconciliation, semantic drift dossiers, and promotion governance are available for shadow and per-measure promotion workflows.

### DEQM, QRDA, And QPP

DEQM Gaps-in-Care fixture validation currently passes. QRDA Cat I/Cat III and QPP JSON serializer foundations exist, but full external submission validation remains part of the completion backlog.

## Security

Implemented:

- JWT access and refresh tokens.
- Local auth fallback.
- TOTP MFA setup, challenge verification, disable flow, hashed recovery codes, and refresh-token MFA enforcement.
- Tokenized invite activation and password reset flows.
- Active session/device listing with per-session revoke.
- OIDC foundation with provider-admin controls.
- Role-based access control.
- Rate limiting.
- Helmet security headers with explicit production CSP.
- Audit trail for many mutation and governance paths.
- AI consent and BAA gates for cloud provider use.
- Production log redaction hooks and Sentry telemetry scrubbing.
- Production Swagger suppression.
- Public registration and demo-login exposure policy from `/auth/providers`.
- Backend role/permission matrix with admin and super-admin regression evidence.
- Auth-provider health and last-test evidence in System Health.

Not yet complete:

- Complete audit proof for every mutation route.

## Documentation

- [Current-state index](docs/superpowers/current-state.md)
- [Application completion plan](docs/superpowers/plans/2026-06-18-medgnosis-application-completion-plan.md)
- [EHR current-state devlog](docs/superpowers/devlogs/2026-06-17-ehr-integration-current-state-devlog.md)
- [QDM bridge completion devlog](docs/superpowers/devlogs/2026-06-18-fhir-qdm-dimensional-bridge-completion.md)
- [QDM bridge operations runbook](docs/superpowers/runbooks/qdm-bridge-operations.md)
- [Role and permission matrix](docs/superpowers/runbooks/role-permission-matrix.md)
- [Validation gates runbook](docs/superpowers/runbooks/validation-gates.md)
- [Development log](docs/DEVLOG.md)

## License

Apache License 2.0
