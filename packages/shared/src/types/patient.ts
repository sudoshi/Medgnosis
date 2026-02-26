// =============================================================================
// Medgnosis — Patient Domain Types
// Ported from frontend/types/patient.ts with unified naming conventions
// =============================================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskBand = 'low' | 'moderate' | 'high' | 'critical';
export type RiskTrend = 'up' | 'down' | 'stable';
export type CareGapStatus = 'open' | 'closed' | 'in_progress';
export type CareGapType = 'lab' | 'imaging' | 'procedure' | 'referral' | 'immunization';
export type ConditionStatus = 'active' | 'resolved' | 'inactive';
export type ControlStatus = 'controlled' | 'uncontrolled' | 'unknown';
export type LabStatus = 'normal' | 'abnormal' | 'critical';
export type Priority = 'low' | 'medium' | 'high';

export interface Patient {
  id: string;
  name: {
    first: string;
    last: string;
  };
  mrn: string;
  date_of_birth: string;
  gender: string;
  risk_factors: {
    level: RiskLevel;
    score: number;
    factors: RiskFactor[];
    trending?: RiskTrend;
  };
  care_gaps: CareGap[];
  conditions: Condition[];
  encounters: Encounter[];
}

export interface RiskFactor {
  name: string;
  severity: Priority;
  last_assessed: string;
}

export interface CareGap {
  id: string;
  measure: string;
  due_date: string;
  status: CareGapStatus;
  priority: Priority;
  description: string;
  type?: CareGapType;
  order_type?: string;
  order_code?: string;
}

export interface Condition {
  id: string;
  code: string;
  name: string;
  status: ConditionStatus;
  onset_date: string;
  diagnosed_date: string;
  last_assessed: string;
  control_status: ControlStatus;
}

export interface Encounter {
  id: string;
  date: string;
  type: string;
  provider: string;
  summary: string;
  follow_up_needed: boolean;
  follow_up_date?: string;
  reason?: string;
  details?: {
    vitals?: VitalSigns;
  };
}

export interface VitalSigns {
  temperature: string;
  heart_rate: string;
  respiratory_rate: string;
  blood_pressure: string;
  weight: string;
  bmi: string;
}

export interface PatientDetails extends Patient {
  demographics: {
    age: number;
    gender: string;
    ethnicity: string;
    language: string;
    marital_status: string;
    employment: string;
    phone?: string;
    email?: string;
    address?: Address;
  };
  address: Address;
  contact: {
    phone: string;
    email: string;
  };
  insurance: {
    provider: string;
    plan: string;
    member_id: string;
  };
  primary_care: {
    provider: string;
    clinic: string;
    last_visit: string;
  };
  care_team: CareTeamMember[];
  alerts: ClinicalAlert[];
  recent_actions: PatientAction[];
  labs: LabResult[];
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface CareTeamMember {
  id: string;
  name: string;
  role: string;
  specialty?: string;
  primary: boolean;
  phone?: string;
  email?: string;
  details?: {
    npi: string;
    practice: string;
    languages: string[];
    expertise: string[];
  };
}

export interface ClinicalAlert {
  id: string;
  type: 'warning' | 'info' | 'critical';
  message: string;
  date: string;
  status: 'active' | 'resolved';
  category: string;
}

export interface PatientAction {
  id: string;
  type: string;
  description: string;
  date: string;
  provider: string;
  status: 'pending' | 'completed' | 'cancelled';
  priority: Priority;
}

export interface LabResult {
  id: string;
  name: string;
  value: number;
  unit: string;
  date: string;
  status: LabStatus;
  trend?: RiskTrend;
  reference_range?: string;
  components?: LabComponent[];
}

export interface LabComponent {
  name: string;
  value: number;
  unit: string;
  reference_range: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Phase 10: Clinical workspace types
// ---------------------------------------------------------------------------

export interface MedicationOrder {
  id: number;
  name: string;
  code: string;
  code_system: string | null;
  form: string | null;
  strength: string | null;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  status: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  refill_count: number | null;
  prescriber: string | null;
}

export interface PatientAllergy {
  id: number;
  name: string;
  code: string;
  category: string | null;
  reaction: string | null;
  severity: string | null;
  onset_date: string | null;
  status: string | null;
}

export interface ObservationRecord {
  id: number;
  code: string;
  description: string | null;
  value: string | null;
  value_numeric: number | null;
  unit: string | null;
  reference_range: string | null;
  abnormal_flag: string | null;
  status: string | null;
  date: string;
  encounter_id: number | null;
}

export interface EnhancedEncounter {
  id: number;
  date: string;
  type: string;
  reason: string | null;
  status: string | null;
  disposition: string | null;
  provider_name: string | null;
  provider_specialty: string | null;
  facility: string | null;
}

export interface FlowsheetRow {
  code: string;
  name: string;
  unit: string | null;
  reference_range: string | null;
  date: string;
  value_numeric: number | null;
  value_text: string | null;
  abnormal_flag: string | null;
}

export interface TrendingPoint {
  date: string;
  value: number;
  unit: string | null;
  reference_range: string | null;
  abnormal_flag: string | null;
}
