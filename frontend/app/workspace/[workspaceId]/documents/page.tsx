'use client';

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Upload, FileText, HardDrive } from "lucide-react";
import { documentsApi } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUpload } from "@/components/documents/document-upload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBytes, formatPercent } from "@/lib/utils";
import { DocumentStatus } from "@/types";
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

  const loadDocuments = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await documentsApi.list(workspaceId, {
        page,
        page_size: 10,
        search: search || undefined,
      });
      setDocuments(data.items);
      setTotalCount(data.total);
    } catch {
      if (!silent) toast.error("Failed to load documents");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [workspaceId, page, search, toast]);

  useEffect(() => {
    if (workspaceId) loadDocuments();
  }, [loadDocuments, workspaceId]);

  useEffect(() => {
    const anyProcessing = documents.some(
      (d) => d.status === DocumentStatus.Pending || d.status === DocumentStatus.Processing
    );
    if (!anyProcessing) return;

    const interval = setInterval(() => {
      loadDocuments(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [documents, loadDocuments]);

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
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
          </DialogHeader>
          <DocumentUpload
            workspaceId={workspaceId}
            onClose={() => setShowUpload(false)}
            onUploadComplete={handleUploadComplete}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
