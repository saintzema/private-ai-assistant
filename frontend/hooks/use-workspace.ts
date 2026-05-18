"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { workspacesApi } from "@/lib/api";
import type { Workspace } from "@/types";

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
}

interface WorkspaceActions {
  fetchWorkspaces: () => Promise<void>;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  addWorkspace: (workspace: Workspace) => void;
  updateWorkspace: (workspaceId: string, data: Partial<Workspace>) => void;
  removeWorkspace: (workspaceId: string) => void;
  clearError: () => void;
}

export const useWorkspace = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspace: null,
      isLoading: false,
      error: null,

      fetchWorkspaces: async () => {
        set({ isLoading: true, error: null });
        try {
          const workspaces = await workspacesApi.list();
          set({ workspaces, isLoading: false });
          // Set current workspace to first if none selected
          const { currentWorkspace } = get();
          if (!currentWorkspace && workspaces.length > 0) {
            set({ currentWorkspace: workspaces[0] });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to fetch workspaces";
          set({ error: msg, isLoading: false });
        }
      },

      setCurrentWorkspace: (workspace: Workspace | null) => {
        set({ currentWorkspace: workspace });
      },

      switchWorkspace: async (workspaceId: string) => {
        const { workspaces } = get();
        let workspace = workspaces.find((w) => w.id === workspaceId);
        if (!workspace) {
          // Fetch from API if not in local state
          set({ isLoading: true });
          try {
            workspace = await workspacesApi.get(workspaceId);
            set((state) => ({
              workspaces: state.workspaces.some((w) => w.id === workspaceId)
                ? state.workspaces
                : [...state.workspaces, workspace!],
            }));
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to load workspace";
            set({ error: msg, isLoading: false });
            return;
          } finally {
            set({ isLoading: false });
          }
        }
        set({ currentWorkspace: workspace });
      },

      addWorkspace: (workspace: Workspace) => {
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
          currentWorkspace: workspace,
        }));
      },

      updateWorkspace: (workspaceId: string, data: Partial<Workspace>) => {
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId ? { ...w, ...data } : w
          ),
          currentWorkspace:
            state.currentWorkspace?.id === workspaceId
              ? { ...state.currentWorkspace, ...data }
              : state.currentWorkspace,
        }));
      },

      removeWorkspace: (workspaceId: string) => {
        set((state) => {
          const workspaces = state.workspaces.filter((w) => w.id !== workspaceId);
          const currentWorkspace =
            state.currentWorkspace?.id === workspaceId
              ? workspaces[0] ?? null
              : state.currentWorkspace;
          return { workspaces, currentWorkspace };
        });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "workspace-storage",
      partialize: (state) => ({
        currentWorkspace: state.currentWorkspace,
        workspaces: state.workspaces,
      }),
    }
  )
);
