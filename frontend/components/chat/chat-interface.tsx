'use client';

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Loader2, StopCircle } from "lucide-react";
import { chatsApi } from "@/lib/api";
import MessageBubble from "./message-bubble";
import { MessageRole } from "@/types";
import type { Message, Source } from "@/types";

interface Props {
  chatId: string;
  workspaceId: string;
  initialMessages?: Message[];
}

interface StreamingMessage {
  id: string;
  role: MessageRole.Assistant;
  content: string;
  sources: Source[];
  isStreaming: boolean;
  created_at: string;
}

export function ChatInterface({ chatId, workspaceId, initialMessages = [] }: Props) {
  const [messages, setMessages] = useState<(Message | StreamingMessage)[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleStop = () => {
    abortRef.current?.();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages(prev => prev.map(m => "isStreaming" in m ? { ...m, isStreaming: false } : m));
  };

  const handleSend = async () => {
    const query = input.trim();
    if (!query || isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      chat_id: chatId,
      role: MessageRole.User,
      content: query,
      created_at: new Date().toISOString(),
    };

    const streamingMsg: StreamingMessage = {
      id: "streaming",
      role: MessageRole.Assistant,
      content: "",
      sources: [],
      isStreaming: true,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg, streamingMsg]);
    setInput("");
    setIsStreaming(true);

    const abort = chatsApi.streamMessage(
      workspaceId, chatId, query,
      (token) => {
        setMessages(prev => prev.map(m => m.id === "streaming" ? { ...m, content: (m as StreamingMessage).content + token } : m));
      },
      (sources) => {
        setMessages(prev => prev.map(m => m.id === "streaming" ? { ...m, sources: sources as Source[] } : m));
      },
      (messageId) => {
        setMessages(prev => prev.map(m => m.id === "streaming" ? { ...m, id: messageId ?? Date.now().toString(), isStreaming: false } : m));
        setIsStreaming(false);
        abortRef.current = null;
      },
      (err) => {
        setMessages(prev => prev.map(m => m.id === "streaming" ? { ...m, content: `Error: ${err}`, isStreaming: false } : m));
        setIsStreaming(false);
        abortRef.current = null;
      }
    );

    abortRef.current = abort;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mb-4">
              <Send className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Ask anything about your documents</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
              Type a question and I'll search your knowledge base for accurate, cited answers.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id + i} message={msg as Message}
            isStreaming={"isStreaming" in msg ? msg.isStreaming : false}
            sources={"sources" in msg ? msg.sources as Source[] : undefined} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your documents..."
                rows={1}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 resize-none text-sm transition-all"
              />
            </div>
            {isStreaming ? (
              <button onClick={handleStop}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-colors">
                <StopCircle className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim()}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            Press <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs">Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>
    </div>
  );
}
