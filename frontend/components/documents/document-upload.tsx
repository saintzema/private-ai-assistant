"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, formatBytes, getFileExtension } from "@/lib/utils";
import { documentsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UploadProgress } from "@/types";

const ALLOWED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "text/markdown": [".md"],
  "application/vnd.ms-excel": [".xlsx"],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface DocumentUploadProps {
  workspaceId: string;
  onUploadComplete?: () => void;
  onClose?: () => void;
}

import type { FileRejection } from "react-dropzone";

export function DocumentUpload({ workspaceId, onUploadComplete, onClose }: DocumentUploadProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [pastedText, setPastedText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleUploadPastedText = async () => {
    if (!pastedText.trim()) return;
    
    // Create a File from the text
    const blob = new Blob([pastedText], { type: 'text/plain' });
    const file = new File([blob], `pasted_text_${Date.now()}.txt`, { type: 'text/plain' });
    
    // Add to upload queue and start upload
    const newUpload: UploadProgress = {
      file,
      progress: 0,
      status: "pending",
    };
    setUploads((prev) => [...prev, newUpload]);
    
    setPastedText(""); // Clear textarea
    await uploadFile(file);
  };

  const updateUpload = (file: File, update: Partial<UploadProgress>) => {
    setUploads((prev) =>
      prev.map((u) => (u.file === file ? { ...u, ...update } : u))
    );
  };

  const uploadFile = async (file: File) => {
    updateUpload(file, { status: "uploading", progress: 0 });

    try {
      await documentsApi.upload(workspaceId, file, (progress) => {
        updateUpload(file, { progress });
      });
      updateUpload(file, { status: "complete", progress: 100 });
      queryClient.invalidateQueries({ queryKey: ["documents", workspaceId] });
      onUploadComplete?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      updateUpload(file, { status: "error", error: msg });
      toast.error(`Failed to upload ${file.name}`, msg);
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // Show rejection errors
      rejectedFiles.forEach(({ file, errors }) => {
        toast.error(
          `Cannot upload "${file.name}"`,
          errors.map((e) => e.message).join(", ")
        );
      });

      if (acceptedFiles.length === 0) return;

      // Add to upload queue
      const newUploads: UploadProgress[] = acceptedFiles.map((file) => ({
        file,
        progress: 0,
        status: "pending",
      }));
      setUploads((prev) => [...prev, ...newUploads]);

      // Upload sequentially
      for (const file of acceptedFiles) {
        await uploadFile(file);
      }
    },
    [workspaceId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  const removeUpload = (file: File) => {
    setUploads((prev) => prev.filter((u) => u.file !== file));
  };

  const clearCompleted = () => {
    setUploads((prev) => prev.filter((u) => u.status !== "complete" && u.status !== "error"));
  };

  const hasCompleted = uploads.some((u) => u.status === "complete" || u.status === "error");

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer",
          isDragActive
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <input {...getInputProps()} />
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl mb-3 transition-colors",
            isDragActive ? "bg-primary/10" : "bg-muted"
          )}
        >
          <Upload
            className={cn(
              "h-6 w-6 transition-colors",
              isDragActive ? "text-primary" : "text-muted-foreground"
            )}
          />
        </div>
        <p className="text-sm font-medium">
          {isDragActive ? "Drop files here" : "Drag & drop files here"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          or click to browse
        </p>
        <p className="text-[10px] text-muted-foreground mt-3">
          Supports PDF, DOCX, TXT, CSV, MD • Max 50 MB per file
        </p>
      </div>

      {/* Upload list */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {uploads.length} file{uploads.length !== 1 ? "s" : ""}
            </p>
            {hasCompleted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompleted}
                className="h-6 text-xs"
              >
                Clear done
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {uploads.map((upload, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium truncate">{upload.file.name}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatBytes(upload.file.size)}
                    </span>
                  </div>
                  {upload.status === "uploading" && (
                    <Progress value={upload.progress} className="h-1 mt-1.5" />
                  )}
                  {upload.status === "error" && upload.error && (
                    <p className="text-[10px] text-destructive mt-0.5">{upload.error}</p>
                  )}
                </div>
                <div className="shrink-0">
                  {upload.status === "pending" && (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground opacity-40" />
                  )}
                  {upload.status === "uploading" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {upload.status === "complete" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                  {upload.status === "error" && (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                {(upload.status === "complete" || upload.status === "error") && (
                  <button
                    onClick={() => removeUpload(upload.file)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paste text section */}
      <div className="mt-6 border-t pt-6">
        <p className="text-sm font-medium mb-3 text-slate-700 dark:text-slate-300">Or paste text directly:</p>
        <div className="relative">
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste text here to train the AI..."
            className="w-full min-h-[120px] p-4 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y pb-16 transition-colors dark:text-slate-200"
          />
          <div className="absolute bottom-3 right-3 flex justify-end">
            <Button
              size="sm"
              disabled={!pastedText.trim()}
              onClick={handleUploadPastedText}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Upload Text
            </Button>
          </div>
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <Button onClick={onClose} variant="outline">
          Done
        </Button>
      </div>
    </div>
  );
}
