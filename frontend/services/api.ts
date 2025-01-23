import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  },
  withCredentials: true,
  // Increase timeout for slower connections
  timeout: 10000
});

// Get CSRF token before making requests
api.interceptors.request.use(async (config) => {
  try {
    await axios.get(`${api.defaults.baseURL}/sanctum/csrf-cookie`, {
      withCredentials: true
    });
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
  }
  return config;
});

// Error handling interceptor with navigation
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: any) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401 && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      // Handle other errors
      console.error('API Error:', error.response?.data?.message || error.message);
    }
    return Promise.reject(error);
  }
);

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

// API endpoints with type safety
export const auth = {
  login: (credentials: LoginCredentials): Promise<AxiosResponse<{ user: User }>> => 
    api.post('/api/login', credentials),
  logout: (): Promise<AxiosResponse<{ message: string }>> => 
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
export interface DashboardData {
  stats: {
    totalPatients: {
      value: number;
      trend: number;
    };
    riskScore: {
      value: number;
      trend: number;
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
