// =============================================================================
// Medgnosis API - FHIR Measure/Library data criteria extraction
// Converts packaged executable eCQM artifacts into durable definition-side
// criteria rows that link FHIR/QI-Core requirements to QDM and VSAC analytics.
// =============================================================================

import { createHash } from 'node:crypto';
import { sql } from '@medgnosis/db';

type UnsafeParameter = NonNullable<Parameters<typeof sql.unsafe>[1]>[number];

export type MeasureCriteriaPopulationRole =
  | 'initial_population'
  | 'denominator'
  | 'denominator_exclusion'
  | 'numerator'
  | 'supplemental'
  | 'unclassified';

export type MeasureCriteriaSourceMethod =
  | 'fhir_library_data_requirement'
  | 'elm_retrieve_traversal';

export interface MeasurePopulationExpression {
  populationId?: string;
  populationRole: MeasureCriteriaPopulationRole;
  expression: string;
  description?: string;
}

export interface MeasureDataCriteriaRow {
  measureCode: string;
  measureArtifactId?: number;
  measureId?: number | null;
  libraryId: string;
  libraryUrl?: string;
  libraryName?: string;
  criteriaId: string;
  criteriaName?: string;
  populationRole: MeasureCriteriaPopulationRole;
  fhirResourceType: string;
  qicoreProfile?: string;
  qdmCategory?: string;
  qdmDatatype?: string;
  codeFilterPath?: string;
  valueSetOid?: string;
  valueSetUrl?: string;
  directCodeSystem?: string;
  directCode?: string;
  directCodeDisplay?: string;
  mustSupport: string[];
  elmExpressionName?: string;
  elmLocalId?: string;
  elmPath?: string;
  criteriaPayload: Record<string, unknown>;
  sourceMethod: MeasureCriteriaSourceMethod;
  mappingConfidence?: number;
}

export interface ParseMeasureDataCriteriaInput {
  measureCode: string;
  bundle: unknown;
  primaryLibraryId?: string;
  primaryLibraryUrl?: string;
  includeDataRequirements?: boolean;
  includeElmRetrieves?: boolean;
}

export interface MeasureDataCriteriaParseResult {
  measureId: string;
  measureUrl?: string;
  measureName?: string;
  libraryId: string;
  libraryUrl?: string;
  libraryName?: string;
  populationExpressions: MeasurePopulationExpression[];
  criteria: MeasureDataCriteriaRow[];
  warnings: string[];
}

export interface UpsertMeasureDataCriteriaInput extends ParseMeasureDataCriteriaInput {
  measureArtifactId?: number;
  replaceExisting?: boolean;
}

export interface UpsertMeasureDataCriteriaResult extends MeasureDataCriteriaParseResult {
  measureArtifactId: number;
  legacyMeasureId: number | null;
  rowsParsed: number;
  rowsDeleted: number;
  rowsUpserted: number;
  criteriaIds: number[];
}

interface ArtifactBindingRow {
  measure_artifact_id: number | string;
  measure_id: number | string | null;
}

interface PersistedCriteriaIdRow {
  id: number | string;
}

interface FhirBundle {
  resourceType: 'Bundle';
  entry?: Array<{ fullUrl?: string; resource?: FhirResource }>;
}

interface FhirResource {
  resourceType?: string;
  id?: string;
  url?: string;
  name?: string;
  title?: string;
  library?: unknown[];
  group?: unknown[];
  dataRequirement?: unknown[];
  content?: unknown[];
  [key: string]: unknown;
}

interface ElmMaps {
  statementsByName: Map<string, Record<string, unknown>>;
  valueSetsByName: Map<string, ElmValueSetDef>;
  codesByName: Map<string, ElmCodeDef>;
  codeSystemsByName: Map<string, string>;
  includesByAlias: Map<string, ElmIncludeDef>;
}

interface ElmIncludeDef {
  localIdentifier: string;
  path?: string;
  version?: string;
}

interface ElmValueSetDef {
  name: string;
  id?: string;
  localId?: string;
  locator?: string;
}

interface ElmCodeDef {
  name: string;
  id?: string;
  display?: string;
  system?: string;
  systemName?: string;
  localId?: string;
  locator?: string;
}

interface ElmTraversalContext {
  measureCode: string;
  measurePayload: Record<string, unknown>;
  population: MeasurePopulationExpression;
  registry: ElmLibraryRegistry;
  warnings: string[];
}

interface ElmLibraryRegistry {
  units: ElmLibraryUnit[];
  byKey: Map<string, ElmLibraryUnit>;
}

interface ElmLibraryUnit {
  library: FhirResource;
  identity: LibraryIdentity;
  elm: Record<string, unknown>;
  maps: ElmMaps;
}

interface LibraryIdentity {
  id: string;
  url?: string;
  name?: string;
}

const UNKNOWN_RESOURCE_TYPE = 'Unknown';

