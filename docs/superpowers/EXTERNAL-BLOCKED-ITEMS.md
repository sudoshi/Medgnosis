# External-Blocked Completion Items

Created: 2026-06-26
Source: completion sweep of `docs/superpowers/plans/2026-06-18-medgnosis-application-completion-plan.md`

This document inventories the remaining plan items that **cannot be completed by code changes alone** because they depend on external credentials, external validators, live vendor sandboxes, or human/governance sign-off. For each, it records the maximum in-repo scaffolding that exists (or should exist) and the exact external action required to close it. An agent swarm can build everything up to these seams but cannot cross them.

These are deliberately separated from the in-repo code work so the completion plan's open checkboxes are not mistaken for "not started" when they are in fact "built and waiting on an external dependency."

---

## 1. EHR vendor sandbox evidence (Plan Phase 3 / Phase 4)

**Blocked items:** Epic sandbox + Oracle Cerner sandbox — registration, launch, callback, FHIR read, patient context, and evidence capture.

**In-repo today (no external dep):**
- Tenant registry, strict SMART launch validation, one-time handoff binding, callback ID-token/nonce/issuer/audience validation.
- Vendor adapters (`apps/api/src/services/ehr/vendorAdapters/`) including a generic SMART adapter.
- Bulk kickoff/poll/import worker + mock Bulk server integration tests.
- Readiness evidence API/UI, capability drift detection, backend token diagnostics.

**Why blocked:** Requires live vendor sandbox client credentials, registered redirect URIs on the vendor side, and a real authorization-server endpoint. None can be created from inside this repository.

**To unblock (operator action):**
1. Register Medgnosis as a SMART app in the Epic and Cerner sandbox developer portals; obtain client IDs / JWKS registration.
2. Add the sandbox tenants via the existing tenant onboarding path (do **not** hardcode secrets — use env/secret refs per `docs/superpowers/runbooks/environment-separation.md`).
3. Run a live launch → callback → FHIR read → patient context, and capture the readiness-evidence rows + audit trail as the sandbox evidence artifact.
4. Add sandbox replay fixtures (where the vendor license permits) under the EHR fixtures path so the path becomes a regression test.

> SMART Health IT generic sandbox is already the low-risk regression fixture and does **not** need a vendor account; keep it as the default CI fixture.

---

## 2. External standards/reporting validators (Plan Phase 5)

**Blocked items:** QRDA Cat I / Cat III validation via Cypress/CVU+; QPP JSON validation against the official QPP submission sandbox.

**In-repo today (built by the parallel reporting workstream):**
- Deterministic Cat I, Cat III, and QPP fixtures plus `scripts/qrda-validate.sh` and `scripts/qpp-validate.sh`.
- Both scripts pass **local structural** checks and **explicitly skip** the external validator when the command env vars are unset (so CI stays green without external access).
- FHIR / DEQM validation runs offline-by-default with optional live-terminology override.

**Why blocked:** Cypress/CVU+ and the QPP submission API are external services requiring their own installation/credentials and a designated reporting year.

**To unblock (operator action):**
1. Install Cypress/CVU+ for the target reporting year; set `QRDA_CVU_CAT1_CMD` / `QRDA_CVU_CAT3_CMD` to the validator invocation.
2. Set `QPP_VALIDATE_CMD` to the QPP submission-sandbox/schema validator invocation.
3. Re-run `./scripts/qrda-validate.sh` and `./scripts/qpp-validate.sh`; capture the external pass as release evidence.
4. For live FHIR terminology evidence, set `FHIR_VALIDATOR_TX` / `FHIR_VALIDATOR_TX_CACHE`.

---

## 3. Measure promotion decisions (Plan Phase 5)

**Blocked item:** CMS122 (and subsequent measures) promotion decision — keep on manual hold, SQL-remediate, QDM/QI-Core remediate, or promote CQL to authoritative.

**In-repo today:**
- SQL remains the authoritative evaluator (`MEASURE_EVALUATOR=sql`); per-measure promotion config is the source of truth.
- Semantic-drift dossier + `testDeckCoverage` surfaced in `MeasureDossier`.
- CMS122 is intentionally blocked by documented semantic drift.

**Why blocked:** Promotion is a clinical/product governance decision, not a code change. It requires clinical/product sign-off on denominator/numerator/exclusion/initial-population differences.

**To unblock:** Clinical + product owner review of the drift dossier and a recorded promotion decision per measure. Do **not** flip `MEASURE_EVALUATOR=cql` globally until reconciliation + performance gates pass.

---

## 4. Compliance & customer-readiness (Plan Phase 9)

**Blocked items:** HIPAA/BAA evidence package; clinical safety governance policy; customer pilot checklist; training/support material.

**In-repo today:**
- PHI redaction for Pino structured logs and Sentry telemetry is implemented and regression-tested.
- Auth/session + mutation audit coverage is PHI-safe and broad.

**Why blocked:** These are governance/legal/operational artifacts grounded in real-world vendor relationships, hosting/backup controls, signed BAAs, and organizational policy — not derivable from code.

**To unblock (governance action):**
1. Vendor list + AI-provider BAA status (the AI cloud path is already BAA-gated and default-off in code — record the actual BAA state).
2. Hosting/backup controls + access-control/audit evidence (the audit log already exists; export it as evidence).
3. Clinical safety policy: human-review policy, alert-fatigue monitoring, AI disclaimer/provenance, measure-promotion sign-off, EHR-writeback restrictions (writeback is code-flagged off by default).
4. Pilot checklist + clinician/admin/EHR-ops/measure-governance training docs.

---

## 5. Live operational evidence (Plan Phase 3 / 4 / 8)

**Blocked items:** Configured external alert destination; live stale-data / Bulk incident rehearsal evidence; backup/restore drill; operational dashboards against a real metrics backend.

**In-repo today:**
- PHI-safe EHR sync alert snapshots with webhook signing; alerting is wired but inert until configured.
- Stale-data / Bulk incident runbooks exist.

**To unblock (operator action):**
1. Set `EHR_SYNC_ALERTING_ENABLED=true`, `EHR_SYNC_ALERT_WEBHOOK_URL`, and `EHR_SYNC_ALERT_WEBHOOK_SECRET` to a real destination.
2. Execute the incident runbooks once against a non-prod tenant and capture the rehearsal evidence.
3. Run a database restore drill + Solr/index rebuild-from-DB per the deployment runbooks.
4. Stand up the chosen observability backend (the open decision on the production observability stack) and point the new system-health metrics at it.

---

## Summary

| Area | In-repo work | External seam |
|------|--------------|---------------|
| Vendor sandboxes | tenant registry, launch/callback, adapters, fixtures | Epic/Cerner credentials + live endpoints |
| QRDA/QPP validation | fixtures + skip-aware validate scripts | Cypress/CVU+ + QPP sandbox install |
| Measure promotion | drift dossier, SQL authoritative | clinical/product sign-off |
| HIPAA/BAA/pilot/training | PHI redaction + audit | governance/legal artifacts |
| Live ops evidence | alerting wired, runbooks written | configured destinations + rehearsal runs |

Everything above is **built to the seam**. Closing each requires an external credential, an external validator, a live vendor endpoint, or a human decision — not additional application code.
