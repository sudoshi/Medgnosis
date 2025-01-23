import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

const api: AxiosInstance = axios.create({
  baseURL: 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  },
  withCredentials: true // Required for Sanctum authentication
});

// Response interceptor for handling errors
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: any) => {
    if (axios.isAxiosError(error)) {
      console.error('API Error:', error.response?.data);
      if (error.response?.status === 401) {
        // Handle unauthorized access
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Request interceptor for adding CSRF token
api.interceptors.request.use(async (config) => {
  try {
    // Get CSRF cookie from Laravel before making requests
    if (!document.cookie.includes('XSRF-TOKEN')) {
      await axios.get('http://localhost:8000/sanctum/csrf-cookie', {
        withCredentials: true,
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
    }

    // Get XSRF token from cookie
    const xsrfToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('XSRF-TOKEN='))
      ?.split('=')[1];

    if (xsrfToken) {
      config.headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrfToken);
    }
  } catch (error) {
    console.error('Error setting up request:', error);
  }
  return config;
});

export default api;

// Types for API responses
interface User {
  id: number;
  name: string;
  email: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: User;
}

// API endpoints with type safety
export const auth = {
  login: (credentials: LoginCredentials): Promise<AxiosResponse<LoginResponse>> => 
    api.post('/api/login', credentials),
  logout: (): Promise<AxiosResponse<void>> => 
    api.post('/api/logout'),
  user: (): Promise<AxiosResponse<User>> => 
    api.get('/api/user')
};

// Generic types for CRUD operations
interface CrudOperations<T> {
  getData: () => Promise<AxiosResponse<T[]>>;
  createData: (data: Partial<T>) => Promise<AxiosResponse<T>>;
  updateData: (id: number, data: Partial<T>) => Promise<AxiosResponse<T>>;
  deleteData: (id: number) => Promise<AxiosResponse<void>>;
}

// Dashboard data types
interface RiskScore {
  total: number;
}

interface RiskData {
  riskScore: RiskScore;
  factorBreakdown: Record<string, number>;
  trending: Array<{
    month: string;
    risk_score: number;
  }>;
}

interface MeasureData {
  historical_trend: Array<{
    month_name: string;
    compliance_rate: number;
  }>;
  current_rate: {
    rate: number;
  };
  improvement_opportunities: Array<{
    description: string;
    potential_impact: string;
  }>;
}

interface Alert {
  level: 'critical' | 'warning' | 'info';
  message: string;
  action_required?: string;
  contributing_factors?: Record<string, number>;
}

export interface DashboardData {
  riskData: RiskData;
  measureData: MeasureData;
  alerts: Alert[];
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
    api.get('/api/v1/dashboard')
};
