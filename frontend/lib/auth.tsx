'use client';

import { api, auth as authApi } from '@/services/api';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
type AuthError = {
message: string;
code?: string;
validation?: Record<string, string[]>;
};

export interface AuthContextType {
user: User | null;
loading: boolean;
error: AuthError | null;
isAuthenticated: boolean;
login: (credentials: LoginCredentials) => Promise<void>;
logout: () => Promise<void>;
register: (data: RegisterData) => Promise<void>;
resetPassword: (email: string) => Promise<void>;
updatePassword: (data: UpdatePasswordData) => Promise<void>;
clearError: () => void;
refreshUser: () => Promise<void>;
}
interface User {
id: number;
name: string;
email: string;
email_verified_at?: string;
created_at: string;
updated_at: string;
}

interface LoginCredentials {
email: string;
password: string;
remember?: boolean;
}

interface RegisterData {
name: string;
email: string;
password: string;
password_confirmation: string;
}

interface UpdatePasswordData {
current_password: string;
password: string;
password_confirmation: string;
}

const AuthContext = createContext<AuthContextType | null>(null);
export function useAuth() {
const context = useContext(AuthContext);
if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
}
return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
const [user, setUser] = useState<User | null>(null);
const [loading, setLoading] = useState<boolean>(true);
const [error, setError] = useState<AuthError | null>(null);
const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
const router = useRouter();
const pathname = usePathname();
const abortControllerRef = useRef<AbortController | null>(null);
const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/password/reset';
const isMounted = useRef(false);
const isCheckingAuth = useRef<boolean>(false);

const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
    }
}, []);

const clearError = useCallback(() => setError(null), []);

const checkAuth = useCallback(async (signal?: AbortSignal) => {
    if (isCheckingAuth.current) return;
    isCheckingAuth.current = true;
    
    try {
    setError(null);
    const response = await authApi.user();
    if (!signal?.aborted) {
        setUser(response.data);
    }
    } catch (err) {
    if (!signal?.aborted) {
        setUser(null);
        if (!isAuthPage) {
        router.push('/login');
        }
    }
    } finally {
    if (!signal?.aborted) {
        setLoading(false);
        isCheckingAuth.current = false;
    }
    }
}, [isAuthPage, router]);

useEffect(() => {
if (!isMounted.current) {
    isMounted.current = true;
    return;
}

abortControllerRef.current?.abort();
abortControllerRef.current = new AbortController();

if (!isAuthPage) {
    checkAuth(abortControllerRef.current.signal);
} else {
    setLoading(false);
}

return () => {
    abortControllerRef.current?.abort();
};
}, [isAuthPage, pathname, checkAuth]);

// Setup refresh timer when user is authenticated
useEffect(() => {
if (isAuthenticated && user) {
    clearRefreshTimer();
    refreshTimerRef.current = setTimeout(() => {
    refreshUser();
    }, 5 * 60 * 1000); // Refresh every 5 minutes
}
return clearRefreshTimer;
}, [isAuthenticated, user, clearRefreshTimer]);
const refreshUser = async () => {
if (!isAuthenticated || isCheckingAuth.current) return;

try {
    const response = await authApi.user();
    setUser(response.data);
    setIsAuthenticated(true);
} catch (err) {
    handleAuthError(err);
}
};

const handleAuthError = (err: unknown) => {
const authError: AuthError = {
    message: 'An unexpected error occurred'
};

if (err instanceof Error) {
    authError.message = err.message;
}

if (axios.isAxiosError(err) && err.response) {
    authError.message = err.response.data.message || authError.message;
    authError.code = String(err.response.status);
    authError.validation = err.response.data.errors;
}

setError(authError);
setUser(null);
setIsAuthenticated(false);
};

const login = async (credentials: LoginCredentials) => {
try {
    setError(null);
    setLoading(true);
    await authApi.csrf();
    const response = await authApi.login(credentials);
    setUser(response.data.user);
    setIsAuthenticated(true);
    if (isMounted.current) {
        router.push('/dashboard');
    }
} catch (err) {
    handleAuthError(err);
    throw err;
} finally {
    setLoading(false);
}
};

const register = async (data: RegisterData) => {
try {
    setError(null);
    setLoading(true);
    await authApi.csrf();
    await authApi.register(data);
    if (isMounted.current) {
        router.push('/login');
    }
} catch (err) {
    handleAuthError(err);
    throw err;
} finally {
    setLoading(false);
}
};

const resetPassword = async (email: string) => {
try {
    setError(null);
    setLoading(true);
    await authApi.csrf();
    await authApi.forgotPassword({ email });
} catch (err) {
    handleAuthError(err);
    throw err;
} finally {
    setLoading(false);
}
};

const updatePassword = async (data: UpdatePasswordData) => {
try {
    setError(null);
    setLoading(true);
    await authApi.csrf();
    await authApi.updatePassword(data);
} catch (err) {
    handleAuthError(err);
    throw err;
} finally {
    setLoading(false);
}
};

const logout = async () => {
try {
    setError(null);
    setLoading(true);
    await authApi.logout();
    setUser(null);
    setIsAuthenticated(false);
    clearRefreshTimer();
    if (isMounted.current) {
        router.push('/login');
    }
} catch (err) {
    handleAuthError(err);
    throw err;
} finally {
    setLoading(false);
}
};

return (
<AuthContext.Provider
    value={{
    user,
    loading,
    error,
    isAuthenticated,
    login,
    logout,
    register,
    resetPassword,
    updatePassword,
    clearError,
    refreshUser
    }}
>
    {children}
</AuthContext.Provider>
);
}
