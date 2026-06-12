// =============================================================================
// Medgnosis Web — Real-time surveillance hooks (MEWS/NEWS2 + Glucometrics)
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';

export interface CensusRow {
  admission_id: number;
  patient_id: number;
  patient_name: string;
  unit: string;
  bed: string;
  admitting_dx: string | null;
  score: number | null;
  band: string | null;
  action: string | null;
  components: Record<string, number> | null;
  computed_datetime: string | null;
}

export function useSurveillanceCensus(scoreType: 'MEWS' | 'NEWS2') {
  return useQuery({
    queryKey: ['surveillance', 'census', scoreType],
    queryFn: () => api.get<{ score_type: string; census: CensusRow[] }>(`/surveillance/census?score=${scoreType}`),
    refetchInterval: 30_000, // live feel; the streamer ticks every 5 min
  });
}

export interface VitalRow {
  recorded_datetime: string;
  temp_c: string | null;
  heart_rate: number | null;
  systolic_bp: number | null;
  resp_rate: number | null;
  spo2: number | null;
  on_oxygen: boolean;
  consciousness: string;
  gcs: number;
}
export interface ScoreRow {
  score_type: string;
  score: number;
  band: string;
  action: string | null;
  components: Record<string, number>;
  computed_datetime: string;
}

export function useSurveillanceDetail(admissionId: number | null) {
  return useQuery({
    queryKey: ['surveillance', 'detail', admissionId],
    queryFn: () => api.get<{ admission: Record<string, unknown>; vitals: VitalRow[]; scores: ScoreRow[] }>(`/surveillance/${admissionId}`),
    enabled: admissionId != null,
  });
}

export function useTick() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/surveillance/tick'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['surveillance'] });
      void queryClient.invalidateQueries({ queryKey: ['glucometrics'] });
    },
  });
}

// ─── Glucometrics ──────────────────────────────────────────────────────────────

export interface GlucoCensusRow {
  admission_id: number;
  patient_id: number;
  patient_name: string;
  unit: string;
  bed: string;
  avg_24h: number | null;
  max_24h: number | null;
  high_risk: boolean;
  reasons: string[];
}

export function useGlucoCensus() {
  return useQuery({
    queryKey: ['glucometrics', 'census'],
    queryFn: () => api.get<{ census: GlucoCensusRow[]; high_risk: number; total: number }>('/glucometrics/census'),
    refetchInterval: 30_000,
  });
}

export interface GlucoDetail {
  admission: Record<string, unknown>;
  glucose: { reading_datetime: string; glucose_mgdl: number; source: string }[];
  insulin: { admin_datetime: string; dose_units: number; product: string }[];
  context: { has_diabetes: boolean; on_insulin: boolean };
}

export function useGlucoDetail(admissionId: number | null) {
  return useQuery({
    queryKey: ['glucometrics', 'detail', admissionId],
    queryFn: () => api.get<GlucoDetail>(`/glucometrics/${admissionId}`),
    enabled: admissionId != null,
  });
}
