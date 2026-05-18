'use client';

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Upload, FileText, HardDrive } from "lucide-react";
import { documentsApi } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUpload } from "@/components/documents/document-upload";
import { formatBytes, formatPercent } from "@/lib/utils";
import type { Document, PaginatedResponse } from "@/types";

export default function DocumentsPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  const [showUpload, setShowUpload] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await documentsApi.list(workspaceId, {
        page,
        page_size: 10,
        search: search || undefined,
      });
      setDocuments(data.items);
      setTotalCount(data.total);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, page, search, toast]);

  useEffect(() => {
    if (workspaceId) loadDocuments();
  }, [loadDocuments, workspaceId]);

  const handleUploadComplete = () => {
    setShowUpload(false);
    loadDocuments();
    toast.success("Upload complete", "Your documents are being processed.");
  };

  const handleDelete = async (documentId: string) => {
    try {
      await documentsApi.delete(workspaceId, documentId);
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      setTotalCount((prev) => prev - 1);
      toast.success("Document deleted");
    } catch {
      toast.error("Failed to delete document");
    }
  };

  const handleReprocess = async (documentId: string) => {
    try {
      const updated = await documentsApi.reprocess(workspaceId, documentId);
      setDocuments((prev) => prev.map((d) => (d.id === documentId ? updated : d)));
      toast.success("Reprocessing started");
    } catch {
      toast.error("Failed to reprocess document");
    }
  };

  const storageUsed = currentWorkspace?.storage_used_bytes ?? 0;
  const storageLimit = currentWorkspace?.storage_limit_bytes ?? 1;
  const storagePercent = formatPercent(storageUsed, storageLimit);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Documents</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {totalCount} document{totalCount !== 1 ? "s" : ""} in this workspace
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload documents
        </button>
      </div>

      {/* Storage bar */}
      {currentWorkspace && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <HardDrive className="w-4 h-4" />
              Storage usage
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {formatBytes(storageUsed)} / {formatBytes(storageLimit)}
            </span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                storagePercent > 90
                  ? "bg-red-500"
                  : storagePercent > 70
                  ? "bg-yellow-500"
                  : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(storagePercent, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">{storagePercent}% used</p>
        </div>
      )}

      {/* Document list */}
      <DocumentList
        workspaceId={workspaceId}
        documents={documents}
        totalCount={totalCount}
        isLoading={isLoading}
        page={page}
        pageSize={10}
        search={search}
        onSearchChange={(s) => { setSearch(s); setPage(1); }}
        onPageChange={setPage}
        onDelete={handleDelete}
        onReprocess={handleReprocess}
        onUpload={() => setShowUpload(true)}
      />

      {/* Upload dialog */}
      {showUpload && (
        <DocumentUpload
          workspaceId={workspaceId}
          onClose={() => setShowUpload(false)}
          onComplete={handleUploadComplete}
        />
      )}
    </div>
  );
}
