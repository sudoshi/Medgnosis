// =============================================================================
// Unit tests - FHIR Measure/Library criteria extraction for QDM bridge analytics
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql, mockTxUnsafe } = vi.hoisted(() => {
  const txUnsafe = vi.fn();
  return {
    mockTxUnsafe: txUnsafe,
    mockSql: {
      unsafe: vi.fn(),
      begin: vi.fn(async (cb: (tx: { unsafe: typeof txUnsafe }) => Promise<unknown>) =>
        cb({ unsafe: txUnsafe }),
      ),
    },
  };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  parseMeasureDataCriteriaFromBundle,
  upsertMeasureDataCriteriaFromBundle,
} from './measureCriteria.js';

const OFFICE_VISIT_OID = '2.16.840.1.113883.3.526.3.1240';
const DIABETES_OID = '2.16.840.1.113883.3.464.1003.103.12.1001';
const HOSPICE_OID = '2.16.840.1.113883.3.464.1003.1165';

const elm = {
  library: {
    identifier: { id: 'CMS122FHIRDiabetesAssessGreaterThan9Percent', version: '1.0.000' },
    includes: {
      def: [
        {
          localIdentifier: 'Hospice',
          path: 'http://ecqi.healthit.gov/ecqms/Hospice',
          version: '1.0.000',
        },
      ],
    },
    valueSets: {
      def: [
        {
          name: 'Office Visit',
          id: `http://cts.nlm.nih.gov/fhir/ValueSet/${OFFICE_VISIT_OID}`,
          localId: 'vs-office',
        },
        {
          name: 'Diabetes',
          id: `http://cts.nlm.nih.gov/fhir/ValueSet/${DIABETES_OID}`,
          localId: 'vs-diabetes',
        },
      ],
    },
    codeSystems: {
      def: [{ name: 'LOINC', id: 'http://loinc.org' }],
    },
    codes: {
      def: [
        {
          name: 'Glucose management indicator',
          id: '97506-0',
          display: 'Glucose management indicator',
          codeSystem: { name: 'LOINC' },
          localId: 'code-gmi',
        },
      ],
    },
    statements: {
      def: [
        {
          name: 'Initial Population',
          localId: 'stmt-ip',
          locator: '10:1-12:5',
          expression: {
            type: 'And',
            operand: [
              { type: 'ExpressionRef', name: 'Qualifying Encounters' },
              { type: 'ExpressionRef', name: 'Diabetes Condition' },
            ],
          },
        },
        {
          name: 'Denominator',
          localId: 'stmt-denom',
          expression: { type: 'ExpressionRef', name: 'Initial Population' },
        },
        {
          name: 'Denominator Exclusions',
          localId: 'stmt-denom-excl',
          expression: {
            type: 'ExpressionRef',
            name: 'Has Hospice Services',
            libraryName: 'Hospice',
          },
        },
        {
          name: 'Numerator',
          localId: 'stmt-num',
          expression: {
            type: 'Retrieve',
            localId: 'ret-gmi',
            locator: '30:5-30:40',
            dataType: '{http://hl7.org/fhir}Observation',
            templateId: 'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-observation-lab',
            codeProperty: 'code',
            codeComparator: '=',
            codes: { type: 'CodeRef', name: 'Glucose management indicator', localId: 'code-ref-gmi' },
          },
        },
        {
          name: 'Qualifying Encounters',
          localId: 'stmt-enc',
          expression: {
            type: 'Exists',
            operand: {
              type: 'Retrieve',
              localId: 'ret-office',
              locator: '20:5-20:35',
              dataType: '{http://hl7.org/fhir}Encounter',
              templateId: 'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-encounter',
              codeProperty: 'type',
              codeComparator: 'in',
              codes: { type: 'ValueSetRef', name: 'Office Visit', localId: 'vs-ref-office' },
            },
          },
        },
        {
          name: 'Diabetes Condition',
          localId: 'stmt-diabetes',
          expression: {
            type: 'Retrieve',
            localId: 'ret-diabetes',
            dataType: '{http://hl7.org/fhir}Condition',
            templateId:
              'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-condition-encounter-diagnosis',
            codeProperty: 'code',
            codeComparator: 'in',
            codes: { type: 'ValueSetRef', name: 'Diabetes', localId: 'vs-ref-diabetes' },
          },
        },
      ],
    },
  },
};

const hospiceElm = {
  library: {
    identifier: { id: 'Hospice', version: '1.0.000' },
    valueSets: {
      def: [
        {
          name: 'Hospice Encounter',
          id: `http://cts.nlm.nih.gov/fhir/ValueSet/${HOSPICE_OID}`,
          localId: 'vs-hospice',
        },
      ],
    },
    statements: {
      def: [
        {
          name: 'Has Hospice Services',
          localId: 'stmt-hospice',
          expression: {
            type: 'Exists',
            operand: {
              type: 'Retrieve',
              localId: 'ret-hospice',
              dataType: '{http://hl7.org/fhir}Encounter',
              templateId: 'http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-encounter',
              codeProperty: 'type',
              codeComparator: 'in',
              codes: { type: 'ValueSetRef', name: 'Hospice Encounter', localId: 'vs-ref-hospice' },
            },
          },
        },
      ],
    },
  },
};

const bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      resource: {
        resourceType: 'Measure',
        id: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
        url: 'https://madie.cms.gov/Measure/CMS122FHIRDiabetesAssessGreaterThan9Percent',
        name: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
        library: ['https://madie.cms.gov/Library/CMS122FHIRDiabetesAssessGreaterThan9Percent|1.0.000'],
        group: [
          {
            population: [
              {
                id: 'pop-ip',
                code: { coding: [{ code: 'initial-population' }] },
                criteria: { expression: 'Initial Population' },
              },
              {
                id: 'pop-denom',
                code: { coding: [{ code: 'denominator' }] },
                criteria: { expression: 'Denominator' },
              },
              {
                id: 'pop-num',
                code: { coding: [{ code: 'numerator' }] },
                criteria: { expression: 'Numerator' },
              },
              {
                id: 'pop-denom-excl',
                code: { coding: [{ code: 'denominator-exclusion' }] },
                criteria: { expression: 'Denominator Exclusions' },
              },
            ],
          },
        ],
      },
    },
    {
      resource: {
        resourceType: 'Library',
        id: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
        url: 'https://madie.cms.gov/Library/CMS122FHIRDiabetesAssessGreaterThan9Percent',
        name: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
        dataRequirement: [
          {
            type: 'Encounter',
            profile: ['http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-encounter'],
            mustSupport: ['type', 'period'],
            codeFilter: [
              {
                path: 'type',
                valueSet: `http://cts.nlm.nih.gov/fhir/ValueSet/${OFFICE_VISIT_OID}`,
              },
            ],
          },
          {
            type: 'Observation',
            profile: ['http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-observation-lab'],
            codeFilter: [
              {
                path: 'code',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '97506-0',
                    display: 'Glucose management indicator',
                  },
                ],
              },
            ],
          },
        ],
        content: [
          {
            contentType: 'application/elm+json',
            data: Buffer.from(JSON.stringify(elm), 'utf8').toString('base64'),
          },
        ],
      },
    },
    {
      resource: {
        resourceType: 'Library',
        id: 'Hospice',
        url: 'https://madie.cms.gov/Library/Hospice',
        name: 'Hospice',
        content: [
          {
            contentType: 'application/elm+json',
            data: Buffer.from(JSON.stringify(hospiceElm), 'utf8').toString('base64'),
          },
        ],
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseMeasureDataCriteriaFromBundle', () => {
  it('extracts unclassified Library data requirements and population-scoped ELM retrieves', () => {
    const result = parseMeasureDataCriteriaFromBundle({
      measureCode: 'CMS122v12',
      bundle,
    });

    expect(result.measureId).toBe('CMS122FHIRDiabetesAssessGreaterThan9Percent');
    expect(result.libraryId).toBe('CMS122FHIRDiabetesAssessGreaterThan9Percent');
    expect(result.populationExpressions).toEqual([
      expect.objectContaining({ populationRole: 'initial_population', expression: 'Initial Population' }),
      expect.objectContaining({ populationRole: 'denominator', expression: 'Denominator' }),
      expect.objectContaining({ populationRole: 'numerator', expression: 'Numerator' }),
      expect.objectContaining({ populationRole: 'denominator_exclusion', expression: 'Denominator Exclusions' }),
    ]);

    const dataRequirement = result.criteria.find(
      (row) => row.sourceMethod === 'fhir_library_data_requirement' && row.valueSetOid === OFFICE_VISIT_OID,
    );
    expect(dataRequirement).toMatchObject({
      populationRole: 'unclassified',
      fhirResourceType: 'Encounter',
      qdmCategory: 'Encounter',
      qdmDatatype: 'Encounter, Performed',
      codeFilterPath: 'type',
      mustSupport: ['type', 'period'],
    });
    expect(dataRequirement?.criteriaPayload.measure).toMatchObject({
      populationExpressions: expect.any(Array),
    });

    const denominatorOfficeVisit = result.criteria.find(
      (row) =>
        row.sourceMethod === 'elm_retrieve_traversal' &&
        row.populationRole === 'denominator' &&
        row.valueSetOid === OFFICE_VISIT_OID,
    );
    expect(denominatorOfficeVisit).toMatchObject({
      criteriaName: 'Office Visit',
      fhirResourceType: 'Encounter',
      qdmDatatype: 'Encounter, Performed',
      elmExpressionName: 'Denominator',
      elmPath: 'Denominator > Initial Population > Qualifying Encounters',
    });

    const numeratorDirectCode = result.criteria.find(
      (row) =>
        row.sourceMethod === 'elm_retrieve_traversal' &&
        row.populationRole === 'numerator' &&
        row.directCode === '97506-0',
    );
    expect(numeratorDirectCode).toMatchObject({
      criteriaName: 'Glucose management indicator',
      fhirResourceType: 'Observation',
      qdmCategory: 'Laboratory Test',
      qdmDatatype: 'Laboratory Test, Performed',
      directCodeSystem: 'http://loinc.org',
      directCodeDisplay: 'Glucose management indicator',
    });

    const hospiceExclusion = result.criteria.find(
      (row) =>
        row.sourceMethod === 'elm_retrieve_traversal' &&
        row.populationRole === 'denominator_exclusion' &&
        row.valueSetOid === HOSPICE_OID,
    );
    expect(hospiceExclusion).toMatchObject({
      libraryId: 'Hospice',
      criteriaName: 'Hospice Encounter',
      fhirResourceType: 'Encounter',
      qdmDatatype: 'Encounter, Performed',
      elmExpressionName: 'Denominator Exclusions',
      elmPath: 'Denominator Exclusions > Hospice.Has Hospice Services',
    });
  });

  it('can parse a serialized bundle and disable ELM traversal for inventory-only loads', () => {
    const result = parseMeasureDataCriteriaFromBundle({
      measureCode: 'CMS122v12',
      bundle: JSON.stringify(bundle),
      includeElmRetrieves: false,
    });

    expect(result.criteria).toHaveLength(2);
    expect(result.criteria.every((row) => row.populationRole === 'unclassified')).toBe(true);
  });
});

