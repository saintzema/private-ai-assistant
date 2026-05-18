'use client';

import { useState } from "react";
import Link from "next/link";
import { Brain, Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import { authApi } from "@/lib/api";

function PasswordStrengthBar({ password }: { password: string }) {
  const checks = [
    { label: "8+ chars", ok: password.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /\d/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const widths = ["w-1/3", "w-2/3", "w-full"];
  const colors = ["bg-red-500", "bg-yellow-500", "bg-green-500"];
  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${widths[score - 1] ?? "w-0"} ${colors[score - 1] ?? ""}`} />
      </div>
      <div className="flex gap-3 mt-1">
        {checks.map((c) => (
          <span key={c.label} className={`text-xs ${c.ok ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
            {c.ok ? "✓" : "○"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError("Passwords do not match"); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setIsLoading(true);
    try {
      await authApi.register({ email: form.email, password: form.password, full_name: form.full_name });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "detail" in err
        ? (err as { detail: string }).detail
        : "Registration failed. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-9 h-9 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Check your email</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">We sent a verification link to <strong>{form.email}</strong>. Click it to activate your account.</p>
        <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 font-medium hover:underline">Back to sign in</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mb-3">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create your account</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Start your 14-day free trial</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm">{error}</div>
            )}

            {[{ id: "full_name", label: "Full name", type: "text", placeholder: "Jane Smith", auto: "name" },
              { id: "email", label: "Work email", type: "email", placeholder: "jane@company.com", auto: "email" }
            ].map(f => (
              <div key={f.id}>
                <label htmlFor={f.id} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{f.label}</label>
                <input id={f.id} type={f.type} value={form[f.id as keyof typeof form]} onChange={handleChange(f.id)}
                  required autoComplete={f.auto} placeholder={f.placeholder}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" />
              </div>
            ))}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input id="password" type={showPw ? "text" : "password"} value={form.password}
                  onChange={handleChange("password")} required autoComplete="new-password" placeholder="Min. 8 characters"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Confirm password</label>
              <input id="confirm" type="password" value={form.confirm} onChange={handleChange("confirm")}
                required placeholder="Repeat password"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" />
            </div>

            <button type="submit" disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-all disabled:opacity-50 mt-2">
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Creating account...</> : "Create account"}
            </button>

            <p className="text-xs text-center text-slate-500 dark:text-slate-400">
              By signing up you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        </div>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400 mt-6">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
