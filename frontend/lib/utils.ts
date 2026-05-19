import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import {
  FileText,
  FileSpreadsheet,
  FileType,
  File,
  type LucideIcon,
} from "lucide-react";
import { Plan } from "@/types";

// ─── Tailwind class merger ────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Bytes formatting ─────────────────────────────────────────────────────────

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// ─── Date formatting ──────────────────────────────────────────────────────────

export function formatDate(date?: string | Date | null): string {
  if (!date) return "Unknown";
  try {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, "MMM d, yyyy");
  } catch {
    return "Unknown";
  }
}

export function formatDateTime(date?: string | Date | null): string {
  if (!date) return "Unknown";
  try {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, "MMM d, yyyy h:mm a");
  } catch {
    return "Unknown";
  }
}

export function formatRelativeTime(date?: string | Date | null): string {
  if (!date) return "Unknown";
  try {
    const d = typeof date === "string" ? parseISO(date) : date;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

// ─── String utilities ─────────────────────────────────────────────────────────

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length)}...`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// ─── Avatar / initials ────────────────────────────────────────────────────────

export function generateAvatar(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];

export function getAvatarColor(name: string): string {
  const index = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// ─── File utilities ───────────────────────────────────────────────────────────

export function getFileIcon(fileType: string): LucideIcon {
  switch (fileType.toLowerCase()) {
    case "pdf":
      return FileText;
    case "docx":
    case "doc":
      return FileType;
    case "csv":
    case "xlsx":
    case "xls":
      return FileSpreadsheet;
    case "txt":
    case "md":
      return FileText;
    default:
      return File;
  }
}

export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedFileType(file: File): boolean {
  const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/csv", "application/vnd.ms-excel", "text/markdown"];
  return allowed.includes(file.type) || ["pdf", "docx", "txt", "csv", "xlsx", "md"].includes(getFileExtension(file.name));
}

// ─── Plan utilities ───────────────────────────────────────────────────────────

export function getPlanColor(plan: Plan): string {
  switch (plan) {
    case Plan.Free:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    case Plan.Pro:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case Plan.Enterprise:
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function getPlanLabel(plan: Plan): string {
  switch (plan) {
    case Plan.Free:
      return "Free";
    case Plan.Pro:
      return "Pro";
    case Plan.Enterprise:
      return "Enterprise";
    default:
      return "Unknown";
  }
}

// ─── Number formatting ────────────────────────────────────────────────────────

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

export function formatPercent(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

// ─── URL utilities ────────────────────────────────────────────────────────────

export function buildQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      qs.set(key, String(value));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

// ─── Copy to clipboard ────────────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ─── Error message extraction ─────────────────────────────────────────────────

export function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e.detail === "string") return e.detail;
    if (typeof e.message === "string") return e.message;
  }
  return "An unexpected error occurred";
}
