// =============================================================================
// Medgnosis Web — TanStack React Query hooks for all API endpoints
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import type { DashboardAnalytics } from '@medgnosis/shared';

// ---- Dashboard ----

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardAnalytics>('/dashboard'),
  });
}

// ---- Patients ----

interface PatientsParams {
  page?: number;
  limit?: number;
  search?: string;
  risk_band?: string;
}

export function usePatients(params: PatientsParams = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.risk_band) qs.set('risk_band', params.risk_band);

  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => api.get(`/patients?${qs}`),
  });
}

export function usePatient(id: string | undefined) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get(`/patients/${id}`),
    enabled: !!id,
  });
}

// ---- Measures ----

export function useMeasures(params: { domain?: string; search?: string } = {}) {
  const qs = new URLSearchParams({ limit: '100' });
  if (params.domain) qs.set('domain', params.domain);
  if (params.search) qs.set('search', params.search);

  return useQuery({
    queryKey: ['measures', params],
    queryFn: () => api.get(`/measures?${qs}`),
  });
}

export function useMeasure(id: string | undefined) {
  return useQuery({
    queryKey: ['measure', id],
    queryFn: () => api.get(`/measures/${id}`),
    enabled: !!id,
  });
}

// ---- Care Gaps ----

export function useCareGaps(params: { status?: string; patient_id?: string } = {}) {
  const qs = new URLSearchParams({ limit: '50' });
  if (params.status) qs.set('status', params.status);
  if (params.patient_id) qs.set('patient_id', params.patient_id);

  return useQuery({
    queryKey: ['care-gaps', params],
    queryFn: () => api.get(`/care-gaps?${qs}`),
  });
}

export function useUpdateCareGap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/care-gaps/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['care-gaps'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---- Alerts ----

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get('/alerts'),
    refetchInterval: 30_000,
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: number) => api.post(`/alerts/${alertId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

// ---- Search ----

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.get(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });
}

// ---- AI Insights ----

export function useAiChat() {
  return useMutation({
    mutationFn: ({
      message,
      patient_id,
    }: {
      message: string;
      patient_id?: number;
    }) =>
      api.post('/insights/chat', {
        message,
        patient_id,
        provider: 'ollama',
      }),
  });
}
