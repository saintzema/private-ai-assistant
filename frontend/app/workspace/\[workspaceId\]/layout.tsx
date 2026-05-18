'use client';

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import WorkspaceSidebar from "@/components/layout/workspace-sidebar";
import type { Workspace } from "@/types";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const workspaceId = params?.workspaceId as string;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) { router.push("/auth/login"); return; }
    if (!workspaceId) return;
    const load = async () => {
      try {
        const { workspacesApi } = await import("@/lib/api");
        const ws = await workspacesApi.get(workspaceId);
        setWorkspace(ws);
      } catch {
        router.push("/dashboard");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [workspaceId, router]);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <WorkspaceSidebar workspace={workspace} workspaceId={workspaceId} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
