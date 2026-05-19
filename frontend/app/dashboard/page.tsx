'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, MessageSquare, Users, Zap, Building2 } from "lucide-react";
import { workspacesApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceCard } from "@/components/workspace/workspace-card";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { formatRelativeTime } from "@/lib/utils";
import type { Workspace, Chat } from "@/types";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
}

function StatCard({ label, value, icon: Icon, colorClass }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { workspaces, fetchWorkspaces, isLoading, addWorkspace, removeWorkspace } = useWorkspace();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const safeWorkspaces = Array.isArray(workspaces) ? workspaces : [];
  const totalDocs = safeWorkspaces.reduce((s, w) => s + (w.document_count ?? 0), 0);
  const totalChats = safeWorkspaces.reduce((s, w) => s + (w.chat_count ?? 0), 0);
  const totalMembers = safeWorkspaces.reduce((s, w) => s + (w.member_count ?? 0), 0);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {greeting()}, {user?.full_name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Here&apos;s an overview of your AI knowledge base.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Workspaces"
          value={safeWorkspaces.length}
          icon={Building2}
          colorClass="bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Documents"
          value={totalDocs}
          icon={FileText}
          colorClass="bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400"
        />
        <StatCard
          label="Total chats"
          value={totalChats}
          icon={MessageSquare}
          colorClass="bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          label="Team members"
          value={totalMembers}
          icon={Users}
          colorClass="bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
        />
      </div>

      {/* Workspaces section */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your Workspaces</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Workspace
        </button>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : safeWorkspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            No workspaces yet
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
            Create your first workspace to start uploading documents and chatting with your AI knowledge base.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create your first workspace
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {safeWorkspaces.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onEdit={(w) => router.push(`/workspace/${w.id}/settings`)}
              onDelete={(w) => removeWorkspace(w.id)}
            />
          ))}
          <button
            onClick={() => setShowCreate(true)}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-500 transition-all min-h-[160px]"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">New Workspace</span>
          </button>
        </div>
      )}

      <CreateWorkspaceDialog
        open={showCreate}
        onOpenChange={setShowCreate}
      />
    </div>
  );
}
