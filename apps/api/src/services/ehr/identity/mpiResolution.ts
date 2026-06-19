// =============================================================================
// MPI resolution factory — builds the optional probabilistic tier for
// resolvePatientIdentity from the environment.
//
// Reads process.env directly (NOT the validated config module) so importing it
// never triggers config's required()-on-load throws in unit tests. Returns
// undefined whenever MPI matching is disabled, which keeps identity resolution
// deterministic-only by default.
// =============================================================================

import { FhirMpiClient } from './mpiClient.js';
import type { MpiResolution } from './resolvePatientIdentity.js';

const DEFAULT_MASTER_ID_SYSTEM = 'urn:oid:2.16.840.1.113883.3.999.mpi';

let cached: MpiResolution | undefined | null = null; // null = not yet computed

function nonEmpty(key: string): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

function build(): MpiResolution | undefined {
  if (process.env['MPI_ENABLED'] !== 'true') return undefined;
  const baseUrl = process.env['MPI_BASE_URL'];
  if (!baseUrl) return undefined;
  const masterIdSystem = process.env['MPI_MASTER_ID_SYSTEM'] ?? DEFAULT_MASTER_ID_SYSTEM;
  return {
    masterIdSystem,
    client: new FhirMpiClient({
      baseUrl,
      masterIdSystem,
      // Static token wins; otherwise acquire via OAuth2 client_credentials.
      accessToken: nonEmpty('MPI_ACCESS_TOKEN'),
      tokenUrl: nonEmpty('MPI_TOKEN_URL'),
      clientId: nonEmpty('MPI_CLIENT_ID'),
      clientSecret: nonEmpty('MPI_CLIENT_SECRET'),
      scope: nonEmpty('MPI_SCOPE'),
    }),
    autoThreshold: Number(process.env['MPI_AUTO_THRESHOLD'] ?? '0.9'),
    reviewThreshold: Number(process.env['MPI_REVIEW_THRESHOLD'] ?? '0.6'),
  };
}

/** Memoized MPI resolution (or undefined when disabled). */
export function buildMpiResolution(): MpiResolution | undefined {
  if (cached === null) cached = build();
  return cached;
}
