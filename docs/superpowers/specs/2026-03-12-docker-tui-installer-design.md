# Dockerized Deployment + TUI Installer — Design Specification

> **Date:** 2026-03-12
> **Status:** Draft
> **Scope:** Replace systemd-based production deployment with Docker Compose; add Python TUI installer for first-time setup

---

## 1. Problem Statement

Medgnosis currently deploys via `systemctl restart` which requires `sudo` and manual systemd service management. This creates friction for:
- **This machine**: deploy script fails without sudo password
- **New users**: cloning the repo requires manually configuring Node.js, building packages, setting up systemd services, and configuring Apache — no guided setup path exists

## 2. Goals

1. Dockerize the application (API + Web + infrastructure) so deployment is `docker compose up --build -d`
2. Keep PostgreSQL on the host (existing data: ~1M patients, 28M encounters, 42M diagnoses)
3. Maintain Apache as the SSL reverse proxy on this machine (nginx binds to 3081)
4. Provide a Textual-based Python TUI installer for users who clone the repo, guiding them through environment detection, configuration, and deployment

## 3. Non-Goals

- Kubernetes / cloud orchestration
- Migrating PostgreSQL data into Docker
- Replacing Apache on this specific machine
- CI/CD pipeline changes

---

## 4. Architecture

### 4.1 Docker Services

| Service | Image | Exposed Port | Internal Port | Purpose |
|---------|-------|-------------|---------------|---------|
| nginx | 1.27-alpine + built frontend | ${NGINX_PORT:-3081}:80 | 80 | Reverse proxy + SPA static files |
| api | node:22-alpine (multi-stage) | none (internal) | 3002 | Fastify API server |
| solr | solr:9.7-slim | ${SOLR_PORT:-8984}:8983 | 8983 | Search + clinical cores |
| redis | redis:7-alpine | ${REDIS_PORT:-6379}:6379 | 6379 | Cache, CDC queue, WebSocket pub/sub |
| mailpit | axllent/mailpit | 1025/8025 | 1025/8025 | Dev email capture (profile: dev) |

### 4.2 Network Topology

```
Internet → Apache (:443 SSL) → nginx (:3081) → api (:3002)
                                             → static SPA (/)
                                             → solr (:8983)

api → host PostgreSQL (via host.docker.internal:5432)
api → redis (:6379)
api → solr (:8983)
```

All containers join a `medgnosis` bridge network. The API reaches host PostgreSQL via `extra_hosts: ["host.docker.internal:host-gateway"]`.

### 4.3 Image Build Strategy

**API (multi-stage):**
- Stage 1 (`builder`): `node:22-alpine`, copy `package*.json` + `turbo.json` + workspace `package.json` files, `npm ci`, copy source, `turbo build`
- Stage 2 (`runtime`): `node:22-alpine`, `ENV API_PORT=3002`, copy `dist/` + pruned `node_modules` (production only), run with `node dist/server.js`
- Expected image size: ~200MB
- **Important:** `ENV API_PORT=3002` baked into image as safety net — `config.ts` defaults to 3000, but nginx proxies to 3002

**nginx + Frontend (multi-stage):**
- Stage 1 (`frontend-build`): `node:22-alpine`, `npm ci`, `vite build` the web app
- Stage 2 (`runtime`): `nginx:1.27-alpine`, copy `dist/` to `/usr/share/nginx/html/`, copy `default.conf`
- Expected image size: ~30MB

### 4.4 nginx Routing

```
location /                → static SPA (/usr/share/nginx/html, try_files $uri /index.html)
location /api/v1/         → proxy_pass http://api:3002
location /solr/           → proxy_pass http://solr:8983 (optional, admin UI)
```

Headers: `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`.

**WebSocket proxy** for `/api/v1/ws`:
```nginx
location /api/v1/ws {
    proxy_pass http://api:3002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400s;
}
```

### 4.5 Solr Core Initialization

Entrypoint script checks if cores exist; creates them from configsets if not:
```bash
precreate-core search /opt/solr/server/solr/configsets/search
precreate-core clinical /opt/solr/server/solr/configsets/clinical
```

