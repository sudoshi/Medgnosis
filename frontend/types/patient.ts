export interface PatientDetails {
  id: number;
  name: string;
  demographics: {
    age: number;
    gender: string;
    language: string;
    ethnicity: string;
    address: string;
    phone: string;
    email: string;
    insurance?: {
      primary: string;
      secondary?: string;
      memberId: string;
      group: string;
    };
    socialDeterminants?: {
      housing: string;
      transportation: string;
      foodSecurity: string;
      socialSupport: string;
      employmentStatus: string;
    };
    preferences?: {
      contactMethod: string;
      language: string;
      timePreference: string;
      communicationNeeds: string;
    };
  };
  riskFactors: {
    score: number;
    level: 'low' | 'medium' | 'high';
    factors: Array<{
      name: string;
      severity: 'low' | 'medium' | 'high';
      lastAssessed: string;
    }>;
    trending: 'up' | 'down' | 'stable';
  };
  conditions: Array<{
    id: number;
    name: string;
    status: 'active' | 'resolved' | 'inactive';
    diagnosedDate: string;
    lastAssessed: string;
    controlStatus: 'uncontrolled' | 'controlled' | 'unknown';
    details?: {
      severity: string;
      complications?: string[];
      symptoms?: string[];
      targetGoals?: Record<string, string>;
      ejectionFraction?: string;
      fev1?: string;
      exacerbations?: string;
      riskFactors?: string[];
    };
    treatmentPlan?: {
      lifestyle?: string[];
      education?: string[];
    monitoring?: {
      frequency: string;
      tests?: string[];
      parameters?: string[];
    };
    };
  }>;
  medications: Array<{
    id: number;
    name: string;
    dosage: string;
    frequency: string;
    startDate: string;
    endDate?: string;
    adherence?: number;
    status: 'active' | 'discontinued' | 'completed';
  }>;
  careGaps: Array<{
    id: number;
    measure: string;
    priority: 'high' | 'medium' | 'low';
    dueDate: string;
    status: 'open' | 'in_progress' | 'completed';
    description: string;
  }>;
  labs: Array<{
    id: number;
    name: string;
    value?: string;
    unit?: string;
    date: string;
    status: 'normal' | 'abnormal' | 'critical';
    trend?: 'improving' | 'worsening' | 'stable';
    referenceRange?: string;
    history?: Array<{
      date: string;
      value: string;
    }>;
    details?: {
      method?: string;
      location?: string;
      orderedBy?: string;
      notes?: string;
    };
    components?: Array<{
      name: string;
      value: string;
      unit: string;
      referenceRange: string;
      status: string;
    }>;
  }>;
  encounters: Array<{
    id: number;
    type: string;
    provider: string;
    date: string;
    reason: string;
    summary: string;
    followUpNeeded: boolean;
    followUpDate?: string;
    details?: {
      vitals?: {
        temperature?: string;
        heartRate?: string;
        respiratoryRate?: string;
        bloodPressure?: string;
        weight?: string;
        bmi?: string;
      };
      physicalExam?: Record<string, string>;
      cardiacExam?: Record<string, string>;
      assessment?: string[];
      plan?: string[];
      diagnostics?: Record<string, string>;
    };
  }>;
  careTeam: Array<{
    id: number;
    name: string;
    role: string;
    specialty?: string;
    phone: string;
    email: string;
    primary: boolean;
    details?: {
      credentials?: string;
      npi?: string;
      practice?: string;
      address?: string;
      availability?: {
        office?: string;
        hours?: string;
        urgent?: string;
        response?: string;
      };
      languages?: string[];
      expertise?: string[];
      specialty?: string;
      responsibilities?: string[];
      assignedSince?: string;
    };
  }>;
  programs: Array<{
    id: number;
    name: string;
    type: string;
    startDate: string;
    endDate?: string;
    status: 'active' | 'completed' | 'discontinued';
    coordinator: string;
  }>;
}

export interface PatientAction {
  id: number;
  type: 'appointment' | 'outreach' | 'referral' | 'care_gap' | 'medication' | 'program';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  assignedTo?: string;
  description: string;
  notes?: string;
  outcome?: string;
}

export interface ClinicalAlert {
  id: number;
  type: 'lab' | 'medication' | 'condition' | 'care_gap' | 'risk';
  severity: 'high' | 'medium' | 'low';
  message: string;
  date: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedDate?: string;
}

export interface PatientNote {
  id: number;
  type: 'clinical' | 'administrative' | 'care_management';
  author: string;
  date: string;
  content: string;
  tags: string[];
  private: boolean;
}