export function parseMeasureDataCriteriaFromBundle(
  input: ParseMeasureDataCriteriaInput,
): MeasureDataCriteriaParseResult {
  const measureCode = normalizeRequired(input.measureCode, 'measureCode');
  const bundle = normalizeBundle(input.bundle);
  const resources = resourcesFromBundle(bundle);
  const measure = selectMeasure(resources);
  const library = selectPrimaryLibrary(resources, measure, input);
  const libraryIdentity = identityForLibrary(library);
  const populationExpressions = populationExpressionsFromMeasure(measure);
  const measurePayload = {
    measureId: measure.id,
    measureUrl: measure.url,
    measureName: measure.name ?? measure.title,
    populationExpressions,
  };
  const criteria: MeasureDataCriteriaRow[] = [];
  const warnings: string[] = [];

  if (input.includeDataRequirements !== false) {
    criteria.push(
      ...criteriaFromDataRequirements({
        measureCode,
        measurePayload,
        library,
        libraryIdentity,
      }),
    );
  }

  if (input.includeElmRetrieves !== false) {
    const registry = elmLibraryRegistry(resources);
    const primaryUnit = resolveLibraryUnitForResource(registry, library);
    if (primaryUnit) {
      criteria.push(
        ...criteriaFromElm({
          measureCode,
          measurePayload,
          populationExpressions,
          primaryLibrary: primaryUnit,
          registry,
          warnings,
        }),
      );
    } else {
      warnings.push(`Library ${libraryIdentity.id} has no decodable application/elm+json content`);
    }
  }

  return {
    measureId: measure.id ?? 'unknown-measure',
    measureUrl: stringValue(measure.url),
    measureName: stringValue(measure.name ?? measure.title),
    libraryId: libraryIdentity.id,
    libraryUrl: libraryIdentity.url,
    libraryName: libraryIdentity.name,
    populationExpressions,
    criteria: dedupeCriteria(criteria),
    warnings,
  };
}

export async function upsertMeasureDataCriteriaFromBundle(
  input: UpsertMeasureDataCriteriaInput,
): Promise<UpsertMeasureDataCriteriaResult> {
  const measureCode = normalizeRequired(input.measureCode, 'measureCode');
  const binding = await resolveArtifactBinding(measureCode, input.measureArtifactId);
  if (!binding) {
    throw new Error(`No measure_artifact row found for measureCode ${measureCode}`);
  }

  const parsed = parseMeasureDataCriteriaFromBundle({ ...input, measureCode });
  const measureArtifactId = toPositiveInteger(binding.measure_artifact_id, 'measureArtifactId');
  const legacyMeasureId = nullablePositiveInteger(binding.measure_id);
  const criteria = parsed.criteria.map((row) => ({
    ...row,
    measureArtifactId,
    measureId: legacyMeasureId,
  }));

  const result = await sql.begin(async (tx) => {
    let rowsDeleted = 0;
    if (input.replaceExisting) {
      const deleted = await tx.unsafe<{ count: number | string }[]>(
        `
        DELETE FROM phm_edw.measure_data_criteria
        WHERE measure_artifact_id = $1
        RETURNING 1 AS count
        `,
        [measureArtifactId],
      );
      rowsDeleted = deleted.length;
    }

    if (criteria.length === 0) {
      return { rowsDeleted, ids: [] as number[] };
    }

    const rows = await tx.unsafe<PersistedCriteriaIdRow[]>(
      `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(($1::jsonb #>> '{}')::jsonb) AS r(
          measure_code text,
          measure_artifact_id bigint,
          measure_id int,
          library_id text,
          library_url text,
          library_name text,
          criteria_id text,
          criteria_name text,
          population_role text,
          fhir_resource_type text,
          qicore_profile text,
          qdm_category text,
          qdm_datatype text,
          code_filter_path text,
          value_set_oid text,
          value_set_url text,
          direct_code_system text,
          direct_code text,
          direct_code_display text,
          must_support jsonb,
          elm_expression_name text,
          elm_local_id text,
          elm_path text,
          criteria_payload jsonb,
          source_method text,
          mapping_confidence numeric
        )
      )
      INSERT INTO phm_edw.measure_data_criteria
        (measure_code, measure_artifact_id, measure_id, library_id, library_url,
         library_name, criteria_id, criteria_name, population_role,
         fhir_resource_type, qicore_profile, qdm_category, qdm_datatype,
         code_filter_path, value_set_oid, value_set_url,
         direct_code_system, direct_code, direct_code_display, must_support,
         elm_expression_name, elm_local_id, elm_path, criteria_payload,
         source_method, mapping_confidence)
      SELECT measure_code,
             measure_artifact_id,
             measure_id,
             library_id,
             library_url,
             library_name,
             criteria_id,
             criteria_name,
             population_role,
             fhir_resource_type,
             qicore_profile,
             qdm_category,
             qdm_datatype,
             code_filter_path,
             value_set_oid,
             value_set_url,
             direct_code_system,
             direct_code,
             direct_code_display,
             COALESCE(must_support, '[]'::jsonb),
             elm_expression_name,
             elm_local_id,
             elm_path,
             COALESCE(criteria_payload, '{}'::jsonb),
             source_method,
             mapping_confidence
      FROM incoming
      ON CONFLICT ON CONSTRAINT uq_measure_data_criteria
      DO UPDATE SET
        measure_code         = EXCLUDED.measure_code,
        measure_id           = EXCLUDED.measure_id,
        library_url          = EXCLUDED.library_url,
        library_name         = EXCLUDED.library_name,
        criteria_name        = EXCLUDED.criteria_name,
        qdm_category         = EXCLUDED.qdm_category,
        value_set_url        = EXCLUDED.value_set_url,
        direct_code_display  = EXCLUDED.direct_code_display,
        must_support         = EXCLUDED.must_support,
        elm_expression_name  = EXCLUDED.elm_expression_name,
        elm_local_id         = EXCLUDED.elm_local_id,
        elm_path             = EXCLUDED.elm_path,
        criteria_payload     = EXCLUDED.criteria_payload,
        source_method        = EXCLUDED.source_method,
        mapping_confidence   = EXCLUDED.mapping_confidence,
        updated_at           = NOW()
      RETURNING id
      `,
      [asUnsafeJson(criteria.map(persistableCriteriaRow))],
    );

    return {
      rowsDeleted,
      ids: rows.map((row) => toPositiveInteger(row.id, 'criteria id')),
    };
  });

  return {
    ...parsed,
    measureArtifactId,
    legacyMeasureId,
    criteria,
    rowsParsed: criteria.length,
    rowsDeleted: result.rowsDeleted,
    rowsUpserted: result.ids.length,
    criteriaIds: result.ids,
  };
}

