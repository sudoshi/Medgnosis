// =============================================================================
// Medgnosis Web — Data Quality hooks
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';

export interface DqFinding {
  finding_id: number;
  detector: string;
  entity_table: string;
  entity_id: number | null;
  patient_id: number | null;
  patient_name: string | null;
  field: string | null;
  observed: string | null;
  severity: string;
  status: string;
  is_regression: boolean;
  created_date: string;
}

export interface DqFeed {
  feed_name: string;
  source: string | null;
  accurate: boolean | null;
  timely: boolean | null;
  complete: boolean | null;
  understood: boolean | null;
  trusted: boolean | null;
  latency: string | null;
  last_refreshed: string | null;
  notes: string | null;
}

export function useDqFindings(status = 'open') {
  return useQuery({
    queryKey: ['data-quality', 'findings', status],
    queryFn: () => api.get<DqFinding[]>(`/data-quality/findings?status=${status}`),
    staleTime: 60_000,
  });
}

export function useDqFeeds() {
  return useQuery({
    queryKey: ['data-quality', 'feeds'],
    queryFn: () => api.get<DqFeed[]>('/data-quality/feeds'),
    staleTime: 5 * 60_000,
  });
}

export function useDqActions() {
  const queryClient = useQueryClient();
  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['data-quality'] });
  return {
    confirm: useMutation({ mutationFn: (id: number) => api.post(`/data-quality/findings/${id}/confirm`), onSuccess: invalidate }),
    dismiss: useMutation({ mutationFn: (id: number) => api.post(`/data-quality/findings/${id}/dismiss`), onSuccess: invalidate }),
  };
}
