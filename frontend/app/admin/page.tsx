'use client';

import { useState, useEffect } from "react";
import { Users, FileText, MessageSquare, Activity, TrendingUp, Shield, AlertTriangle, RefreshCw } from "lucide-react";
import { adminApi } from "@/lib/api";
import type { AdminStats } from "@/types";

function StatCard({ icon: Icon, label, value, sub, color = "blue" }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "violet" | "amber";
}) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",
    green: "bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400",
    violet: "bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400",
    amber: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<{ id: string; email: string; full_name: string; is_active: boolean; is_verified: boolean; created_at: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "users">("overview");

  const load = async () => {
    try {
      const [statsData, usersData] = await Promise.all([
        adminApi.getStats(),
        adminApi.getUsers(),
      ]);
      setStats(statsData);
      setUsers(usersData.items || []);
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = () => { setIsRefreshing(true); load(); };

  const handleToggleUser = async (userId: string, currentlyActive: boolean) => {
    try {
      if (currentlyActive) {
        await adminApi.deactivateUser(userId);
      } else {
        await adminApi.activateUser(userId);
      }
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: !currentlyActive } : u));
    } catch {
      // handle
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" /> Admin Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">Platform-wide overview and user management</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard icon={Users} label="Total Users" value={stats?.total_users ?? "—"} sub={`${stats?.active_users_30d ?? 0} active (30d)`} color="blue" />
        <StatCard icon={FileText} label="Documents" value={stats?.total_documents ?? "—"} color="green" />
        <StatCard icon={MessageSquare} label="Chats" value={stats?.total_chats ?? "—"} color="violet" />
        <StatCard icon={TrendingUp} label="Tokens Used" value={stats?.total_tokens_used ? `${(stats.total_tokens_used / 1000).toFixed(0)}k` : "—"} color="amber" />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <div className="flex gap-6">
          {(["overview", "users"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" /> System Health
            </h3>
            <div className="space-y-3">
              {[
                { label: "API", value: "Operational", ok: true },
                { label: "Database", value: "Healthy", ok: true },
                { label: "Redis / Celery", value: "Running", ok: true },
                { label: "S3 Storage", value: "Operational", ok: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{item.label}</span>
                  <span className={`text-sm font-medium flex items-center gap-1.5 ${item.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                    <span className={`w-2 h-2 rounded-full ${item.ok ? "bg-green-500" : "bg-red-500"}`} />
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" /> Usage Summary
            </h3>
            <div className="space-y-3">
              {[
                { label: "Workspaces", value: stats?.total_workspaces ?? "—" },
                { label: "New Users (7d)", value: stats?.new_users_7d ?? "—" },
                { label: "Total Tokens Used", value: stats?.total_tokens_used ? `${(stats.total_tokens_used / 1000).toFixed(0)}k` : "—" },
                { label: "Revenue MTD", value: stats?.revenue_mtd ? `$${stats.revenue_mtd.toLocaleString()}` : "—" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{item.label}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-400">No users found</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">{u.full_name || "—"}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${u.is_active ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                        {!u.is_verified && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" /> Unverified
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-500 text-xs">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => handleToggleUser(u.id, u.is_active)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                          u.is_active
                            ? "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                            : "border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950"
                        }`}
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