function criteriaFromDataRequirements(input: {
  measureCode: string;
  measurePayload: Record<string, unknown>;
  library: FhirResource;
  libraryIdentity: LibraryIdentity;
}): MeasureDataCriteriaRow[] {
  const rows: MeasureDataCriteriaRow[] = [];
  const requirements = recordArray(input.library.dataRequirement);

  requirements.forEach((requirement, requirementIndex) => {
    const fhirResourceType = normalizeResourceType(stringValue(requirement['type']));
    const profiles = stringArray(requirement['profile']);
    const qicoreProfile = profiles[0];
    const mustSupport = stringArray(requirement['mustSupport']);
    const codeFilters = recordArray(requirement['codeFilter']);
    const base = {
      measureCode: input.measureCode,
      libraryId: input.libraryIdentity.id,
      libraryUrl: input.libraryIdentity.url,
      libraryName: input.libraryIdentity.name,
      populationRole: 'unclassified' as const,
      fhirResourceType,
      qicoreProfile,
      mustSupport,
      elmExpressionName: undefined,
      elmLocalId: undefined,
      elmPath: undefined,
      sourceMethod: 'fhir_library_data_requirement' as const,
    };

    if (codeFilters.length === 0) {
      rows.push(
        dataRequirementRow({
          ...base,
          requirement,
          requirementIndex,
          codeFilter: null,
          codeFilterIndex: null,
          criterionName: `${fhirResourceType} data requirement`,
          measurePayload: input.measurePayload,
        }),
      );
      return;
    }

    codeFilters.forEach((codeFilter, codeFilterIndex) => {
      const path = stringValue(codeFilter['path']);
      const valueSetUrl = stringValue(codeFilter['valueSet']);
      const valueSetOid = valueSetUrl ? valueSetOidFromUrl(valueSetUrl) : undefined;
      if (valueSetUrl) {
        rows.push(
          dataRequirementRow({
            ...base,
            requirement,
            requirementIndex,
            codeFilter,
            codeFilterIndex,
            criterionName: `${fhirResourceType} ${path ?? 'code'} value set`,
            measurePayload: input.measurePayload,
            codeFilterPath: path,
            valueSetUrl,
            valueSetOid,
          }),
        );
      }

      const directCodes = recordArray(codeFilter['code']);
      directCodes.forEach((coding, codingIndex) => {
        const directCode = stringValue(coding['code']);
        if (!directCode) return;
        rows.push(
          dataRequirementRow({
            ...base,
            requirement,
            requirementIndex,
            codeFilter,
            codeFilterIndex,
            criterionName: `${fhirResourceType} ${path ?? 'code'} direct code`,
            measurePayload: input.measurePayload,
            codeFilterPath: path,
            directCodeSystem: stringValue(coding['system']),
            directCode,
            directCodeDisplay: stringValue(coding['display']),
            codeOrdinal: codingIndex,
          }),
        );
      });

      if (!valueSetUrl && directCodes.length === 0) {
        rows.push(
          dataRequirementRow({
            ...base,
            requirement,
            requirementIndex,
            codeFilter,
            codeFilterIndex,
            criterionName: `${fhirResourceType} ${path ?? 'code'} filter`,
            measurePayload: input.measurePayload,
            codeFilterPath: path,
          }),
        );
      }
    });
  });

  return rows;
}

function dataRequirementRow(input: {
  measureCode: string;
  measurePayload: Record<string, unknown>;
  libraryId: string;
  libraryUrl?: string;
  libraryName?: string;
  populationRole: MeasureCriteriaPopulationRole;
  fhirResourceType: string;
  qicoreProfile?: string;
  mustSupport: string[];
  sourceMethod: MeasureCriteriaSourceMethod;
  requirement: Record<string, unknown>;
  requirementIndex: number;
  codeFilter: Record<string, unknown> | null;
  codeFilterIndex: number | null;
  criterionName: string;
  codeFilterPath?: string;
  valueSetUrl?: string;
  valueSetOid?: string;
  directCodeSystem?: string;
  directCode?: string;
  directCodeDisplay?: string;
  codeOrdinal?: number;
}): MeasureDataCriteriaRow {
  const qdm = qdmMappingForRequirement(
    input.fhirResourceType,
    input.qicoreProfile,
    input.criterionName,
    input.valueSetUrl,
  );
  const criteriaIdValue = criteriaId('dr', {
    libraryId: input.libraryId,
    fhirResourceType: input.fhirResourceType,
    qicoreProfile: input.qicoreProfile,
    requirementIndex: input.requirementIndex,
    codeFilterPath: input.codeFilterPath,
    codeFilterIndex: input.codeFilterIndex,
    valueSetOid: input.valueSetOid,
    valueSetUrl: input.valueSetUrl,
    directCodeSystem: input.directCodeSystem,
    directCode: input.directCode,
    codeOrdinal: input.codeOrdinal,
  });
  return {
    measureCode: input.measureCode,
    libraryId: input.libraryId,
    libraryUrl: input.libraryUrl,
    libraryName: input.libraryName,
    criteriaId: criteriaIdValue,
    criteriaName: input.criterionName,
    populationRole: input.populationRole,
    fhirResourceType: input.fhirResourceType,
    qicoreProfile: input.qicoreProfile,
    qdmCategory: qdm.category,
    qdmDatatype: qdm.datatype,
    codeFilterPath: input.codeFilterPath,
    valueSetOid: input.valueSetOid,
    valueSetUrl: input.valueSetUrl,
    directCodeSystem: input.directCodeSystem,
    directCode: input.directCode,
    directCodeDisplay: input.directCodeDisplay,
    mustSupport: input.mustSupport,
    criteriaPayload: {
      measure: input.measurePayload,
      dataRequirement: compactPayload(input.requirement),
      codeFilter: input.codeFilter ? compactPayload(input.codeFilter) : undefined,
      requirementIndex: input.requirementIndex,
      codeFilterIndex: input.codeFilterIndex,
      extraction: {
        note: 'FHIR Library.dataRequirement is resource inventory and does not by itself prove population role membership.',
      },
    },
    sourceMethod: input.sourceMethod,
    mappingConfidence: qdm.confidence,
  };
}

