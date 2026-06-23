# DEVLOG — Authentik "Medgnosis Admins" group (fleet SSO alignment)

**Date:** 2026-06-22
**Author:** Sanjay Udoshi (with Claude Code)
**Status:** Applied in Authentik (no code change / no redeploy)
**Scope:** Authentik IdP configuration only — Medgnosis application code is unchanged.

---

## Summary

As part of bringing uniform "Login with Authentik" SSO + admin access to all six
Acumenus apps, Medgnosis's Authentik configuration was completed: a
**"Medgnosis Admins"** group was created (the 7 Parthenon admins) and bound to the
`medgnosis-oidc` application as a **second** access binding alongside the existing
"Medgnosis Users" group.

No Medgnosis source code changed and no redeploy was required — the live backend
already references `OIDC_ADMIN_GROUPS=Medgnosis Admins` (in both `.env.production`
and the seeded `auth_provider_settings` row from migration 069); the group simply
did not exist yet.

## Background

Medgnosis OIDC has been live since 2026-06-20. Its reconciliation uses two tiers:
- `OIDC_ALLOWED_GROUPS = Medgnosis Users` → role `analyst`
- `OIDC_ADMIN_GROUPS  = Medgnosis Admins` → role `admin`

The `medgnosis-oidc` app was bound only to **"Medgnosis Users"** (11 collaborators,
incl. external members like `alondhe@boehringer-ingelheim.com`). Two consequences:
1. The 6 internal Parthenon-admin humans signed in as **analyst**, not admin.
2. The `admin` service account (`admin@acumenus.net`) was **not** in Medgnosis Users,
   so it could not launch the app at all.

## Change

Created group **"Medgnosis Admins"** with the 7 admins
(`sudoshi, ebruno, kpatel, jdawe, dmuraco, gbock, admin`) and added it as a second
policy binding (order 1, enabled) on `medgnosis-oidc`. The existing "Medgnosis Users"
binding and membership are untouched.

Result (policy engine mode = `any`, so membership in *either* group grants launch):
- The 7 internal admins (now in "Medgnosis Admins") → role **admin** on next SSO login
  (reconciliation promotes existing non-admins in an admin group; never to super_admin).
- The 5 external collaborators (in "Medgnosis Users" only) → unchanged, role **analyst**.
- The `admin` service account can now launch Medgnosis.

This was done via the Authentik REST API using the bootstrap token in
`Parthenon/acropolis/.env`. It is additive and reversible (delete the group/binding
to revert).

## Verification

- `GET https://medgnosis.acumenus.net/api/v1/auth/providers` → `oidc_enabled: true` (unchanged)
- `GET .../api/v1/auth/oidc/redirect` → `302` to Authentik authorize (unchanged)
- Authentik: `medgnosis-oidc` now bound to both "Medgnosis Users" and "Medgnosis Admins";
  the latter has all 7 members.

## Cross-reference

Part of the fleet-wide rollout that also shipped OIDC to COPE and MediCosts. See
`reference_authentik_sso_fleet` in Claude memory for the per-app slug/group/redirect map.
