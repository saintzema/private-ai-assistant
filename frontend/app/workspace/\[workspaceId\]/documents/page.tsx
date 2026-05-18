'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Upload, FileText } from "lucide-react";
import { documentsApi } from "@/lib/api";
import DocumentUpload from "@/components/documents/document-upload";
import DocumentList from "@/components/documents/document-list";
import type { Document } from "@/types";

export default function DocumentsPage() {
  const params = useParams();
  const workspaceId = params?.workspaceId as string;
  const [docs, setDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const loadDocs = async () => {
    try {
      const res = await documentsApi.list(workspaceId);
      setDocs(res.items ?? []);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { if (workspaceId) loadDocs(); }, [workspaceId]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Documents</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{docs.length} document{docs.length !== 1 ? "s" : ""} in this workspace</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors">
          <Upload className="w-4 h-4" /> Upload Documents
        </button>
      </div>

      {showUpload && (
        <div className="mb-6">
          <DocumentUpload workspaceId={workspaceId} onUploaded={doc => { setDocs(p => [doc, ...p]); setShowUpload(false); }} onClose={() => setShowUpload(false)} />
        </div>
      )}

      <DocumentList documents={docs} isLoading={isLoading} workspaceId={workspaceId}
        onDelete={id => setDocs(p => p.filter(d => d.id !== id))} />
    </div>
  );
}
