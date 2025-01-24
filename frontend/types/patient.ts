export interface Patient {
  id: string;
  name: {
    first: string;
    last: string;
  };
  dateOfBirth: string;
  gender: string;
  riskFactors: {
    level: 'low' | 'medium' | 'high';
    score: number;
    factors: Array<{
      name: string;
      severity: 'low' | 'medium' | 'high';
      lastAssessed: string;
    }>;
    trending?: 'up' | 'down' | 'stable';
  };
  careGaps: Array<{
    id: string;
    measure: string;
    dueDate: string;
    status: 'open' | 'closed' | 'in_progress';
    priority: 'low' | 'medium' | 'high';
    description: string;
  }>;
  conditions: Array<{
    id: string;
    code: string;
    name: string;
    status: 'active' | 'resolved' | 'inactive';
    onsetDate: string;
    diagnosedDate: string;
    lastAssessed: string;
    controlStatus: 'controlled' | 'uncontrolled' | 'unknown';
  }>;
  encounters: Array<{
    id: string;
    date: string;
    type: string;
    provider: string;
    summary: string;
    followUpNeeded: boolean;
    followUpDate?: string;
    reason?: string;
    details?: {
      vitals?: {
        temperature: string;
        heartRate: string;
        respiratoryRate: string;
        bloodPressure: string;
        weight: string;
        bmi: string;
      };
    };
  }>;
  metrics: {
    [key: string]: {
      value: number;
      unit: string;
      date: string;
    };
  };
}

export interface PatientDetails extends Patient {
  demographics: {
    age: number;
    gender: string;
    ethnicity: string;
    language: string;
    maritalStatus: string;
    employment: string;
    phone?: string;
    email?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  contact: {
    phone: string;
    email: string;
  };
  insurance: {
    provider: string;
    plan: string;
    memberId: string;
  };
  primaryCare: {
    provider: string;
    clinic: string;
    lastVisit: string;
  };
  careTeam: Array<{
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
  }>;
  alerts: ClinicalAlert[];
  recentActions: PatientAction[];
  labs: Array<{
    id: string;
    name: string;
    value: number;
    unit: string;
    date: string;
    status: 'normal' | 'abnormal' | 'critical';
    trend?: 'up' | 'down' | 'stable';
    referenceRange?: string;
    components?: Array<{
      name: string;
      value: number;
      unit: string;
      referenceRange: string;
      status: string;
    }>;
  }>;
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
  priority: 'low' | 'medium' | 'high';
}
