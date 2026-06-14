// =============================================================================
// Medgnosis API — clinical-reasoning engine bundle loader
// POSTs a FHIR transaction Bundle (a measure bundle or an exported cohort, see
// qicoreExport.ts) to the HAPI CR sidecar's base endpoint. The sidecar applies
// the transaction against its JPA store ("Mode B"); we parse the
// transaction-response to report per-entry status counts and fail loudly when
// the transaction as a whole is rejected (OperationOutcome / non-2xx).
// =============================================================================

import type { TransactionBundle } from './fhir/qicoreExport.js';

export interface LoadResult {
  total: number;
  created: number; // 201
  ok: number; // 2xx (incl. 200/201)
  failed: number; // non-2xx per-entry responses
}

interface TransactionResponse {
  entry?: Array<{ response?: { status?: string } }>;
  issue?: Array<{ diagnostics?: string }>;
}

export async function loadBundle(
  engineBaseUrl: string,
  bundle: TransactionBundle,
): Promise<LoadResult> {
  const res = await fetch(engineBaseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/fhir+json',
      accept: 'application/fhir+json',
    },
    body: JSON.stringify(bundle),
  });

  const body = (await res.json()) as TransactionResponse;

  if (!res.ok) {
    const msg =
      (body.issue ?? []).map((i) => i.diagnostics).filter(Boolean).join('; ') ||
      `HTTP ${res.status}`;
    throw new Error(`engine bundle load failed: ${msg}`);
  }

  const entries = body.entry ?? [];
  let created = 0;
  let ok = 0;
  let failed = 0;
  for (const e of entries) {
    const code = parseInt((e.response?.status ?? '').slice(0, 3), 10);
    if (code >= 200 && code < 300) {
      ok += 1;
      if (code === 201) created += 1;
    } else {
      failed += 1;
    }
  }

  return { total: entries.length, created, ok, failed };
}
