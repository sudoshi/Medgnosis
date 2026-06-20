// =============================================================================
// Medgnosis API - QDM to QI-Core/FHIR projection
// Turns canonical QDM elements back into FHIR resources for CQL engine loading,
// DEQM/MeasureReport evidence, and bidirectional source reconciliation.
// =============================================================================

import { createHash } from 'node:crypto';
import type { FHIRResource } from '../fhir/mappers.js';
import { US_CORE, QICORE } from '../fhir/profiles.js';
import type { TransactionBundle, TransactionBundleEntry } from '../fhir/qicoreExport.js';
import type { QdmCode, QdmElement, QdmIdentifier, QdmInterval, QdmReference } from './model.js';

export const QDM_IDENTIFIER_SYSTEM = 'urn:medgnosis:qdm-data-element';

export interface QdmToQiCoreOptions {
  now?: string;
}

function now(options?: QdmToQiCoreOptions): string {
  return options?.now ?? new Date().toISOString();
}

function qdmIdentifier(qdm: QdmElement): { system: string; value: string } {
  return { system: QDM_IDENTIFIER_SYSTEM, value: qdm.id };
}

function stableFhirId(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');
  const base = cleaned ? `qdm-${cleaned}` : 'qdm-element';
  if (base.length <= 64) return base;
  return `${base.slice(0, 51)}-${createHash('sha256').update(raw).digest('hex').slice(0, 8)}`;
}

function identityFor(type: string, idOrReference: string | undefined): string {
  const raw = idOrReference?.trim();
  if (!raw) return stableFhirId(type);
  return stableFhirId(raw.includes('/') ? raw : `${type}/${raw}`);
}

function resourceId(qdm: QdmElement, resourceType: string): string {
  if (qdm.source.resourceType === resourceType && qdm.source.id) {
    return identityFor(resourceType, qdm.source.id);
  }
  return identityFor(resourceType, qdm.id);
}

function patientReference(ref: QdmReference | undefined): { reference: string } | undefined {
  const raw = ref?.reference ?? (ref?.id ? `Patient/${ref.id}` : undefined);
  if (!raw) return undefined;
  if (raw.startsWith('Patient/')) return { reference: `Patient/${identityFor('Patient', raw)}` };
  if (ref?.type === 'Patient' && ref.id) return { reference: `Patient/${identityFor('Patient', ref.id)}` };
  return { reference: raw };
}

function profileMeta(profile: string[], options?: QdmToQiCoreOptions): FHIRResource['meta'] {
  return { lastUpdated: now(options), profile: Array.from(new Set(profile)) };
}

function identifiers(source: QdmIdentifier[]): Array<Record<string, unknown>> {
  return source.map((identifier) => ({
    system: identifier.system,
    value: identifier.value,
    type: identifier.type ? codeableConcept(identifier.type) : undefined,
  }));
}

function codeableConcept(code: QdmCode | undefined): Record<string, unknown> | undefined {
  if (!code) return undefined;
  const coding = code.system || code.code || code.display
    ? [{
        system: code.system,
        code: code.code,
        display: code.display,
      }]
    : undefined;
  return compact({
    coding,
    text: code.text ?? code.display,
  });
}

function coding(code: QdmCode): Record<string, unknown> {
  return compact({
    system: code.system,
    code: code.code,
    display: code.display ?? code.text,
  });
}

function period(interval: QdmInterval | undefined): { start?: string; end?: string } | undefined {
  if (!interval?.start && !interval?.end) return undefined;
  return compact({ start: interval.start, end: interval.end });
}

function timing(resource: FHIRResource, qdm: QdmElement, prefix: 'effective' | 'performed'): void {
  const relevantPeriod = qdm.timing.relevantPeriod ?? qdm.timing.prevalencePeriod;
  const relevantDateTime = qdm.timing.relevantDateTime;
  if (prefix === 'effective') {
    if (relevantDateTime) resource.effectiveDateTime = relevantDateTime;
    const effectivePeriod = period(relevantPeriod);
    if (effectivePeriod) resource.effectivePeriod = effectivePeriod;
  } else {
    if (relevantDateTime) resource.performedDateTime = relevantDateTime;
    const performedPeriod = period(relevantPeriod);
    if (performedPeriod) resource.performedPeriod = performedPeriod;
  }
}

