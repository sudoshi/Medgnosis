// =============================================================================
// Medgnosis Web — Coding & HCC analytics hooks
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api.js';

export interface ProviderCapture {
  provider_id: number | null;
  provider_name: string | null;
  evident: number;
  coded: number;
  capture_pct: number;
}
export interface EmShift {
  level3: number;
  level4: number;
  level5: number;
  total: number;
  pct_level4plus: number;
}
export interface ProviderEm extends EmShift {
  provider_id: number | null;
  provider_name: string | null;
}
export interface MissedOpportunities {
  lab_evident: { label: string; count: number }[];
  uncoded_hcc: { label: string; count: number }[];
  total_uncoded_hcc: number;
}

export function useHccCapture() {
  return useQuery({
    queryKey: ['coding', 'hcc-capture'],
    queryFn: () => api.get<{ byProvider: ProviderCapture[]; overall: ProviderCapture }>('/coding/hcc-capture'),
    staleTime: 5 * 60_000,
  });
}

export function useEmDistribution() {
  return useQuery({
    queryKey: ['coding', 'em-distribution'],
    queryFn: () => api.get<{ byProvider: ProviderEm[]; overall: EmShift }>('/coding/em-distribution'),
    staleTime: 5 * 60_000,
  });
}

export function useMissedOpportunities() {
  return useQuery({
    queryKey: ['coding', 'missed-opportunities'],
    queryFn: () => api.get<MissedOpportunities>('/coding/missed-opportunities'),
    staleTime: 5 * 60_000,
  });
}

const FINDING_LABEL: Record<string, string> = {
  obesity_unlabeled: 'Unlabeled obesity',
  ckd_restage: 'Generic CKD to re-stage',
  ckd_unlabeled: 'Unlabeled CKD',
};
export function findingLabel(key: string): string {
  return FINDING_LABEL[key] ?? key;
}
