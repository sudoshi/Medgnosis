// =============================================================================
// Medgnosis API — FHIR R4 routes
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import {
  mapPatientToFHIR,
  mapConditionToFHIR,
  mapObservationToFHIR,
  mapMedicationToFHIR,
  buildBundle,
} from '../../services/fhir/mappers.js';

export default async function fhirRoutes(app: FastifyInstance) {
  // FHIR Patient endpoint
  app.get('/Patient', { preHandler: [app.authenticate] }, async (req) => {
    const patients = await sql`
      SELECT patient_id, first_name, last_name, date_of_birth, gender, mrn
      FROM phm_edw.patient
      LIMIT 100
    `;
    const resources = patients.map(mapPatientToFHIR);
    return buildBundle(resources);
  });

  app.get('/Patient/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [patient] = await sql`
      SELECT patient_id, first_name, last_name, date_of_birth, gender, mrn
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
          SELECT c.condition_id, c.condition_name, c.condition_code, c.onset_date, c.status, c.patient_id
          FROM phm_edw.condition c
          WHERE c.patient_id = ${patient}
        `
      : await sql`
          SELECT c.condition_id, c.condition_name, c.condition_code, c.onset_date, c.status, c.patient_id
          FROM phm_edw.condition c LIMIT 100
        `;
    const resources = conditions.map((c) =>
      mapConditionToFHIR(c, String(c.patient_id)),
    );
    return buildBundle(resources);
  });

  // FHIR Observation endpoint
  app.get('/Observation', { preHandler: [app.authenticate] }, async (req) => {
    const { patient } = req.query as { patient?: string };
    const obs = patient
      ? await sql`
          SELECT o.observation_id, o.observation_type, o.observation_code,
                 o.value_numeric, o.value_text, o.unit, o.observation_date, o.patient_id
          FROM phm_edw.observation o
          WHERE o.patient_id = ${patient}
          ORDER BY o.observation_date DESC LIMIT 50
        `
      : await sql`
          SELECT o.observation_id, o.observation_type, o.observation_code,
                 o.value_numeric, o.value_text, o.unit, o.observation_date, o.patient_id
          FROM phm_edw.observation o
          ORDER BY o.observation_date DESC LIMIT 100
        `;
    const resources = obs.map((o) =>
      mapObservationToFHIR(o, String(o.patient_id)),
    );
    return buildBundle(resources);
  });

  // FHIR MedicationRequest endpoint
  app.get('/MedicationRequest', { preHandler: [app.authenticate] }, async (req) => {
    const { patient } = req.query as { patient?: string };
    const meds = patient
      ? await sql`
          SELECT m.medication_id, m.medication_name, m.medication_code,
                 m.start_date, m.status, m.patient_id
          FROM phm_edw.medication m
          WHERE m.patient_id = ${patient}
        `
      : await sql`
          SELECT m.medication_id, m.medication_name, m.medication_code,
                 m.start_date, m.status, m.patient_id
          FROM phm_edw.medication m LIMIT 100
        `;
    const resources = meds.map((m) =>
      mapMedicationToFHIR(m, String(m.patient_id)),
    );
    return buildBundle(resources);
  });

  // Patient $everything operation
  app.get(
    '/Patient/:id/$everything',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      const [patient] = await sql`
        SELECT patient_id, first_name, last_name, date_of_birth, gender, mrn
        FROM phm_edw.patient WHERE patient_id = ${id}
      `;
      if (!patient) return reply.status(404).send({ error: 'Patient not found' });

      const [conditions, observations, medications] = await Promise.all([
        sql`SELECT * FROM phm_edw.condition WHERE patient_id = ${id}`,
        sql`SELECT * FROM phm_edw.observation WHERE patient_id = ${id} ORDER BY observation_date DESC LIMIT 50`,
        sql`SELECT * FROM phm_edw.medication WHERE patient_id = ${id}`,
      ]);

      const resources = [
        mapPatientToFHIR(patient),
        ...conditions.map((c) => mapConditionToFHIR(c, id)),
        ...observations.map((o) => mapObservationToFHIR(o, id)),
        ...medications.map((m) => mapMedicationToFHIR(m, id)),
      ];

      return buildBundle(resources, 'collection');
    },
  );
}
