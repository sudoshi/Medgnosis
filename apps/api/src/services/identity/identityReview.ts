// =============================================================================
// Identity steward review service.
//
// Backs the admin "Identity Review" UI: list open review-queue items, inspect
// the persons involved, and resolve them by MERGING (one survivor absorbs the
// others) or DISMISSING (not a match). Merges are atomic and audited in
// phm_edw.patient_merge_log with enough detail to support a future un-merge.
// =============================================================================

import { sql } from '@medgnosis/db';

export interface ReviewPersonSummary {
  personId: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string | null;
  status: string;
  linkedPatientCount: number;
  identifiers: Array<{ system: string; value: string; sourceSystem: string | null }>;
}

export interface ReviewItem {
  id: number;
  reason: string;
  sourceSystem: string | null;
  demographicKey: string | null;
  createdAt: string;
  persons: ReviewPersonSummary[];
}

export interface MergeReviewInput {
  reviewId: number;
  survivorPersonId: number;
  performedBy: string;
}

export interface MergeReviewResult {
  survivorPersonId: number;
  mergedPersonIds: number[];
  movedPatientLinks: number;
}

function distinct(values: number[]): number[] {
  return Array.from(new Set(values));
}

interface ReviewRow {
  id: number | string;
  person_id: number | string;
  candidate_person_ids: Array<number | string> | null;
  reason: string;
  source_system: string | null;
  demographic_key: string | null;
  status: string;
}

function toInt(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value ?? 0;
  return Number.isFinite(parsed as number) ? (parsed as number) : 0;
}

async function loadReview(reviewId: number): Promise<ReviewRow | null> {
  const rows = await sql<ReviewRow[]>`
    SELECT id, person_id, candidate_person_ids, reason, source_system, demographic_key, status
    FROM phm_edw.identity_review_queue
    WHERE id = ${reviewId}
  `;
  return rows[0] ?? null;
}

/** Person ids involved in a review: the resolved person plus its candidates. */
function reviewPersonIds(review: ReviewRow): number[] {
  const candidates = (review.candidate_person_ids ?? []).map(toInt);
  return distinct([toInt(review.person_id), ...candidates]).filter((id) => id > 0);
}

