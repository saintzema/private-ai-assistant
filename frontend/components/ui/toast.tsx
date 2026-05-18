"use client";

import * as React from "react";
import { useEffect } from "react";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, removeToast } from "@/hooks/use-toast";
import type { ToastMessage } from "@/types";

const toastIcons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const toastStyles = {
  success: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950",
  error: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
  warning: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
  info: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
};

const iconStyles = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

function ToastItem({ toast }: { toast: ToastMessage }) {
  const Icon = toastIcons[toast.type];

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-4 shadow-lg transition-all duration-300 animate-fade-in-up",
        toastStyles[toast.type]
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconStyles[toast.type])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 rounded-sm opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts, subscribe } = useToastStore();

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  return (
    <div className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:max-w-[420px]">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