function criteriaFromElm(input: {
  measureCode: string;
  measurePayload: Record<string, unknown>;
  populationExpressions: MeasurePopulationExpression[];
  primaryLibrary: ElmLibraryUnit;
  registry: ElmLibraryRegistry;
  warnings: string[];
}): MeasureDataCriteriaRow[] {
  const rows: MeasureDataCriteriaRow[] = [];

  input.populationExpressions.forEach((population) => {
    const statement = input.primaryLibrary.maps.statementsByName.get(population.expression);
    if (!statement) {
      input.warnings.push(`ELM statement not found for population expression ${population.expression}`);
      return;
    }

    rows.push(
      ...criteriaFromElmStatement({
        measureCode: input.measureCode,
        measurePayload: input.measurePayload,
        population,
        registry: input.registry,
        warnings: input.warnings,
        primaryLibrary: input.primaryLibrary,
      }),
    );
  });

  return rows;
}

function criteriaFromElmStatement(
  context: ElmTraversalContext & { primaryLibrary: ElmLibraryUnit },
): MeasureDataCriteriaRow[] {
  const rows: MeasureDataCriteriaRow[] = [];
  const visitedStatements = new Set<string>();

  const visitStatement = (
    libraryUnit: ElmLibraryUnit,
    name: string,
    stack: string[],
    displayName = name,
  ): void => {
    const visitKey = `${libraryUnit.identity.id}:${name}`;
    if (visitedStatements.has(visitKey)) return;
    visitedStatements.add(visitKey);
    const statement = libraryUnit.maps.statementsByName.get(name);
    if (!statement) return;

    visitNode(libraryUnit, statement['expression'], statement, [...stack, displayName]);
  };

  const visitNode = (
    libraryUnit: ElmLibraryUnit,
    node: unknown,
    statement: Record<string, unknown>,
    stack: string[],
  ): void => {
    if (!isRecord(node)) return;
    const nodeType = stringValue(node['type']);

    if (nodeType === 'Retrieve') {
      rows.push(...rowsFromElmRetrieve(context, libraryUnit, statement, node, stack));
    }

    if (nodeType === 'ExpressionRef') {
      const expressionName = stringValue(node['name']);
      const libraryName = stringValue(node['libraryName']);
      if (expressionName && !libraryName) {
        visitStatement(libraryUnit, expressionName, stack);
      } else if (expressionName && libraryName) {
        const referencedLibrary = resolveIncludedLibrary(context.registry, libraryUnit, libraryName);
        if (referencedLibrary) {
          visitStatement(referencedLibrary, expressionName, stack, `${libraryName}.${expressionName}`);
        } else {
          context.warnings.push(
            `External ELM expression reference ${libraryName}.${expressionName} was not traversed`,
          );
        }
      }
    }

    if (nodeType === 'FunctionRef') {
      const functionName = stringValue(node['name']);
      const libraryName = stringValue(node['libraryName']);
      if (functionName && !libraryName) {
        visitStatement(libraryUnit, functionName, stack);
      } else if (functionName && libraryName) {
        const referencedLibrary = resolveIncludedLibrary(context.registry, libraryUnit, libraryName);
        if (referencedLibrary) {
          visitStatement(referencedLibrary, functionName, stack, `${libraryName}.${functionName}`);
        } else {
          context.warnings.push(`External ELM function reference ${libraryName}.${functionName} was not traversed`);
        }
      }
    }

    Object.entries(node).forEach(([key, value]) => {
      if (key === 'annotation') return;
      if (Array.isArray(value)) {
        value.forEach((item) => visitNode(libraryUnit, item, statement, stack));
      } else {
        visitNode(libraryUnit, value, statement, stack);
      }
    });
  };

  visitStatement(context.primaryLibrary, context.population.expression, []);
  return rows;
}