Configset directories bind-mounted from `./solr/search/conf` and `./solr/clinical/conf`.

---

## 5. Docker Compose File Design

### 5.1 Main `docker-compose.yml`

Replaces both `docker-compose.demo.yml` (retired) and the systemd services.

Profiles:
- **default** (no profile): nginx, api, solr, redis — production stack
- **dev**: adds mailpit

Environment variables with defaults in `.env.example` (copied to `.env` by installer):
- `NGINX_PORT=3081`
- `SOLR_PORT=8984`
- `REDIS_PORT=6379`
- `DATABASE_URL=postgresql://user:password@host.docker.internal:5432/medgnosis` *(placeholder — installer prompts for real credentials)*
- `REDIS_URL=redis://redis:6379`
- `SOLR_URL=http://solr:8983/solr`
- `SOLR_ENABLED=true`
- `API_PORT=3002`
- `JWT_SECRET=<generated>` *(installer auto-generates via `openssl rand -base64 32`)*
- `RESEND_API_KEY=<optional>`
- `NODE_ENV=production`

Additional variables inherited from existing `.env.example` (not Docker-specific, but required):
- `CORS_ORIGIN=http://localhost:3081` *(must match the nginx URL — installer sets this)*
- `EMAIL_FROM=Medgnosis <noreply@acumenus.net>`
- `API_HOST=0.0.0.0`
- `WEB_APP_URL=http://localhost:3081`

**Note:** `.env` is git-ignored. `.env.example` contains only placeholders — never real credentials.

### 5.2 `docker-compose.override.yml` (generated by installer)

User-specific overrides: custom ports, resource limits, PG-in-Docker option, extra services.

### 5.3 Healthchecks

The API already exposes an unauthenticated health endpoint at `GET /health` (registered without the `/api/v1` prefix) → 200 `{"status":"healthy"}`.

| Service | Check | Interval | Retries |
|---------|-------|----------|---------|
| api | `node -e "fetch('http://localhost:3002/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"` | 10s | 5 |
| nginx | `wget -q --spider http://localhost:80/` | 5s | 5 |
| solr | `curl -sf http://localhost:8983/solr/admin/info/system` | 10s | 10 |
| redis | `redis-cli ping` | 5s | 10 |

**Notes:**
- Alpine-based images (api, nginx) include `wget` but not `curl` — use `wget -q --spider`
- `solr:9.7-slim` is Debian-based and includes `curl` — use `curl -sf` for Solr
- The `/api/v1/health` endpoint is added as part of Docker setup (no auth required)

### 5.4 Dependency Chain

```
redis (no deps)  →  api (depends_on: redis healthy, extra_hosts for PG)
solr (no deps)   →  api (depends_on: solr healthy)
                     nginx (depends_on: api healthy)
```

Solr is always started by default. When `SOLR_ENABLED=false`, the API gracefully degrades (PG fallback) — Solr still runs but isn't queried. To fully exclude Solr, the installer generates a `docker-compose.override.yml` that comments out the solr service.

**Requirement:** Docker Engine >= 20.10 (for `host.docker.internal` on Linux). The installer's environment detection (Screen 1) checks this.

### 5.5 Resource Limits

| Service | Memory | CPU |
|---------|--------|-----|
| api | 1G | 2 |
| nginx | 256M | 0.5 |
| solr | 4G | 2 |
| redis | 512M | 1 |

### 5.6 Volumes

```yaml
volumes:
  redis_data:       # Redis AOF persistence
  solr_data:        # Solr core data + indexes

# In service definitions:
redis:
  volumes:
    - redis_data:/data
solr:
  volumes:
    - solr_data:/var/solr
    - ./solr/search/conf:/opt/solr/server/solr/configsets/search/conf:ro
    - ./solr/clinical/conf:/opt/solr/server/solr/configsets/clinical/conf:ro
```

Named volumes ensure data survives `docker compose down`. Solr configsets are bind-mounted read-only from the repo.

