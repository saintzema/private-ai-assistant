'use client';

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Brain, CheckCircle, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { marketplaceApi } from "@/lib/api";

function MarketplaceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("x-amzn-marketplace-token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "no-token">(
    token ? "loading" : "no-token"
  );
  const [customerData, setCustomerData] = useState<{ customer_id: string; product_code: string } | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!token) return;

    const validate = async () => {
      try {
        const data = await marketplaceApi.resolveToken(token);
        setCustomerData(data);
        setStatus("success");
        // Redirect to registration with marketplace context after short delay
        setTimeout(() => {
          router.push(`/auth/register?marketplace=true&customer_id=${data.customer_id}`);
        }, 3000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Token validation failed";
        setError(msg);
        setStatus("error");
      }
    };

    validate();
  }, [token, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-white">PrivateAI</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
          {status === "loading" && (
            <>
              <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center mx-auto mb-5">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Validating Marketplace Token</h1>
              <p className="text-sm text-slate-500">Connecting your AWS Marketplace subscription…</p>
            </>
          )}

          {status === "success" && customerData && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-950 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Subscription Verified!</h1>
              <p className="text-sm text-slate-500 mb-6">
                Your AWS Marketplace subscription has been confirmed. Redirecting you to create your account…
              </p>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-xs text-slate-500 font-mono text-left mb-4">
                <div>Customer ID: {customerData.customer_id.slice(0, 8)}…</div>
                <div>Product: {customerData.product_code}</div>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Redirecting to registration…
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Validation Failed</h1>
              <p className="text-sm text-slate-500 mb-4">{error || "Unable to validate your AWS Marketplace token."}</p>
              <p className="text-xs text-slate-400 mb-6">
                This can happen if the token has expired (tokens are valid for 90 minutes) or if you&apos;ve already registered.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="https://aws.amazon.com/marketplace"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Return to AWS Marketplace
                </a>
                <a
                  href="/auth/login"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Already have an account? Sign in
                </a>
              </div>
            </>
          )}

          {status === "no-token" && (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-8 h-8 text-amber-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Marketplace Token</h1>
              <p className="text-sm text-slate-500 mb-6">
                This page is for AWS Marketplace subscribers. Please subscribe via AWS Marketplace to continue, or create a direct account below.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="https://aws.amazon.com/marketplace"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Subscribe on AWS Marketplace <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="/auth/register"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Create a direct account instead
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    }>
      <MarketplaceContent />
    </Suspense>
  );
}