function rowsFromElmRetrieve(
  context: ElmTraversalContext,
  libraryUnit: ElmLibraryUnit,
  statement: Record<string, unknown>,
  retrieve: Record<string, unknown>,
  stack: string[],
): MeasureDataCriteriaRow[] {
  const fhirResourceType = normalizeResourceType(resourceTypeFromElmDataType(stringValue(retrieve['dataType'])));
  const qicoreProfile = stringValue(retrieve['templateId']);
  const codeFilterPath = stringValue(retrieve['codeProperty']);
  const refs = codeRefsFromElm(retrieve['codes']);
  const qdm = qdmMappingForRequirement(fhirResourceType, qicoreProfile, refs.map((ref) => ref.name).join(' '), undefined);

  if (refs.length === 0) {
    return [
      elmRetrieveRow({
        context,
        libraryUnit,
        statement,
        retrieve,
        stack,
        fhirResourceType,
        qicoreProfile,
        qdm,
        codeFilterPath,
        criteriaName: `${context.population.expression} ${fhirResourceType} retrieve`,
      }),
    ];
  }

  return refs.flatMap((ref) => {
    const refLibraryUnit = ref.libraryName
      ? resolveIncludedLibrary(context.registry, libraryUnit, ref.libraryName) ?? libraryUnit
      : libraryUnit;
    if (ref.kind === 'valueset') {
      const def = refLibraryUnit.maps.valueSetsByName.get(ref.name);
      const valueSetUrl = def?.id ?? ref.id;
      const valueSetOid = valueSetUrl ? valueSetOidFromUrl(valueSetUrl) : undefined;
      return [
        elmRetrieveRow({
          context,
          libraryUnit,
          statement,
          retrieve,
          stack,
          fhirResourceType,
          qicoreProfile,
          qdm: qdmMappingForRequirement(fhirResourceType, qicoreProfile, ref.name, valueSetUrl),
          codeFilterPath,
          criteriaName: ref.name,
          valueSetOid,
          valueSetUrl,
          elmRefLocalId: ref.localId ?? def?.localId,
        }),
      ];
    }

    const def = refLibraryUnit.maps.codesByName.get(ref.name);
    const directCodeSystem = def?.system ?? ref.system;
    const directCode = def?.id ?? ref.code;
    if (!directCode) return [];
    return [
      elmRetrieveRow({
        context,
        libraryUnit,
        statement,
        retrieve,
        stack,
        fhirResourceType,
        qicoreProfile,
        qdm: qdmMappingForRequirement(fhirResourceType, qicoreProfile, ref.name, undefined),
        codeFilterPath,
        criteriaName: ref.name,
        directCodeSystem,
        directCode,
        directCodeDisplay: def?.display,
        elmRefLocalId: ref.localId ?? def?.localId,
      }),
    ];
  });
}

function elmRetrieveRow(input: {
  context: ElmTraversalContext;
  libraryUnit: ElmLibraryUnit;
  statement: Record<string, unknown>;
  retrieve: Record<string, unknown>;
  stack: string[];
  fhirResourceType: string;
  qicoreProfile?: string;
  qdm: { category?: string; datatype?: string; confidence?: number };
  codeFilterPath?: string;
  criteriaName: string;
  valueSetOid?: string;
  valueSetUrl?: string;
  directCodeSystem?: string;
  directCode?: string;
  directCodeDisplay?: string;
  elmRefLocalId?: string;
}): MeasureDataCriteriaRow {
  const statementName = stringValue(input.statement['name']) ?? input.context.population.expression;
  const retrieveLocalId = stringValue(input.retrieve['localId']);
  const criteriaIdValue = criteriaId('elm', {
    libraryId: input.libraryUnit.identity.id,
    populationRole: input.context.population.populationRole,
    populationExpression: input.context.population.expression,
    statementName,
    retrieveLocalId,
    fhirResourceType: input.fhirResourceType,
    qicoreProfile: input.qicoreProfile,
    codeFilterPath: input.codeFilterPath,
    valueSetOid: input.valueSetOid,
    valueSetUrl: input.valueSetUrl,
    directCodeSystem: input.directCodeSystem,
    directCode: input.directCode,
  });
  return {
    measureCode: input.context.measureCode,
    libraryId: input.libraryUnit.identity.id,
    libraryUrl: input.libraryUnit.identity.url,
    libraryName: input.libraryUnit.identity.name,
    criteriaId: criteriaIdValue,
    criteriaName: input.criteriaName,
    populationRole: input.context.population.populationRole,
    fhirResourceType: input.fhirResourceType,
    qicoreProfile: input.qicoreProfile,
    qdmCategory: input.qdm.category,
    qdmDatatype: input.qdm.datatype,
    codeFilterPath: input.codeFilterPath,
    valueSetOid: input.valueSetOid,
    valueSetUrl: input.valueSetUrl,
    directCodeSystem: input.directCodeSystem,
    directCode: input.directCode,
    directCodeDisplay: input.directCodeDisplay,
    mustSupport: [],
    elmExpressionName: input.context.population.expression,
    elmLocalId: retrieveLocalId ?? input.elmRefLocalId,
    elmPath: input.stack.join(' > '),
    criteriaPayload: {
      measure: input.context.measurePayload,
      populationExpression: input.context.population,
      statement: {
        name: statementName,
        localId: stringValue(input.statement['localId']),
        locator: stringValue(input.statement['locator']),
      },
      retrieve: {
        localId: retrieveLocalId,
        locator: stringValue(input.retrieve['locator']),
        dataType: stringValue(input.retrieve['dataType']),
        templateId: stringValue(input.retrieve['templateId']),
        codeProperty: stringValue(input.retrieve['codeProperty']),
        codeComparator: stringValue(input.retrieve['codeComparator']),
      },
      expressionStack: input.stack,
      library: {
        id: input.libraryUnit.identity.id,
        url: input.libraryUnit.identity.url,
        name: input.libraryUnit.identity.name,
      },
    },
    sourceMethod: 'elm_retrieve_traversal',
    mappingConfidence: input.qdm.confidence,
  };
}

function codeRefsFromElm(value: unknown): Array<{
  kind: 'valueset' | 'code';
  name: string;
  libraryName?: string;
  id?: string;
  code?: string;
  system?: string;
  localId?: string;
}> {
  const refs: Array<{
    kind: 'valueset' | 'code';
    name: string;
    libraryName?: string;
    id?: string;
    code?: string;
    system?: string;
    localId?: string;
  }> = [];

  const visit = (node: unknown): void => {
    if (!isRecord(node)) return;
    const type = stringValue(node['type']);
    const name = stringValue(node['name']);
    if (type === 'ValueSetRef' && name) {
      refs.push({
        kind: 'valueset',
        name,
        libraryName: stringValue(node['libraryName']),
        id: stringValue(node['id']),
        localId: stringValue(node['localId']),
      });
    }
    if (type === 'CodeRef' && name) {
      refs.push({
        kind: 'code',
        name,
        libraryName: stringValue(node['libraryName']),
        code: stringValue(node['id']),
        system: stringValue(node['system']),
        localId: stringValue(node['localId']),
      });
    }
    Object.values(node).forEach((child) => {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    });
  };

  visit(value);
  return refs;
}