export async function listOpenReviews(limit = 100): Promise<ReviewItem[]> {
  const reviews = await sql<ReviewRow[]>`
    SELECT id, person_id, candidate_person_ids, reason, source_system, demographic_key, status, created_at
    FROM phm_edw.identity_review_queue
    WHERE status = 'open'
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
  const items: ReviewItem[] = [];
  for (const review of reviews) {
    const personIds = reviewPersonIds(review);
    items.push({
      id: toInt(review.id),
      reason: review.reason,
      sourceSystem: review.source_system,
      demographicKey: review.demographic_key,
      createdAt: (review as ReviewRow & { created_at?: string }).created_at ?? '',
      persons: await loadPersonSummaries(personIds),
    });
  }
  return items;
}

interface PersonSummaryRow {
  person_id: number | string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string | null;
  status: string;
  linked_patient_count: number | string;
}

interface IdentifierRow {
  person_id: number | string;
  system: string;
  value: string;
  source_system: string | null;
}

export async function loadPersonSummaries(personIds: number[]): Promise<ReviewPersonSummary[]> {
  if (personIds.length === 0) return [];
  const rows = await sql<PersonSummaryRow[]>`
    SELECT p.person_id, p.first_name, p.last_name,
           to_char(p.date_of_birth, 'YYYY-MM-DD') AS date_of_birth, p.sex, p.status,
           (SELECT count(*) FROM phm_edw.patient_link pl WHERE pl.person_id = p.person_id) AS linked_patient_count
    FROM phm_edw.person p
    WHERE p.person_id = ANY(${personIds})
  `;
  const idRows = await sql<IdentifierRow[]>`
    SELECT person_id, system, value, source_system
    FROM phm_edw.patient_identifier
    WHERE person_id = ANY(${personIds}) AND active = true
  `;
  return rows.map((row) => ({
    personId: toInt(row.person_id),
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    sex: row.sex,
    status: row.status,
    linkedPatientCount: toInt(row.linked_patient_count),
    identifiers: idRows
      .filter((id) => toInt(id.person_id) === toInt(row.person_id))
      .map((id) => ({ system: id.system, value: id.value, sourceSystem: id.source_system })),
  }));
}

export async function mergeReview(input: MergeReviewInput): Promise<MergeReviewResult> {
  const review = await loadReview(input.reviewId);
  if (!review) throw new Error(`Review ${input.reviewId} not found`);
  if (review.status !== 'open') throw new Error(`Review ${input.reviewId} is already ${review.status}`);

  const personIds = reviewPersonIds(review);
  if (!personIds.includes(input.survivorPersonId)) {
    throw new Error('survivorPersonId must be one of the persons in the review');
  }
  const losers = personIds.filter((id) => id !== input.survivorPersonId);
  if (losers.length === 0) throw new Error('Nothing to merge: survivor is the only person');

  return sql.begin(async (tx) => {
    let movedPatientLinks = 0;
    for (const loserId of losers) {
      // Repoint legacy patients to the survivor.
      const movedLinks = await tx.unsafe<{ patient_id: number }[]>(
        `UPDATE phm_edw.patient_link SET person_id = $1 WHERE person_id = $2 RETURNING patient_id`,
        [input.survivorPersonId, loserId],
      );
      movedPatientLinks += movedLinks.length;

      // Move identifiers, dropping any that already exist on the survivor
      // (UNIQUE(system,value) — survivor keeps its copy).
      await tx.unsafe(
        `DELETE FROM phm_edw.patient_identifier l
         WHERE l.person_id = $1
           AND EXISTS (SELECT 1 FROM phm_edw.patient_identifier s
                       WHERE s.person_id = $2 AND s.system = l.system AND s.value = l.value)`,
        [loserId, input.survivorPersonId],
      );
      await tx.unsafe(
        `UPDATE phm_edw.patient_identifier SET person_id = $1 WHERE person_id = $2`,
        [input.survivorPersonId, loserId],
      );

      // Tombstone the loser.
      await tx.unsafe(
        `UPDATE phm_edw.person SET status = 'merged', merged_into_person_id = $1, updated_at = NOW() WHERE person_id = $2`,
        [input.survivorPersonId, loserId],
      );

      // Append-only audit (movedPatientIds supports a future un-merge).
      await tx.unsafe(
        `INSERT INTO phm_edw.patient_merge_log (action, source_person_id, target_person_id, reason, performed_by, details)
         VALUES ('merge', $1, $2, $3, $4, $5::jsonb)`,
        [
          loserId,
          input.survivorPersonId,
          review.reason,
          input.performedBy,
          JSON.stringify({ reviewId: input.reviewId, movedPatientIds: movedLinks.map((r) => r.patient_id) }),
        ],
      );
    }

    await tx.unsafe(
      `UPDATE phm_edw.identity_review_queue SET status = 'merged', resolved_by = $1, resolved_at = NOW() WHERE id = $2`,
      [input.performedBy, input.reviewId],
    );

    return { survivorPersonId: input.survivorPersonId, mergedPersonIds: losers, movedPatientLinks };
  });
}

export async function dismissReview(reviewId: number, performedBy: string): Promise<void> {
  const review = await loadReview(reviewId);
  if (!review) throw new Error(`Review ${reviewId} not found`);
  if (review.status !== 'open') throw new Error(`Review ${reviewId} is already ${review.status}`);
  await sql`
    UPDATE phm_edw.identity_review_queue
    SET status = 'dismissed', resolved_by = ${performedBy}, resolved_at = NOW()
    WHERE id = ${reviewId}
  `;
}
