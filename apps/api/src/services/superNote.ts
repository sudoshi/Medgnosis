// =============================================================================
// Medgnosis API — SuperNote assembly
// "The note that does the work." Pre-assembles the progress note from the
// record: generated history, interval events, organ-system-grouped problems,
// in-note care gaps, trended labs, and an A&P scaffold where writing the plan
// codes the diagnosis.
//
// AUTHORITATIVE SOURCE OF TRUTH: every section here is DETERMINISTICALLY
// assembled from structured EDW/star sources — it is NOT AI-generated and no
// LLM is ever called from this module. There is no "AI narrative coming soon"
// behavior: an optional LLM narrative seam exists below but is OFF by default
// behind the same BAA/consent provider config every other cloud-AI path uses,
// and the deterministic assembly stays authoritative regardless.
//
// GOVERNANCE: assembly NEVER finalizes or signs a note. The assembled note is
// always returned with an unsigned/draft review status; finalization is an
// explicit clinician action (see finalizeSuperNote + the no-autosign guard).
// =============================================================================

import { randomUUID } from 'node:crypto';
import { sql } from '@medgnosis/db';
import { config } from '../config.js';

// ─── Pure helpers ────────────────────────────────────────────────────────────

const ORGAN_RANK: Record<string, number> = {
  Cardiovascular: 0,
  Renal: 1,
  Endocrine: 2,
  Pulmonary: 3,
  Neurology: 4,
  'Heme/Onc': 5,
  Other: 99,
};

export function organSystemRank(system: string): number {
  return ORGAN_RANK[system] ?? ORGAN_RANK.Other!;
}

export interface ProblemRow {
  icd10_code: string;
  dx_name: string;
  organ_system: string;
  disease_process?: string | null;
  generate_plan?: boolean;
}

export interface ProblemGroup {
  organ_system: string;
  problems: ProblemRow[];
}

/** Group problems by organ system (high-impact first), de-duped by code within a system. */
export function groupProblems(rows: ProblemRow[]): ProblemGroup[] {
  const bySystem = new Map<string, Map<string, ProblemRow>>();
  for (const r of rows) {
    const system = r.organ_system || 'Other';
    if (!bySystem.has(system)) bySystem.set(system, new Map());
    bySystem.get(system)!.set(r.icd10_code, r); // dedupe by code within the system
  }
  return [...bySystem.entries()]
    .map(([organ_system, m]) => ({ organ_system, problems: [...m.values()] }))
    .sort((a, b) => organSystemRank(a.organ_system) - organSystemRank(b.organ_system));
}

export function whatsDue(gaps: { measure_name: string | null }[]): string {
  const names = gaps.map((g) => g.measure_name).filter((n): n is string => !!n);
  if (names.length === 0) return 'Up to date on care gaps.';
  return `Due for: ${names.slice(0, 6).join(', ')}.`;
}

export function briefHistory(
  demo: { first_name: string; last_name: string; age: number; gender: string },
  problems: { dx_name: string; organ_system: string }[],
  lastSeenISO: string | null,
  due: string,
): string {
  const top = problems.slice(0, 4).map((p) => p.dx_name).join(', ') || 'no chronic conditions on file';
  const seen = lastSeenISO ? `Last seen ${lastSeenISO}.` : 'No prior visit on file.';
  return `${demo.first_name} ${demo.last_name} is a ${demo.age} year old ${demo.gender} with a history of ${top}. ${seen} ${due}`;
}

// ─── Provenance & governance ──────────────────────────────────────────────────
// Every assembled section records which structured source it derived from and
// affirms it was deterministically assembled (never AI-generated). This makes
// the product surface honest about how the note was produced.

/** Structured record sources a SuperNote section can derive from. */
export const SUPERNOTE_SOURCES = {
  PROBLEM_LIST: 'problem_list',
  MEDICATIONS: 'medications',
  VITALS: 'vitals',
  ENCOUNTER: 'encounter',
  MEASURES: 'measures',
  LABS: 'labs',
  DEMOGRAPHICS: 'demographics',
} as const;

export type SuperNoteSource = (typeof SUPERNOTE_SOURCES)[keyof typeof SUPERNOTE_SOURCES];

/** Per-section provenance — names the structured source(s) and affirms deterministic assembly. */
export interface SectionProvenance {
  /** Which structured record source(s) this section derived from. */
  sources: SuperNoteSource[];
  /** Always true: this section was deterministically assembled, not AI-generated. */
  deterministic: true;
  /** Always false: no LLM produced this content. */
  ai_generated: false;
}

/** Make a section-provenance stamp. Deterministic + non-AI is invariant. */
export function sectionProvenance(...sources: SuperNoteSource[]): SectionProvenance {
  return { sources, deterministic: true, ai_generated: false };
}