describe('upsertMeasureDataCriteriaFromBundle', () => {
  it('resolves artifact lineage and upserts criteria rows with JSONB recordset payloads', async () => {
    mockSql.unsafe.mockResolvedValueOnce([{ measure_artifact_id: 56, measure_id: 122 }]);
    mockTxUnsafe.mockResolvedValueOnce([{ id: 9001 }, { id: 9002 }]);

    const result = await upsertMeasureDataCriteriaFromBundle({
      measureCode: 'CMS122v12',
      bundle,
      includeElmRetrieves: false,
    });

    expect(result).toMatchObject({
      measureArtifactId: 56,
      legacyMeasureId: 122,
      rowsParsed: 2,
      rowsDeleted: 0,
      rowsUpserted: 2,
      criteriaIds: [9001, 9002],
    });

    expect(mockSql.unsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM phm_edw.measure_artifact ma'),
      ['CMS122v12'],
    );
    expect(mockSql.begin).toHaveBeenCalledTimes(1);
    const upsertQuery = mockTxUnsafe.mock.calls[0]?.[0] as string;
    const params = mockTxUnsafe.mock.calls[0]?.[1] as string[];
    expect(upsertQuery).toContain("jsonb_to_recordset(($1::jsonb #>> '{}')::jsonb)");
    expect(upsertQuery).toContain('INSERT INTO phm_edw.measure_data_criteria');
    expect(upsertQuery).toContain('ON CONFLICT ON CONSTRAINT uq_measure_data_criteria');

    const rows = JSON.parse(params[0]!) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      measure_code: 'CMS122v12',
      measure_artifact_id: 56,
      measure_id: 122,
      population_role: 'unclassified',
    });
  });

  it('can replace an artifact criteria inventory before upserting', async () => {
    mockSql.unsafe.mockResolvedValueOnce([{ measure_artifact_id: 56, measure_id: null }]);
    mockTxUnsafe
      .mockResolvedValueOnce([{ count: 1 }, { count: 1 }, { count: 1 }])
      .mockResolvedValueOnce([{ id: 9101 }, { id: 9102 }]);

    const result = await upsertMeasureDataCriteriaFromBundle({
      measureCode: 'CMS122v12',
      bundle,
      includeElmRetrieves: false,
      replaceExisting: true,
    });

    expect(result.rowsDeleted).toBe(3);
    expect(mockTxUnsafe.mock.calls[0]?.[0]).toContain('DELETE FROM phm_edw.measure_data_criteria');
    expect(mockTxUnsafe.mock.calls[1]?.[0]).toContain('INSERT INTO phm_edw.measure_data_criteria');
  });

  it('fails before parsing when artifact lineage is missing', async () => {
    mockSql.unsafe.mockResolvedValueOnce([]);

    await expect(
      upsertMeasureDataCriteriaFromBundle({
        measureCode: 'CMS999v1',
        bundle,
      }),
    ).rejects.toThrow('No measure_artifact row found');

    expect(mockSql.begin).not.toHaveBeenCalled();
  });
});
