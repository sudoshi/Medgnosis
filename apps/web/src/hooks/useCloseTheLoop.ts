// =============================================================================
// Medgnosis Web — Close the Loop + risk-model hooks (TanStack Query)
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';

export interface OpenLoop {
  loop_id: number;
  result_id: number;
  patient_id: number;
  patient_name: string;
  obligation: string;
  severity: 'critical' | 'high' | 'routine';
  due_date: string;
  days_overdue: number;
  abnormal_flag: string | null;
  result_value: string | null;
  critical_flag: boolean;
  order_name: string | null;
  loop_status: string;
}

export interface LoopStats {
  by_status: { loop_status: string; n: number }[];
  by_closure: { closure_type: string; n: number }[];
}

export type ClosureType = 'appropriate_care' | 'refused' | 'unable_to_reach' | 'reviewed';

export function useOpenLoops(status = 'open') {
  return useQuery({
    queryKey: ['close-the-loop', status],
    queryFn: () => api.get<OpenLoop[]>(`/close-the-loop?status=${status}&per_page=100`),
    staleTime: 60_000,
  });
}

export function useLoopStats() {
  return useQuery({
    queryKey: ['close-the-loop', 'stats'],
    queryFn: () => api.get<LoopStats>('/close-the-loop/stats'),
    staleTime: 60_000,
  });
}

export function useResolveLoop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, closure_type, note }: { id: number; closure_type: ClosureType; note?: string }) =>
      api.post(`/close-the-loop/${id}/resolve`, { closure_type, note }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['close-the-loop'] });
    },
  });
}

export interface RiskScore {
  patient_id: number;
  patient_name: string;
  model_code: string;
  score_numeric: number | null;
  risk_category: string;
  components: Record<string, unknown>;
  care_gap: boolean;
}

export function useRiskScores(code: string, careGapOnly = false) {
  return useQuery({
    queryKey: ['risk-models', code, careGapOnly],
    queryFn: () => api.get<RiskScore[]>(`/risk-models/${code}/scores${careGapOnly ? '?care_gap=true' : ''}`),
    staleTime: 60_000,
  });
}
