import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://demo.medgnosis.app/api';

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      withCredentials: true, // Important for handling cookies/session
    });

    // Add response interceptor for handling errors
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized access
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Authentication endpoints
  async login(email: string, password: string) {
    try {
      const response = await this.api.post('/auth/login', { email, password });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async logout() {
    try {
      const response = await this.api.post('/auth/logout');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getUser() {
    try {
      const response = await this.api.get('/auth/user');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Dashboard data
  async getDashboardData() {
    try {
      const response = await this.api.get('/v1/dashboard');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Patients
  async getPatients() {
    try {
      const response = await this.api.get('/v1/patients');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getPatient(id: string) {
    try {
      const response = await this.api.get(`/v1/patients/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Helper method to set auth token
  setAuthToken(token: string | null) {
    if (token) {
      this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.api.defaults.headers.common['Authorization'];
    }
  }
}

// Export a singleton instance
const apiService = new ApiService();
export default apiService;
