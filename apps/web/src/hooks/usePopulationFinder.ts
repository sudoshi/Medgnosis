// =============================================================================
// Medgnosis Web — Population Finder hooks (TanStack Query)
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';

export interface FinderCandidate {
  candidate_id: number;
  patient_id: number;
  patient_name: string;
  pass: number;
  finding_type: string;
  current_icd10: string | null;
  suggested_icd10: string;
  suggested_name: string;
  evidence: { egfr?: number; bmi?: number; observed_at?: string | null };
  confidence: string;
  status: string;
  created_date: string;
}

export function usePopulationFinder(status = 'pending') {
  return useQuery({
    queryKey: ['population-finder', status],
    queryFn: () => api.get<FinderCandidate[]>(`/population-finder?status=${status}&per_page=100`),
    staleTime: 60_000,
  });
}

type DismissReason = 'does_not_have' | 'snooze';

export function useFinderActions() {
  const queryClient = useQueryClient();
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['population-finder'] });
  };

  const accept = useMutation({
    mutationFn: (id: number) => api.post(`/population-finder/${id}/accept`),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: (id: number) => api.post(`/population-finder/${id}/reject`),
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: DismissReason }) =>
      api.post(`/population-finder/${id}/dismiss`, { reason }),
    onSuccess: invalidate,
  });

  return { accept, reject, dismiss };
}
