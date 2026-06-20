// =============================================================================
// Medgnosis API - FHIR R4/QI-Core-like resources to canonical QDM
// Pure normalizers for dimensional quality analytics. These helpers deliberately
// accept loose FHIR-like objects because source resources may arrive from US Core,
// QI-Core, Bulk FHIR NDJSON, or test fixtures before full FHIR typing exists.
// =============================================================================

import type {
  QdmCode,
  QdmDatatype,
  QdmElement,
  QdmIdentifier,
  QdmInterval,
  QdmNormalizationContext,
  QdmReference,
  QdmSourceReference,
  QdmTiming,
} from './model.js';

export type FhirLikeResource = Record<string, unknown> & {
  resourceType?: string;
  id?: string;
};

type FhirRecord = Record<string, unknown>;

function isRecord(value: unknown): value is FhirRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecordArray(value: unknown): FhirRecord[] {
  return asArray(value).filter(isRecord);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function resourceType(resource: FhirLikeResource): string {
  return asString(resource.resourceType) ?? 'Resource';
}

function elementId(resource: FhirLikeResource): string {
  const id = asString(resource.id) ?? 'unknown';
  return `${resourceType(resource)}/${id}`;
}

function profiles(resource: FhirLikeResource): string[] {
  const meta = isRecord(resource.meta) ? resource.meta : {};
  return asArray(meta.profile).filter((p): p is string => typeof p === 'string');
}

function codingToCode(coding: FhirRecord, text?: string): QdmCode {
  return compact({
    system: asString(coding.system),
    code: asString(coding.code),
    display: asString(coding.display),
    text,
  });
}

function codeableConcept(value: unknown): QdmCode | undefined {
  if (!isRecord(value)) return undefined;
  const coding = asRecordArray(value.coding).find(
    (c) => asString(c.code) != null || asString(c.display) != null,
  );
  const text = asString(value.text);
  if (coding) return codingToCode(coding, text);
  if (text) return { text };
  return undefined;
}

function codeableConcepts(value: unknown): QdmCode[] {
  if (isRecord(value)) {
    const concept = codeableConcept(value);
    return concept ? [concept] : [];
  }
  return asRecordArray(value).map(codeableConcept).filter((c): c is QdmCode => c != null);
}

function reference(value: unknown): QdmReference | undefined {
  if (!isRecord(value)) return undefined;
  const ref = asString(value.reference);
  const type = asString(value.type) ?? ref?.split('/')[0];
  const id = ref?.includes('/') ? ref.split('/').at(-1) : undefined;
  const display = asString(value.display);
  if (!ref && !type && !id && !display) return undefined;
  return compact({ reference: ref, type, id, display });
}

function referenceArray(value: unknown): QdmReference[] {
  return asRecordArray(value).map(reference).filter((r): r is QdmReference => r != null);
}

function identifiers(value: unknown): QdmIdentifier[] {
  return asRecordArray(value)
    .map((identifier) => {
      const valueText = asString(identifier.value);
      if (!valueText) return undefined;
      const mapped: QdmIdentifier = { value: valueText };
      const system = asString(identifier.system);
      const type = codeableConcept(identifier.type);
      if (system) mapped.system = system;
      if (type) mapped.type = type;
      return mapped;
    })
    .filter((identifier): identifier is QdmIdentifier => identifier != null);
}

function sourceReference(
  resource: FhirLikeResource,
  context: QdmNormalizationContext | undefined,
): QdmSourceReference {
  return compact({
    resourceType: resourceType(resource),
    id: asString(resource.id),
    reference: elementId(resource),
    profiles: profiles(resource),
    identifiers: identifiers(resource.identifier),
    sourceSystem: context?.sourceSystem,
  });
}

function baseElement(
  resource: FhirLikeResource,
  context: QdmNormalizationContext | undefined,
  datatype: QdmDatatype,
  timing: QdmTiming,
): Omit<QdmElement, 'category'> {
  return compact({
    id: elementId(resource),
    qdmVersion: '5.6' as const,
    datatype,
    status: asString(resource.status),
    subject: reference(resource.subject) ?? context?.patient,
    encounter: reference(resource.encounter) ?? context?.encounter,
    timing,
    attributes: {},
    source: sourceReference(resource, context),
    provenance: context?.provenance,
  });
}

function interval(value: unknown): QdmInterval | undefined {
  if (!isRecord(value)) return undefined;
  const start = asString(value.start);
  const end = asString(value.end);
  if (!start && !end) return undefined;
  return compact({ start, end });
}

function effectiveTiming(resource: FhirLikeResource): QdmTiming {
  const period =
    interval(resource.effectivePeriod) ??
    interval(resource.performedPeriod) ??
    interval(resource.period);
  const dateTime =
    asString(resource.effectiveDateTime) ??
    asString(resource.performedDateTime) ??
    asString(resource.occurrenceDateTime);
  return compact({
    relevantDateTime: dateTime,
    relevantPeriod: period,
    resultDateTime: asString(resource.issued),
  });
}

function onsetAbatementTiming(resource: FhirLikeResource): QdmTiming {
  const onsetPeriod = interval(resource.onsetPeriod);
  const onsetDateTime = asString(resource.onsetDateTime);
  const abatementDateTime = asString(resource.abatementDateTime);
  const abatementPeriod = interval(resource.abatementPeriod);
  const prevalencePeriod =
    onsetPeriod ??
    compact({
      start: onsetDateTime,
      end: abatementDateTime ?? abatementPeriod?.end,
    });
  return prevalencePeriod.start || prevalencePeriod.end ? { prevalencePeriod } : {};
}

function statusCode(value: unknown): string | undefined {
  return codeableConcept(value)?.code;
}

function firstHumanName(value: unknown): Record<string, unknown> | undefined {
  const name = asRecordArray(value)[0];
  if (!name) return undefined;
  return compact({
    family: asString(name.family),
    given: asArray(name.given).filter((part): part is string => typeof part === 'string'),
    text: asString(name.text),
    use: asString(name.use),
  });
}

function observationDatatype(resource: FhirLikeResource): {
  category: QdmElement['category'];
  datatype: QdmDatatype;
} {
  const categoryCodes = codeableConcepts(resource.category).map((c) => c.code?.toLowerCase());
  if (categoryCodes.includes('laboratory')) {
    return { category: 'Laboratory Test', datatype: 'Laboratory Test, Performed' };
  }
  if (categoryCodes.includes('vital-signs') || categoryCodes.includes('exam')) {
    return { category: 'Physical Exam', datatype: 'Physical Exam, Performed' };
  }
  return { category: 'Assessment', datatype: 'Assessment, Performed' };
}

function medicationCode(resource: FhirLikeResource): QdmCode | undefined {
  const concept = codeableConcept(resource.medicationCodeableConcept);
  if (concept) return concept;
  const medicationReference = reference(resource.medicationReference);
  if (!medicationReference) return undefined;
  return compact({
    text: medicationReference.display,
    code: medicationReference.id,
  });
}

function valueAttribute(resource: FhirLikeResource): unknown {
  const valueKeys = [
    'valueQuantity',
    'valueCodeableConcept',
    'valueString',
    'valueBoolean',
    'valueInteger',
    'valueRange',
    'valueRatio',
    'valueTime',
    'valueDateTime',
    'valuePeriod',
  ];
  for (const key of valueKeys) {
    if (resource[key] !== undefined) return resource[key];
  }
  return undefined;
}

function reasonCodes(resource: FhirLikeResource): QdmCode[] {
  return [
    ...codeableConcepts(resource.reasonCode),
    ...codeableConcepts(resource.statusReason),
    ...codeableConcepts(resource.notPerformedReason),
  ];
}

export function normalizePatient(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const element: QdmElement = {
    ...baseElement(resource, context, 'Patient', {
      birthDate: asString(resource.birthDate),
    }),
    category: 'Patient',
    status: asBoolean(resource.active) === false ? 'inactive' : 'active',
    subject: reference({ reference: elementId(resource), type: 'Patient' }),
    attributes: compact({
      active: asBoolean(resource.active),
      gender: asString(resource.gender),
      birthDate: asString(resource.birthDate),
      name: firstHumanName(resource.name),
      identifiers: identifiers(resource.identifier),
      telecom: resource.telecom,
      address: resource.address,
      extensions: resource.extension,
    }),
  };
  return [element];
}

export function normalizeEncounter(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const element: QdmElement = {
    ...baseElement(resource, context, 'Encounter, Performed', {
      relevantPeriod: interval(resource.period),
    }),
    category: 'Encounter',
    code: codeableConcept(asRecordArray(resource.type)[0]) ?? codeableConcept(resource.serviceType),
    attributes: compact({
      class: isRecord(resource.class) ? codingToCode(resource.class) : undefined,
      type: codeableConcepts(resource.type),
      serviceType: codeableConcept(resource.serviceType),
      priority: codeableConcept(resource.priority),
      reasonCode: codeableConcepts(resource.reasonCode),
      hospitalization: resource.hospitalization,
      participant: resource.participant,
    }),
  };
  return [element];
}

export function normalizeCondition(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const clinicalStatus = statusCode(resource.clinicalStatus);
  const element: QdmElement = {
    ...baseElement(resource, context, 'Diagnosis', onsetAbatementTiming(resource)),
    category: 'Condition',
    status: clinicalStatus ?? asString(resource.status),
    code: codeableConcept(resource.code),
    attributes: compact({
      clinicalStatus,
      verificationStatus: statusCode(resource.verificationStatus),
      category: codeableConcepts(resource.category),
      severity: codeableConcept(resource.severity),
      recordedDate: asString(resource.recordedDate),
      recorder: reference(resource.recorder),
      asserter: reference(resource.asserter),
    }),
  };
  return [element];
}

export function normalizeObservation(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const mapped = observationDatatype(resource);
  const element: QdmElement = {
    ...baseElement(resource, context, mapped.datatype, effectiveTiming(resource)),
    category: mapped.category,
    code: codeableConcept(resource.code),
    attributes: compact({
      category: codeableConcepts(resource.category),
      value: valueAttribute(resource),
      interpretation: codeableConcepts(resource.interpretation),
      method: codeableConcept(resource.method),
      bodySite: codeableConcept(resource.bodySite),
      components: asRecordArray(resource.component).map((component) =>
        compact({
          code: codeableConcept(component.code),
          value: valueAttribute(component),
          interpretation: codeableConcepts(component.interpretation),
        }),
      ),
      performer: referenceArray(resource.performer),
    }),
  };
  return [element];
}

export function normalizeMedicationRequest(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const doNotPerform = asBoolean(resource.doNotPerform) === true;
  const element: QdmElement = {
    ...baseElement(resource, context, doNotPerform ? 'Medication, Not Ordered' : 'Medication, Order', {
      authorDateTime: asString(resource.authoredOn),
      relevantPeriod: interval(isRecord(resource.dispenseRequest) ? resource.dispenseRequest.validityPeriod : undefined),
    }),
    category: 'Medication',
    code: medicationCode(resource),
    attributes: compact({
      intent: asString(resource.intent),
      priority: asString(resource.priority),
      doNotPerform,
      negationRationale: doNotPerform ? reasonCodes(resource) : undefined,
      requester: reference(resource.requester),
      reasonCode: codeableConcepts(resource.reasonCode),
      dosageInstruction: resource.dosageInstruction,
      dispenseRequest: resource.dispenseRequest,
    }),
  };
  return [element];
}

export function normalizeMedicationAdministration(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const status = asString(resource.status);
  const notAdministered = status === 'not-done' || status === 'entered-in-error';
  const element: QdmElement = {
    ...baseElement(
      resource,
      context,
      notAdministered ? 'Medication, Not Administered' : 'Medication, Administered',
      effectiveTiming(resource),
    ),
    category: 'Medication',
    code: medicationCode(resource),
    attributes: compact({
      statusReason: reasonCodes(resource),
      negationRationale: notAdministered ? reasonCodes(resource) : undefined,
      performer: referenceArray(resource.performer),
      reasonCode: codeableConcepts(resource.reasonCode),
      dosage: resource.dosage,
      request: reference(resource.request),
    }),
  };
  return [element];
}

export function normalizeProcedure(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const status = asString(resource.status);
  const notPerformed = status === 'not-done' || status === 'entered-in-error';
  const element: QdmElement = {
    ...baseElement(
      resource,
      context,
      notPerformed ? 'Procedure, Not Performed' : 'Procedure, Performed',
      effectiveTiming(resource),
    ),
    category: 'Procedure',
    code: codeableConcept(resource.code),
    attributes: compact({
      category: codeableConcepts(resource.category),
      statusReason: reasonCodes(resource),
      negationRationale: notPerformed ? reasonCodes(resource) : undefined,
      performer: referenceArray(resource.performer),
      reasonCode: codeableConcepts(resource.reasonCode),
      bodySite: codeableConcepts(resource.bodySite),
      outcome: codeableConcept(resource.outcome),
    }),
  };
  return [element];
}

export function normalizeDevice(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const type = codeableConcept(resource.type);
  const deviceName = asRecordArray(resource.deviceName)
    .map((name) => asString(name.name))
    .find((name) => name != null);
  const element: QdmElement = {
    ...baseElement(resource, context, 'Device', {
      relevantDateTime: asString(resource.manufactureDate),
      relevantPeriod: compact({
        start: asString(resource.manufactureDate),
        end: asString(resource.expirationDate),
      }),
    }),
    category: 'Device',
    code: type ?? (deviceName ? { text: deviceName } : undefined),
    attributes: compact({
      type,
      deviceName,
      manufacturer: asString(resource.manufacturer),
      modelNumber: asString(resource.modelNumber),
      lotNumber: asString(resource.lotNumber),
      serialNumber: asString(resource.serialNumber),
      udiCarrier: resource.udiCarrier,
      owner: reference(resource.owner),
      patient: reference(resource.patient),
    }),
  };
  return [element];
}

export function normalizeDiagnosticReport(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const element: QdmElement = {
    ...baseElement(resource, context, 'Diagnostic Study, Performed', effectiveTiming(resource)),
    category: 'Diagnostic Study',
    code: codeableConcept(resource.code),
    attributes: compact({
      category: codeableConcepts(resource.category),
      conclusion: asString(resource.conclusion),
      conclusionCode: codeableConcepts(resource.conclusionCode),
      performer: referenceArray(resource.performer),
      result: referenceArray(resource.result),
    }),
  };
  return [element];
}

export function normalizeServiceRequest(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const doNotPerform = asBoolean(resource.doNotPerform) === true;
  const element: QdmElement = {
    ...baseElement(resource, context, 'Intervention, Order', {
      authorDateTime: asString(resource.authoredOn),
    }),
    category: 'Intervention',
    code: codeableConcept(resource.code),
    attributes: compact({
      intent: asString(resource.intent),
      priority: asString(resource.priority),
      category: codeableConcepts(resource.category),
      doNotPerform,
      negationRationale: doNotPerform ? reasonCodes(resource) : undefined,
      requester: reference(resource.requester),
      reasonCode: codeableConcepts(resource.reasonCode),
    }),
  };
  return [element];
}

export function normalizeDocumentReference(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const element: QdmElement = {
    ...baseElement(resource, context, 'Communication, Performed', {
      relevantDateTime: asString(resource.date),
    }),
    category: 'Communication',
    code: codeableConcept(resource.type),
    attributes: compact({
      category: codeableConcepts(resource.category),
      docStatus: asString(resource.docStatus),
      author: referenceArray(resource.author),
    }),
  };
  return [element];
}

export function normalizeGoal(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  const target = asRecordArray(resource.target)[0];
  const element: QdmElement = {
    ...baseElement(resource, context, 'Care Goal', {
      relevantDateTime: asString(resource.startDate),
    }),
    category: 'Care Goal',
    status: asString(resource.lifecycleStatus) ?? asString(resource.status),
    code: codeableConcept(resource.description),
    attributes: compact({
      lifecycleStatus: asString(resource.lifecycleStatus),
      achievementStatus: codeableConcept(resource.achievementStatus),
      priority: codeableConcept(resource.priority),
      targetDate: target ? asString(target.dueDate) : undefined,
    }),
  };
  return [element];
}

export function normalizeFhirToQdm(
  resource: FhirLikeResource,
  context?: QdmNormalizationContext,
): QdmElement[] {
  switch (resource.resourceType) {
    case 'Patient':
      return normalizePatient(resource, context);
    case 'Encounter':
      return normalizeEncounter(resource, context);
    case 'Condition':
      return normalizeCondition(resource, context);
    case 'Observation':
      return normalizeObservation(resource, context);
    case 'MedicationRequest':
      return normalizeMedicationRequest(resource, context);
    case 'MedicationAdministration':
      return normalizeMedicationAdministration(resource, context);
    case 'Procedure':
      return normalizeProcedure(resource, context);
    case 'Device':
      return normalizeDevice(resource, context);
    case 'DiagnosticReport':
      return normalizeDiagnosticReport(resource, context);
    case 'ServiceRequest':
      return normalizeServiceRequest(resource, context);
    case 'DocumentReference':
      return normalizeDocumentReference(resource, context);
    case 'Goal':
      return normalizeGoal(resource, context);
    default:
      return [];
  }
}

export function normalizeFhirResourcesToQdm(
  resources: FhirLikeResource[],
  context?: QdmNormalizationContext,
): QdmElement[] {
  return resources.flatMap((resource) => normalizeFhirToQdm(resource, context));
}
