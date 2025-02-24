import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

// API Response types
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  status: number;
  errors?: Record<string, string[]>;
}

// Auth-related interfaces
export interface User {
  id: number;
  name: string;
  email: string;
  email_verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember?: boolean;
}

export interface AuthResponse {
  user: User;
  token?: string;
}

// API Response interfaces
export interface ApiSuccessResponse<T> {
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

// Create a single axios instance
const api: AxiosInstance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
    withCredentials: true, // Include credentials (cookies) in requests
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    timeout: 30000
});

// Basic error handling
api.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            window.location.href = '/login';
        }
        return Promise.reject(error.response?.data || error);
    }
);

// Basic auth functions
export const auth = {
    login: async (credentials: LoginCredentials): Promise<AxiosResponse<AuthResponse>> => {
        return api.post('/auth/login', credentials);
    },

    logout: async (): Promise<AxiosResponse<{ message: string }>> => {
        return api.post('/auth/logout');
    },

    user: async (): Promise<AxiosResponse<User>> => {
        return api.get('/auth/user');
    }
};

// Generic types for CRUD operations
interface CrudOperations<T> {
  getData: () => Promise<AxiosResponse<T[]>>;
  createData: (data: Partial<T>) => Promise<AxiosResponse<T>>;
  updateData: (id: number, data: Partial<T>) => Promise<AxiosResponse<T>>;
  deleteData: (id: number) => Promise<AxiosResponse<void>>;
}

// Dashboard data types
export interface DashboardData {
  stats: {
    totalPatients: {
      value: number;
      trend: number;
    };
    riskScore: {
      value: number;
      trend: number;
      highRiskCount: number;
      highRiskPercentage: number;
    };
    careGaps: {
      value: number;
      trend: number;
    };
    encounters: {
      value: number;
      trend: number;
    };
  };
  careGaps: Array<{
    id: number;
    patient: string;
    measure: string;
    days_open: number;
    priority: 'high' | 'medium' | 'low';
  }>;
  highRiskPatients: Array<{
    id: number;
    name: string;
    riskScore: number;
    conditions: string[];
    lastEncounter: string;
  }>;
  analytics: {
    populationMetrics: {
      totalActive: number;
      byRiskLevel: {
        high: number;
        medium: number;
        low: number;
      };
      demographics: {
        age: {
          [key: string]: number;
        };
        gender: {
          male: number;
          female: number;
        };
      };
    };
    careGapSummary: {
      total: number;
      byPriority: {
        high: number;
        medium: number;
        low: number;
      };
      byMeasure: {
        [key: string]: number;
      };
    };
    riskStratification: {
      distribution: Array<{
        score: string;
        count: number;
      }>;
    };
    patientActivity: {
      events: Array<{
        id: number;
        type: 'encounter' | 'procedure' | 'order' | 'result';
        patient: string;
        description: string;
        date: string;
        encounterType?: string;
        provider?: string;
        specialty?: string;
        status?: string;
        priority?: 'high' | 'medium' | 'low';
      }>;
    };
  };
  qualityMeasures: {
    performance: {
      overall: number;
      measures: Array<{
        id: number;
        name: string;
        score: number;
        target: number;
        trend: number;
      }>;
    };
    trends: {
      monthly: Array<{
        month: string;
        score: number;
      }>;
    };
    improvement: Array<{
      id: number;
      measure: string;
      gap: string;
      impact: string;
      potential: string;
    }>;
  };
}

// Example of using the generic CRUD type
interface ExampleData {
  id: number;
  name: string;
  description?: string;
}

export const example: CrudOperations<ExampleData> = {
  getData: () =>
    api.get('/example'),
  createData: (data) =>
    api.post('/example', data),
  updateData: (id, data) =>
    api.put(`/example/${id}`, data),
  deleteData: (id) =>
    api.delete(`/example/${id}`)
};

// Dashboard endpoints
export const dashboard = {
  getData: (): Promise<AxiosResponse<DashboardData>> =>
    api.get('/dashboard')
};

export default api;