function valueToFhir(resource: FHIRResource, value: unknown): void {
  if (value == null) return;
  if (typeof value === 'string') {
    resource.valueString = value;
    return;
  }
  if (typeof value === 'boolean') {
    resource.valueBoolean = value;
    return;
  }
  if (typeof value === 'number') {
    resource.valueQuantity = { value };
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value['value'] === 'number') {
    resource.valueQuantity = compact({
      value: value['value'],
      unit: value['unit'],
      system: value['system'],
      code: value['code'],
    });
    return;
  }
  if (typeof value['code'] === 'string' || typeof value['text'] === 'string') {
    resource.valueCodeableConcept = codeableConcept({
      system: typeof value['system'] === 'string' ? value['system'] : undefined,
      code: typeof value['code'] === 'string' ? value['code'] : undefined,
      display: typeof value['display'] === 'string' ? value['display'] : undefined,
      text: typeof value['text'] === 'string' ? value['text'] : undefined,
    });
  }
}

function negationReason(qdm: QdmElement): Record<string, unknown> | undefined {
  const reasons = qdm.attributes['negationRationale'];
  if (!Array.isArray(reasons)) return undefined;
  const first = reasons.find(isRecord);
  if (!first) return undefined;
  return codeableConcept({
    system: typeof first['system'] === 'string' ? first['system'] : undefined,
    code: typeof first['code'] === 'string' ? first['code'] : undefined,
    display: typeof first['display'] === 'string' ? first['display'] : undefined,
    text: typeof first['text'] === 'string' ? first['text'] : undefined,
  });
}

function baseResource(
  qdm: QdmElement,
  resourceType: string,
  profiles: string[],
  options?: QdmToQiCoreOptions,
): FHIRResource {
  return {
    resourceType,
    id: resourceId(qdm, resourceType),
    meta: profileMeta(profiles, options),
    identifier: [
      qdmIdentifier(qdm),
      ...identifiers(qdm.source.identifiers),
    ],
  };
}

export function qdmElementToQiCore(
  qdm: QdmElement,
  options?: QdmToQiCoreOptions,
): FHIRResource | null {
  switch (qdm.datatype) {
    case 'Patient':
      return patientToQiCore(qdm, options);
    case 'Encounter, Performed':
      return encounterToQiCore(qdm, options);
    case 'Diagnosis':
      return conditionToQiCore(qdm, options);
    case 'Laboratory Test, Performed':
    case 'Physical Exam, Performed':
    case 'Assessment, Performed':
      return observationToQiCore(qdm, options);
    case 'Medication, Order':
    case 'Medication, Not Ordered':
      return medicationRequestToQiCore(qdm, options);
    case 'Medication, Administered':
    case 'Medication, Not Administered':
      return medicationAdministrationToQiCore(qdm, options);
    case 'Procedure, Performed':
    case 'Procedure, Not Performed':
      return procedureToQiCore(qdm, options);
    case 'Device':
      return deviceToQiCore(qdm, options);
    case 'Diagnostic Study, Performed':
      return diagnosticReportToQiCore(qdm, options);
    case 'Intervention, Order':
      return serviceRequestToQiCore(qdm, options);
    case 'Communication, Performed':
      return communicationToQiCore(qdm, options);
    case 'Care Goal':
      return goalToQiCore(qdm, options);
    default:
      return null;
  }
}

export function qdmElementsToQiCoreBundle(
  qdmElements: readonly QdmElement[],
  options?: QdmToQiCoreOptions,
): TransactionBundle {
  const entries: TransactionBundleEntry[] = [];
  for (const qdm of qdmElements) {
    const resource = qdmElementToQiCore(qdm, options);
    if (!resource) continue;
    const url = `${resource.resourceType}/${resource.id}`;
    entries.push({ fullUrl: url, resource, request: { method: 'PUT', url } });
  }
  return { resourceType: 'Bundle', type: 'transaction', entry: entries };
}

function patientToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const attrs = qdm.attributes;
  return compactResource({
    ...baseResource(qdm, 'Patient', [US_CORE.patient, QICORE.patient], options),
    active: attrs['active'] ?? qdm.status !== 'inactive',
    gender: attrs['gender'],
    birthDate: attrs['birthDate'] ?? qdm.timing.birthDate,
    name: attrs['name'] ? [attrs['name']] : undefined,
    telecom: attrs['telecom'],
    address: attrs['address'],
    extension: attrs['extensions'],
  });
}

function encounterToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const resource = compactResource({
    ...baseResource(qdm, 'Encounter', [US_CORE.encounter, QICORE.encounter], options),
    status: qdm.status ?? 'finished',
    class: qdm.attributes['class'],
    type: qdm.code ? [codeableConcept(qdm.code)] : qdm.attributes['type'],
    subject: patientReference(qdm.subject),
    period: period(qdm.timing.relevantPeriod),
  });
  return resource;
}

function conditionToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const prevalence = qdm.timing.prevalencePeriod;
  const resource = compactResource({
    ...baseResource(qdm, 'Condition', [US_CORE.conditionProblems, QICORE.conditionEncounterDiagnosis], options),
    clinicalStatus: qdm.status
      ? { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: qdm.status }] }
      : undefined,
    verificationStatus: qdm.attributes['verificationStatus']
      ? { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: qdm.attributes['verificationStatus'] }] }
      : undefined,
    code: codeableConcept(qdm.code),
    subject: patientReference(qdm.subject),
  });
  if (prevalence?.start && prevalence.end) resource.onsetPeriod = { start: prevalence.start, end: prevalence.end };
  else if (prevalence?.start) resource.onsetDateTime = prevalence.start;
  if (prevalence?.end) resource.abatementDateTime = prevalence.end;
  return resource;
}

function observationToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const categoryCode = qdm.datatype === 'Laboratory Test, Performed'
    ? 'laboratory'
    : qdm.datatype === 'Physical Exam, Performed'
      ? 'exam'
      : 'survey';
  const resource = compactResource({
    ...baseResource(qdm, 'Observation', [US_CORE.observationClinicalResult, QICORE.observationLab], options),
    status: qdm.status ?? 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: categoryCode }] }],
    code: codeableConcept(qdm.code),
    subject: patientReference(qdm.subject),
    issued: qdm.timing.resultDateTime,
  });
  timing(resource, qdm, 'effective');
  valueToFhir(resource, qdm.attributes['value']);
  return resource;
}

function medicationRequestToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const notOrdered = qdm.datatype === 'Medication, Not Ordered';
  const resource = compactResource({
    ...baseResource(qdm, 'MedicationRequest', [US_CORE.medicationRequest, QICORE.medicationRequest], options),
    status: notOrdered ? 'cancelled' : qdm.status ?? 'active',
    intent: qdm.attributes['intent'] ?? 'order',
    doNotPerform: notOrdered || undefined,
    medicationCodeableConcept: codeableConcept(qdm.code),
    subject: patientReference(qdm.subject),
    authoredOn: qdm.timing.authorDateTime,
    requester: qdm.attributes['requester'],
    dosageInstruction: qdm.attributes['dosageInstruction'],
    dispenseRequest: qdm.attributes['dispenseRequest'],
  });
  const reason = negationReason(qdm);
  if (notOrdered && reason) resource.reasonCode = [reason];
  return resource;
}

function medicationAdministrationToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const notAdministered = qdm.datatype === 'Medication, Not Administered';
  const resource = compactResource({
    ...baseResource(qdm, 'MedicationAdministration', [QICORE.medicationAdministration], options),
    status: notAdministered ? 'not-done' : qdm.status ?? 'completed',
    medicationCodeableConcept: codeableConcept(qdm.code),
    subject: patientReference(qdm.subject),
    dosage: qdm.attributes['dosage'],
    request: qdm.attributes['request'],
  });
  timing(resource, qdm, 'effective');
  const reason = negationReason(qdm);
  if (notAdministered && reason) resource.statusReason = [reason];
  return resource;
}

function procedureToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const notPerformed = qdm.datatype === 'Procedure, Not Performed';
  const resource = compactResource({
    ...baseResource(qdm, 'Procedure', [QICORE.procedure], options),
    status: notPerformed ? 'not-done' : qdm.status ?? 'completed',
    code: codeableConcept(qdm.code),
    subject: patientReference(qdm.subject),
    bodySite: qdm.attributes['bodySite'],
    outcome: qdm.attributes['outcome'],
  });
  timing(resource, qdm, 'performed');
  const reason = negationReason(qdm);
  if (notPerformed && reason) resource.statusReason = { coding: [codingFromConcept(reason)] };
  return resource;
}

function diagnosticReportToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const resource = compactResource({
    ...baseResource(qdm, 'DiagnosticReport', [US_CORE.diagnosticReportLab, QICORE.diagnosticReportLab], options),
    status: qdm.status ?? 'final',
    category: qdm.attributes['category'],
    code: codeableConcept(qdm.code),
    subject: patientReference(qdm.subject),
    issued: qdm.timing.resultDateTime,
    conclusion: qdm.attributes['conclusion'],
    conclusionCode: qdm.attributes['conclusionCode'],
    performer: qdm.attributes['performer'],
    result: qdm.attributes['result'],
  });
  timing(resource, qdm, 'effective');
  return resource;
}

function serviceRequestToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const doNotPerform = qdm.attributes['doNotPerform'] === true;
  const resource = compactResource({
    ...baseResource(qdm, 'ServiceRequest', [US_CORE.serviceRequest, QICORE.serviceRequest], options),
    status: qdm.status ?? 'active',
    intent: qdm.attributes['intent'] ?? 'order',
    priority: qdm.attributes['priority'],
    doNotPerform: doNotPerform || undefined,
    category: qdm.attributes['category'],
    code: codeableConcept(qdm.code),
    subject: patientReference(qdm.subject),
    authoredOn: qdm.timing.authorDateTime,
    requester: qdm.attributes['requester'],
    reasonCode: qdm.attributes['reasonCode'],
  });
  const reason = negationReason(qdm);
  if (doNotPerform && reason) resource.reasonCode = [reason];
  return resource;
}

function communicationToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  return compactResource({
    ...baseResource(qdm, 'Communication', [QICORE.communication], options),
    status: qdm.status ?? 'completed',
    category: qdm.attributes['category'],
    topic: codeableConcept(qdm.code),
    subject: patientReference(qdm.subject),
    sent: qdm.timing.relevantDateTime,
  });
}

function goalToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  const targetDate = qdm.attributes['targetDate'];
  return compactResource({
    ...baseResource(qdm, 'Goal', [US_CORE.goal, QICORE.goal], options),
    lifecycleStatus: qdm.attributes['lifecycleStatus'] ?? qdm.status ?? 'active',
    achievementStatus: qdm.attributes['achievementStatus'],
    priority: qdm.attributes['priority'],
    description: codeableConcept(qdm.code),
    subject: patientReference(qdm.subject),
    startDate: qdm.timing.relevantDateTime,
    target: typeof targetDate === 'string' ? [{ dueDate: targetDate }] : undefined,
  });
}

function deviceToQiCore(qdm: QdmElement, options?: QdmToQiCoreOptions): FHIRResource {
  return compactResource({
    ...baseResource(qdm, 'Device', [QICORE.device], options),
    status: qdm.status,
    type: codeableConcept(qdm.code),
    manufacturer: qdm.attributes['manufacturer'],
    modelNumber: qdm.attributes['modelNumber'],
    lotNumber: qdm.attributes['lotNumber'],
    serialNumber: qdm.attributes['serialNumber'],
    udiCarrier: qdm.attributes['udiCarrier'],
    patient: qdm.attributes['patient'] ?? patientReference(qdm.subject),
    owner: qdm.attributes['owner'],
  });
}

function codingFromConcept(concept: Record<string, unknown>): Record<string, unknown> {
  const codings = Array.isArray(concept['coding']) ? concept['coding'].filter(isRecord) : [];
  return codings[0] ?? coding({ text: typeof concept['text'] === 'string' ? concept['text'] : undefined });
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function compactResource(value: FHIRResource): FHIRResource {
  return compact(value) as FHIRResource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
