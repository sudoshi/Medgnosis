// =============================================================================
// Medgnosis API — CDS Hooks 2.0.1 feedback store
// Persists the closed feedback loop (accepted / overridden + overrideReason +
// outcomeTimestamp) into phm_edw.cds_alert_feedback, and aggregates per-service
// burden (the override-rate signal behind the open alert-burden dashboard,
// Phase 3 Epic 3.2/3.3). The feedback body shape follows CDS Hooks 2.0.1.
// =============================================================================

import { sql } from '@medgnosis/db';

export interface CdsFeedbackItem {
  card: string;
  outcome: 'accepted' | 'overridden';
  outcomeTimestamp: string;
  acceptedSuggestions?: Array<{ id: string }>;
  overrideReason?: {
    reason?: { code?: string; system?: string; display?: string };
    userComment?: string;
  };
}

export interface CdsFeedbackPayload {
  feedback: CdsFeedbackItem[];
}

export interface ServiceBurden {
  accepted: number;
  overridden: number;
  total: number;
  overrideRate: number;
  overrideReasons: Record<string, number>;
}

function parsePayload(payload: unknown): CdsFeedbackItem[] {
  const feedback = (payload as { feedback?: unknown })?.feedback;
  if (!Array.isArray(feedback)) {
    throw new Error('CDS feedback: body must contain a `feedback` array');
  }
  return feedback.map((raw, i) => {
    const item = raw as Partial<CdsFeedbackItem>;
    if (item.outcome !== 'accepted' && item.outcome !== 'overridden') {
      throw new Error(`CDS feedback[${i}]: outcome must be 'accepted' or 'overridden'`);
    }
    if (typeof item.card !== 'string' || item.card === '') {
      throw new Error(`CDS feedback[${i}]: 'card' is required`);
    }
    if (typeof item.outcomeTimestamp !== 'string' || item.outcomeTimestamp === '') {
      throw new Error(`CDS feedback[${i}]: 'outcomeTimestamp' is required`);
    }
    return item as CdsFeedbackItem;
  });
}

/** Persist a CDS Hooks 2.0.1 feedback payload for a service; returns rows written. */
export async function recordFeedback(serviceId: string, payload: unknown): Promise<number> {
  const items = parsePayload(payload);

  for (const item of items) {
    const reasonKey = item.overrideReason?.reason?.code ?? null;
    const reasonDisplay = item.overrideReason?.reason?.display ?? null;
    const comment = item.overrideReason?.userComment ?? null;
    const acceptedId = item.acceptedSuggestions?.[0]?.id ?? null;

    await sql`
      INSERT INTO phm_edw.cds_alert_feedback
        (service_id, card_uuid, outcome, override_reason_key, override_reason_display,
         override_comment, accepted_suggestion_id, outcome_timestamp)
      VALUES (
        ${serviceId}, ${item.card}, ${item.outcome}, ${reasonKey}, ${reasonDisplay},
        ${comment}, ${acceptedId}, ${item.outcomeTimestamp}
      )
    `;
  }

  return items.length;
}

/** Per-service (or global) accepted/overridden counts + override-reason histogram. */
export async function serviceBurden(serviceId?: string): Promise<ServiceBurden> {
  const rows = await sql<{ outcome: string; override_reason_display: string | null; n: number }[]>`
    SELECT outcome, override_reason_display, COUNT(*)::int AS n
    FROM phm_edw.cds_alert_feedback
    WHERE (${serviceId ?? null}::text IS NULL OR service_id = ${serviceId ?? null}::text)
    GROUP BY outcome, override_reason_display
  `;

  let accepted = 0;
  let overridden = 0;
  const overrideReasons: Record<string, number> = {};
  for (const r of rows) {
    if (r.outcome === 'accepted') accepted += r.n;
    else if (r.outcome === 'overridden') {
      overridden += r.n;
      if (r.override_reason_display) {
        overrideReasons[r.override_reason_display] = (overrideReasons[r.override_reason_display] ?? 0) + r.n;
      }
    }
  }
  const total = accepted + overridden;
  return { accepted, overridden, total, overrideRate: total > 0 ? overridden / total : 0, overrideReasons };
}
