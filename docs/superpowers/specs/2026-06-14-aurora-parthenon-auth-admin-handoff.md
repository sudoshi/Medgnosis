# Aurora Auth/Admin Standardization Handoff

> Audience: a Codex agent taking over Aurora hardening and Acumenus-wide auth/admin standardization.
> Date: 2026-06-14.
> Source model: Parthenon CE/EE auth and admin infrastructure, including Authentik-based access.
> Target repo: `/home/smudoshi/Github/Aurora`.
> Reference repos: `/home/smudoshi/Github/Parthenon` and `/home/smudoshi/Github/Parthenon-EE`.

## Objective

Bring Aurora to the same operational auth/admin baseline as Parthenon, then use that pattern as the Acumenus application standard.

The end state is:

- Aurora keeps Laravel Sanctum as the API token/session mechanism.
- Local email/password login remains available as a controlled fallback.
- Authentik OIDC becomes the primary access path for human users.
- Identity resolution is handled through a driver registry, not hard-coded into `AuthController`.
- OIDC tokens are validated server-side using discovery/JWKS, issuer, audience, expiry, and nonce checks.
- The browser never receives a Sanctum token in an OIDC callback URL.
- JIT provisioning is group-gated and additive-only.
- OIDC login never grants `super-admin`.
- Admin provider configuration is managed through the same protected `/admin/auth-providers` surface Parthenon uses.
- Non-Laravel or tool UIs are protected by the shared Authentik forward-auth infrastructure instead of bespoke credentials.

## Current Reality To Verify First

Do not assume the repo or live environment still matches this document. Start every run with current checks.

```bash
cd /home/smudoshi/Github/Aurora
git status --short
find . -maxdepth 3 -name '.env.example' -o -name 'docker-compose*.yml'
```

Known current Aurora shape from this handoff preparation:

- Backend: Laravel 11, PHP 8.4-ish runtime, Sanctum, Spatie RBAC.
- Frontend: React/Vite.
- Auth path today:
  - `frontend/src/features/auth/pages/LoginPage.tsx`
  - `frontend/src/features/auth/api/authApi.ts`
  - `frontend/src/lib/api-client.ts`
  - `POST /api/auth/login`
  - `backend/app/Http/Controllers/AuthController.php`
  - `backend/app/Services/AuthService.php`
- Aurora admin routes already exist for users, audit, roles, AI providers, and system health in `backend/routes/api.php`.
- Aurora frontend already has an `AuthProvidersPage` and auth-provider TypeScript types, but the backend auth-provider runtime and route group are missing.
- Aurora currently has no OIDC migration/model/service/controller stack comparable to Parthenon.
- Aurora currently has no `firebase/php-jwt` composer dependency, which Parthenon uses for OIDC ID token validation.
- Recent Aurora production troubleshooting showed live-site behavior can diverge from local containers; verify public hostname and served DB state directly.

Important existing live knowledge to re-check, not blindly trust:

- Public host: `https://aurora.acumenus.net`.
- Health: `GET /api/health`.
- Local fallback seed: `admin@acumenus.net` / `superuser`, created by `backend/database/seeders/SuperuserSeeder.php`.
- Failed login attempts can throttle the endpoint; clear Laravel cache before retesting after repeated failures.
- UI-facing patient verification is authenticated `GET /api/patients`, not raw row counts.

## Parthenon Source Of Truth

Use Parthenon as the implementation reference, but do not copy paths blindly. Parthenon exposes `/api/v1/...`; Aurora exposes `/api/...`.

Core backend files in `/home/smudoshi/Github/Parthenon`:

- `backend/app/Contracts/AuthDriverInterface.php`
- `backend/app/Auth/AuthDriverRegistry.php`
- `backend/app/Auth/Drivers/AuthDriverException.php`
- `backend/app/Auth/Drivers/AuthDriverResult.php`
- `backend/app/Auth/Drivers/LocalCredentialsAuthDriver.php`
- `backend/app/Auth/Drivers/AuthentikOidcAuthDriver.php`
- `backend/app/Providers/AuthDriverServiceProvider.php`
- `backend/config/auth-drivers.php`
- `backend/config/services.php` OIDC section
- `backend/app/Providers/AppServiceProvider.php` OIDC service bindings
- `backend/app/Http/Controllers/Api/V1/AuthController.php`
- `backend/app/Http/Controllers/Api/V1/Auth/OidcController.php`
- `backend/app/Services/Auth/Oidc/OidcDiscoveryService.php`
- `backend/app/Services/Auth/Oidc/OidcHandshakeStore.php`
- `backend/app/Services/Auth/Oidc/OidcTokenValidator.php`
- `backend/app/Services/Auth/Oidc/OidcReconciliationService.php`
- `backend/app/Services/Auth/Oidc/ValidatedClaims.php`
- `backend/app/Services/Auth/Oidc/Exceptions/*`
- `backend/app/Models/App/AuthProviderSetting.php`
- `backend/app/Models/App/UserExternalIdentity.php`
- `backend/app/Models/App/OidcEmailAlias.php`
- `backend/app/Http/Controllers/Api/V1/Admin/AuthProviderController.php`
- `backend/database/migrations/2026_03_01_180000_create_auth_provider_settings_table.php`
- `backend/database/migrations/2026_04_13_000001_create_user_external_identities_table.php`
- `backend/database/migrations/2026_04_13_000002_create_oidc_email_aliases_table.php`
- `backend/database/seeders/AuthProviderSeeder.php`

Core frontend files in Parthenon:

- `frontend/src/features/auth/api.ts`
- `frontend/src/features/auth/pages/LoginPage.tsx`
- `frontend/src/features/auth/pages/OidcCallbackPage.tsx`
- `frontend/src/app/router.tsx`
- `frontend/src/features/administration/pages/AuthProvidersPage.tsx`
- `frontend/src/features/administration/api/adminApi.ts`

Infrastructure references:

- `Parthenon-EE/parthenon/acropolis/docker-compose.enterprise.yml`
- `Parthenon-EE/parthenon/acropolis/config/pgadmin/config_local.py`
- `Parthenon-EE/parthenon/acropolis/config/superset/superset_config.py`
- `Parthenon/alfresco/docker-compose.sso-authentik.yml`
- `Parthenon/alfresco/scripts/configure_authentik.py`

## Standard Architecture

### Application-Native Auth

Laravel applications should use this shape:

1. Authentik handles upstream identity, MFA, group membership, and IdP policy.
2. App backend performs OIDC authorization-code flow with PKCE.
3. App backend validates ID token with discovery/JWKS.
4. App backend reconciles the Authentik subject to a local user.
5. App backend issues local Sanctum token.
6. SPA stores the local token exactly as it does for email/password login.
7. All app authorization remains local RBAC/policy based.

This avoids pushing clinical or app-specific authorization into Authentik while still making Authentik the human identity and access-control front door.

### Edge Forward-Auth

Non-Laravel services, admin tools, and infrastructure UIs should not keep separate public login surfaces.

Use Acropolis/Traefik Authentik forward-auth:

- Router middleware: `authentik@docker`.
- Auth address: `http://acropolis-authentik-server:9000/outpost.goauthentik.io/auth/traefik`.
- Trusted response headers:
  - `X-authentik-username`
  - `X-authentik-groups`
  - `X-authentik-email`
  - `X-authentik-name`
  - `X-authentik-uid`
  - `X-authentik-jwt`
  - `X-authentik-meta-*`

Critical rule: never trust `X-authentik-*` headers unless the service is reachable only through the protected internal network and the Traefik middleware injects those headers. If a service can be reached directly, a client can spoof them.

## Authentik Naming And Group Standard

Use a single Authentik instance for Acumenus applications, preferably `https://auth.acumenus.net`.

Per app, create a distinct Authentik OIDC provider/application:

- Parthenon: `parthenon-oidc`
- Aurora: `aurora-oidc`
- Medgnosis: `medgnosis-oidc`
- Data Room/dev portal: `dataroom-oidc` or `acumenus-dataroom-oidc`

Recommended redirect URIs:

- Parthenon: `https://parthenon.acumenus.net/api/v1/auth/oidc/callback`
- Aurora: `https://aurora.acumenus.net/api/auth/oidc/callback`
- Medgnosis: match whatever API prefix that app owns.

Recommended scopes:

```text
openid profile email groups
```

Recommended claim contract:

- `sub`: stable Authentik subject.
- `email`: canonical email.
- `name`: display name.
- `groups`: list of Authentik groups.

Group policy:

- Each app gets one or more allowed login groups.
- JIT creation requires membership in an allowed group.
- JIT users may receive `admin` only if the app intentionally treats the allowed group as an admin group.
- OIDC must never assign `super-admin`.
- `super-admin` is local break-glass and must be granted by an existing super-admin or trusted seed command.

If Acumenus wants one global convention, use explicit app-scoped groups such as:

```text
Acumenus Aurora Users
Acumenus Aurora Admins
Acumenus Parthenon Users
Acumenus Parthenon Admins
Acumenus Platform Super Admins
```

If preserving Parthenon's current convention for now, mirror it with:

```text
Aurora Admins
```

and set `OIDC_ALLOWED_GROUPS` or `services.oidc.allowed_groups` accordingly.

## Backend Implementation Plan For Aurora

### Phase 0 - Preserve And Baseline

- [ ] Record `git status --short`.
- [ ] Do not revert existing Aurora generated build changes unless explicitly instructed.
- [ ] Identify whether current branch is meant for local remediation, PR work, or direct live deployment.
- [ ] Verify current backend/frontend commands before changing package files.
- [ ] Capture current live state:

```bash
curl -k -i https://aurora.acumenus.net/api/health
curl -k -i -H 'Accept: application/json' https://aurora.acumenus.net/api/auth/providers
```

The second command will likely be 404 before this work. That is acceptable as baseline evidence.

### Phase 1 - Dependencies And Config

- [ ] Add OIDC JWT dependency:

```bash
cd /home/smudoshi/Github/Aurora/backend
composer require firebase/php-jwt:^7.0
```

- [ ] Add `backend/config/auth-drivers.php`, copied conceptually from Parthenon:
  - `local` => `App\Auth\Drivers\LocalCredentialsAuthDriver`
  - `authentik-oidc` => `App\Auth\Drivers\AuthentikOidcAuthDriver`
- [ ] Add OIDC config to `backend/config/services.php`.
- [ ] Add `.env.example` entries in both root and backend examples as appropriate:

```env
OIDC_ENABLED=false
OIDC_DISCOVERY_URL=https://auth.acumenus.net/application/o/aurora-oidc/.well-known/openid-configuration
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=https://aurora.acumenus.net/api/auth/oidc/callback
OIDC_ALLOWED_GROUPS=Aurora Admins
LOCAL_AUTH_ENABLED=true
```

- [ ] Prefer a real array parser for allowed groups if you add `OIDC_ALLOWED_GROUPS`; do not hard-code a single Aurora group in service constructors.
- [ ] Confirm Laravel 11 provider registration location. In most Laravel 11 apps, add `App\Providers\AuthDriverServiceProvider::class` to `backend/bootstrap/providers.php`; do not assume old `config/app.php` provider registration.

### Phase 2 - Auth Driver Contract

Port the Parthenon abstraction into Aurora with Aurora namespaces:

- [ ] `backend/app/Contracts/AuthDriverInterface.php`
- [ ] `backend/app/Auth/AuthDriverRegistry.php`
- [ ] `backend/app/Auth/Drivers/AuthDriverException.php`
- [ ] `backend/app/Auth/Drivers/AuthDriverResult.php`
- [ ] `backend/app/Auth/Drivers/LocalCredentialsAuthDriver.php`
- [ ] `backend/app/Auth/Drivers/AuthentikOidcAuthDriver.php`
- [ ] `backend/app/Providers/AuthDriverServiceProvider.php`

Implementation requirements:

- Keep drivers responsible only for identity resolution.
- Keep Sanctum token issuance in controller/service code.
- Local driver must preserve current invalid-credential enumeration protection.
- Local driver must reject inactive users or return a result that the controller rejects consistently.
- OIDC driver receives already validated claims and delegates to reconciliation.
- OIDC users must have `must_change_password=false`.
- OIDC path must never grant `super-admin`.

### Phase 3 - OIDC Services

Port the Parthenon OIDC service stack:

- [ ] `backend/app/Services/Auth/Oidc/OidcDiscoveryService.php`
- [ ] `backend/app/Services/Auth/Oidc/OidcHandshakeStore.php`
- [ ] `backend/app/Services/Auth/Oidc/OidcTokenValidator.php`
- [ ] `backend/app/Services/Auth/Oidc/OidcReconciliationService.php`
- [ ] `backend/app/Services/Auth/Oidc/ValidatedClaims.php`
- [ ] `backend/app/Services/Auth/Oidc/Exceptions/OidcException.php`
- [ ] `backend/app/Services/Auth/Oidc/Exceptions/OidcTokenInvalidException.php`
- [ ] `backend/app/Services/Auth/Oidc/Exceptions/OidcAccessDeniedException.php`

Aurora-specific adjustments:

- Use Aurora's `App\Models\User`.
- Decide whether external identity models live under `App\Models` or `App\Models\App`; Aurora currently uses flatter model namespaces than Parthenon for many app tables.
- Include `is_active=true` on JIT-created users if Aurora requires it.
- Use Aurora's current user fields:
  - Parthenon has `phone_number`, `job_title`, `department`, etc.
  - Aurora has `phone`, `avatar`, `must_change_password`, `is_active`, `last_login_at`.
- Ensure `formatUser` returns the same shape for local and OIDC login.

Security requirements:

- Discovery and JWKS must be fetched with short timeouts and cached.
- Validate signature, issuer, audience, expiry, and nonce.
- Use PKCE: `code_verifier` plus S256 `code_challenge`.
- Store state and one-time exchange codes server-side.
- Consume state and exchange codes atomically/single-use.
- Keep exchange code TTL short: Parthenon uses 60 seconds.
- Keep state TTL short: Parthenon uses 5 minutes.
- Never include the Sanctum token in the callback URL.

### Phase 4 - Identity Link Migrations And Models

Add migrations equivalent to Parthenon, with Aurora timestamp naming:

- [ ] `create_auth_provider_settings_table`
- [ ] `create_user_external_identities_table`
- [ ] `create_oidc_email_aliases_table`

Tables:

```text
auth_provider_settings
  id
  provider_type unique
  display_name
  is_enabled
  priority
  settings encrypted:array
  updated_by nullable foreign key users.id
  timestamps

user_external_identities
  id
  user_id foreign key users.id cascade delete
  provider string
  provider_subject string
  provider_email_at_link nullable
  linked_at timestamp
  timestamps
  unique(provider, provider_subject)
  index(provider, provider_email_at_link)

oidc_email_aliases
  id
  alias_email unique
  canonical_email
  note nullable
  timestamps
  index(canonical_email)
```

Models:

- [ ] `AuthProviderSetting` with encrypted array cast for `settings`.
- [ ] `UserExternalIdentity` with relationship to `User`.
- [ ] `OidcEmailAlias` with case-insensitive `canonicalFor()`.

Do not store client secrets in plaintext JSON.

### Phase 5 - Auth Controllers And Routes

Add an Aurora OIDC controller. Use Parthenon's behavior but Aurora routes:

```php
Route::get('/auth/providers', [OidcController::class, 'providers']);
Route::get('/auth/oidc/redirect', [OidcController::class, 'redirect'])->middleware('throttle:20,1');
Route::get('/auth/oidc/callback', [OidcController::class, 'callback'])->middleware('throttle:20,1');
Route::post('/auth/oidc/exchange', [OidcController::class, 'exchange'])->middleware('throttle:20,1');
```

Requirements:

- `GET /api/auth/providers` must always be reachable and return feature state.
- OIDC redirect/callback/exchange must return 404 when `OIDC_ENABLED=false`.
- Callback must redirect to `/auth/callback?code=...` on the frontend.
- Exchange must return the same auth payload shape as local login.

Response-shape compatibility:

- Aurora currently returns `access_token`.
- Parthenon returns `token`.
- For Acumenus standardization, prefer Parthenon's `token` key long term.
- During Aurora transition, return both keys from OIDC and local login:

```json
{
  "token": "plain-text-sanctum-token",
  "access_token": "plain-text-sanctum-token",
  "user": {}
}
```

Then update the Aurora frontend to prefer `token ?? access_token`.

Refactor `AuthController::login`:

- [ ] Inject `AuthDriverRegistry`.
- [ ] Use the `local` driver.
- [ ] Keep current validation messages and enumeration protection.
- [ ] Load roles/permissions before formatting.
- [ ] Keep `last_login_at`.
- [ ] Write `UserAuditLog` login event if Aurora's audit model supports it.
- [ ] Decide token replacement semantics:
  - Parthenon local login creates a new `auth-token`.
  - Parthenon OIDC callback deletes existing `auth-token` before creating a new one.
  - Aurora currently creates `auth_token` and logout deletes all tokens.
  - Standardize naming to `auth-token` if practical, but do not break existing clients in the same deployment.

### Phase 6 - Admin Auth Provider Runtime

Aurora has frontend admin-provider UI scaffolding, but backend routes are missing. Add:

- [ ] `backend/app/Http/Controllers/Admin/AuthProviderController.php`
- [ ] `backend/database/seeders/AuthProviderSeeder.php`
- [ ] route group under `Route::prefix('admin')->middleware('role:admin|super-admin')`, but protected with `role:super-admin`:

```php
Route::middleware('role:super-admin')->prefix('auth-providers')->group(function () {
    Route::get('/', [AuthProviderController::class, 'index']);
    Route::get('/{providerType}', [AuthProviderController::class, 'show']);
    Route::put('/{providerType}', [AuthProviderController::class, 'update']);
    Route::post('/{providerType}/enable', [AuthProviderController::class, 'enable']);
    Route::post('/{providerType}/disable', [AuthProviderController::class, 'disable']);
    Route::post('/{providerType}/test', [AuthProviderController::class, 'test']);
});
```

Provider seed baseline:

- `ldap`: disabled
- `oauth2`: disabled
- `saml2`: disabled
- `oidc`: disabled, configured for Authentik/Aurora defaults

Admin-controller requirements:

- Partial settings updates must merge with existing settings.
- Settings cast must be encrypted.
- `updated_by` must be set from the current user.
- OIDC test should fetch discovery and report issuer/authorization/token endpoints.
- LDAP test can be copied only if Aurora has LDAP extension support in its runtime; otherwise return a clear "not available" response instead of fataling on missing `ldap_*` functions.

### Phase 7 - Frontend Auth Integration

Update Aurora frontend:

- [ ] Extend `frontend/src/features/auth/api/authApi.ts`:
  - `getProviders()`
  - `exchangeOidcCode(code)`
- [ ] Add `frontend/src/features/auth/pages/OidcCallbackPage.tsx`.
- [ ] Add route `/auth/callback` in `frontend/src/App.tsx`.
- [ ] Add conditional Authentik SSO button to `LoginPage.tsx`.
- [ ] Use backend provider discovery instead of hard-coding button visibility.
- [ ] Store auth with `data.token ?? data.access_token`.
- [ ] Guard the callback against React strict-mode double exchange.
- [ ] Display a deterministic failure state for missing or invalid code.

Suggested API types:

```ts
interface AuthProviders {
  oidc_enabled: boolean;
  oidc_label: string;
  oidc_redirect_path: string;
}

interface AuthResponse {
  token?: string;
  access_token?: string;
  user: User;
}
```

Do not store the one-time OIDC code after exchange. Do not log it.

### Phase 8 - Frontend Admin Integration

Aurora already has:

- `frontend/src/features/administration/api/adminApi.ts`
- `frontend/src/features/administration/pages/AuthProvidersPage.tsx`

Complete the wiring:

- [ ] Add `AuthProvidersPage` lazy import in `frontend/src/App.tsx`.
- [ ] Add route `/admin/auth-providers`.
- [ ] Add an admin-dashboard card or navigation item for "Authentication Providers".
- [ ] Ensure only `super-admin` users can see and use auth-provider configuration.
- [ ] Keep the UI aligned with backend provider types: `ldap`, `oauth2`, `saml2`, `oidc`.
- [ ] Mask secret values in forms. Avoid rendering real client secrets back to the UI after save if possible.

### Phase 9 - Role And Permission Alignment

Do not blindly rename Aurora's domain roles if clinical features already depend on them.

Standard infrastructure roles across Acumenus apps:

- `super-admin`: local break-glass and full platform authority. Never JIT through OIDC.
- `admin`: app administrator. Can be assigned by OIDC JIT when allowed by app policy.
- `viewer`: read-only baseline where applicable.

Aurora domain roles can remain:

- `analyst`
- `clinician`
- oncology/imaging/genomics-specific roles if present

Ensure:

- Last `super-admin` cannot be removed or deleted. Aurora already has this protection; keep tests around it.
- `admin|super-admin` protects operational admin routes.
- `super-admin` protects role management, auth provider config, AI provider secrets, app settings, and dangerous system operations.
- OIDC reconciliation is additive-only for existing users. It must not remove roles.
- Group sync, if added later, must be explicit and tested. Do not silently replace local roles based on Authentik groups.

### Phase 10 - Authentik Setup

Create or verify Authentik provider/application:

- Provider type: OIDC.
- App slug: `aurora-oidc`.
- Redirect URI: `https://aurora.acumenus.net/api/auth/oidc/callback`.
- Scopes: `openid profile email groups`.
- Subject mode: stable per-user UUID/sub from Authentik.
- Include claims: `email`, `name`, `groups`.
- Access policy: require the chosen Aurora group(s).
- Record client id and secret into Aurora production env.

Production Aurora env:

```env
OIDC_ENABLED=true
OIDC_DISCOVERY_URL=https://auth.acumenus.net/application/o/aurora-oidc/.well-known/openid-configuration
OIDC_CLIENT_ID=<from-authentik>
OIDC_CLIENT_SECRET=<from-authentik>
OIDC_REDIRECT_URI=https://aurora.acumenus.net/api/auth/oidc/callback
OIDC_ALLOWED_GROUPS=Aurora Admins
LOCAL_AUTH_ENABLED=true
```

Keep local auth enabled until:

- Authentik login works from public hostname.
- At least two super-admins are verified.
- Backups and rollback are confirmed.

Even after Authentik is primary, keep a documented local break-glass path for outages.

## Acumenus-Wide Standardization Plan

Use this order:

1. Parthenon remains the source model.
2. Aurora gets the same Laravel-native OIDC/AuthDriver/AdminProvider stack.
3. Medgnosis and other Laravel/Fastify apps get an equivalent adapter:
   - Laravel apps use the Parthenon PHP shape.
   - Fastify/Node apps should implement the same contract concept: provider discovery, OIDC callback, one-time exchange, local token issuance, admin-provider config, no token in URL.
4. Non-app tools use Authentik forward-auth at Traefik.
5. Central documentation lists each app's:
   - OIDC app slug
   - redirect URI
   - allowed groups
   - admin route
   - break-glass owner
   - smoke-test URL

Minimum common API for every first-party app:

```text
GET  /api/auth/providers
GET  /api/auth/oidc/redirect
GET  /api/auth/oidc/callback
POST /api/auth/oidc/exchange
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/user
GET  /api/admin/users
GET  /api/admin/roles
GET  /api/admin/auth-providers
GET  /api/admin/system-health
```

Route prefixes may differ by app, but the user-facing contract should be documented and consistent.

## Test Plan

Backend unit/feature tests:

- [ ] Local login succeeds for active seeded admin.
- [ ] Local login fails with same response for unknown email and wrong password.
- [ ] Local login rejects inactive account.
- [ ] `GET /api/auth/providers` returns `oidc_enabled=false` when disabled.
- [ ] OIDC redirect/callback/exchange return 404 when disabled.
- [ ] OIDC redirect returns Authentik authorize URL with state, nonce, PKCE challenge, scopes, client id, and redirect URI.
- [ ] Callback rejects missing state/code.
- [ ] Callback rejects unknown/expired state.
- [ ] Callback rejects token response without `id_token`.
- [ ] Token validator rejects bad signature, issuer mismatch, audience mismatch, nonce mismatch, and missing claims.
- [ ] Reconciliation links by existing external subject.
- [ ] Reconciliation links existing user by exact email.
- [ ] Reconciliation links by approved email alias.
- [ ] Reconciliation rejects non-allowed group.
- [ ] JIT creates active user with `admin` only, never `super-admin`.
- [ ] JIT-created user has `must_change_password=false`.
- [ ] Exchange code is single-use.
- [ ] Exchange code does not appear in logs.
- [ ] Admin auth-provider routes require `super-admin`.
- [ ] Admin user routes still prevent deleting/removing the last super-admin.

Frontend tests:

- [ ] Login page renders local form.
- [ ] Login page fetches provider discovery.
- [ ] Login page hides Authentik button when disabled.
- [ ] Login page shows Authentik button when enabled.
- [ ] Authentik button href uses backend-provided redirect path.
- [ ] Callback page exchanges code once.
- [ ] Callback page stores token from `token ?? access_token`.
- [ ] Callback page redirects home after successful exchange.
- [ ] Callback page renders failure state for missing code.
- [ ] Admin dashboard links to Auth Providers for super-admin.
- [ ] Non-super-admin cannot reach auth-provider UI.

Suggested local validation commands:

```bash
cd /home/smudoshi/Github/Aurora/backend
composer validate
composer audit
php artisan test
php artisan route:list | grep -E 'auth/providers|auth/oidc|admin/auth-providers'

cd /home/smudoshi/Github/Aurora/frontend
npm run lint
npm run typecheck
npm run test
npm run build

cd /home/smudoshi/Github/Aurora
docker compose config --quiet
```

Production smoke checks:

```bash
curl -k -i https://aurora.acumenus.net/api/health
curl -k -s https://aurora.acumenus.net/api/auth/providers
curl -k -I https://aurora.acumenus.net/api/auth/oidc/redirect
```

After a successful Authentik browser login:

- Verify app redirects to `/auth/callback?code=...`, then home/dashboard.
- Verify URL does not contain Sanctum token.
- Verify `/api/auth/user` returns roles and permissions.
- Verify `/api/admin/auth-providers` works for super-admin and fails for admin/non-admin as intended.
- Verify existing local fallback login still works.
- Verify authenticated `/api/patients?per_page=5` still works; this catches "auth works but app data path broke" regressions.

## Deployment Notes

- Run migrations before enabling `OIDC_ENABLED=true`.
- Seed auth providers after migration:

```bash
docker compose exec php php artisan db:seed --class=Database\\Seeders\\AuthProviderSeeder --force
```

- Reseed or verify the local superuser before cutover:

```bash
docker compose exec php php artisan db:seed --class=Database\\Seeders\\SuperuserSeeder --force
docker compose exec php php artisan cache:clear
```

- Clear caches after changing config:

```bash
docker compose exec php php artisan config:clear
docker compose exec php php artisan cache:clear
docker compose exec php php artisan route:clear
```

- If repeated login attempts were made, clear throttle/cache before retesting.
- Keep temporary bearer tokens created for smoke tests out of docs and delete/revoke them afterward.
- Never print `OIDC_CLIENT_SECRET` in logs or final reports.

## Failure Modes To Watch

- Wrong API prefix copied from Parthenon. Aurora should use `/api/auth/...`, not `/api/v1/auth/...`, unless Aurora is intentionally versioned first.
- Authentik redirect URI mismatch. This causes callback or token-exchange failures even when login appears successful at Authentik.
- Missing `groups` claim. JIT will deny everyone if the token does not include groups.
- Cache backend misconfiguration. OIDC state and one-time exchange codes rely on cache `put`/`pull` behavior.
- Clock skew. ID token expiry validation can fail if host time is wrong.
- Generated frontend build files in Aurora can be dirty before you start. Do not confuse those with your source edits.
- Browser callback double-run in React strict mode. Guard exchange with a ref because exchange codes are single-use.
- Accidentally granting `super-admin` from Authentik. Do not do this.
- Trusting `X-authentik-*` headers on direct service ports. Only use them behind forward-auth middleware.

## Completion Criteria

The Aurora work is complete when:

- `GET /api/auth/providers` is live and returns the correct OIDC state.
- Authentik sign-in is visible on the login page when enabled.
- Authentik sign-in works from `https://aurora.acumenus.net`.
- Callback uses one-time exchange and never exposes Sanctum token in URL.
- Local login remains functional for the seeded break-glass superuser.
- OIDC JIT is group-gated and cannot create super-admins.
- Admin Auth Providers route and page are functional and super-admin-only.
- User, role, audit, AI provider, system-health admin surfaces still work.
- Automated backend/frontend tests cover the auth paths above.
- Public smoke checks validate health, login/provider discovery, auth user, admin gating, and `/api/patients`.
- The implementation notes identify any remaining Acumenus apps that still lack the standard Authentik/Admin infrastructure.