### 5.7 Service Defaults

All services include:
- `restart: unless-stopped` — containers restart after host reboot or crash
- Redis: `command: redis-server --appendonly yes` — enables AOF persistence to the named volume

### 5.8 Sensitive Generated Files

The following files are git-ignored:
- `.env` — contains real credentials
- `installer/config.json` — contains wizard answers including DB credentials and JWT secret
- `docker-compose.override.yml` — may contain user-specific secrets

---

## 6. Deploy Script

Replace `scripts/deploy-production.sh` with `scripts/deploy.sh`:

```bash
./scripts/deploy.sh              # full rebuild + restart
./scripts/deploy.sh --api        # rebuild API only
./scripts/deploy.sh --frontend   # rebuild nginx (frontend) only
./scripts/deploy.sh --restart    # restart without rebuild
./scripts/deploy.sh --logs       # tail all container logs
./scripts/deploy.sh --status     # show service health
```

Flow:
1. `docker compose build [service]`
2. `docker compose up -d [service]`
3. Wait for healthchecks
4. Print status table

No `sudo` required.

---

## 7. TUI Installer

### 7.1 Technology

- **Framework**: Textual >= 0.50 (TUI app framework)
- **Rendering**: Rich >= 13 (tables, panels, progress)
- **PG test**: psycopg2-binary
- **Docker status**: docker Python SDK
- **Location**: `installer/` directory at repo root
- **Entry point**: `python installer/main.py` or `./install.sh` (wrapper that checks Python 3.10+ and pip-installs deps)

### 7.2 Wizard Screens

**Screen 1: Welcome + Environment Detection**

Auto-detects and displays in a status table:
- Docker Engine version + Docker Compose version
- Running PostgreSQL (port, version, connection test)
- Running Redis (port, ping test)
- Running Solr (port, core status)
- Available ports (3081, 8984, 6379) — conflict detection
- OS, architecture, available memory, CPU cores
- Existing `.env` file (offer to import)

Status indicators: green (ready), yellow (detected but needs config), red (missing).

**Screen 2: Database Configuration**

Options:
- a) Use detected local PostgreSQL (pre-fill host/port/user/db)
- b) Enter custom PostgreSQL connection string
- c) Run PostgreSQL in Docker (adds PG container to compose)

Live connection test button. Validates connectivity before proceeding.

**Screen 3: Service Configuration**

Per-service toggles:
- Solr: enable/disable, JVM heap (1G-8G slider, default 4G)
- Redis: use detected instance or Docker (default: Docker)
- Mailpit: enable for dev (default: off in production)

Port customization for each exposed service.

**Screen 4: Application Settings**

- Admin email (default: admin@medgnosis.app)
- RESEND_API_KEY (or skip → Mailpit for email)
- JWT secret (auto-generate button, or enter custom)
- SOLR_ENABLED (default: true if Solr enabled in screen 3)
- NODE_ENV (production / development)

**Screen 5: Web Server / SSL**

Choose deployment mode:
- a) Direct (nginx binds to 80/443) — generates self-signed or Let's Encrypt
- b) Behind Apache (nginx binds to internal port, e.g., 3081) — generates Apache ProxyPass snippet
- c) Behind Caddy — generates Caddyfile snippet

SSL options (for direct mode):
- None (HTTP only)
- Self-signed (auto-generate with openssl)
- Let's Encrypt (requires domain name, uses certbot container)

**Screen 6: System Integration**

- Auto-start on boot:
  - Linux: generate systemd service (`medgnosis.service` that runs `docker compose up -d`)
  - macOS: generate launchd plist
  - Skip
- Resource limits: memory caps per container (sliders with defaults from Section 5.5)
- PostgreSQL backup:
  - Enable/disable
  - Schedule (cron expression, default: daily 2 AM)
  - Destination path
  - Generates backup script + cron entry

**Screen 7: Review + Deploy**

