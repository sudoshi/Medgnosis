// =============================================================================
// Medgnosis Web — Anticipatory care hooks (AMP / Auto-Orders / MTM)
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';

// ─── AMP ─────────────────────────────────────────────────────────────────────

export interface AmpOutreach {
  outreach_id: number;
  patient_id: number;
  patient_name: string;
  care_gap_id: number | null;
  amp_tier: number;
  disposition: string;
  net_revenue: number | null;
  measure_name: string | null;
  appointment_date: string | null;
}

export interface AmpRoiRow {
  amp_tier: number;
  pending_gaps: number;
  opportunity: number;
}

export type AmpDisposition = 'labs_completed' | 'procedure' | 'reminder' | 'declined' | 'education' | 'referral';

export function useAmpWorklist(tier: number) {
  return useQuery({
    queryKey: ['amp', tier],
    queryFn: () => api.get<AmpOutreach[]>(`/amp?tier=${tier}&per_page=50`),
    staleTime: 60_000,
  });
}

export function useAmpRoi() {
  return useQuery({
    queryKey: ['amp', 'roi'],
    queryFn: () => api.get<AmpRoiRow[]>('/amp/roi'),
    staleTime: 60_000,
  });
}

export function useAmpDisposition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, disposition, note }: { id: number; disposition: AmpDisposition; note?: string }) =>
      api.post(`/amp/${id}/disposition`, { disposition, note }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['amp'] }),
  });
}

// ─── Auto-Orders ──────────────────────────────────────────────────────────────

export interface Enrollment {
  enrollment_id: number;
  patient_id: number;
  patient_name: string;
  protocol_name: string;
  status: string;
  expires_at: string | null;
}

export function useEnrollments(status = 'pending') {
  return useQuery({
    queryKey: ['auto-orders', status],
    queryFn: () => api.get<Enrollment[]>(`/auto-orders/enrollments?status=${status}`),
    staleTime: 60_000,
  });
}

export function useEnrollmentActions() {
  const queryClient = useQueryClient();
  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ['auto-orders'] });
  return {
    cosign: useMutation({ mutationFn: (id: number) => api.post(`/auto-orders/enrollments/${id}/cosign`), onSuccess: invalidate }),
    disenroll: useMutation({ mutationFn: (id: number) => api.post(`/auto-orders/enrollments/${id}/disenroll`), onSuccess: invalidate }),
  };
}

// ─── MTM ──────────────────────────────────────────────────────────────────────

export interface MtmReferral {
  mtm_id: number;
  patient_id: number;
  patient_name: string;
  condition: string;
  trigger_value: number;
  trigger_code: string;
  mtm_status: string;
}

export function useMtmReferrals(status?: string) {
  return useQuery({
    queryKey: ['mtm', status ?? 'all'],
    queryFn: () => api.get<MtmReferral[]>(`/mtm${status ? `?status=${status}` : ''}`),
    staleTime: 60_000,
  });
}

export function useMtmAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, at_goal }: { id: number; at_goal: boolean }) =>
      api.post(`/mtm/${id}/advance`, { at_goal }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mtm'] }),
  });
}
