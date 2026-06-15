import type { FastifyReply, FastifyRequest } from 'fastify';
import { sql } from '@medgnosis/db';

export interface ActorScope {
  providerId: number | undefined;
  scoped: boolean;
}

type ResponseFormat = 'envelope' | 'fhir';

type PatientAccess =
  | { allowed: true }
  | { allowed: false; statusCode: 403 | 404 };

interface PatientScopeRow {
  pcp_provider_id: number | null;
}

export function getActorScope(request: FastifyRequest): ActorScope {
  const providerId = request.user.provider_id;
  return {
    providerId,
    scoped: providerId !== undefined,
  };
}

async function getPatientAccess(patientId: string | number, scope: ActorScope): Promise<PatientAccess> {
  const [patient] = await sql<PatientScopeRow[]>`
    SELECT pcp_provider_id
    FROM phm_edw.patient
    WHERE patient_id = ${patientId}::int
      AND active_ind = 'Y'
  `;

  if (!patient) {
    return { allowed: false, statusCode: 404 };
  }

  if (scope.scoped && patient.pcp_provider_id !== scope.providerId) {
    return { allowed: false, statusCode: 403 };
  }

  return { allowed: true };
}

function forbiddenBody(format: ResponseFormat): unknown {
  if (format === 'fhir') {
    return {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'forbidden',
          diagnostics: 'Patient is outside the authenticated user scope',
        },
      ],
    };
  }

  return {
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Patient is outside the authenticated user scope',
    },
  };
}

function notFoundBody(format: ResponseFormat): unknown {
  if (format === 'fhir') {
    return {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'not-found',
          diagnostics: 'Patient not found',
        },
      ],
    };
  }

  return {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Patient not found',
    },
  };
}

export async function requirePatientAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  patientId: string | number,
  format: ResponseFormat = 'envelope',
): Promise<boolean> {
  const access = await getPatientAccess(patientId, getActorScope(request));

  if (access.allowed) {
    return true;
  }

  if (access.statusCode === 404) {
    await reply.status(404).send(notFoundBody(format));
    return false;
  }

  await reply.status(403).send(forbiddenBody(format));
  return false;
}
