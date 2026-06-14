// =============================================================================
// Medgnosis API — FHIR R4 routes
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { config } from '../../config.js';
import {
  mapPatientToFHIR,
  mapConditionToFHIR,
  mapObservationToFHIR,
  mapMedicationToFHIR,
  buildBundle,
} from '../../services/fhir/mappers.js';
import { expandValueSet, validateCode } from '../../services/fhir/terminology.js';
import { buildCapabilityStatement } from '../../services/fhir/capabilityStatement.js';

export default async function fhirRoutes(app: FastifyInstance) {
  // FHIR capability statement (conventionally unauthenticated)
  app.get('/metadata', async () => buildCapabilityStatement(config.fhirBaseUrl));

  // ValueSet/$expand?url=<canonical-or-oid>[&measurementPeriod=YYYY]
  app.get('/ValueSet/$expand', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { url, measurementPeriod } = req.query as {
      url?: string;
      measurementPeriod?: string;
    };
    if (!url) {
      return reply.status(400).send({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'required', diagnostics: 'url parameter required' }],
      });
    }
    const vs = await expandValueSet(url, { measurementPeriod });
    if (!vs) {
      return reply.status(404).send({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'not-found', diagnostics: `Unknown value set ${url}` }],
      });
    }
    return vs;
  });

  // ValueSet/$validate-code?url=...&system=...&code=...
  app.get(
    '/ValueSet/$validate-code',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { url, system, code } = req.query as {
        url?: string;
        system?: string;
        code?: string;
      };
      if (!url || !system || !code) {
        return reply.status(400).send({
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'required', diagnostics: 'url, system, code required' }],
        });
      }
      return validateCode(url, system, code);
    },
  );

  // FHIR Patient endpoint
  app.get('/Patient', { preHandler: [app.authenticate] }, async (_req) => {
    const patients = await sql`
      SELECT patient_id, first_name, last_name, date_of_birth, gender, race, ethnicity, mrn
      FROM phm_edw.patient
      LIMIT 100
    `;
    const resources = patients.map(mapPatientToFHIR);
    return buildBundle(resources, 'searchset', config.fhirBaseUrl);
  });

  app.get('/Patient/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [patient] = await sql`
      SELECT patient_id, first_name, last_name, date_of_birth, gender, race, ethnicity, mrn
      FROM phm_edw.patient
      WHERE patient_id = ${id}
    `;
    if (!patient) return reply.status(404).send({ error: 'Patient not found' });
    return mapPatientToFHIR(patient);
  });

  // FHIR Condition endpoint
  app.get('/Condition', { preHandler: [app.authenticate] }, async (req) => {
    const { patient } = req.query as { patient?: string };
    const conditions = patient
      ? await sql`
          SELECT cd.condition_diagnosis_id, c.condition_name, c.condition_code,
                 cd.onset_date, cd.diagnosis_status, cd.patient_id
          FROM phm_edw.condition_diagnosis cd
          JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
          WHERE cd.patient_id = ${patient}
        `
      : await sql`
          SELECT cd.condition_diagnosis_id, c.condition_name, c.condition_code,
                 cd.onset_date, cd.diagnosis_status, cd.patient_id
          FROM phm_edw.condition_diagnosis cd
          JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
          LIMIT 100
        `;
    const resources = conditions.map((c) =>
      mapConditionToFHIR(c, String(c.patient_id)),
    );
    return buildBundle(resources, 'searchset', config.fhirBaseUrl);
  });

  // FHIR Observation endpoint
  app.get('/Observation', { preHandler: [app.authenticate] }, async (req) => {
    const { patient } = req.query as { patient?: string };
    const obs = patient
      ? await sql`
          SELECT o.observation_id, o.observation_desc, o.observation_code,
                 o.value_numeric, o.value_text, o.units, o.observation_datetime, o.patient_id
          FROM phm_edw.observation o
          WHERE o.patient_id = ${patient}
          ORDER BY o.observation_datetime DESC LIMIT 50
        `
      : await sql`
          SELECT o.observation_id, o.observation_desc, o.observation_code,
                 o.value_numeric, o.value_text, o.units, o.observation_datetime, o.patient_id
          FROM phm_edw.observation o
          ORDER BY o.observation_datetime DESC LIMIT 100
        `;
    const resources = obs.map((o) =>
      mapObservationToFHIR(o, String(o.patient_id)),
    );
    return buildBundle(resources, 'searchset', config.fhirBaseUrl);
  });

  // FHIR MedicationRequest endpoint
  app.get('/MedicationRequest', { preHandler: [app.authenticate] }, async (req) => {
    const { patient } = req.query as { patient?: string };
    const meds = patient
      ? await sql`
          SELECT mo.medication_order_id, m.medication_name, m.medication_code,
                 mo.start_datetime, mo.prescription_status, mo.patient_id
          FROM phm_edw.medication_order mo
          JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
          WHERE mo.patient_id = ${patient}
        `
      : await sql`
          SELECT mo.medication_order_id, m.medication_name, m.medication_code,
                 mo.start_datetime, mo.prescription_status, mo.patient_id
          FROM phm_edw.medication_order mo
          JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
          LIMIT 100
        `;
    const resources = meds.map((m) =>
      mapMedicationToFHIR(m, String(m.patient_id)),
    );
    return buildBundle(resources, 'searchset', config.fhirBaseUrl);
  });

  // Patient $everything operation
  app.get(
    '/Patient/:id/$everything',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      const [patient] = await sql`
        SELECT patient_id, first_name, last_name, date_of_birth, gender, race, ethnicity, mrn
        FROM phm_edw.patient WHERE patient_id = ${id}
      `;
      if (!patient) return reply.status(404).send({ error: 'Patient not found' });

      const [conditions, observations, medications] = await Promise.all([
        sql`
          SELECT cd.condition_diagnosis_id, c.condition_name, c.condition_code,
                 cd.onset_date, cd.diagnosis_status, cd.patient_id
          FROM phm_edw.condition_diagnosis cd
          JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
          WHERE cd.patient_id = ${id}
        `,
        sql`
          SELECT o.observation_id, o.observation_desc, o.observation_code,
                 o.value_numeric, o.value_text, o.units, o.observation_datetime, o.patient_id
          FROM phm_edw.observation o
          WHERE o.patient_id = ${id}
          ORDER BY o.observation_datetime DESC LIMIT 50
        `,
        sql`
          SELECT mo.medication_order_id, m.medication_name, m.medication_code,
                 mo.start_datetime, mo.prescription_status, mo.patient_id
          FROM phm_edw.medication_order mo
          JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
          WHERE mo.patient_id = ${id}
        `,
      ]);

      const resources = [
        mapPatientToFHIR(patient),
        ...conditions.map((c) => mapConditionToFHIR(c, id)),
        ...observations.map((o) => mapObservationToFHIR(o, id)),
        ...medications.map((m) => mapMedicationToFHIR(m, id)),
      ];

      return buildBundle(resources, 'collection', config.fhirBaseUrl);
    },
  );
}
