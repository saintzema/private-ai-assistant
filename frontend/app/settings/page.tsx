'use client';

import { useState, useEffect } from "react";
import { User, Key, Shield, Trash2, Eye, EyeOff, Plus, Copy, Check } from "lucide-react";
import { usersApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { ApiKey } from "@/types";

export default function SettingsPage() {
  const { user, updateUser } = useAuth();

  // Profile state
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name);
    loadApiKeys();
  }, [user]);

  const loadApiKeys = async () => {
    try {
      const keys = await usersApi.getApiKeys();
      setApiKeys(keys);
    } catch {
      // non-critical
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg("");
    try {
      const updated = await usersApi.updateProfile({ full_name: fullName });
      updateUser(updated);
      setProfileMsg("Profile updated successfully.");
    } catch {
      setProfileMsg("Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg("Password must be at least 8 characters.");
      return;
    }
    setPasswordSaving(true);
    setPasswordMsg("");
    try {
      await usersApi.changePassword(currentPassword, newPassword);
      setPasswordMsg("Password changed successfully.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch {
      setPasswordMsg("Failed to change password. Check your current password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const result = await usersApi.createApiKey({ name: newKeyName });
      setNewKeyValue(result.key);
      setApiKeys((prev) => [...prev, result]);
      setNewKeyName("");
    } catch {
      // handle
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    try {
      await usersApi.deleteApiKey(keyId);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch {
      // handle
    }
  };

  const copyKey = () => {
    if (newKeyValue) {
      navigator.clipboard.writeText(newKeyValue);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Account Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your profile, security, and API access.</p>
      </div>

      {/* Profile */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Profile</h2>
            <p className="text-xs text-slate-500">Your public display information</p>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
            <input
              value={user?.email || ""}
              disabled
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-sm cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">Email cannot be changed.</p>
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.includes("success") ? "text-green-600" : "text-red-500"}`}>{profileMsg}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileSaving}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {profileSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </section>

      {/* Password */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Password & Security</h2>
            <p className="text-xs text-slate-500">Update your password</p>
          </div>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Current Password</label>
            <input
              type={showCurrentPw ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600">
              {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">New Password</label>
              <input
                type={showNewPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2.5 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600">
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {passwordMsg && (
            <p className={`text-sm ${passwordMsg.includes("success") ? "text-green-600" : "text-red-500"}`}>{passwordMsg}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={passwordSaving}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {passwordSaving ? "Changing…" : "Change Password"}
            </button>
          </div>
        </form>
      </section>

      {/* API Keys */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
            <Key className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">API Keys</h2>
            <p className="text-xs text-slate-500">Manage programmatic access to your account</p>
          </div>
        </div>

        {/* New key banner */}
        {newKeyValue && (
          <div className="mb-5 p-4 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
            <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-2">
              ✓ API key created. Copy it now — it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-green-200 dark:border-green-700 truncate text-slate-700 dark:text-slate-300">
                {newKeyValue}
              </code>
              <button onClick={copyKey} className="p-2 rounded-lg border border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900 transition-colors">
                {copiedKey ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-green-600" />}
              </button>
            </div>
          </div>
        )}

        {/* Create key form */}
        <form onSubmit={handleCreateKey} className="flex gap-3 mb-5">
          <input
            placeholder="Key name (e.g. Production CI)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={creatingKey || !newKeyName.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {creatingKey ? "Creating…" : "Create Key"}
          </button>
        </form>

        {/* Key list */}
        {apiKeys.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No API keys yet.</p>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{key.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{key.key_prefix}…</p>
                </div>
                <button
                  onClick={() => handleRevokeKey(key.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                  title="Revoke key"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
