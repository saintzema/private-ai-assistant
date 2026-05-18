'use client';

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Save,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Key,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { workspacesApi, subscriptionsApi } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, formatPercent, formatDate, copyToClipboard } from "@/lib/utils";
import type { ApiKey, Subscription, UsageStats } from "@/types";
import { Plan } from "@/types";

type Tab = "general" | "subscription" | "api-keys" | "danger";

const PLAN_LABELS: Record<Plan, string> = {
  [Plan.Free]: "Free",
  [Plan.Pro]: "Pro",
  [Plan.Enterprise]: "Enterprise",
};

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const { currentWorkspace, updateWorkspace, removeWorkspace } = useWorkspace();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>("general");

  // General tab state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Subscription tab state
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);

  // API Keys tab state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);

  // Danger tab state
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      setName(currentWorkspace.name);
      setDescription(currentWorkspace.description ?? "");
      setLogoUrl(currentWorkspace.logo_url ?? "");
    }
  }, [currentWorkspace]);

  useEffect(() => {
    const loadTabData = async () => {
      if (activeTab === "subscription") {
        try {
          const [sub, usg] = await Promise.all([
            subscriptionsApi.get(workspaceId),
            subscriptionsApi.getUsage(workspaceId),
          ]);
          setSubscription(sub);
          setUsage(usg);
        } catch {
          toast.error("Failed to load subscription data");
        }
      } else if (activeTab === "api-keys") {
        try {
          const keys = await workspacesApi.getApiKeys(workspaceId);
          setApiKeys(keys);
        } catch {
          toast.error("Failed to load API keys");
        }
      }
    };
    if (workspaceId) loadTabData();
  }, [activeTab, workspaceId, toast]);

  const handleSaveGeneral = async () => {
    setIsSaving(true);
    try {
      const updated = await workspacesApi.update(workspaceId, {
        name,
        description,
        logo_url: logoUrl || undefined,
      });
      updateWorkspace(workspaceId, updated);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);
    try {
      const key = await workspacesApi.createApiKey(workspaceId, { name: newKeyName });
      setApiKeys((prev) => [...prev, key]);
      setNewKeyValue(key.key ?? null);
      setNewKeyName("");
    } catch {
      toast.error("Failed to create API key");
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      await workspacesApi.deleteApiKey(workspaceId, keyId);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast.success("API key revoked");
    } catch {
      toast.error("Failed to revoke API key");
    }
  };

  const handleDeleteWorkspace = async () => {
    if (deleteConfirm !== currentWorkspace?.name) return;
    setIsDeleting(true);
    try {
      await workspacesApi.delete(workspaceId);
      removeWorkspace(workspaceId);
      toast.success("Workspace deleted");
      router.push("/dashboard");
    } catch {
      toast.error("Failed to delete workspace");
      setIsDeleting(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "subscription", label: "Subscription" },
    { id: "api-keys", label: "API Keys" },
    { id: "danger", label: "Danger Zone" },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Workspace Settings</h1>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            } ${tab.id === "danger" ? "text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* General tab */}
      {activeTab === "general" && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Workspace name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Logo URL
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <button
            onClick={handleSaveGeneral}
            disabled={isSaving || !name.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </button>
        </div>
      )}

      {/* Subscription tab */}
      {activeTab === "subscription" && (
        <div className="space-y-6">
          {!subscription ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Current plan</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {PLAN_LABELS[subscription.plan]}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    subscription.status === "active"
                      ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {subscription.status}
                  </span>
                </div>
                {subscription.plan === Plan.Free && (
                  <button className="w-full mt-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
                    Upgrade to Pro
                  </button>
                )}
              </div>

              {usage && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                  <h3 className="font-semibold">Usage this period</h3>
                  {[
                    { label: "Storage", used: usage.storage_used_bytes, limit: usage.storage_limit_bytes, format: formatBytes },
                    { label: "Documents processed", used: usage.documents_processed, limit: usage.documents_limit, format: (v: number) => v.toLocaleString() },
                    { label: "API calls", used: usage.api_calls, limit: usage.api_calls_limit, format: (v: number) => v.toLocaleString() },
                    { label: "Tokens used", used: usage.tokens_used, limit: usage.tokens_limit, format: (v: number) => v.toLocaleString() },
                  ].map(({ label, used, limit, format }) => {
                    const pct = formatPercent(used, limit);
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="text-slate-600 dark:text-slate-400">{label}</span>
                          <span className="font-medium text-slate-900 dark:text-white">
                            {format(used)} / {format(limit)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* API Keys tab */}
      {activeTab === "api-keys" && (
        <div className="space-y-5">
          {newKeyValue && (
            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                  API key created — save it now, it won&apos;t be shown again
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-green-200 dark:border-green-800 text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
                  {newKeyValue}
                </code>
                <button
                  onClick={() => { copyToClipboard(newKeyValue); toast.success("Copied!"); }}
                  className="p-2 rounded-lg border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => setNewKeyValue(null)} className="text-xs text-green-600 dark:text-green-400 mt-2 hover:underline">
                I&apos;ve saved the key, dismiss
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-sm">API Keys</h3>
              <button
                onClick={() => setShowCreateKey(!showCreateKey)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create key
              </button>
            </div>

            {showCreateKey && (
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex gap-2">
                  <input
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key name (e.g. Production)"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleCreateApiKey}
                    disabled={isCreatingKey || !newKeyName.trim()}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isCreatingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
                  </button>
                </div>
              </div>
            )}

            {apiKeys.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <Key className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No API keys yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {apiKeys.map((key) => (
                  <div key={key.id} className="flex items-center gap-4 p-4">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Key className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-900 dark:text-white">{key.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{key.key_prefix}••••••••</p>
                    </div>
                    <div className="hidden sm:block text-xs text-slate-400">
                      Created {formatDate(key.created_at)}
                    </div>
                    <button
                      onClick={() => handleDeleteApiKey(key.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                      title="Revoke key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Danger zone tab */}
      {activeTab === "danger" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 dark:border-red-900 p-6">
          <div className="flex items-start gap-3 mb-5">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-700 dark:text-red-400">Delete workspace</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                This will permanently delete <strong>{currentWorkspace?.name}</strong> and all its documents, chats, and members. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Type <strong>{currentWorkspace?.name}</strong> to confirm
            </label>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={currentWorkspace?.name}
              className="w-full px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            />
            <button
              onClick={handleDeleteWorkspace}
              disabled={deleteConfirm !== currentWorkspace?.name || isDeleting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
