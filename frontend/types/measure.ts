export type MeasureDomain = 'preventive' | 'chronic' | 'acute' | 'safety';
export type MeasureType = 'process' | 'outcome' | 'structural';

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

export interface QualityMeasure {
  id: string;
  title: string;
  version: string;
  steward: string;
  domain: MeasureDomain;
  type: MeasureType;
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
