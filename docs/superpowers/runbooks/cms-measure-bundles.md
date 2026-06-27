# CMS eCQM Measure-Bundle Fetch And Cache Runbook

Last updated: 2026-06-27

## Purpose

This runbook covers how Medgnosis fetches and caches the official CMS electronic
clinical quality measure (eCQM) FHIR/QI-Core measure bundles for a target
reporting year. These bundles (each a FHIR `Bundle` carrying the published
`Measure`, its `Library` ELM/CQL, and referenced value-set `ValueSet` resources)
are the authoritative artifact behind real measure execution, semantic-drift
dossiers, and CMS122-style promotion holds. They are operator-fetched, never
committed, and always validated before use.

## Official Source

The measure bundles originate from the CMS eCQM program. Operators supply the
exact published base URL through the `ECQM_BUNDLE_SOURCE_URL` environment
variable; the URL is never hardcoded in the repository.

Canonical pointers for locating the correct per-reporting-year bundles:

- eCQI Resource Center eCQM content (annual published measure packages):
  https://ecqi.healthit.gov/ecqms
- MADiE (Measure Authoring Development Integrated Environment) measure export:
  https://madie.cms.gov/
- eCQM content GitHub releases (per reporting year):
  https://github.com/cms-enterprise (eCQM content repositories)

Pick the bundle distribution that matches the **target reporting year** and the
QI-Core/FHIR eCQM flavor (not the QDM/HQMF flavor). Record the exact source,
release tag, and reporting year in the release evidence.

## Target Reporting Year

The default target reporting year is defined in
`scripts/cms-measure-bundles.manifest.json` (`reportingYear`). The current
default is **2026**. Override per-run with `--year YYYY` when staging a future
reporting year. Bundles cache under a year-scoped directory so multiple
reporting years can coexist.

When the reporting year advances, bump `reportingYear` and the per-measure
`version` / `bundleFile` entries in the manifest to the newly published eCQM
release, then re-run a real fetch.

## Target Portfolio

The initial portfolio is defined in `scripts/cms-measure-bundles.manifest.json`:

| eCQM | Version | Domain | Title |
| ---- | ------- | ------ | ----- |
| CMS122 | CMS122v13 | diabetes | Diabetes: Hemoglobin A1c (HbA1c) Poor Control (> 9%) |
| CMS165 | CMS165v13 | cardiovascular | Controlling High Blood Pressure |
| CMS130 | CMS130v13 | preventive-cancer-screening | Colorectal Cancer Screening |
| CMS125 | CMS125v13 | preventive-cancer-screening | Breast Cancer Screening |
| CMS124 | CMS124v13 | preventive-cancer-screening | Cervical Cancer Screening |

CMS122, CMS165, CMS130, and CMS125 are the four plan measures. **CMS124
(Cervical Cancer Screening)** is the deliberately chosen additional non-diabetes
measure: it rounds out preventive cancer screening alongside CMS130/CMS125 and,
together with CMS165, keeps the portfolio from being diabetes-only. Versions in
the manifest track the published reporting-year eCQM release and must be updated
when the target reporting year changes.

## Cache Location

Bundles cache under `data/cms-bundles/<reportingYear>/<bundleFile>`, for example
`data/cms-bundles/2026/CMS122-v13-FHIR.json`. The entire `data/cms-bundles/`
tree is gitignored — official bundles are operator-fetched and must never be
committed to the repository. Override the cache root with `--cache-dir <path>`
or the `CMS_BUNDLE_CACHE_DIR` environment variable.

## How To Run

### Dry run (no network, no writes)

Preview exactly what would be fetched and where it would cache. Safe to run with
no `ECQM_BUNDLE_SOURCE_URL` set:

```bash
./scripts/fetch-cms-measure-bundles.sh --dry-run
```

The dry run prints, per measure, the resolved target URL pattern and the cache
destination path, then a per-measure summary. It performs no network access.

### Real fetch (operator-run, requires network access)

The actual download requires network access to the official CMS eCQM source and
is therefore **operator-run** (it is not exercised in CI or in this repository's
offline environment):

```bash
ECQM_BUNDLE_SOURCE_URL=https://<official-host>/ecqm/bundles \
  ./scripts/fetch-cms-measure-bundles.sh
```

For each measure the script fetches
`${ECQM_BUNDLE_SOURCE_URL%/}/<reportingYear>/<bundleFile>`, validates the
response is JSON with `resourceType: "Bundle"`, and writes it atomically into the
cache. The fetch is **idempotent**: an already-cached, structurally valid bundle
is reported as `cached` and not re-downloaded. Use `--force` to re-download.

If the official source needs an opaque authorization header, pass it via
`ECQM_BUNDLE_AUTH_HEADER` (e.g. `Authorization: Bearer ...`). The header value
is read from the environment only and is never printed or logged. Do not put
credentials on the command line or in the repository.

### Useful flags

```bash
./scripts/fetch-cms-measure-bundles.sh --help        # full usage
./scripts/fetch-cms-measure-bundles.sh --year 2027   # stage a future year
./scripts/fetch-cms-measure-bundles.sh --force       # re-download cached bundles
./scripts/fetch-cms-measure-bundles.sh --manifest <path> --cache-dir <path>
```

## Expected Behavior And Exit Codes

- Per measure, the script reports one of: `would-fetch` (dry run), `fetched`,
  `cached`, `failed-download`, or `failed-validation`.
- It prints a `Fetched / Cached / Failed` tally for real fetches.
- A downloaded artifact that is not valid JSON, or whose top-level
  `resourceType` is not `Bundle`, is rejected (the partial file is discarded and
  the measure is counted as failed).
- Exit `0`: dry run completed, or all targeted bundles present and valid.
- Exit `1`: one or more bundles failed download or Bundle validation.
- Exit `2`: usage / configuration error (missing `jq`, missing/invalid manifest,
  missing `ECQM_BUNDLE_SOURCE_URL` on a real fetch, bad flag).

## Evidence To Record

- Commit under validation.
- Official source URL, release tag, and reporting year used.
- `./scripts/fetch-cms-measure-bundles.sh --dry-run` output (portfolio preview).
- Real-fetch `Fetched / Cached / Failed` summary and resulting cache paths.
- Bundle file checksums if a specific fetch is pinned for a release.
- Any measure left out of the portfolio and why.

## Relationship To Measure Governance

These cached official bundles are the upstream input to real measure execution
and to semantic-drift comparison against the local SQL baseline. They do **not**
by themselves promote any measure. CMS122 and any other measure remain on their
governed authority model until the criteria in `qdm-bridge-operations.md` are
met. Fetching or refreshing a bundle is non-authoritative and never changes a
promotion status on its own.
