// =============================================================================
// Medgnosis — Quality Measure Types
// Ported from frontend/types/measure.ts
// =============================================================================

export type MeasureDomain = 'preventive' | 'chronic' | 'acute' | 'safety';
export type MeasureType = 'process' | 'outcome' | 'structural';
export type MeasureCategory = 'NQF' | 'eCQM' | 'USPSTF';
export type MeasureStatus = 'active' | 'draft' | 'retired';
export type PerformanceLevel = 'below' | 'meeting' | 'exceeding';

export interface ClinicalFocus {
  id: string;
  name: string;
  description: string;
  related_conditions: string[];
  recommended_measures: string[];
}

export interface MeasureBundle {
  id: string;
  name: string;
  description: string;
  clinical_focus: string;
  measures: string[];
  recommended_frequency?: {
    value: number;
    unit: 'days' | 'weeks' | 'months' | 'years';
  };
}

export interface ValueSetConcept {
  code: string;
  system: string;
  display: string;
}

export interface ValueSet {
  id: string;
  oid: string;
  name: string;
  concepts: ValueSetConcept[];
}

export interface MeasureCriteria {
  initial_population: {
    demographics?: {
      age_min?: number;
      age_max?: number;
      gender?: string[];
    };
    conditions?: string[];
    encounters?: string[];
    medications?: string[];
    timeframe?: {
      type: 'rolling' | 'annual';
      lookback: number;
    };
  };
  denominator?: {
    conditions: string[];
    procedures: string[];
    observations: string[];
  };
  denominator_exclusions?: {
    conditions: string[];
    medications: string[];
    timeframe: number;
  };
  numerator: {
    tests?: string[];
    procedures?: string[];
    results?: {
      type: string;
      value: string;
      comparator: '>' | '<' | '>=' | '<=' | '=';
    }[];
    timeframe: {
      before: number;
      after: number;
    };
  };
}

export interface QualityMeasure {
  id: string;
  title: string;
  implementation: {
    category: MeasureCategory;
    code: string;
    version: string;
    status: MeasureStatus;
    effective_date: string;
    last_review_date: string;
  };
  steward: string;
  domain: MeasureDomain;
  type: MeasureType;
  clinical_focus: string;
  description: string;
  rationale: string;
  guidance?: string;
  clinical_recommendation?: string;
  valuesets: ValueSet[];
  criteria: MeasureCriteria;
  performance?: {
    target?: number;
    benchmark?: number;
    improvement?: number;
  };
}

export interface MeasurePopulationAnalysis {
  eligible: number;
  excluded: number;
  compliant: number;
  performance: number;
  gaps: {
    patient: string;
    requirements: string[];
  }[];
  trends?: {
    period: string;
    performance: number;
  }[];
}

export interface MeasureFilter {
  domain?: MeasureDomain;
  type?: MeasureType;
  search?: string;
  status?: MeasureStatus;
  performance?: PerformanceLevel;
}
