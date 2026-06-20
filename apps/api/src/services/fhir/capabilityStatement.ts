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
    software: { name: 'Medgnosis FHIR R4 API', version: '1.0.0' },
    implementation: { description: 'Medgnosis FHIR R4 API', url: fhirBaseUrl },
    fhirVersion: '4.0.1',
    format: ['json'],
    instantiates: [
      'http://hl7.org/fhir/us/core/CapabilityStatement/us-core-server',
    ],
    rest: [
      {
        mode: 'server',
        // Token-based (OAuth2 bearer) — this is an app-authenticated facade, not
        // a SMART-launchable server, so SMART launch URIs are intentionally not declared.
        security: {
          cors: true,
          service: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/restful-security-service',
                  code: 'OAuth',
                  display: 'OAuth',
                },
              ],
              text: 'OAuth2 bearer token',
            },
          ],
        },
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
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'Observation',
            interaction: [{ code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-clinical-result',
            ],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'MedicationRequest',
            interaction: [{ code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest',
            ],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'DiagnosticReport',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab',
            ],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'DocumentReference',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference',
            ],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'ServiceRequest',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-servicerequest',
            ],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'CarePlan',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-careplan',
            ],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'CareTeam',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-careteam',
            ],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'Goal',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-goal',
            ],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'Coverage',
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            supportedProfile: [
              'http://hl7.org/fhir/us/core/StructureDefinition/us-core-coverage',
            ],
            searchParam: [{ name: 'patient', type: 'reference' }],
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
