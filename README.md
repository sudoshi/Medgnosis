# Medgnosis

Population health management platform for healthcare organizations. Tracks patient outcomes, closes care gaps, calculates eCQMs, and supports value-based care through risk stratification, cohort analysis, and quality reporting.

Built as a TypeScript monorepo: **Fastify API + Vite/React SPA + PostgreSQL + Redis**.

## Architecture

```
apps/
  api/       Fastify 5 REST API + WebSocket      :3001
  web/       Vite 6 + React 19 SPA               :5173

packages/
  shared/    Types, Zod schemas, constants        @medgnosis/shared
  db/        Postgres client, migrations, seeds   @medgnosis/db
```

### Data Layer

Medgnosis uses a hybrid data warehouse combining Inmon (3NF) and Kimball (star schema) architectures:

- **Enterprise Data Warehouse** (`phm_edw`) — 14 normalized tables for operational data (patients, encounters, conditions, observations, medications, procedures, labs, vitals, immunizations, allergies, care teams, care plans)
- **Analytics Star Schema** (`phm_star`) — 15 dimension + fact tables optimized for reporting (encounters, conditions, medications, labs, vitals, measure results, care gaps)
- **ETL Pipeline** — Stored procedures for Synthea-to-EDW and EDW-to-Star transformation
- **48 eCQM Definitions** — CMS quality measures (CMS2 through CMS951) with SQL-based population logic

### API

Fastify 5 with plugin architecture, JWT auth, and role-based access control.

| Route | Description |
|-------|-------------|
| `/health` | Health check (no auth) |
| `/auth` | Login, logout, refresh, MFA setup/verify |
| `/patients` | CRUD, risk scores, care gaps, encounters, observations, conditions, medications |
| `/dashboard` | Aggregated population metrics |
| `/measures` | eCQM definitions, results, cohorts |
| `/care-gaps` | Gap management, prioritization, status updates |
| `/alerts` | Clinical alerts with real-time WebSocket delivery |
| `/insights` | AI-powered analysis (consent-gated, HIPAA-compliant) |
| `/search` | Full-text patient search (pg_trgm) |
| `/fhir` | FHIR R4 endpoints (Patient, Condition, Observation, MedicationRequest) |
| `/admin` | User management, OMOP export, audit log, analytics |

### Background Workers (BullMQ)

| Worker | Schedule | Description |
|--------|----------|-------------|
| Rules Engine | On data change | Evaluates clinical rules, fires alerts via WebSocket |
| Measure Calculator | Nightly | Recalculates all active eCQMs against EDW |
| AI Insights | Weekly | Generates patient summaries via LLM |
| ETL Worker | Configurable | Runs Synthea-to-EDW-to-Star pipeline |
| Nightly Scheduler | Cron | Dispatches recurring jobs |

### Frontend

Vite 6 + React 19 SPA with React Router 7, TanStack React Query, and Zustand state management.

**Pages:** Login, Dashboard, Patients, Patient Detail, Measures, Care Lists, Alerts, Settings, 404

**Key features:**
- Real-time alert feed via WebSocket
- Command palette search (Ctrl+K)
- Keyboard navigation (Alt+1-5)
- Dark/light/system theme
- TipTap clinical editor (Super Note)

## Prerequisites

- **Node.js** >= 20
- **Docker** (for PostgreSQL + Redis + MailHog)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure (Postgres 15, Redis 7, MailHog)
npm run demo:infra

# 3. Copy environment config
cp .env.example .env

# 4. Run database migrations and seed
npm run demo:setup

# 5. Start everything (API + Web)
npm run dev
```

Open http://localhost:5173 and log in with a test account.

### Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@medgnosis.com | admin123 |
| Provider | provider@medgnosis.com | provider123 |
| Analyst | analyst@medgnosis.com | analyst123 |

### Individual Services

```bash
npm run demo:api          # API only (localhost:3001)
npm run demo:web          # Web only (localhost:5173)
```

### Infrastructure Management

```bash
npm run demo:infra        # Start Postgres + Redis + MailHog
npm run demo:infra:stop   # Stop containers (data preserved)
npm run demo:infra:reset  # Stop containers and delete volumes
```

## Development

All commands run across the monorepo via Turborepo:

```bash
npm run dev               # Start all apps in watch mode
npm run build             # Build all packages and apps
npm run typecheck         # TypeScript validation
npm run lint              # ESLint
npm run test              # Vitest unit tests
npm run format            # Prettier formatting
```

### Database

```bash
npm run db:migrate        # Run pending migrations
npm run db:seed           # Seed base data (users, orgs)
```

### Package-specific commands

```bash
# API
npm run dev --workspace=apps/api
npm run dev:worker --workspace=apps/api    # BullMQ workers