function elmMaps(elm: Record<string, unknown>): ElmMaps {
  const library = isRecord(elm['library']) ? elm['library'] : elm;
  const statementsRoot = isRecord(library['statements']) ? library['statements'] : {};
  const statements = recordArray(statementsRoot['def']);
  const valueSetsRoot = isRecord(library['valueSets']) ? library['valueSets'] : {};
  const codesRoot = isRecord(library['codes']) ? library['codes'] : {};
  const codeSystemsRoot = isRecord(library['codeSystems']) ? library['codeSystems'] : {};
  const includesRoot = isRecord(library['includes']) ? library['includes'] : {};

  const includesByAlias = new Map<string, ElmIncludeDef>();
  recordArray(includesRoot['def']).forEach((def) => {
    const localIdentifier = stringValue(def['localIdentifier']);
    if (!localIdentifier) return;
    includesByAlias.set(localIdentifier, {
      localIdentifier,
      path: stringValue(def['path']),
      version: stringValue(def['version']),
    });
  });

  const codeSystemsByName = new Map<string, string>();
  recordArray(codeSystemsRoot['def']).forEach((def) => {
    const name = stringValue(def['name']);
    const id = stringValue(def['id']);
    if (name && id) codeSystemsByName.set(name, id);
  });

  const valueSetsByName = new Map<string, ElmValueSetDef>();
  recordArray(valueSetsRoot['def']).forEach((def) => {
    const name = stringValue(def['name']);
    if (!name) return;
    valueSetsByName.set(name, {
      name,
      id: stringValue(def['id']),
      localId: stringValue(def['localId']),
      locator: stringValue(def['locator']),
    });
  });

  const codesByName = new Map<string, ElmCodeDef>();
  recordArray(codesRoot['def']).forEach((def) => {
    const name = stringValue(def['name']);
    if (!name) return;
    const codeSystem = isRecord(def['codeSystem']) ? def['codeSystem'] : {};
    const systemName = stringValue(codeSystem['name']);
    codesByName.set(name, {
      name,
      id: stringValue(def['id']),
      display: stringValue(def['display']),
      systemName,
      system: systemName ? codeSystemsByName.get(systemName) : undefined,
      localId: stringValue(def['localId']),
      locator: stringValue(def['locator']),
    });
  });

  const statementsByName = new Map<string, Record<string, unknown>>();
  statements.forEach((statement) => {
    const name = stringValue(statement['name']);
    if (name) statementsByName.set(name, statement);
  });

  return { statementsByName, valueSetsByName, codesByName, codeSystemsByName, includesByAlias };
}

function elmLibraryRegistry(resources: FhirResource[]): ElmLibraryRegistry {
  const units = resources
    .filter((resource) => resource.resourceType === 'Library')
    .flatMap((library) => {
      const elm = decodeElmJson(library);
      if (!elm) return [];
      return [{
        library,
        identity: identityForLibrary(library),
        elm,
        maps: elmMaps(elm),
      }];
    });
  const byKey = new Map<string, ElmLibraryUnit>();
  units.forEach((unit) => {
    libraryLookupKeys(unit).forEach((key) => {
      byKey.set(key, unit);
    });
  });
  return { units, byKey };
}

function resolveLibraryUnitForResource(
  registry: ElmLibraryRegistry,
  library: FhirResource,
): ElmLibraryUnit | null {
  const identity = identityForLibrary(library);
  const keys = [
    library.id,
    library.url,
    library.name,
    identity.id,
    identity.url,
    identity.name,
  ];
  return keys.flatMap(libraryKeyAliases).map((key) => registry.byKey.get(key)).find(Boolean) ?? null;
}

function resolveIncludedLibrary(
  registry: ElmLibraryRegistry,
  fromLibrary: ElmLibraryUnit,
  alias: string,
): ElmLibraryUnit | null {
  const include = fromLibrary.maps.includesByAlias.get(alias);
  const candidates = [
    include?.path,
    include?.localIdentifier,
    alias,
    include?.path && include.version ? `${include.path}|${include.version}` : undefined,
  ];
  return candidates
    .flatMap(libraryKeyAliases)
    .map((key) => registry.byKey.get(key))
    .find(Boolean) ?? null;
}

function libraryLookupKeys(unit: ElmLibraryUnit): string[] {
  const libraryRoot = isRecord(unit.elm['library']) ? unit.elm['library'] : unit.elm;
  const identifier = isRecord(libraryRoot['identifier']) ? libraryRoot['identifier'] : {};
  const identifierId = stringValue(identifier['id']);
  const identifierSystem = stringValue(identifier['system']);
  const candidates = [
    unit.identity.id,
    unit.identity.url,
    unit.identity.name,
    unit.library.id,
    unit.library.url,
    unit.library.name,
    identifierId,
    identifierSystem && identifierId ? `${identifierSystem}/${identifierId}` : undefined,
  ];
  return candidates.flatMap(libraryKeyAliases);
}

function libraryKeyAliases(value: unknown): string[] {
  const canonical = canonicalWithoutVersion(value).replace(/\/+$/, '');
  if (!canonical) return [];
  const lastPathSegment = canonical.split('/').filter(Boolean).at(-1);
  const aliases = [canonical, canonical.toLowerCase()];
  if (lastPathSegment) {
    aliases.push(lastPathSegment, lastPathSegment.toLowerCase());
  }
  return Array.from(new Set(aliases));
}

