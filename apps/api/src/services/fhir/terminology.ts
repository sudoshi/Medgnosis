// =============================================================================
// Medgnosis API — FHIR terminology operations over the VSAC tables
// $expand / $validate-code, read-only. VSAC code_system labels (SNOMEDCT,
// RXNORM, LOINC, ICD10CM) are translated to FHIR system URIs for output.
// =============================================================================

import { sql } from '@medgnosis/db';

const VSAC_CANONICAL_PREFIX = 'http://cts.nlm.nih.gov/fhir/ValueSet/';

// VSAC code_system label -> FHIR system URI.
const SYSTEM_URI: Record<string, string> = {
  SNOMEDCT: 'http://snomed.info/sct',
  RXNORM: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  LOINC: 'http://loinc.org',
  ICD10CM: 'http://hl7.org/fhir/sid/icd-10-cm',
  CPT: 'http://www.ama-assn.org/go/cpt',
};

// Reverse map: FHIR system URI -> VSAC label, for matching against stored codes.
const LABEL_FOR_URI: Record<string, string> = Object.fromEntries(
  Object.entries(SYSTEM_URI).map(([label, uri]) => [uri, label]),
);

interface ExpansionEntry {
  system: string;
  code: string;
  display?: string;
}

export interface FhirValueSetExpansion {
  resourceType: 'ValueSet';
  status: 'active';
  url: string;
  name?: string;
  version?: string;
  expansion?: {
    timestamp: string;
    total: number;
    contains: ExpansionEntry[];
  };
}

export interface FhirParameters {
  resourceType: 'Parameters';
  parameter: Array<{ name: string; valueBoolean?: boolean; valueString?: string }>;
}

export function oidFromCanonical(urlOrOid: string): string {
  return urlOrOid.startsWith(VSAC_CANONICAL_PREFIX)
    ? urlOrOid.slice(VSAC_CANONICAL_PREFIX.length)
    : urlOrOid;
}

function toSystemUri(label: string): string {
  return SYSTEM_URI[label] ?? `urn:medgnosis:codesystem:${label}`;
}

/**
 * Expand a VSAC value set to a FHIR ValueSet. When `measurementPeriod` is
 * supplied and a period-pinned row exists in vsac_expansion_cache, the cached
 * (stable, versioned) expansion is returned; otherwise the live code rows are
 * expanded. Returns null when the OID is unknown.
 */
export async function expandValueSet(
  urlOrOid: string,
  opts: { measurementPeriod?: string } = {},
): Promise<FhirValueSetExpansion | null> {
  const oid = oidFromCanonical(urlOrOid);

  const header = await sql<{ name: string; expansion_version: string | null }[]>`
    SELECT name, expansion_version
    FROM phm_edw.vsac_value_set
    WHERE value_set_oid = ${oid}
  `;
  if (header.length === 0) return null;
  const name = header[0]!.name;

  if (opts.measurementPeriod) {
    const cached = await sql<
      {
        expansion: ExpansionEntry[];
        expansion_version: string | null;
        code_count: number;
      }[]
    >`
      SELECT expansion, expansion_version, code_count
      FROM phm_edw.vsac_expansion_cache
      WHERE value_set_oid = ${oid} AND measurement_period = ${opts.measurementPeriod}
    `;
    if (cached.length > 0) {
      return {
        resourceType: 'ValueSet',
        status: 'active',
        url: `${VSAC_CANONICAL_PREFIX}${oid}`,
        name,
        version: cached[0]!.expansion_version ?? undefined,
        expansion: {
          timestamp: new Date().toISOString(),
          total: cached[0]!.code_count,
          contains: cached[0]!.expansion,
        },
      };
    }
  }

  const codes = await sql<
    { code: string; description: string | null; code_system: string }[]
  >`
    SELECT code, description, code_system
    FROM phm_edw.vsac_value_set_code
    WHERE value_set_oid = ${oid}
    ORDER BY code_system, code
    LIMIT 12000
  `;

  return {
    resourceType: 'ValueSet',
    status: 'active',
    url: `${VSAC_CANONICAL_PREFIX}${oid}`,
    name,
    version: header[0]!.expansion_version ?? undefined,
    expansion: {
      timestamp: new Date().toISOString(),
      total: codes.length,
      contains: codes.map((c) => ({
        system: toSystemUri(c.code_system),
        code: c.code,
        display: c.description ?? undefined,
      })),
    },
  };
}

/**
 * Validate that a (system, code) pair is a member of a VSAC value set.
 * Returns a FHIR Parameters resource with a boolean `result`.
 */
export async function validateCode(
  urlOrOid: string,
  system: string,
  code: string,
): Promise<FhirParameters> {
  const oid = oidFromCanonical(urlOrOid);
  const label = LABEL_FOR_URI[system] ?? system;

  const rows = await sql<{ found: number }[]>`
    SELECT 1 AS found
    FROM phm_edw.vsac_value_set_code
    WHERE value_set_oid = ${oid}
      AND code = ${code}
      AND code_system = ${label}
    LIMIT 1
  `;
  const result = rows.length > 0;

  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'result', valueBoolean: result },
      {
        name: 'message',
        valueString: result
          ? `${code} is in ${oid}`
          : `${code} (${system}) not found in ${oid}`,
      },
    ],
  };
}