# Web
npm run dev --workspace=apps/web
npm run test:e2e --workspace=apps/web      # Playwright E2E tests
```

## Environment Variables

Copy `.env.example` to `.env`. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://postgres:demosecret@localhost:5432/medgnosis` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis for BullMQ + WebSocket pub/sub |
| `JWT_SECRET` | — | Secret for signing JWTs (change in production) |
| `AI_PROVIDER` | `ollama` | `ollama` (local) or `anthropic` (cloud, requires BAA) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `ANTHROPIC_API_KEY` | — | Required if `AI_PROVIDER=anthropic` |
| `SENTRY_DSN` | — | Error tracking (optional) |

See [.env.example](.env.example) for the full list.

## AI Integration

Medgnosis supports two LLM providers for clinical insights:

- **Ollama** (default) — Local inference, no BAA required. Install [Ollama](https://ollama.com) and pull a model (e.g., `ollama pull gemma:7b`).
- **Anthropic Claude** — Cloud inference via the Anthropic API. Requires a signed BAA for PHI processing.

AI features are consent-gated: users must grant consent before the `/insights` endpoints return results. All prompts include a HIPAA preamble. Interactions are logged to `ai_interactions` for cost tracking and audit.

## Interoperability

### FHIR R4

The `/fhir` routes expose patient data as FHIR R4 resources:
- `GET /fhir/Patient` — Patient resources
- `GET /fhir/Condition` — Condition resources (SNOMED CT)
- `GET /fhir/Observation` — Observation resources (LOINC)
- `GET /fhir/MedicationRequest` — Medication resources (RxNorm)
- `GET /fhir/Patient/:id/$everything` — Full patient bundle

### OMOP CDM

Admin endpoints export data in OMOP Common Data Model format for research:
- `GET /admin/omop/persons` — OMOP person records
- `GET /admin/omop/conditions` — Condition occurrences
- `GET /admin/omop/measurements` — Measurement records
- `POST /admin/omop/cohort` — De-identified cohort generation

## Security

- JWT authentication with access + refresh tokens
- Role-based access control (provider, analyst, admin, care_coordinator)
- MFA support (TOTP)
- Helmet (HSTS, no-sniff, frameguard, referrer policy)
- Rate limiting (200 req/min global)
- Audit trail on all mutations (resource type, user, IP, redacted payload)
- PHI redaction in production logs (Pino + Sentry scrubbing)
- AI consent gating

## Testing

```bash
npm run test                                    # Unit tests (Vitest)
npm run test:e2e --workspace=apps/web           # E2E tests (Playwright)
npm run build && npm run typecheck && npm run lint   # Full CI check
```

CI runs automatically on push/PR to `main` via GitHub Actions with Postgres and Redis service containers.

## Project Structure

```
Medgnosis/
├── apps/
│   ├── api/                    Fastify 5 API (port 3001)
│   │   └── src/
│   │       ├── plugins/        Auth, error handler, WebSocket
│   │       ├── middleware/      AI consent gate, audit trail
│   │       ├── routes/         10 route modules
│   │       ├── services/       Risk scoring, LLM, FHIR, OMOP, measures, cohorts
│   │       └── workers/        BullMQ background jobs
│   └── web/                    Vite + React SPA (port 5173)
│       └── src/
│           ├── pages/          9 page components
│           ├── components/     AuthGuard, AppShell, GlobalSearch
│           ├── hooks/          WebSocket, keyboard shortcuts, theme, API queries
│           ├── stores/         Zustand (auth, theme, UI)
│           └── services/       Typed API client
├── packages/
│   ├── shared/                 Types, Zod schemas, constants
│   └── db/                     Postgres client, 5 SQL migrations, seeds
├── docs/
│   └── DEVLOG.md               Development log and roadmap
├── archive/                    Legacy Laravel + Next.js code (reference)
├── docker-compose.demo.yml     Dev infrastructure
├── turbo.json                  Task pipeline
└── .env.example                Environment template
```

## Documentation

- [Development Log & Roadmap](docs/DEVLOG.md) — Detailed accomplishments, known issues, and next phases

## License

Apache License 2.0
