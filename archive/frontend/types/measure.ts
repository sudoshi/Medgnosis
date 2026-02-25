export type MeasureDomain = 'preventive' | 'chronic' | 'acute' | 'safety';
export type MeasureType = 'process' | 'outcome' | 'structural';
export type MeasureCategory = 'NQF' | 'eCQM' | 'USPSTF';

export interface ClinicalFocus {
  id: string;
  name: string;
  description: string;
  relatedConditions: string[];
  recommendedMeasures: string[]; // measure IDs
}

export interface MeasureBundle {
  id: string;
  name: string;
  description: string;
  clinicalFocus: string; // references ClinicalFocus.id
  measures: string[]; // measure IDs
  recommendedFrequency?: {
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

export interface MeasureCriteriaDemographics {
  ageMin?: number;
  ageMax?: number;
  gender?: string[];
}

export interface MeasureTimeframe {
  type: 'rolling' | 'annual';
  lookback: number; // days
}

export interface MeasureResult {
  type: string;
  value: string;
  comparator: '>' | '<' | '>=' | '<=' | '=';
}

export interface MeasureCriteria {
  initialPopulation: {
    demographics?: MeasureCriteriaDemographics;
    conditions?: string[]; // ValueSet OIDs
    encounters?: string[]; // ValueSet OIDs
    medications?: string[]; // ValueSet OIDs
    timeframe?: MeasureTimeframe;
  };
  denominator?: {
    conditions: string[];
    procedures: string[];
    observations: string[];
  };
  denominatorExclusions?: {
    conditions: string[];
    medications: string[];
    timeframe: number; // days
  };
  numerator: {
    tests?: string[];
    procedures?: string[];
    results?: MeasureResult[];
    timeframe: {
      before: number; // days
      after: number; // days
    };
  };
}

export interface MeasureImplementation {
  category: MeasureCategory;
  code: string; // e.g., "NQF-0018" or "CMS122v3"
  version: string;
  status: 'active' | 'draft' | 'retired';
  effectiveDate: string;
  lastReviewDate: string;
}

export interface QualityMeasure {
  id: string;
  title: string;
  implementation: MeasureImplementation;
  steward: string;
  domain: MeasureDomain;
  type: MeasureType;
  clinicalFocus: string; // references ClinicalFocus.id
  description: string;
  rationale: string;
  guidance?: string;
  clinicalRecommendation?: string;
  valuesets: ValueSet[];
  criteria: MeasureCriteria;
  performance?: {
    target?: number;
    benchmark?: number;
    improvement?: number;
  };
}

export interface MeasureQualification {
  qualifies: boolean;
  population: 'initial' | 'denominator' | 'numerator';
  exclusions: string[];
  dueDate?: Date;
  requirements: {
    met: string[];
    pending: string[];
  };
}

export interface MeasurePopulationAnalysis {
  eligible: number;
  excluded: number;
  compliant: number;
  performance: number;
  gaps: Array<{
    patient: string;
    requirements: string[];
  }>;
  trends?: {
    period: string;
    performance: number;
  }[];
}

export interface MeasureFilter {
  domain?: MeasureDomain;
  type?: MeasureType;
  search?: string;
  status?: 'active' | 'inactive';
  performance?: 'below' | 'meeting' | 'exceeding' | undefined;
}