function decodeElmJson(library: FhirResource): Record<string, unknown> | null {
  const content = recordArray(library.content).find(
    (item) => stringValue(item['contentType']) === 'application/elm+json' && stringValue(item['data']),
  );
  const data = stringValue(content?.['data']);
  if (!data) return null;

  try {
    const decoded = Buffer.from(data, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function populationExpressionsFromMeasure(measure: FhirResource): MeasurePopulationExpression[] {
  return recordArray(measure.group).flatMap((group) =>
    recordArray(group['population'])
      .flatMap((population) => {
        const expression = stringValue(isRecord(population['criteria']) ? population['criteria']['expression'] : undefined);
        if (!expression) return [];
        const item: MeasurePopulationExpression = {
          populationRole: populationRoleFromCode(codingCode(population['code'])),
          expression,
        };
        const populationId = stringValue(population['id']);
        const description = stringValue(population['description']);
        if (populationId) item.populationId = populationId;
        if (description) item.description = description;
        return [item];
      }),
  );
}

function selectMeasure(resources: FhirResource[]): FhirResource {
  const measures = resources.filter((resource) => resource.resourceType === 'Measure');
  if (measures.length === 0) {
    throw new Error('FHIR Bundle must contain a Measure resource');
  }
  if (measures.length > 1) {
    const executable = measures.find((measure) => Array.isArray(measure.library) && measure.library.length > 0);
    if (executable) return executable;
  }
  return measures[0]!;
}

function selectPrimaryLibrary(
  resources: FhirResource[],
  measure: FhirResource,
  input: Pick<ParseMeasureDataCriteriaInput, 'primaryLibraryId' | 'primaryLibraryUrl'>,
): FhirResource {
  const libraries = resources.filter((resource) => resource.resourceType === 'Library');
  if (libraries.length === 0) {
    throw new Error('FHIR Bundle must contain at least one Library resource');
  }

  if (input.primaryLibraryId) {
    const byId = libraries.find((library) => library.id === input.primaryLibraryId);
    if (byId) return byId;
    throw new Error(`Primary Library id ${input.primaryLibraryId} was not found in bundle`);
  }

  const requestedUrl = canonicalWithoutVersion(input.primaryLibraryUrl);
  if (requestedUrl) {
    const byUrl = libraries.find((library) => canonicalWithoutVersion(library.url) === requestedUrl);
    if (byUrl) return byUrl;
    throw new Error(`Primary Library url ${input.primaryLibraryUrl} was not found in bundle`);
  }

  const measureLibraryUrls = stringArray(measure.library).map(canonicalWithoutVersion).filter(Boolean);
  const byMeasureReference = libraries.find((library) => {
    const url = canonicalWithoutVersion(library.url);
    return Boolean(url && measureLibraryUrls.includes(url));
  });
  if (byMeasureReference) return byMeasureReference;

  const byIdSimilarity = libraries.find((library) => library.id && measure.id && library.id === measure.id);
  if (byIdSimilarity) return byIdSimilarity;

  return libraries[0]!;
}

function identityForLibrary(library: FhirResource): LibraryIdentity {
  const id = stringValue(library.id) ?? stringValue(library.name) ?? stringValue(library.url);
  if (!id) {
    throw new Error('Primary Library must have id, name, or url');
  }
  return {
    id,
    url: stringValue(library.url),
    name: stringValue(library.name ?? library.title),
  };
}

function normalizeBundle(value: unknown): FhirBundle {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  if (!isRecord(parsed) || parsed['resourceType'] !== 'Bundle') {
    throw new Error('Expected a FHIR Bundle resource');
  }
  return parsed as unknown as FhirBundle;
}

function resourcesFromBundle(bundle: FhirBundle): FhirResource[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is FhirResource => isRecord(resource) && typeof resource.resourceType === 'string');
}

function qdmMappingForRequirement(
  fhirResourceType: string,
  qicoreProfile: string | undefined,
  criterionName: string | undefined,
  valueSetUrl: string | undefined,
): { category?: string; datatype?: string; confidence?: number } {
  const text = `${fhirResourceType} ${qicoreProfile ?? ''} ${criterionName ?? ''} ${valueSetUrl ?? ''}`.toLowerCase();
  switch (fhirResourceType) {
    case 'Patient':
      return { category: 'Patient', datatype: 'Patient', confidence: 0.95 };
    case 'Encounter':
      return { category: 'Encounter', datatype: 'Encounter, Performed', confidence: 0.95 };
    case 'Condition':
      return { category: 'Condition', datatype: 'Diagnosis', confidence: 0.9 };
    case 'Observation':
      if (text.includes('lab') || text.includes('laboratory') || text.includes('hba1c') || text.includes('loinc')) {
        return { category: 'Laboratory Test', datatype: 'Laboratory Test, Performed', confidence: 0.9 };
      }
      if (text.includes('vital') || text.includes('physical')) {
        return { category: 'Physical Exam', datatype: 'Physical Exam, Performed', confidence: 0.72 };
      }
      return { category: 'Assessment', datatype: 'Assessment, Performed', confidence: 0.7 };
    case 'MedicationRequest':
      return { category: 'Medication', datatype: 'Medication, Order', confidence: 0.9 };
    case 'MedicationAdministration':
      return { category: 'Medication', datatype: 'Medication, Administered', confidence: 0.9 };
    case 'Procedure':
      return { category: 'Procedure', datatype: 'Procedure, Performed', confidence: 0.9 };
    case 'ServiceRequest':
      return { category: 'Procedure', datatype: 'Procedure, Order', confidence: 0.72 };
    case 'Device':
    case 'DeviceRequest':
      return { category: 'Device', datatype: 'Device', confidence: 0.8 };
    case 'Coverage':
      return { category: 'Patient Characteristic', datatype: 'Patient Characteristic, Payer', confidence: 0.68 };
    default:
      return { confidence: 0.25 };
  }
}

function populationRoleFromCode(code: string | undefined): MeasureCriteriaPopulationRole {
  switch (code) {
    case 'initial-population':
    case 'initial_population':
      return 'initial_population';
    case 'denominator':
      return 'denominator';
    case 'denominator-exclusion':
    case 'denominator_exclusion':
      return 'denominator_exclusion';
    case 'numerator':
      return 'numerator';
    case 'supplemental-data':
    case 'supplemental':
      return 'supplemental';
    default:
      return 'unclassified';
  }
}

function codingCode(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const codings = recordArray(value['coding']);
  return codings.map((coding) => stringValue(coding['code'])).find(Boolean);
}

function resourceTypeFromElmDataType(dataType: string | undefined): string | undefined {
  if (!dataType) return undefined;
  const match = dataType.match(/\}([A-Za-z][A-Za-z0-9]*)$/);
  return match?.[1] ?? dataType.split('.').at(-1) ?? dataType;
}

function valueSetOidFromUrl(url: string): string | undefined {
  const noVersion = canonicalWithoutVersion(url);
  const urnOid = noVersion.match(/^urn:oid:(\d+(?:\.\d+)+)$/);
  if (urnOid?.[1]) return urnOid[1];
  const pathOid = noVersion.match(/\/ValueSet\/([^/?#]+)/);
  if (pathOid?.[1]) return pathOid[1];
  if (/^\d+(?:\.\d+)+$/.test(noVersion)) return noVersion;
  return undefined;
}

function canonicalWithoutVersion(value: unknown): string {
  const text = stringValue(value);
  return text ? text.split('|')[0]!.trim() : '';
}

function normalizeResourceType(value: string | undefined): string {
  return value?.trim() || UNKNOWN_RESOURCE_TYPE;
}

function criteriaId(prefix: string, value: Record<string, unknown>): string {
  const digest = createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 24);
  return `${prefix}-${digest}`;
}

function dedupeCriteria(rows: MeasureDataCriteriaRow[]): MeasureDataCriteriaRow[] {
  const byKey = new Map<string, MeasureDataCriteriaRow>();
  rows.forEach((row) => {
    const key = stableStringify({
      criteriaId: row.criteriaId,
      populationRole: row.populationRole,
      fhirResourceType: row.fhirResourceType,
      qicoreProfile: row.qicoreProfile,
      qdmDatatype: row.qdmDatatype,
      codeFilterPath: row.codeFilterPath,
      valueSetOid: row.valueSetOid,
      valueSetUrl: row.valueSetUrl,
      directCodeSystem: row.directCodeSystem,
      directCode: row.directCode,
    });
    if (!byKey.has(key)) byKey.set(key, row);
  });
  return Array.from(byKey.values());
}

async function resolveArtifactBinding(
  measureCode: string,
  measureArtifactId: number | undefined,
): Promise<ArtifactBindingRow | null> {
  const parameters: UnsafeParameter[] = [measureCode];
  const artifactFilter = measureArtifactId ? 'AND ma.id = $2::bigint' : '';
  if (measureArtifactId) parameters.push(measureArtifactId);

  const rows = await sql.unsafe<ArtifactBindingRow[]>(
    `
    SELECT ma.id AS measure_artifact_id,
           md.measure_id
    FROM phm_edw.measure_artifact ma
    LEFT JOIN LATERAL (
      SELECT measure_id
      FROM phm_edw.measure_definition md
      WHERE md.measure_code = ma.measure_code
        AND md.active_ind = 'Y'
      ORDER BY md.measure_id
      LIMIT 1
    ) md ON TRUE
    WHERE ma.measure_code = $1
      ${artifactFilter}
    ORDER BY ma.reporting_period_start DESC NULLS LAST, ma.id DESC
    LIMIT 1
    `,
    parameters,
  );
  return rows[0] ?? null;
}

function persistableCriteriaRow(row: MeasureDataCriteriaRow): Record<string, unknown> {
  return {
    measure_code: row.measureCode,
    measure_artifact_id: row.measureArtifactId,
    measure_id: row.measureId ?? null,
    library_id: row.libraryId,
    library_url: row.libraryUrl ?? null,
    library_name: row.libraryName ?? null,
    criteria_id: row.criteriaId,
    criteria_name: row.criteriaName ?? null,
    population_role: row.populationRole,
    fhir_resource_type: row.fhirResourceType,
    qicore_profile: row.qicoreProfile ?? null,
    qdm_category: row.qdmCategory ?? null,
    qdm_datatype: row.qdmDatatype ?? null,
    code_filter_path: row.codeFilterPath ?? null,
    value_set_oid: row.valueSetOid ?? null,
    value_set_url: row.valueSetUrl ?? null,
    direct_code_system: row.directCodeSystem ?? null,
    direct_code: row.directCode ?? null,
    direct_code_display: row.directCodeDisplay ?? null,
    must_support: row.mustSupport,
    elm_expression_name: row.elmExpressionName ?? null,
    elm_local_id: row.elmLocalId ?? null,
    elm_path: row.elmPath ?? null,
    criteria_payload: row.criteriaPayload,
    source_method: row.sourceMethod,
    mapping_confidence: row.mappingConfidence ?? null,
  };
}

function compactPayload(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined && child !== null),
  );
}

function normalizeRequired(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

function nullablePositiveInteger(value: unknown): number | null {
  if (value == null) return null;
  return toPositiveInteger(value, 'legacy measure id');
}

function toPositiveInteger(value: unknown, name: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function asUnsafeJson(value: unknown): UnsafeParameter {
  return JSON.stringify(value) as UnsafeParameter;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter((item): item is string => Boolean(item));
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortStable(value[key])]),
  );
}
