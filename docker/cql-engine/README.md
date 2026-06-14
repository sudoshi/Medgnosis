# Medgnosis CQL Engine — clinical-reasoning sidecar

The Phase 1 CQL measure engine. Runs FHIR `Measure/$evaluate-measure` so Medgnosis
can compute standardized eCQMs/dQMs in CQL instead of bespoke SQL.

## Engine artifact (confirmed by the 2026-06-13 Task 1 spike)

- **Image:** `hapiproject/hapi:latest` — HAPI FHIR JPA starter, **version 8.10.0**.
  (The standalone `cqf-ruler` is retired; HAPI's built-in clinical-reasoning module
  is the maintained successor.)
- **Enable CR:** `-e hapi.fhir.cr.enabled=true` (R4). `/fhir/metadata` then advertises
  `$evaluate-measure`. An `application-cds.yaml` profile with CR-tuned defaults also ships.
- **Store:** in-memory H2 by default (fine for dev/CI); point at Postgres for persistence.
- **Resources:** ~1.3 GB JVM heap (`JAVA_OPTS=-Xmx1300m -Xms512m`), ~1.8 GB container cap.
  Boots in ~3–4 min. No OOM observed at this cap.

### Run (dev)

```bash
docker run -d --name medgnosis-cql-engine \
  --network medgnosis_medgnosis -m 1800m \
  -e hapi.fhir.cr.enabled=true -e JAVA_OPTS="-Xmx1300m -Xms512m" \
  -p 18080:8080 hapiproject/hapi:latest
# verify + smoke:
scripts/cql-engine-smoke.sh
```

## Data-feeding mode (DECISION)

**Mode B — load resources into the sidecar's JPA store** (FHIR transaction `PUT`),
then `$evaluate-measure` runs against them. This is HAPI's native model; pull-from-
external is not. For Phase 1, load a **sample cohort** of QI-Core resources (mapped
by `fhir/mappers.ts`) + the measure's `Library`/`Measure` + value sets, evaluate, and
reconcile against the SQL path. Full-population loading is a later phase.

## Gotchas learned (feed these into the Phase 1 plan)

1. **`reportType`** must be an R4 enum: `subject | subject-list | population`
   (`summary` is rejected — use `population` for aggregate reports).
2. **`Measure.group.population` elements require an `id`** (dQM-era constraint).
3. **Runtime CQL translation is fragile** for inline `text/cql` libraries — the
   translator resolves libraries by name/version and fails on version mismatch
   (`Could not load source for library X, version null`). **Ship pre-compiled ELM**
   (`application/elm+json` content) from CI (`scripts/cql-compile.sh`) rather than
   relying on runtime translation. The spike succeeded once versions were consistent.
4. `Library` needs `name` (matched by the source provider), not just `id`/`url`.

## Files

- `spike-bundle.json` — minimal proportion measure (CQL Library + Measure + 1 Patient)
  proven to evaluate to a valid MeasureReport. Used by `scripts/cql-engine-smoke.sh`.