/**
 * Clinician-review lifecycle for an assembled note. Mirrors the clinical-note
 * lifecycle (draft → finalized → amended). An assembled note is ALWAYS unsigned:
 * a clinician must explicitly finalize it. There is no auto-sign path.
 */
export type ReviewStatus = 'unsigned' | 'draft' | 'pending-review' | 'reviewed' | 'final';

/** Edit-tracking + review status carried on an assembled note. Defaults to unsigned/draft. */
export interface ReviewState {
  review_status: ReviewStatus;
  /** True only after an explicit clinician finalize action — never set by assembly. */
  signed: false;
  last_edited_by: string | null;
  last_edited_at: string | null;
}

/** The review state every freshly assembled note starts in: unsigned, unedited, never auto-signed. */
export function initialReviewState(): ReviewState {
  return { review_status: 'unsigned', signed: false, last_edited_by: null, last_edited_at: null };
}

// ─── DB orchestration ────────────────────────────────────────────────────────

const LAB_CODES = ['4548-4', '18262-6', '33914-3', '38483-4', '6298-4', '2947-0', '2339-0', '6299-2'];

export interface SuperNote {
  patient: { patient_id: number; first_name: string; last_name: string; age: number; gender: string };
  last_seen: string | null;
  brief_history: string;
  whats_due: string;
  problems_by_system: ProblemGroup[];
  interval_events: Record<string, unknown>[];
  care_gaps: Record<string, unknown>[];
  lab_review: Record<string, unknown>[];
  assessment_plan: { icd10_code: string; diagnosis_name: string; organ_system: string; ontology_id: number | null; generate_plan: boolean; previous_plan: string | null; current_plan: string }[];
  /** Per-section provenance: which structured source each section derived from + deterministic affirmation. */
  provenance: {
    brief_history: SectionProvenance;
    whats_due: SectionProvenance;
    problems_by_system: SectionProvenance;
    interval_events: SectionProvenance;
    care_gaps: SectionProvenance;
    lab_review: SectionProvenance;
    assessment_plan: SectionProvenance;
  };
  /** Whole-note provenance flag: deterministically assembled, not AI-generated. */
  assembly: { deterministic: true; ai_generated: false; assembled_by: 'supernote' };
  /** Clinician-review status + edit tracking. Always starts unsigned/draft — assembly never signs. */
  review: ReviewState;
}

