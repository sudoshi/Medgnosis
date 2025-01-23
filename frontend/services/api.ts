import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { NextResponse } from 'next/server';

// Error handling types
export interface ErrorDetails {
    message: string;
    status?: number;
    code?: string;
    errors?: Record<string, string[]>;
}

// API Response types
export interface ApiResponse<T = any> {
    data: T;
    message?: string;
    status: number;
}

// Auth-related interfaces
export interface User {
id: number;
name: string;
email: string;
created_at: string;
updated_at: string;
}

export interface LoginCredentials {
email: string;
password: string;
remember?: boolean;
}

export interface RegisterCredentials {
name: string;
email: string;
password: string;
password_confirmation: string;
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
stack?: string;
}

interface ErrorDetails {
status?: number;
message: string;
error?: string;
url?: string;
method?: string;
data?: any;
stack?: string;
requestData?: any;
requestHeaders?: Record<string, string>;
}
// Create axios instance with default config
const api: AxiosInstance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    },
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN',
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400
});

// Enhanced CSRF token management with retries and caching
let csrfPromise: Promise<void> | null = null;
let lastCsrfToken: string | null = null;

// Track pending requests for cancellation
const pendingRequests = new Map<string, AbortController>();

// Helper function to handle API errors consistently
const handleApiError = (error: unknown): never => {
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiResponse>;
        throw {
            message: axiosError.response?.data?.message || axiosError.message,
            status: axiosError.response?.status,
            errors: axiosError.response?.data?.errors,
        };
    }
    throw error;
};

// Error handling interceptor
// Request interceptor for handling auth, CSRF, and cancellation
api.interceptors.request.use(
async (config: InternalAxiosRequestConfig) => {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    config.params = { 
    ...config.params, 
    _: timestamp 
    };
    
    // Log requests in development
    if (process.env.NODE_ENV === 'development') {
    console.log('API Request:', {
        url: config.url,
        method: config.method,
        headers: config.headers,
        data: config.data
    });
    }
    return config;
},
(error: unknown) => {
    console.error('Request Configuration Error:', error);
    return Promise.reject(error);
}
);

// Response interceptor for handling errors and auth
api.interceptors.response.use(
    (response: AxiosResponse) => {
        // Log responses in development
        if (process.env.NODE_ENV === 'development') {
            console.log('API Response:', {
                url: response.config.url,
                status: response.status,
                data: response.data
            });
        }
        
        // Update CSRF token if present in response headers
        const newCsrfToken = response.headers['x-csrf-token'];
        if (newCsrfToken) {
            lastCsrfToken = newCsrfToken;
        }
        
        return response;
    },
    async (error: unknown) => {
    // Helper function to log error details
    const logErrorDetails = (type: string, details: ErrorDetails, extra: Record<string, unknown> = {}) => {
        const errorLog = {
            type,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            ...details,
            ...extra
        };
        
        // Ensure all properties are defined before logging
        Object.keys(errorLog).forEach(key => {
            if (errorLog[key] === undefined) {
                delete errorLog[key];
            }
        });
        
        console.error(`${type}:`, errorLog);
    };

    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ApiErrorResponse>;
        
        // Handle network errors (no response)
        if (!axiosError.response) {
            const networkError: ErrorDetails = {
                message: axiosError.message || 'Network connection failed',
                error: 'Network Error',
                url: axiosError.config?.url || 'unknown',
                method: axiosError.config?.method?.toUpperCase() || 'unknown',
                stack: axiosError.stack,
                requestData: axiosError.config?.data,
                requestHeaders: axiosError.config?.headers as Record<string, string>
            };
            
            logErrorDetails('Network Error', networkError);
            return Promise.reject(networkError);
        }

    // Handle API errors (with response)
    const errorDetails: ErrorDetails = {
        status: axiosError.response.status,
        message: axiosError.response.data?.message || axiosError.message || 'An error occurred',
        error: axiosError.response.data?.error || axiosError.name || 'API Error',
        url: axiosError.config?.url || 'unknown',
        method: axiosError.config?.method?.toUpperCase() || 'unknown',
        data: axiosError.response.data || null,
        stack: process.env.NODE_ENV === 'development' ? axiosError.stack : undefined,
        requestData: axiosError.config?.data || null,
        requestHeaders: axiosError.config?.headers as Record<string, string>
    };

    // Handle authentication errors
    if (axiosError.response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
    }

    // Log error with validation errors if present
    logErrorDetails('API Error', errorDetails, {
        validation: axiosError.response.data?.errors || null,
        statusCode: axiosError.response.status,
        statusText: axiosError.response.statusText
    });

    return Promise.reject(errorDetails);
    } else {
    // Handle non-Axios errors
    const unexpectedError: ErrorDetails = {
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        error: 'Unexpected Error',
        stack: error instanceof Error ? error.stack : undefined
    };

    logErrorDetails('Unexpected Error', unexpectedError, {
        errorType: error instanceof Error ? error.constructor.name : typeof error
    });
    return Promise.reject(unexpectedError);
    }
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

// Enhanced CSRF token management
export const getCsrfToken = async (retries = 3): Promise<void> => {
    if (csrfPromise) return csrfPromise;
    
    csrfPromise = (async () => {
        try {
            await api.get('/sanctum/csrf-cookie');
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
            console.error('Failed to fetch CSRF token:', error);
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                csrfPromise = null;
                return getCsrfToken(retries - 1);
            }
            throw new Error('Failed to initialize session after multiple attempts.');
        }
    })();
    
    return csrfPromise;
};

export const auth = {
login: async (credentials: LoginCredentials): Promise<AxiosResponse<AuthResponse>> => {
    await getCsrfToken();
    return api.post('/login', credentials);
},

register: async (credentials: RegisterCredentials): Promise<AxiosResponse<AuthResponse>> => {
    await getCsrfToken();
    return api.post('/register', credentials);
},

logout: async (): Promise<AxiosResponse<{ message: string }>> => {
    await getCsrfToken();
    return api.post('/logout');
},

user: async (): Promise<AxiosResponse<User>> => {
    return api.get('/user');
},

forgotPassword: async (email: string): Promise<AxiosResponse<{ message: string }>> => {
    await getCsrfToken();
    return api.post('/forgot-password', { email });
},

resetPassword: async (data: { 
    email: string; 
    password: string; 
    password_confirmation: string; 
    token: string; 
}): Promise<AxiosResponse<{ message: string }>> => {
    await getCsrfToken();
    return api.post('/reset-password', data);
},

resendVerification: async (email: string): Promise<AxiosResponse<{ message: string }>> => {
    await getCsrfToken();
    return api.post('/email/verification-notification', { email });
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
    api.get('/api/v1/example'),
  createData: (data) =>
    api.post('/api/v1/example', data),
  updateData: (id, data) =>
    api.put(`/api/v1/example/${id}`, data),
  deleteData: (id) =>
    api.delete(`/api/v1/example/${id}`)
};

// Dashboard endpoints
export const dashboard = {
  getData: (): Promise<AxiosResponse<DashboardData>> =>
    api.get('/api/v1/dashboard')
};
