'use client';

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { Header } from "@/components/layout/header";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { switchWorkspace, currentWorkspace, isLoading: wsLoading } = useWorkspace();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace(`/auth/login?redirect=/workspace/${workspaceId}/chat`);
      return;
    }
    if (isAuthenticated && workspaceId) {
      switchWorkspace(workspaceId);
    }
  }, [isAuthenticated, authLoading, workspaceId, switchWorkspace, router]);

  const isLoading = authLoading || wsLoading;

  if (isLoading && !currentWorkspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <WorkspaceSidebar workspaceId={workspaceId} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
