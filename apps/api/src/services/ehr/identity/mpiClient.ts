// =============================================================================
// MPI client — FHIR Patient/$match against an external MPI (SanteMPI).
//
// The probabilistic tier of identity resolution. When the deterministic tiers
// in resolvePatientIdentity find no match, we POST demographics to the MPI's
// Patient/$match and get back candidate master identities scored 0..1 with an
// IHE/HL7 match-grade. The MPI owns the Fellegi-Sunter scoring and tuning; this
// client only marshals the request and parses scored candidates.
// =============================================================================

import type { FetchLike, FhirResource } from './../types.js';
import type { NormalizedDemographics } from './identityKeys.js';
import type { NormalizedIdentifier } from './identityKeys.js';

export type MatchGradeCode = 'certain' | 'probable' | 'possible' | 'certainly-not';

export interface MpiCandidate {
  masterIdentifier: { system: string; value: string };
  score: number;
  grade: MatchGradeCode | null;
}

export interface MpiMatchInput extends NormalizedDemographics {
  identifiers?: NormalizedIdentifier[];
}

export interface MpiClient {
  match(input: MpiMatchInput): Promise<MpiCandidate[]>;
}

export interface FhirMpiClientOptions {
  baseUrl: string;
  /** Assigning-authority system of the MPI's master/enterprise identifier. */
  masterIdSystem: string;
  fetchImpl?: FetchLike;
  accessToken?: string;
  timeoutMs?: number;
}

const MATCH_GRADE_URL = 'http://hl7.org/fhir/StructureDefinition/match-grade';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function matchGradeFromSearch(search: Record<string, unknown>): MatchGradeCode | null {
  for (const ext of recordArray(search['extension'])) {
    if (ext['url'] === MATCH_GRADE_URL && typeof ext['valueCode'] === 'string') {
      return ext['valueCode'] as MatchGradeCode;
    }
  }
  return null;
}

function masterIdentifier(resource: Record<string, unknown>, system: string): { system: string; value: string } | null {
  for (const identifier of recordArray(resource['identifier'])) {
    if (identifier['system'] === system && typeof identifier['value'] === 'string' && identifier['value'].length > 0) {
      return { system, value: identifier['value'] };
    }
  }
  return null;
}

export class FhirMpiClient implements MpiClient {
  private readonly baseUrl: string;
  private readonly masterIdSystem: string;
  private readonly fetchImpl: FetchLike;
  private readonly accessToken: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: FhirMpiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.masterIdSystem = options.masterIdSystem;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('FhirMpiClient requires a fetch implementation');
    }
    this.fetchImpl = fetchImpl.bind(globalThis) as FetchLike;
    this.accessToken = options.accessToken;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async match(input: MpiMatchInput): Promise<MpiCandidate[]> {
    const parameters = this.buildParameters(input);
    const headers: Record<string, string> = {
      'content-type': 'application/fhir+json',
      accept: 'application/fhir+json',
    };
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;

    const response = await this.fetchImpl(`${this.baseUrl}/Patient/$match`, {
      method: 'POST',
      headers,
      body: JSON.stringify(parameters),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`MPI Patient/$match failed with HTTP ${response.status}`);
    }
    const bundle = (await response.json()) as FhirResource;
    return this.parseCandidates(bundle);
  }

  private buildParameters(input: MpiMatchInput): Record<string, unknown> {
    const patient: Record<string, unknown> = {
      resourceType: 'Patient',
      name: [{ family: input.lastName, given: [input.firstName] }],
      birthDate: input.dateOfBirth,
    };
    if (input.sex) patient.gender = input.sex;
    const identifiers = (input.identifiers ?? []).filter((identifier) => identifier.strong);
    if (identifiers.length > 0) {
      patient.identifier = identifiers.map((identifier) => ({ system: identifier.system, value: identifier.value }));
    }
    return {
      resourceType: 'Parameters',
      parameter: [
        { name: 'resource', resource: patient },
        { name: 'onlyCertainMatches', valueBoolean: false },
      ],
    };
  }

  private parseCandidates(bundle: FhirResource): MpiCandidate[] {
    const candidates: MpiCandidate[] = [];
    for (const entry of recordArray(bundle['entry'])) {
      const resource = isRecord(entry['resource']) ? entry['resource'] : null;
      const search = isRecord(entry['search']) ? entry['search'] : {};
      if (!resource) continue;
      const master = masterIdentifier(resource, this.masterIdSystem);
      if (!master) continue;
      const rawScore = search['score'];
      const score = typeof rawScore === 'number' ? rawScore : 0;
      candidates.push({ masterIdentifier: master, score, grade: matchGradeFromSearch(search) });
    }
    return candidates.sort((a, b) => b.score - a.score);
  }
}