- Summary table of all configuration choices
- Generated file preview (`.env`, `docker-compose.override.yml`)
- "Deploy Now" button:
  1. Writes `.env` and `docker-compose.override.yml`
  2. Runs `docker compose up --build -d`
  3. Shows live Docker build output in scrollable log panel
  4. Post-deploy health check: polls each service, shows green checkmarks
  5. Prints access URL + credentials
- "Save Config Only" button (generates files without deploying)

### 7.3 Generated Files

| File | Purpose |
|------|---------|
| `.env` | All environment variables |
| `docker-compose.override.yml` | Port overrides, resource limits, optional PG container, profile selections |
| `installer/config.json` | Saved wizard answers (re-run to modify) |
| `scripts/medgnosis-backup.sh` | PG backup script (if backup enabled) |
| Apache/Caddy config snippet | Printed to screen + saved to `installer/output/` |
| `medgnosis.service` | systemd unit file (if auto-start enabled) |

### 7.4 Re-run Behavior

Running the installer again loads `installer/config.json` and pre-fills all screens with previous answers. User can modify any screen and re-deploy. Existing `.env` and override files are backed up before overwriting.

### 7.5 Error Handling

- Docker not installed → show OS-specific install instructions, exit gracefully
- Port conflict → highlight in yellow, suggest alternative, let user pick
- PG connection fails → stay on database screen with error, don't proceed
- `docker compose up` fails → show failing container logs inline, offer Retry / Full Logs / Abort
- Config saved after each screen → crash recovery resumes from last completed screen
- Python < 3.10 → `install.sh` wrapper detects and shows upgrade instructions

---

## 8. File Structure

```
docker/
  api/
    Dockerfile              # Multi-stage Node.js API build
  nginx/
    Dockerfile              # Multi-stage frontend build + nginx
    default.conf            # nginx routing config
docker-compose.yml          # Main compose file (replaces demo + systemd)
.dockerignore               # Build exclusions
.env.example                # Template with all variables documented
scripts/
  deploy.sh                 # Docker-based deploy script (replaces deploy-production.sh)
installer/
  main.py                   # Textual app entry point
  install.sh                # Wrapper: checks Python, installs deps, runs main.py
  requirements.txt          # textual, rich, psycopg2-binary, docker
  config.json               # Saved wizard state (generated)
  output/                   # Generated config snippets
  screens/
    welcome.py              # Screen 1: detection
    database.py             # Screen 2: PG config
    services.py             # Screen 3: Solr/Redis/MailHog
    application.py          # Screen 4: app settings
    webserver.py            # Screen 5: reverse proxy + SSL
    system.py               # Screen 6: systemd, backups
    review.py               # Screen 7: summary + deploy
  utils/
    detection.py            # Environment detection logic
    generators.py           # .env, override.yml, systemd generators
    docker_ops.py           # Docker build/up/health wrappers
```

---

## 9. Migration Path

### This Machine (acumenus.net)

1. Build Docker images
2. Stop systemd services: `sudo systemctl stop medgnosis-api medgnosis-worker`
3. Run pending database migrations: `npm run db:migrate` (or equivalent from host)
4. `docker compose up --build -d`
5. Verify Apache still proxies 3081 correctly
6. Verify API can reach host PostgreSQL via `host.docker.internal`
7. Disable systemd services: `sudo systemctl disable medgnosis-api medgnosis-worker`
8. Old `docker-compose.demo.yml` retired (services absorbed into main compose)

### New Users (fresh clone)

1. `git clone` the repo
2. `./installer/install.sh`
3. Walk through 7-screen wizard
4. Installer runs database migrations (Screen 2 validates DB connectivity; for PG-in-Docker, Screen 7 starts PG first via `docker compose up -d postgres`, waits for healthy, then runs migrations before starting remaining services)
5. Installer runs `docker compose up --build -d`
6. Application is live

---

## 10. Deliverable Order

1. **Docker setup** (functional without installer): Dockerfiles, compose file, nginx config, deploy script, .dockerignore, .env.example
2. **TUI installer**: Textual app with all 7 screens, file generators, detection logic
