// =============================================================================
// MPI resolution factory — assembles the optional probabilistic tier for
// resolvePatientIdentity from the environment (mpiConfig) plus the async feed
// producer (mpi-feed worker). Returns undefined whenever MPI matching is
// disabled, keeping identity resolution deterministic-only by default.
// =============================================================================

import { buildMpiClientFromEnv } from './mpiConfig.js';
import { enqueueMpiFeed } from '../../../workers/mpi-feed.js';
import type { MpiResolution } from './resolvePatientIdentity.js';

let cached: MpiResolution | undefined | null = null; // null = not yet computed

function build(): MpiResolution | undefined {
  const base = buildMpiClientFromEnv();
  if (!base) return undefined;
  return {
    ...base,
    // Feed registration runs asynchronously via the mpi-feed queue so it never
    // blocks the ingest request path.
    enqueueFeed: (input) => enqueueMpiFeed(input),
  };
}

/** Memoized MPI resolution (or undefined when disabled). */
export function buildMpiResolution(): MpiResolution | undefined {
  if (cached === null) cached = build();
  return cached;
}
