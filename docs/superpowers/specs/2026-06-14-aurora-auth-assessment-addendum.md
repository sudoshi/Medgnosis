# Aurora Auth Migration — Independent Assessment Addendum

> Companion to `2026-06-14-aurora-parthenon-auth-admin-handoff.md`.
> Produced 2026-06-14 by an independent 13-agent audit (a parallel Claude session),
> while a Codex agent was actively executing the handoff. **Codex owns execution;
> this is verification + a gap list to feed it.** Do not let two agents edit the
> same Aurora files simultaneously.

## Verdict: ~88% complete, security-complete

The 10 implementation phases are essentially **code-complete and wired** on branch
`v2/phase-0-scaffold`. Backend auth suite was green at audit time (`php artisan test`
→ 38 tests / 333 assertions); frontend `tsc --noEmit` exits 0. Of the 11 Completion
Criteria, **9 are met**; the 2 unmet are *"automated tests cover the auth paths"*
(the OIDC half) and *"public smoke checks"*. Those are exactly the files Codex is
writing now — so the items below are **"confirm coverage includes,"** not "missing."

## Security — CONFIRMED (all 8 adversarial verdicts held, no bypass)

Verified against live code in `backend/app/Services/Auth/Oidc/*`, `backend/app/Auth/Drivers/*`,
`backend/app/Http/Controllers/Auth/OidcController.php`:

1. ID-token validation does signature (JWKS) + issuer + audience + nonce + (firebase) expiry.
2. PKCE S256 (`code_verifier` + `code_challenge`).
3. `state` (TTL 300s) and one-time exchange `code` (TTL 60s) are server-side + single-use.
4. **No Sanctum token in the callback URL** — callback redirects to `/auth/callback?code=…`; token returned only via `POST /auth/oidc/exchange`.
5. JIT is group-gated (`OIDC_ALLOWED_GROUPS`, real array parse) and **additive-only** (never removes roles).
6. OIDC **never grants `super-admin`**; JIT users get `admin` only, `must_change_password=false`, `is_active=true`.
7. Discovery/JWKS fetched with short timeouts + cached.
8. Secrets never logged / never in URLs; admin endpoints mask secrets.

### Already-fixed — do NOT re-flag (these were false positives in early passes)
- **Admin secret masking is present.** `backend/app/Http/Controllers/Admin/AuthProviderController.php` `present()`→`maskSecrets()` replaces any `/(secret|password|private_key)/i` key with sentinel `__stored__`, and `update()` strips the sentinel so it never overwrites stored secrets.
- **Frontend super-admin gating is present.** `frontend/src/components/ui/RequireSuperAdmin.tsx` wraps `/admin/auth-providers` (`App.tsx`); `navigation.ts` has the entry `superAdminOnly: true`; the dashboard card is `isSuperAdmin()`-gated.

## Remaining gaps — confirm these are covered

**Backend tests (the load-bearing work; port from `Parthenon/backend/tests/Unit/Services/Auth/Oidc/` and `Feature/Auth/OidcRoutesTest.php`):**
- `OidcTokenValidatorTest` — bad signature, issuer/audience/nonce mismatch, missing `sub/email/name`, **and an `exp`-missing/expired case** (see hardening #2).
- `OidcReconciliationServiceTest` — link-by-subject (no mutation), link-by-email (roles preserved, no admin added), link-by-alias (super-admin survives), **reject non-allowed group (no user/identity created)**, **JIT `admin` only — never `super-admin`**, `must_change_password=false`. NB Aurora namespaces: `App\Models\Auth\UserExternalIdentity`, roles guard `sanctum`, default allowed group `Aurora Admins`, model table `app.oidc_email_aliases`.
- `OidcEmailAliasTest` — case-insensitive `canonicalFor()`.
- `OidcAuthenticationTest` / `OidcRoutesTest` — `GET /auth/oidc/callback` **404 when disabled** (currently redirect+exchange asserted, callback not); enabled `redirect` emits 302 `Location` with `state`, `nonce`, `code_challenge…S256`, scopes, `client_id`, `redirect_uri`; callback rejects missing/unknown/expired state and a token response lacking `id_token`.
- `Admin/UserManagementTest` — **last-super-admin guard** (422 when deleting / removing super-admin role from the only super-admin). Phase 9 explicitly requires this test.
- `AuthenticationTest` — HTTP-level **enumeration parity**: unknown-email POST returns byte-identical status+body to wrong-password.

**Frontend tests:** `/auth/providers` MSW handler in `frontend/src/test/mocks/handlers.ts`; `OidcCallbackPage.test.tsx` (exchanges once via `useRef` strict-mode guard; stores `token ?? access_token`; failure state on missing code); LoginPage SSO button hidden/shown by `oidc_enabled`; `AuthProvidersPage` super-admin gating.

**Smoke (Completion Criterion):** extend `e2e/tests/smoke.spec.ts` (or a CI curl script) to cover `/api/health`, `GET /api/auth/providers` shape, `/api/auth/user`, admin-gating 403 for non-super-admin, and `/api/patients`.

**Atomic commit:** stage the untracked OIDC stack + new tests **as one commit** — `App.tsx`/`navigation.ts` already reference untracked files (`OidcCallbackPage.tsx`, `RequireSuperAdmin.tsx`), so a partial commit breaks the build. The 69 deleted `backend/public/build/assets/*.js` are regenerated build artifacts — do not revert them.

## Two LOW hardening items (optional; both in `OidcTokenValidator::validate`)
Both match Parthenon, so they are not regressions — but worth applying during the test pass:

```php
// after JWK::parseKeySet, before JWT::decode:
JWT::$leeway = 30; // tolerate small clock skew vs the IdP

// after decode, before the issuer check — require exp so a token minted
// without exp cannot validate indefinitely (firebase only checks exp if present):
if (! isset($payload['exp']) || ! is_numeric($payload['exp'])) {
    throw new OidcTokenInvalidException('missing_claim', "Required claim 'exp' missing or non-numeric");
}
```
Minor smells noted, not blocking: `OidcProviderConfig` resolved at container-bind time in `AppServiceProvider`; `AuthService::register` still mints `auth_token` (new paths use `auth-token`) and an orphaned `AuthService::login` returns only `access_token`.

## Verification commands
```bash
cd /home/smudoshi/Github/Aurora/backend && php artisan test --filter='Auth|Oidc|UserManagement'
cd /home/smudoshi/Github/Aurora/frontend && npx tsc --noEmit && npx vite build && npx vitest run src/features/auth src/features/administration
cd /home/smudoshi/Github/Aurora && npx playwright test e2e/tests/smoke.spec.ts
# CI gate is Pint:
cd /home/smudoshi/Github/Aurora/backend && ./vendor/bin/pint --test
```
