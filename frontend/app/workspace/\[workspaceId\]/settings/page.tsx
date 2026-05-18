'use client';

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { workspacesApi } from "@/lib/api";
import type { Workspace } from "@/types";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params?.workspaceId as string;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    workspacesApi.get(workspaceId).then(ws => { setWorkspace(ws); setName(ws.name); setDescription(ws.description ?? ""); });
  }, [workspaceId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { const ws = await workspacesApi.update(workspaceId, { name, description }); setWorkspace(ws); }
    catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== workspace?.name) return;
    try { await workspacesApi.delete(workspaceId); router.push("/dashboard"); }
    catch (e) { console.error(e); }
  };

  const tabs = [{ id: "general", label: "General" }, { id: "danger", label: "Danger Zone" }];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Workspace Settings</h1>

      <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === t.id ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "general" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-5">General Settings</h2>
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Workspace Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none" />
            </div>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Changes</>}
            </button>
          </form>
        </div>
      )}

      {activeTab === "danger" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-900 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Danger Zone</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
            Deleting this workspace permanently removes all documents, chat history, and embeddings. This action <strong>cannot be undone</strong>.
          </p>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Type <strong>{workspace?.name}</strong> to confirm
            </label>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={workspace?.name}
              className="w-full px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-900 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
            <button onClick={handleDelete} disabled={deleteConfirm !== workspace?.name}
              className="px-5 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Delete Workspace Permanently
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
