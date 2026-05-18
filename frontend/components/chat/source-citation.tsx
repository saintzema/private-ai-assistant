'use client';

import { useState } from "react";
import { FileText, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { Source } from "@/types";

interface SourceCitationProps {
  sources: Source[];
  defaultOpen?: boolean;
}

export function SourceCitation({ sources, defaultOpen = true }: SourceCitationProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors w-full text-left"
      >
        <FileText className="w-3.5 h-3.5" />
        <span className="font-medium">{sources.length} source{sources.length !== 1 ? "s" : ""}</span>
        {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {sources.map((source, i) => {
            const score = Math.round((source.relevance_score ?? 0) * 100);
            return (
              <div
                key={`${source.document_id}-${i}`}
                className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-3 group"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                      {source.document_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {source.page_number && (
                      <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        p.{source.page_number}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        score >= 80
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : score >= 60
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {score}% match
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                  {source.content}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Default export for compatibility
export default SourceCitation;
