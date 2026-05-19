'use client';

import { useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  Trash2,
  RefreshCw,
  Download,
  Search,
  Upload,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
} from "lucide-react";
import { formatBytes, formatDate, formatRelativeTime, cn } from "@/lib/utils";
import type { Document } from "@/types";
import { DocumentStatus, FileType } from "@/types";

interface DocumentListProps {
  workspaceId: string;
  documents: Document[];
  totalCount: number;
  isLoading: boolean;
  page: number;
  pageSize: number;
  search: string;
  onSearchChange: (s: string) => void;
  onPageChange: (p: number) => void;
  onDelete: (id: string) => void;
  onReprocess: (id: string) => void;
  onUpload: () => void;
}

const STATUS_CONFIG: Record<DocumentStatus, { label: string; icon: React.ElementType; className: string }> = {
  [DocumentStatus.Pending]: {
    label: "Pending",
    icon: Clock,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  },
  [DocumentStatus.Processing]: {
    label: "Processing",
    icon: Loader2,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  },
  [DocumentStatus.Ready]: {
    label: "Ready",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  },
  [DocumentStatus.Failed]: {
    label: "Failed",
    icon: AlertCircle,
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  },
};

const FILE_ICONS: Record<string, React.ElementType> = {
  pdf: FileText,
  docx: FileText,
  txt: FileText,
  md: FileText,
  csv: FileSpreadsheet,
  xlsx: FileSpreadsheet,
};

function FileIcon({ fileType }: { fileType: string }) {
  const Icon = FILE_ICONS[fileType.toLowerCase()] ?? FileText;
  return <Icon className="w-4 h-4" />;
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG[DocumentStatus.Pending];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${config.className}`}>
      <Icon className={cn("w-3 h-3", status === DocumentStatus.Processing && "animate-spin")} />
      {config.label}
    </span>
  );
}

export function DocumentList({
  workspaceId,
  documents,
  totalCount,
  isLoading,
  page,
  pageSize,
  search,
  onSearchChange,
  onPageChange,
  onDelete,
  onReprocess,
  onUpload,
}: DocumentListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const totalPages = Math.ceil(totalCount / pageSize);

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    try {
      await onDelete(doc.id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleReprocess = async (doc: Document) => {
    setReprocessingId(doc.id);
    try {
      await onReprocess(doc.id);
    } finally {
      setReprocessingId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
      {/* Search bar */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
            {search ? "No documents match your search" : "No documents yet"}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs">
            {search
              ? "Try a different search term"
              : "Upload your first document to start building your knowledge base."}
          </p>
          {!search && (
            <button
              onClick={onUpload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload documents
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Header row */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] gap-4 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            {["Name", "Type", "Size", "Status", "Uploaded", ""].map((h) => (
              <div key={h} className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {h}
              </div>
            ))}
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                {/* Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <FileIcon fileType={doc.file_type} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{doc.name}</p>
                    {doc.error_message && (
                      <p className="text-xs text-red-500 truncate">{doc.error_message}</p>
                    )}
                    {doc.chunk_count > 0 && (
                      <p className="text-xs text-slate-400">{doc.chunk_count} chunks</p>
                    )}
                  </div>
                </div>

                {/* Type */}
                <div className="hidden md:block">
                  <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400 uppercase">
                    {doc.file_type}
                  </span>
                </div>

                {/* Size */}
                <div className="hidden md:block text-sm text-slate-500 dark:text-slate-400">
                  {formatBytes(doc.file_size)}
                </div>

                {/* Status */}
                <div className="hidden md:block">
                  <StatusBadge status={doc.status} />
                </div>

                {/* Uploaded */}
                <div className="hidden md:block text-xs text-slate-400">
                  {formatRelativeTime(doc.created_at)}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 ml-auto md:ml-0">
                  {doc.status === DocumentStatus.Failed && (
                    <button
                      onClick={() => handleReprocess(doc)}
                      disabled={reprocessingId === doc.id}
                      title="Reprocess"
                      className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors disabled:opacity-40"
                    >
                      {reprocessingId === doc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  {doc.download_url && (
                    <a
                      href={doc.download_url}
                      download
                      title="Download"
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.id}
                    title="Delete"
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800">
          <span className="text-sm text-slate-500">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentList;
