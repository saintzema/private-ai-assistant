'use client';

import { useState } from "react";
import { Brain, User, Copy, Check, ChevronDown, ChevronUp, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, Source } from "@/types";

interface Props {
  message: Message;
  isStreaming?: boolean;
  sources?: Source[];
}

export default function MessageBubble({ message, isStreaming, sources }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) return (
    <div className="flex justify-end">
      <div className="max-w-[80%] lg:max-w-[65%]">
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {message.content}
        </div>
        <p className="text-xs text-slate-400 mt-1 text-right">
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex gap-3 group">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mt-1">
        <Brain className="w-4 h-4 text-white" />
      </div>

      <div className="flex-1 min-w-0 max-w-[85%]">
        {/* Content */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 relative">
          {message.content ? (
            <div className="prose-ai">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : isStreaming ? (
            <div className="flex items-center gap-1.5 h-5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : null}

          {isStreaming && message.content && (
            <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 -mb-0.5" />
          )}

          {/* Copy button */}
          {!isStreaming && message.content && (
            <button onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            </button>
          )}
        </div>

        {/* Sources */}
        {sources && sources.length > 0 && !isStreaming && (
          <div className="mt-2">
            <button onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              <FileText className="w-3.5 h-3.5" />
              {sources.length} source{sources.length !== 1 ? "s" : ""}
              {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showSources && (
              <div className="mt-2 space-y-2">
                {sources.map((s, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{s.document_name}</span>
                      <span className="text-xs text-slate-400 ml-auto flex-shrink-0">
                        {Math.round((s.relevance_score ?? (s as any).score ?? 0) * 100)}% match
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {(s as any).excerpt ?? s.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400 mt-1">
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
