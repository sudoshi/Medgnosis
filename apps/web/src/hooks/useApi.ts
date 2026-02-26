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

// ---- Patient Sub-Resources (Phase 10: Clinical Workspace) ----

export function usePatientMedications(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient', patientId, 'medications'],
    queryFn: () => api.get(`/patients/${patientId}/medications`),
    enabled: !!patientId,
  });
}

export function usePatientAllergies(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient', patientId, 'allergies'],
    queryFn: () => api.get(`/patients/${patientId}/allergies`),
    enabled: !!patientId,
  });
}

export function usePatientObservations(
  patientId: string | undefined,
  params: { category?: string; limit?: number; offset?: number } = {},
) {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));

  return useQuery({
    queryKey: ['patient', patientId, 'observations', params],
    queryFn: () => api.get(`/patients/${patientId}/observations?${qs}`),
    enabled: !!patientId,
  });
}

export function useObservationTrending(patientId: string | undefined, code: string | null) {
  return useQuery({
    queryKey: ['patient', patientId, 'observations', 'trending', code],
    queryFn: () => api.get(`/patients/${patientId}/observations/trending?code=${encodeURIComponent(code!)}`),
    enabled: !!patientId && !!code,
  });
}

export function usePatientEncounters(
  patientId: string | undefined,
  params: { limit?: number; page?: number } = {},
) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.page) qs.set('page', String(params.page));

  return useQuery({
    queryKey: ['patient', patientId, 'encounters', params],
    queryFn: () => api.get<Record<string, unknown>[]>(`/patients/${patientId}/encounters?${qs}`),
    enabled: !!patientId,
  });
}

export function usePatientFlowsheet(patientId: string | undefined, category?: string) {
  const qs = new URLSearchParams();
  if (category) qs.set('category', category);

  return useQuery({
    queryKey: ['patient', patientId, 'flowsheet', category],
    queryFn: () => api.get(`/patients/${patientId}/flowsheet?${qs}`),
    enabled: !!patientId,
  });
}

// ---- Care Gap Bundles (Phase 10.6) ----

export function usePatientCareBundle(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient', patientId, 'care-bundle'],
    queryFn: () => api.get(`/patients/${patientId}/care-bundle`),
    enabled: !!patientId,
  });
}

export function useConditionBundles() {
  return useQuery({
    queryKey: ['bundles'],
    queryFn: () => api.get('/bundles'),
  });
}

export function useConditionBundle(bundleCode: string | undefined) {
  return useQuery({
    queryKey: ['bundles', bundleCode],
    queryFn: () => api.get(`/bundles/${bundleCode}`),
    enabled: !!bundleCode,
  });
}

// ---- Clinical Notes (Phase 10.3: Encounter Note + AI Scribe) ----

export function usePatientNotes(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient', patientId, 'notes'],
    queryFn: () => api.get(`/patients/${patientId}/notes`),
    enabled: !!patientId,
  });
}

export function useCreateClinicalNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { patient_id: number; visit_type?: string; encounter_id?: number; chief_complaint?: string }) =>
      api.post('/clinical-notes', data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['patient', String(variables.patient_id), 'notes'] });
    },
  });
}

export function useUpdateClinicalNote() {
  return useMutation({
    mutationFn: ({ noteId, data }: { noteId: string; data: Record<string, unknown> }) =>
      api.patch(`/clinical-notes/${noteId}`, data),
  });
}

export function useFinalizeClinicalNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => api.post(`/clinical-notes/${noteId}/finalize`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinical-note'] });
    },
  });
}

export function useAiScribe() {
  return useMutation({
    mutationFn: (data: {
      patient_id: number;
      visit_type: string;
      sections: string[];
      chief_complaint?: string;
      existing_content?: Record<string, string>;
    }) => api.post('/clinical-notes/scribe', data),
  });
}

// ---- AI Insights ----

export function useAiChat() {
  return useMutation({
    mutationFn: ({
      message,
      patient_id,
      history,
    }: {
      message: string;
      patient_id?: number;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }) =>
      api.post('/insights/chat', {
        message,
        patient_id,
        history,
      }),
  });
}
