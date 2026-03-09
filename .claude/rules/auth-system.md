# Authentication System — DO NOT MODIFY

## CRITICAL: Protected Auth Components

The following authentication system is production-deployed and MUST NOT be overwritten, removed, or architecturally changed without explicit user authorization:

### Backend (apps/api/)
- `apps/api/src/routes/auth/index.ts` — Auth endpoints (login, register, change-password, refresh, logout, me)
- `apps/api/src/plugins/auth.ts` — JWT plugin with must_change_password in payload
- Resend API integration for temp password delivery (inline in auth routes)

### Shared Package (packages/shared/)
- `packages/shared/src/types/auth.ts` — User and JwtPayload types include must_change_password
- `packages/shared/src/schemas/index.ts` — registerRequestSchema, changePasswordSchema

### Frontend (apps/web/)
- `apps/web/src/pages/LoginPage.tsx` — Login form with "Create Account" link
- `apps/web/src/pages/RegisterPage.tsx` — Registration form (firstName, lastName, email, phone)
- `apps/web/src/components/ChangePasswordModal.tsx` — Non-dismissable forced password change modal
- `apps/web/src/stores/auth.ts` — Zustand store with setUser() for must_change_password updates
- `apps/web/src/components/AuthGuard.tsx` — Renders ChangePasswordModal when must_change_password is true

### Database Schema
- `app_users` table includes: must_change_password (boolean, default true)
- Role CHECK constraint: provider, analyst, admin, care_coordinator
- Demo users registered with role 'analyst'

## Enforced Auth Flow (MediCosts Paradigm)

1. Visitor clicks "Create Account" on login page
2. Enters: first name, last name, email, phone (optional)
3. Backend generates 12-char temp password (excludes I, l, O, 0)
4. Temp password emailed via Resend API (from: Medgnosis <noreply@acumenus.net>)
5. Visitor logs in with temp password
6. Non-dismissable ChangePasswordModal forces permanent password (min 8 chars)
7. After password change: must_change_password = false, full app access

## Rules

1. **NEVER remove the "Create Account" link from LoginPage.tsx**
2. **NEVER remove or make the ChangePasswordModal dismissable**
3. **NEVER bypass the must_change_password flow in AuthGuard**
4. **NEVER change the email sender from noreply@acumenus.net**
5. **NEVER hardcode the Resend API key in source code** (use RESEND_API_KEY env var)
6. **NEVER remove email enumeration prevention** (register returns same message for existing/new emails)
7. **NEVER weaken password requirements** (min 8 chars, bcrypt 12 rounds)
8. **NEVER remove rate limiting** on auth endpoints
9. **Superuser account** `admin@acumenus.net` must always exist with must_change_password=false
10. **If modifying auth**, preserve ALL existing endpoints and their behavior — additions only
11. **NEVER remove must_change_password from the JWT payload** — frontend depends on it

## Resend Configuration
- API Key: RESEND_API_KEY in .env (git-ignored)
- From: `Medgnosis <noreply@acumenus.net>`
- EMAIL_FROM env var controls sender
