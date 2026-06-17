// =============================================================================
// Medgnosis API — FHIR CapabilityStatement builder (read-only server)
// Declares the implemented resources + ValueSet terminology operations so
// clients (and conformance tooling) can discover the server's capabilities.
// =============================================================================

export function buildCapabilityStatement(fhirBaseUrl: string) {
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    implementation: { description: 'Medgnosis FHIR R4 API', url: fhirBaseUrl },
    fhirVersion: '4.0.1',
    format: ['json'],
    instantiates: [
      'http://hl7.org/fhir/us/core/CapabilityStatement/us-core-server',
    ],
    rest: [
      {
        mode: 'server',
        resource: [
          {
            type: 'Patient',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
            ],
          },
          {
            type: 'Condition',
            interaction: [{ code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns',
            ],
          },
          {
            type: 'Observation',
            interaction: [{ code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-clinical-result',
            ],
          },
          {
            type: 'MedicationRequest',
            interaction: [{ code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest',
            ],
          },
          {
            type: 'ValueSet',
            interaction: [],
            operation: [
              {
                name: 'expand',
                definition: 'http://hl7.org/fhir/OperationDefinition/ValueSet-expand',
              },
              {
                name: 'validate-code',
                definition: 'http://hl7.org/fhir/OperationDefinition/ValueSet-validate-code',
              },
            ],
          },
        ],
      },
    ],
  };
}
