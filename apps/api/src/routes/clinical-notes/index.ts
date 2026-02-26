// =============================================================================
// Medgnosis API — Clinical Notes routes
// CRUD for SOAP encounter notes + AI Scribe endpoint
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import {
  clinicalNoteCreateSchema,
  clinicalNoteUpdateSchema,
  scribeRequestSchema,
} from '@medgnosis/shared';
import { config } from '../../config.js';
import { generateCompletion } from '../../services/llmClient.js';
import { aiGateMiddleware } from '../../middleware/aiGate.js';
import { getPatientClinicalContext } from '../../services/patientContext.js';

export default async function clinicalNoteRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // POST /clinical-notes — Create a new draft note
  fastify.post('/', async (request, reply) => {
    const parseResult = clinicalNoteCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }

    const { patient_id, visit_type, encounter_id, chief_complaint } =
      parseResult.data;
    const userId = (request.user as unknown as { id: string }).id;

    // Verify patient exists
    const [patient] = await sql<{ patient_id: number }[]>`
      SELECT patient_id FROM phm_edw.patient
      WHERE patient_id = ${patient_id} AND active_ind = 'Y'
    `;
    if (!patient) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Patient not found' },
      });
    }

    const [note] = await sql`
      INSERT INTO phm_edw.clinical_note (
        patient_id, author_user_id, encounter_id,
        visit_type, status, chief_complaint
      )
      VALUES (
        ${patient_id}, ${userId}, ${encounter_id ?? null},
        ${visit_type}, 'draft', ${chief_complaint ?? null}
      )
      RETURNING note_id, patient_id, visit_type, status,
                chief_complaint, created_date
    `;

    return reply.status(201).send({ success: true, data: note });
  });

  // GET /clinical-notes/:noteId — Get a single note
  fastify.get<{ Params: { noteId: string } }>(
    '/:noteId',
    async (request, reply) => {
      const { noteId } = request.params;

      const [note] = await sql`
        SELECT cn.*,
               au.first_name || ' ' || au.last_name AS author_name
        FROM phm_edw.clinical_note cn
        JOIN public.app_users au ON au.id = cn.author_user_id
        WHERE cn.note_id = ${noteId}::uuid AND cn.active_ind = 'Y'
      `;

      if (!note) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Note not found' },
        });
      }

      return reply.send({ success: true, data: note });
    },
  );

  // PATCH /clinical-notes/:noteId — Update SOAP sections (auto-save)
  fastify.patch<{ Params: { noteId: string } }>(
    '/:noteId',
    async (request, reply) => {
      const { noteId } = request.params;

      const parseResult = clinicalNoteUpdateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      // Only allow editing drafts
      const [existing] = await sql<{ status: string }[]>`
        SELECT status FROM phm_edw.clinical_note
        WHERE note_id = ${noteId}::uuid AND active_ind = 'Y'
      `;
      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Note not found' },
        });
      }
      if (existing.status !== 'draft') {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'NOTE_FINALIZED',
            message: 'Cannot edit a finalized note. Use amend instead.',
          },
        });
      }

      const data = parseResult.data;
      const updates: string[] = [];
      const values: unknown[] = [];

      if (data.chief_complaint !== undefined) {
        values.push(data.chief_complaint);
        updates.push(`chief_complaint = $${values.length}`);
      }
      if (data.subjective !== undefined) {
        values.push(data.subjective);
        updates.push(`subjective = $${values.length}`);
      }
      if (data.objective !== undefined) {
        values.push(data.objective);
        updates.push(`objective = $${values.length}`);
      }
      if (data.assessment !== undefined) {
        values.push(data.assessment);
        updates.push(`assessment = $${values.length}`);
      }
      if (data.plan_text !== undefined) {
        values.push(data.plan_text);
        updates.push(`plan_text = $${values.length}`);
      }
      if (data.visit_type !== undefined) {
        values.push(data.visit_type);
        updates.push(`visit_type = $${values.length}`);
      }

      if (updates.length === 0) {
        return reply.send({ success: true, data: { updated: false } });
      }

      // Use tagged template for the update
      const [updated] = await sql`
        UPDATE phm_edw.clinical_note
        SET
          chief_complaint = ${data.chief_complaint !== undefined ? data.chief_complaint : sql`chief_complaint`},
          subjective = ${data.subjective !== undefined ? data.subjective : sql`subjective`},
          objective = ${data.objective !== undefined ? data.objective : sql`objective`},
          assessment = ${data.assessment !== undefined ? data.assessment : sql`assessment`},
          plan_text = ${data.plan_text !== undefined ? data.plan_text : sql`plan_text`},
          visit_type = ${data.visit_type !== undefined ? data.visit_type : sql`visit_type`},
          updated_date = NOW()
        WHERE note_id = ${noteId}::uuid AND active_ind = 'Y'
        RETURNING note_id, updated_date
      `;

      return reply.send({ success: true, data: updated });
    },
  );

  // POST /clinical-notes/:noteId/finalize — Lock and sign the note
  fastify.post<{ Params: { noteId: string } }>(
    '/:noteId/finalize',
    async (request, reply) => {
      const { noteId } = request.params;

      const [note] = await sql<{ status: string }[]>`
        SELECT status FROM phm_edw.clinical_note
        WHERE note_id = ${noteId}::uuid AND active_ind = 'Y'
      `;
      if (!note) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Note not found' },
        });
      }
      if (note.status !== 'draft') {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'ALREADY_FINALIZED',
            message: 'Note is already finalized.',
          },
        });
      }

      const [updated] = await sql`
        UPDATE phm_edw.clinical_note
        SET status = 'finalized', finalized_at = NOW(), updated_date = NOW()
        WHERE note_id = ${noteId}::uuid
        RETURNING note_id, status, finalized_at
      `;

      return reply.send({ success: true, data: updated });
    },
  );

  // POST /clinical-notes/:noteId/amend — Amend a finalized note
  fastify.post<{ Params: { noteId: string } }>(
    '/:noteId/amend',
    async (request, reply) => {
      const { noteId } = request.params;
      const body = request.body as { reason?: string };

      if (!body.reason) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Amendment reason is required',
          },
        });
      }

      const [note] = await sql<{ status: string }[]>`
        SELECT status FROM phm_edw.clinical_note
        WHERE note_id = ${noteId}::uuid AND active_ind = 'Y'
      `;
      if (!note) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Note not found' },
        });
      }
      if (note.status !== 'finalized') {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'NOT_FINALIZED',
            message: 'Only finalized notes can be amended.',
          },
        });
      }

      const [updated] = await sql`
        UPDATE phm_edw.clinical_note
        SET status = 'amended',
            amended_at = NOW(),
            amendment_reason = ${body.reason},
            updated_date = NOW()
        WHERE note_id = ${noteId}::uuid
        RETURNING note_id, status, amended_at, amendment_reason
      `;

      return reply.send({ success: true, data: updated });
    },
  );

  // DELETE /clinical-notes/:noteId — Soft-delete (drafts only)
  fastify.delete<{ Params: { noteId: string } }>(
    '/:noteId',
    async (request, reply) => {
      const { noteId } = request.params;

      const [note] = await sql<{ status: string }[]>`
        SELECT status FROM phm_edw.clinical_note
        WHERE note_id = ${noteId}::uuid AND active_ind = 'Y'
      `;
      if (!note) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Note not found' },
        });
      }
      if (note.status !== 'draft') {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'CANNOT_DELETE',
            message: 'Only draft notes can be deleted.',
          },
        });
      }

      await sql`
        UPDATE phm_edw.clinical_note
        SET active_ind = 'N', updated_date = NOW()
        WHERE note_id = ${noteId}::uuid
      `;

      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  // POST /clinical-notes/scribe — AI-powered SOAP section generation
  fastify.post(
    '/scribe',
    { preHandler: [aiGateMiddleware] },
    async (request, reply) => {
      if (!config.aiInsightsEnabled) {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'AI_DISABLED',
            message:
              'AI features are not enabled. Set AI_INSIGHTS_ENABLED=true.',
          },
        });
      }

      const parseResult = scribeRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid scribe request',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      const { patient_id, visit_type, sections, chief_complaint, existing_content } =
        parseResult.data;

      // Gather patient clinical context via shared helper
      const ctx = await getPatientClinicalContext(patient_id);
      const { conditions: conditionList, medications: medList, vitals: vitalList, allergies: allergyList, careGaps: gapList, encounters: encounterList } = ctx;

      // Existing content context
      const existingCtx = existing_content
        ? Object.entries(existing_content)
            .filter(([, v]) => v && v.trim())
            .map(([k, v]) => `Already written ${k}: ${v}`)
            .join('\n')
        : '';

      const sectionNames: Record<string, string> = {
        subjective: 'Subjective',
        objective: 'Objective',
        assessment: 'Assessment',
        plan_text: 'Plan',
      };

      const requestedSections = sections
        .map((s) => sectionNames[s] ?? s)
        .join(', ');

      const prompt = `You are an AI clinical scribe assisting a healthcare provider in documenting a patient encounter.
Generate the following SOAP note section(s): ${requestedSections}

## Patient Clinical Context
- **Visit Type**: ${visit_type}
- **Chief Complaint**: ${chief_complaint ?? 'Not specified'}
- **Active Conditions**: ${conditionList}
- **Current Medications**: ${medList}
- **Recent Vitals**: ${vitalList}
- **Allergies**: ${allergyList}
- **Open Care Gaps**: ${gapList}
- **Recent Encounters**: ${encounterList}
${existingCtx ? `\n## Already Documented\n${existingCtx}` : ''}

## Instructions
Generate ONLY the requested sections as a JSON object with keys: ${sections.map((s) => `"${s}"`).join(', ')}.
Each value should be an HTML string suitable for a rich text editor.
Use clinical language appropriate for a medical record.
Use <p> tags for paragraphs and <ul>/<li> for lists where appropriate.
Be concise but thorough. Include relevant clinical details from the patient context.
IMPORTANT: This is decision SUPPORT only. Mark suggestions that need clinician verification.
Do NOT include any text outside the JSON object.`;

      const result = await generateCompletion(prompt, {
        maxTokens: 2048,
        temperature: 0.3,
        jsonMode: true,
      });

      // Parse the JSON response
      let parsedSections: Record<string, string>;
      try {
        parsedSections = JSON.parse(result.text);
      } catch {
        // If JSON parsing fails, wrap the text in the first requested section
        parsedSections = { [sections[0]]: `<p>${result.text}</p>` };
      }

      return reply.send({
        success: true,
        data: {
          sections: parsedSections,
          model: result.modelId,
          provider: result.provider,
          usage: {
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
          },
        },
      });
    },
  );
}
