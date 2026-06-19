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
  /**
   * Register a patient with the MPI (demographics-only) so future $match can
   * find it. Returns the MPI's stable id for the registered record.
   */
  feed(input: MpiMatchInput): Promise<string>;
}

export interface FhirMpiClientOptions {
  baseUrl: string;
  /** Assigning-authority system of the MPI's master/enterprise identifier. */
  masterIdSystem: string;
  fetchImpl?: FetchLike;
  /** Static bearer token. Takes precedence over client_credentials acquisition. */
  accessToken?: string;
  timeoutMs?: number;
  /** Max candidates to request. SanteDB's $match NREs without a count, so this is always sent. */
  count?: number;
  // OAuth2 client_credentials acquisition (used when accessToken is not set).
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  /** Injectable clock (ms) for token-expiry testing; defaults to Date.now. */
  now?: () => number;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
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
  // SanteDB returns candidates keyed by their stable resource id rather than an
  // identifier in our master system — use that id as the master value.
  const id = resource['id'];
  if (typeof id === 'string' && id.length > 0) {
    return { system, value: id };
  }
  return null;
}

export class FhirMpiClient implements MpiClient {
  private readonly baseUrl: string;
  private readonly masterIdSystem: string;
  private readonly fetchImpl: FetchLike;
  private readonly accessToken: string | undefined;
  private readonly timeoutMs: number;
  private readonly count: number;
  private readonly tokenUrl: string | undefined;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly scope: string;
  private readonly now: () => number;
  private cachedToken: CachedToken | null = null;

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
    this.count = options.count ?? 10;
    this.tokenUrl = options.tokenUrl;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.scope = options.scope ?? '*';
    this.now = options.now ?? Date.now;
  }

  /** Resolve a bearer token: static if provided, else cached/freshly-acquired client_credentials. */
  private async resolveToken(): Promise<string | undefined> {
    if (this.accessToken) return this.accessToken;
    if (!this.tokenUrl || !this.clientId) return undefined;
    if (this.cachedToken && this.cachedToken.expiresAtMs > this.now()) {
      return this.cachedToken.token;
    }
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      scope: this.scope,
    });
    if (this.clientSecret) body.set('client_secret', this.clientSecret);
    const response = await this.fetchImpl(this.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`MPI token request failed with HTTP ${response.status}`);
    }
    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      throw new Error('MPI token response did not include an access_token');
    }
    // Refresh 30s before stated expiry; default 5 min when expires_in is absent.
    const ttlMs = Math.max(0, (json.expires_in ?? 300) - 30) * 1000;
    this.cachedToken = { token: json.access_token, expiresAtMs: this.now() + ttlMs };
    return json.access_token;
  }

  async match(input: MpiMatchInput): Promise<MpiCandidate[]> {
    const parameters = this.buildParameters(input);
    const headers: Record<string, string> = {
      'content-type': 'application/fhir+json',
      accept: 'application/fhir+json',
    };
    const token = await this.resolveToken();
    if (token) headers.authorization = `Bearer ${token}`;

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

  async feed(input: MpiMatchInput): Promise<string> {
    // Demographics-only: no identifiers, so SanteDB never rejects an
    // unregistered identity domain. The MPI assigns its own id.
    const patient: Record<string, unknown> = {
      resourceType: 'Patient',
      name: [{ family: input.lastName, given: [input.firstName] }],
      birthDate: input.dateOfBirth,
    };
    if (input.sex) patient.gender = input.sex;

    const headers: Record<string, string> = {
      'content-type': 'application/fhir+json',
      accept: 'application/fhir+json',
    };
    const token = await this.resolveToken();
    if (token) headers.authorization = `Bearer ${token}`;

    const response = await this.fetchImpl(`${this.baseUrl}/Patient`, {
      method: 'POST',
      headers,
      body: JSON.stringify(patient),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`MPI Patient create (feed) failed with HTTP ${response.status}`);
    }
    const created = (await response.json()) as FhirResource;
    const id = created['id'];
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('MPI Patient create (feed) response did not include an id');
    }
    return id;
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
        // SanteDB's FHIR $match throws a NullReferenceException without count.
        { name: 'count', valueInteger: this.count },
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
