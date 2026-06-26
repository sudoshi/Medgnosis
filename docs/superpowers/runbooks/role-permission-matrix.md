# Medgnosis Role And Permission Matrix

Last updated: 2026-06-26

## Purpose

This runbook records the current backend role gates, permission names, and
route-family expectations for Medgnosis. It is scoped to the API behavior in
the current codebase; frontend visibility should follow this matrix but is not
the authority for access control.

## Role And Permission Source

Backend permission behavior is defined in
`apps/api/src/services/auth/permissions.ts`.

| Role | Current permissions |
| --- | --- |
| `provider` | `patients:read`, `patients:write` |
| `care_coordinator` | `patients:read`, `patients:write` |
| `analyst` | `patients:read` |
| `admin` | `admin:access`, `admin:users`, `admin:audit`, `admin:system-health`, `admin:etl`, `admin:ehr`, `patients:read`, `patients:write` |
| `super_admin` | All `admin` permissions plus `admin:roles`, `admin:auth-providers`, and `admin:ai-providers` |

`super_admin` satisfies `requireRole(['admin'])`. It is not only a separate
role; it inherits admin route access and adds governance-only permissions.

## Route-Family Matrix

| Route family | Gate | Allowed roles or callers | Notes |
| --- | --- | --- | --- |
| `/health` | none | public | Runtime health only. |
| `GET /cds-services` discovery | none | public/EHR callers | Discovery is public by HL7 convention. |
| `POST /cds-services/:id` and `POST /cds-services/:id/feedback` | CDS Hooks authorization helper | EHR/CDS clients with accepted authorization or configured compatibility fallback | Feedback remains under the same root prefix but is not an unauthenticated public route. |
| `/.well-known/jwks.json` | none | public/EHR callers | Exposes SMART Backend Services public signing keys. |
| `/api/v1/auth/providers` | none | public | Returns effective provider, registration, and demo quick-fill policy. |
| `/api/v1/auth/login`, refresh, MFA challenge, password reset, invite activation | route-local auth policy | public or pending-auth callers as route requires | These routes issue or complete authentication and do not use admin role gates. |
| `/api/v1/patients`, `/api/v1/dashboard`, `/api/v1/measures`, and related clinical workspace routes | `authenticate` plus route/helper checks | valid JWT roles; provider-scoped users are narrowed by `provider_id` where implemented | Patient-detail, FHIR, notes, insights, and order handlers use `requirePatientAccess` when a specific patient id is present. |
| `/api/v1/admin/*` | `authenticate` plus `requireRole(['admin'])` | `admin`, `super_admin` | Parent admin plugin gate. Identity review inherits this hook. |
| `/api/v1/admin/system-health` and `/api/v1/admin/system-health/ehr-sync-alerts/dispatch` | `admin:system-health` | `admin`, `super_admin` | Explicit permission gate on top of the admin route family. |
| `/api/v1/admin/auth-providers*` | `requireSuperAdmin` | `super_admin` | Auth-provider listing, mutation, and provider test routes are governance-only. |
| `/api/v1/admin/users` and invite controls | inline route guard plus org scope | `admin`, `super_admin`; `super_admin` remains global | Normal admins are limited to users in their numeric `org_id`, may manage non-super-admin users in that org, and cannot create, invite, resend, revoke, mutate, or grant `super_admin` access. |
| `/api/v1/admin/audit-log` | admin route gate plus org scope | `admin`, `super_admin`; `super_admin` remains global | Normal admins see audit rows joined to actor users in their numeric `org_id`; super-admins see all audit rows, including system rows without a user actor. |
| `/api/v1/ehr/admin/*` | `authenticate` plus `requireRole(['admin'])` | `admin`, `super_admin` | Tenant, SMART, Bulk, schedule, and replay administration. |

## Regression Evidence

The current backend regression set proves the highest-risk gates directly:

- `apps/api/src/plugins/__tests__/auth.test.ts` covers admin-role inheritance,
  normal-role denial, the super-admin-only decorator, `admin:system-health`, and
  `admin:auth-providers`.
- `apps/api/src/routes/admin/index.test.ts` covers normal-admin denial for auth
  provider list/update, super-admin access to supported provider surfaces,
  normal-admin denial before persistence/audit when attempting to create or
  grant `super_admin`, org-scoped admin-user listing/mutation/invite behavior,
  super-admin target-org assignment for non-super-admin invites, and
  actor-user-org-scoped normal-admin audit-log reads.
- `apps/api/src/routes/ehr/admin.test.ts` covers `super_admin` inheritance
  through EHR admin route gates.
- `apps/api/src/services/ehr/bulkData.test.ts` covers tenant id and tenant org
  mismatches before Bulk import side effects begin.

Focused command:

```bash
npm run test --workspace=apps/api -- \
  src/plugins/__tests__/auth.test.ts \
  src/routes/admin/index.test.ts \
  src/routes/ehr/admin.test.ts \
  src/services/ehr/bulkData.test.ts
```

## Residual Gaps

- Role-specific frontend visibility should be expanded with web E2E coverage so
  normal admins cannot reach governance tabs through navigation or direct URL
  entry, even though backend enforcement is the authority.
- Normal-admin audit-log reporting is intentionally actor-user scoped in this
  tranche. A separate product/security decision is still needed before exposing
  org-owned system or worker audit rows to non-super-admins.
- Patient and clinical workspace routes rely on route-specific provider/patient
  scoping. They are not fully proved by the admin RBAC matrix tests and should
  keep separate patient-access regression coverage.
