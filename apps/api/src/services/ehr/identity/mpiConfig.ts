// =============================================================================
// MPI configuration — env → FhirMpiClient + thresholds.
//
// Neutral module shared by mpiResolution (the resolver's probabilistic tier)
// and the mpi-feed worker, so neither has to import the other. Reads
// process.env directly (never the validated config module) so importing it
// can't trigger config's required()-on-load throws in unit tests.
// =============================================================================

import { FhirMpiClient } from './mpiClient.js';

const DEFAULT_MASTER_ID_SYSTEM = 'urn:oid:2.16.840.1.113883.3.999.mpi';

export interface MpiClientConfig {
  client: FhirMpiClient;
  masterIdSystem: string;
  autoThreshold: number;
  reviewThreshold: number;
}

function nonEmpty(key: string): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

/** Build the MPI client + thresholds from the environment, or undefined when disabled. */
export function buildMpiClientFromEnv(): MpiClientConfig | undefined {
  if (process.env['MPI_ENABLED'] !== 'true') return undefined;
  const baseUrl = process.env['MPI_BASE_URL'];
  if (!baseUrl) return undefined;
  const masterIdSystem = process.env['MPI_MASTER_ID_SYSTEM'] ?? DEFAULT_MASTER_ID_SYSTEM;
  return {
    masterIdSystem,
    client: new FhirMpiClient({
      baseUrl,
      masterIdSystem,
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
