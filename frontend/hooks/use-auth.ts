"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, usersApi } from "@/lib/api";
import { setToken, setRefreshToken, clearTokens } from "@/lib/auth";
import type { User, LoginRequest, RegisterRequest } from "@/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

interface AuthActions {
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  clearError: () => void;
}

export const useAuth = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,

      login: async (data: LoginRequest) => {
        set({ isLoading: true, error: null });
        try {
          const tokens = await authApi.login(data);
          setToken(tokens.access_token);
          setRefreshToken(tokens.refresh_token);
          // Fetch user profile
          const user = await usersApi.getMe();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Login failed";
          set({ error: msg, isLoading: false, isAuthenticated: false });
          throw err;
        }
      },

      register: async (data: RegisterRequest) => {
        set({ isLoading: true, error: null });
        try {
          await authApi.register(data);
          set({ isLoading: false });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Registration failed";
          set({ error: msg, isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await authApi.logout();
        } catch {
          // Even if logout fails on backend, clear local state
        } finally {
          clearTokens();
          set({ user: null, isAuthenticated: false, isLoading: false, error: null });
        }
      },

      fetchMe: async () => {
        const { isAuthenticated } = get();
        if (!isAuthenticated) return;
        set({ isLoading: true });
        try {
          const user = await usersApi.getMe();
          set({ user, isLoading: false });
        } catch {
          // Token may be invalid
          clearTokens();
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      updateUser: (partial: Partial<User>) => {
        const { user } = get();
        if (!user) return;
        set({ user: { ...user, ...partial } });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