export async function assembleSuperNote(patientId: number): Promise<SuperNote | null> {
  const [demo] = await sql<{ patient_id: number; first_name: string; last_name: string; age: number; gender: string; patient_key: number | null }[]>`
    SELECT p.patient_id, p.first_name, p.last_name, p.gender,
           date_part('year', age(p.date_of_birth))::int AS age,
           dp.patient_key
    FROM phm_edw.patient p
    LEFT JOIN phm_star.dim_patient dp ON dp.patient_id = p.patient_id
    WHERE p.patient_id = ${patientId} AND p.active_ind = 'Y'
    LIMIT 1
  `;
  if (!demo) return null;

  const [[lastSeenRow], problemRows, intervalEvents, careGaps, labReview] = await Promise.all([
    sql<{ last_seen: string | null }[]>`
      SELECT GREATEST(
        (SELECT MAX(appointment_date)::text FROM phm_edw.appointment WHERE patient_id = ${patientId} AND status = 'Completed'),
        (SELECT MAX(encounter_datetime)::date::text FROM phm_edw.encounter WHERE patient_id = ${patientId} AND active_ind = 'Y')
      ) AS last_seen
    `,
    sql<ProblemRow[]>`
      SELECT pl.icd10_code, pl.problem_name AS dx_name,
             COALESCE(o.organ_system, 'Other') AS organ_system,
             o.disease_process, COALESCE(o.generate_plan, TRUE) AS generate_plan,
             o.ontology_id
      FROM phm_edw.problem_list pl
      LEFT JOIN phm_edw.dx_ontology o ON o.icd10_code = pl.icd10_code AND o.active_ind = 'Y'
      WHERE pl.patient_id = ${patientId} AND pl.active_ind = 'Y' AND pl.problem_status = 'Active'
    `,
    sql`
      SELECT 'encounter' AS kind, e.encounter_datetime::date::text AS event_date,
             e.encounter_type AS detail, e.encounter_reason AS reason
      FROM phm_edw.encounter e
      WHERE e.patient_id = ${patientId} AND e.active_ind = 'Y'
      ORDER BY e.encounter_datetime DESC LIMIT 8
    `,
    sql<{ care_gap_id: number; measure_name: string | null; due_date: string | null; gap_priority: string | null }[]>`
      SELECT cg.care_gap_id, COALESCE(md.measure_name, 'Care gap') AS measure_name,
             cg.due_date, cg.gap_priority
      FROM phm_edw.care_gap cg
      LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      WHERE cg.patient_id = ${patientId} AND cg.active_ind = 'Y' AND cg.gap_status IN ('open', 'identified')
      ORDER BY cg.due_date NULLS LAST LIMIT 12
    `,
    demo.patient_key != null
      ? sql`
          SELECT observation_code, value_numeric, observed AS observed_date
          FROM (
            SELECT fo.observation_code, fo.value_numeric, dd.full_date::text AS observed,
                   row_number() OVER (PARTITION BY fo.observation_code ORDER BY fo.date_key_obs DESC) AS rn
            FROM phm_star.fact_observation fo
            JOIN phm_star.dim_date dd ON dd.date_key = fo.date_key_obs
            WHERE fo.patient_key = ${demo.patient_key}
              AND fo.observation_code IN ${sql(LAB_CODES)}
              AND fo.value_numeric IS NOT NULL
          ) t WHERE rn <= 3
          ORDER BY observation_code, observed_date DESC
        `
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const lastSeen = lastSeenRow?.last_seen ?? null;
  const groups = groupProblems(problemRows);
  const due = whatsDue(careGaps);
  const brief = briefHistory(demo, problemRows, lastSeen, due);

  // A&P scaffold — one entry per active problem (generate_plan first).
  const assessmentPlan = problemRows
    .map((p) => ({
      icd10_code: p.icd10_code,
      diagnosis_name: p.dx_name,
      organ_system: p.organ_system,
      ontology_id: (p as ProblemRow & { ontology_id?: number | null }).ontology_id ?? null,
      generate_plan: p.generate_plan ?? true,
      previous_plan: null as string | null,
      current_plan: '',
    }))
    .sort((a, b) => Number(b.generate_plan) - Number(a.generate_plan));

  const { PROBLEM_LIST, MEASURES, ENCOUNTER, LABS, DEMOGRAPHICS } = SUPERNOTE_SOURCES;

  return {
    patient: { patient_id: demo.patient_id, first_name: demo.first_name, last_name: demo.last_name, age: demo.age, gender: demo.gender },
    last_seen: lastSeen,
    brief_history: brief,
    whats_due: due,
    problems_by_system: groups,
    interval_events: intervalEvents,
    care_gaps: careGaps,
    lab_review: labReview,
    assessment_plan: assessmentPlan,
    provenance: {
      // brief history is woven from demographics + problem list + open measures + last encounter
      brief_history: sectionProvenance(DEMOGRAPHICS, PROBLEM_LIST, MEASURES, ENCOUNTER),
      whats_due: sectionProvenance(MEASURES),
      problems_by_system: sectionProvenance(PROBLEM_LIST),
      interval_events: sectionProvenance(ENCOUNTER),
      care_gaps: sectionProvenance(MEASURES),
      lab_review: sectionProvenance(LABS),
      assessment_plan: sectionProvenance(PROBLEM_LIST),
    },
    assembly: { deterministic: true, ai_generated: false, assembled_by: 'supernote' },
    // Assembly NEVER signs: a freshly assembled note is always unsigned/draft.
    review: initialReviewState(),
  };
}

// ─── Optional LLM narrative seam (OFF by default — deterministic stays authoritative) ──
// Mirrors the population-summary BAA gate: no external API is ever called from
// this module. The seam exists only so an honest, typed "not enabled" signal can
// be surfaced instead of a vague "AI narrative coming soon" promise.

/** Thrown when an LLM narrative is requested but the provider is not BAA-approved. */
export class SuperNoteLlmNotEnabledError extends Error {
  public readonly code = 'SUPERNOTE_LLM_NOT_ENABLED';
  constructor(reason: string) {
    super(`SuperNote LLM narrative is not enabled: ${reason}`);
    this.name = 'SuperNoteLlmNotEnabledError';
  }
}

/**
 * True only when the SAME BAA/consent provider config that gates every other
 * cloud-AI path permits an LLM call. Ollama (local) needs no BAA; Anthropic
 * (cloud) requires anthropicBaaSigned. Defaults OFF because aiInsightsEnabled
 * defaults false — so deterministic assembly is always authoritative.
 */
export function isSuperNoteNarrativeEnabled(): boolean {
  if (!config.aiInsightsEnabled) return false;
  if (config.aiProvider === 'anthropic' && !config.anthropicBaaSigned) return false;
  return true;
}

/**
 * Gated stub for an optional narrative. Intentionally calls NO external API.
 * When the provider is not BAA-approved it throws a typed error; when it is
 * approved it returns undefined (no-op) so the deterministic note remains
 * authoritative until a vetted narrative generator is wired in.
 */
export function enrichSuperNoteNarrative(_note: SuperNote): string | undefined {
  if (!isSuperNoteNarrativeEnabled()) {
    throw new SuperNoteLlmNotEnabledError(
      config.aiProvider === 'anthropic'
        ? 'Anthropic provider requires a signed BAA (ANTHROPIC_BAA_SIGNED=true)'
        : 'AI insights are disabled (AI_INSIGHTS_ENABLED=false)',
    );
  }
  // BAA-approved path is intentionally a no-op stub — never call an external API here.
  return undefined;
}

export interface ApEntry {
  icd10_code: string;
  diagnosis_name?: string;
  plan: string;
}

export interface FinalizeResult {
  note_id: string;
  coded: number;
}

/**
 * NO-AUTOSIGN GUARD. Deterministic assembly must never produce a signed/finalized
 * note. Only an explicit clinician finalize action may set a final status. This
 * guard asserts the requested status transition is a legitimate clinician action
 * (an explicit, non-empty status arriving from the finalize route) rather than an
 * implicit auto-sign during assembly. Throws if an assembled-note review state is
 * passed where a finalized status would be silently applied.
 */
export function assertExplicitFinalization(reviewStatus: ReviewStatus): void {
  if (reviewStatus === 'unsigned' || reviewStatus === 'draft' || reviewStatus === 'pending-review') {
    throw new Error(
      `No-autosign violation: cannot finalize a SuperNote from an unsigned/draft state (${reviewStatus}) ` +
        'without an explicit clinician finalize action.',
    );
  }
}

/** Honest provenance written to the clinical_note.ai_generated JSONB column on finalize. */
export function finalizationProvenance(codedCount: number): {
  assembled_by: 'supernote';
  deterministic: true;
  ai_generated: false;
  finalized_by: 'clinician';
  coded_count: number;
  sources: SuperNoteSource[];
} {
  return {
    assembled_by: 'supernote',
    deterministic: true,
    ai_generated: false,
    // Finalization is always an explicit clinician action — never auto-signed by assembly.
    finalized_by: 'clinician',
    coded_count: codedCount,
    sources: [SUPERNOTE_SOURCES.PROBLEM_LIST, SUPERNOTE_SOURCES.MEASURES, SUPERNOTE_SOURCES.ENCOUNTER],
  };
}

export async function finalizeSuperNote(
  patientId: number,
  authorUserId: string,
  chiefComplaint: string | null,
  ap: ApEntry[],
): Promise<FinalizeResult> {
  const noteId = randomUUID();
  const coded = ap.filter((e) => e.icd10_code && e.plan?.trim());
  const assessment = coded.map((e) => `${e.diagnosis_name ?? e.icd10_code} (${e.icd10_code})`).join('; ');
  const planText = coded.map((e) => `${e.icd10_code}: ${e.plan.trim()}`).join('\n');

  // This path IS the explicit clinician finalize action: status 'final' is permitted.
  // Assembly (assembleSuperNote) never reaches here, so a note can never auto-sign.
  await sql`
    INSERT INTO phm_edw.clinical_note
      (note_id, patient_id, author_user_id, visit_type, status, chief_complaint,
       assessment, plan_text, ai_generated, finalized_at)
    VALUES (
      ${noteId}::uuid, ${patientId}, ${authorUserId}::uuid, 'supernote', 'final',
      ${chiefComplaint ?? null}, ${assessment}, ${planText},
      ${sql.json(finalizationProvenance(coded.length))}, NOW()
    )
  `;

  for (const e of coded) {
    const [onto] = await sql<{ ontology_id: number; disease_process: string | null }[]>`
      SELECT ontology_id, disease_process FROM phm_edw.dx_ontology
      WHERE icd10_code = ${e.icd10_code} AND active_ind = 'Y'
      ORDER BY ontology_id LIMIT 1
    `;
    await sql`
      INSERT INTO phm_edw.note_coded_diagnosis
        (note_id, patient_id, icd10_code, diagnosis_name, ontology_id, disease_process, hcc_relevant, source)
      VALUES (
        ${noteId}::uuid, ${patientId}, ${e.icd10_code}, ${e.diagnosis_name ?? null},
        ${onto?.ontology_id ?? null}, ${onto?.disease_process ?? null},
        ${/^(E11|I50|N18|E66)/.test(e.icd10_code)}, 'supernote'
      )
    `;
  }

  return { note_id: noteId, coded: coded.length };
}
