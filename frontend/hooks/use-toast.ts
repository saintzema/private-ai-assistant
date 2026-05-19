"use client";

import { useState, useCallback, useMemo } from "react";
import type { ToastMessage } from "@/types";

let toastCounter = 0;

function generateId(): string {
  return `toast-${++toastCounter}-${Date.now()}`;
}

// Singleton store for toast state (simple pub/sub)
type ToastListener = (toasts: ToastMessage[]) => void;
let toasts: ToastMessage[] = [];
const listeners: Set<ToastListener> = new Set();

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

export function addToast(toast: Omit<ToastMessage, "id">): string {
  const id = generateId();
  const newToast: ToastMessage = { id, duration: 4000, ...toast };
  toasts = [...toasts, newToast];
  notify();

  // Auto-remove
  setTimeout(() => {
    removeToast(id);
  }, newToast.duration ?? 4000);

  return id;
}

export function removeToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function useToastStore() {
  const [state, setState] = useState<ToastMessage[]>(toasts);

  const subscribe = useCallback(() => {
    const listener: ToastListener = (updated) => setState(updated);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return { toasts: state, subscribe };
}

export function useToast() {
  const toast = useMemo(() => ({
    success: (title: string, description?: string) =>
      addToast({ type: "success", title, description }),
    error: (title: string, description?: string) =>
      addToast({ type: "error", title, description, duration: 6000 }),
    warning: (title: string, description?: string) =>
      addToast({ type: "warning", title, description }),
    info: (title: string, description?: string) =>
      addToast({ type: "info", title, description }),
    dismiss: (id: string) => removeToast(id),
  }), []);

  return { toast };
}
