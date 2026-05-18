'use client';

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Brain, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "no-token">(
    token ? "loading" : "no-token"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        await authApi.verifyEmail(token);
        setStatus("success");
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Email verification failed. The link may have expired.";
        setError(msg);
        setStatus("error");
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/20">
            <Brain className="w-7 h-7 text-white" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-8 text-center">
          {status === "loading" && (
            <>
              <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center mx-auto mb-5">
                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Verifying your email
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Please wait while we verify your email address...
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-9 h-9 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Email verified!
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Your email has been successfully verified. You can now sign in to your account.
              </p>
              <Link
                href="/auth/login"
                className="inline-flex items-center px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors"
              >
                Sign in to your account
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-9 h-9 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Verification failed
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                {error || "This verification link is invalid or has expired."}
              </p>
              <div className="flex flex-col gap-3">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors"
                >
                  Back to sign in
                </Link>
                <p className="text-xs text-slate-400">
                  Need help?{" "}
                  <a href="mailto:support@privateai.example.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Contact support
                  </a>
                </p>
              </div>
            </>
          )}

          {status === "no-token" && (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-9 h-9 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                No verification token
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Please click the verification link from your email. If you didn&apos;t receive an email, try registering again.
              </p>
              <div className="flex flex-col gap-3">
                <Link
                  href="/auth/register"
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors"
                >
                  Register again
                </Link>
                <Link href="/auth/login" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  Already have an account? Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
