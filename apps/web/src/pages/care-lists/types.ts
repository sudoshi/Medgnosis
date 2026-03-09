// =============================================================================
// Care Lists — Shared types
// =============================================================================

export interface OrderItem {
  item_id: number;
  item_name: string;
  item_type: string;
  loinc_code: string | null;
  loinc_description: string | null;
  cpt_code: string | null;
  cpt_description: string | null;
  frequency: string | null;
  guideline_source: string | null;
}

export interface WorklistMeasure {
  measure_code: string;
  measure_name: string;
  care_gap_id: number;
  gap_status: string;
  gap_priority: string | null;
  due_date: string | null;
  orders: OrderItem[];
}

export interface WorklistBundle {
  bundle_code: string;
  condition_name: string;
  measures: WorklistMeasure[];
}

export interface WorklistPatient {
  patient_id: number;
  patient_name: string;
  mrn: string;
  total_open_gaps: number;
  actionable_orders: number;
  bundles: WorklistBundle[];
}
