'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      // If store says not authenticated, but we have a token, try to recover
      if (!isLoading && !isAuthenticated) {
        const { getToken } = await import("@/lib/auth");
        const token = getToken();
        if (token) {
          try {
            await authApi.refreshToken(token); // Or just fetchMe if you want to modify useAuth
            // Actually, we can just use set({isAuthenticated: true}) in the store, but we can't access set here.
            // Let's just force a reload so the client state syncs or redirect to a recovery route.
            // Better: if we have a token, let's call usersApi.getMe() and update the store!
            const { usersApi } = await import("@/lib/api");
            const user = await usersApi.getMe();
            useAuth.setState({ user, isAuthenticated: true, isLoading: false });
            return;
          } catch {
            // Token recovery failed
          }
        }
        router.replace("/auth/login?redirect=/dashboard");
      }
    };
    checkAuth();
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const handleResend = async () => {
    if (!user?.email) return;
    setResending(true);
    setResendMessage("");
    try {
      await authApi.resendVerification({ email: user.email });
      setResendMessage("Verification email sent!");
    } catch {
      setResendMessage("Failed to send email. Try again later.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        
        {/* Unverified Banner */}
        {user && !user.is_verified && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border-b border-yellow-200 dark:border-yellow-800 p-3 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <Mail className="w-4 h-4" />
              <span>Please verify your email address to access all features.</span>
            </div>
            <button 
              onClick={handleResend}
              disabled={resending}
              className="px-3 py-1 bg-yellow-200 hover:bg-yellow-300 dark:bg-yellow-800 dark:hover:bg-yellow-700 text-yellow-900 dark:text-yellow-100 rounded-md font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {resending && <Loader2 className="w-3 h-3 animate-spin" />}
              {resendMessage || "Resend email"}
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
