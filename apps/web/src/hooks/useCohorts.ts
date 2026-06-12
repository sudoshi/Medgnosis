// =============================================================================
// Medgnosis Web — Cohort Manager hooks
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';

export interface CohortDefinition {
  cohort_id: number;
  name: string;
  description: string | null;
  criteria: { conditions?: string[]; flags?: string[] };
  created_by: string | null;
}

export interface CohortMember {
  patient_id: number;
  patient_name: string;
  conditions: string[];
  flags: string[];
}

export interface CohortMessage {
  message_id: number;
  patient_id: number;
  patient_name: string;
  from_user: string;
  subject: string;
  required_disposition: string | null;
  status: string;
  disposition: string | null;
  created_date: string;
}

export function useCohorts() {
  return useQuery({
    queryKey: ['cohorts'],
    queryFn: () => api.get<CohortDefinition[]>('/cohorts'),
    staleTime: 60_000,
  });
}

export function useCohortMembers(cohortId: number | null) {
  return useQuery({
    queryKey: ['cohorts', cohortId, 'patients'],
    queryFn: () => api.get<CohortMember[]>(`/cohorts/${cohortId}/patients`),
    enabled: cohortId != null,
  });
}

export function useCohortMessages(status?: string) {
  return useQuery({
    queryKey: ['cohorts', 'messages', status ?? 'all'],
    queryFn: () => api.get<CohortMessage[]>(`/cohorts/messages${status ? `?status=${status}` : ''}`),
    staleTime: 60_000,
  });
}

export function useCohortActions() {
  const queryClient = useQueryClient();
  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['cohorts'] });
  return {
    sendMessage: useMutation({
      mutationFn: (body: { patient_id: number; subject: string; required_disposition?: string; body?: string }) =>
        api.post('/cohorts/message', body),
      onSuccess: invalidate,
    }),
    resolveMessage: useMutation({
      mutationFn: ({ id, disposition }: { id: number; disposition: string }) =>
        api.post(`/cohorts/message/${id}/resolve`, { disposition }),
      onSuccess: invalidate,
    }),
  };
}
