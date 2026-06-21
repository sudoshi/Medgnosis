# integrations/ — external clinical systems (FUTURE DIRECTIVE)

Scaffolding for Medgnosis ↔ external clinical system connectivity. **Off by
default; not wired into the running app.** Stub methods throw
`IntegrationNotImplementedError`.

- `epic-fhir` — rides the existing `../ehr/` layer (SMART/UDAP/bulk). Tracked here
  for a unified status registry only.
- `lis.ts` — Laboratory Information System (FHIR `DiagnosticReport`/`Observation`,
  HL7v2 `ORU`).
- `risPacs.ts` — RIS/PACS imaging via DICOMweb. The shared Orthanc PACS is already
  reachable at `http://parthenon-orthanc:8042` on the `acropolis-backend` network.

Full directive, standards, and wiring checklist:
**`docs/EXTERNAL-CLINICAL-INTEGRATIONS-DIRECTIVE.md`**.
