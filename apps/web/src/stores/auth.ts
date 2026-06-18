// =============================================================================
// Medgnosis Web — Auth store (Zustand)
// =============================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthPermission, User, AuthTokens, UserRole } from '@medgnosis/shared';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (user: User, tokens: AuthTokens) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  updateTokens: (tokens: AuthTokens) => void;
  hasRole: (role: UserRole) => boolean;
  hasPermission: (permission: AuthPermission) => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
}

type AuthPersistState = Pick<AuthState, 'user' | 'tokens' | 'isAuthenticated'>;

export const useAuthStore = create<AuthState>()(
  persist<AuthState, [], [], AuthPersistState>(
    (set, get): AuthState => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: (user, tokens) =>
        set({ user, tokens, isAuthenticated: true, isLoading: false }),

      setUser: (user) => set({ user }),

      clearAuth: () =>
        set({ user: null, tokens: null, isAuthenticated: false, isLoading: false }),

      setLoading: (isLoading) => set({ isLoading }),

      updateTokens: (tokens) => set({ tokens }),

      hasRole: (role) => {
        const user = get().user;
        return user?.role === role || user?.roles?.includes(role) || false;
      },

      hasPermission: (permission) => {
        const user = get().user;
        return user?.permissions?.includes(permission) || false;
      },

      isAdmin: () => {
        const user = get().user;
        return user?.role === 'admin' || user?.role === 'super_admin' || user?.roles?.includes('admin') || user?.roles?.includes('super_admin') || false;
      },

      isSuperAdmin: () => {
        const user = get().user;
        return user?.role === 'super_admin' || user?.roles?.includes('super_admin') || false;
      },
    }),
    {
      name: 'medgnosis-auth',
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setLoading(false);
      },
    },
  ),
);
