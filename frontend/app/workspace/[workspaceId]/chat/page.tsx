'use client';

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { MessageSquare, Plus, Lightbulb, Clock, BookOpen, Zap } from "lucide-react";
import { chatsApi } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { ChatList } from "@/components/chat/chat-list";
import { formatRelativeTime } from "@/lib/utils";
import type { Chat } from "@/types";

const TIPS = [
  { icon: Lightbulb, text: "Ask questions in natural language — 'What is our refund policy?'" },
  { icon: BookOpen, text: "Reference documents directly — 'Summarize the Q3 report'" },
  { icon: Zap, text: "Get cited answers — sources are shown below each AI response" },
  { icon: Clock, text: "Your chat history is saved automatically for future reference" },
];

export default function ChatListPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const loadChats = async () => {
      try {
        const data = await chatsApi.list(workspaceId);
        setChats(data);
      } catch (err) {
        console.error("Failed to load chats:", err);
      } finally {
        setIsLoading(false);
      }
    };
    if (workspaceId) loadChats();
  }, [workspaceId]);

  const handleNewChat = async () => {
    setIsCreating(true);
    try {
      const chat = await chatsApi.create({ workspace_id: workspaceId });
      router.push(`/workspace/${workspaceId}/chat/${chat.id}`);
    } catch (err) {
      toast.error("Failed to create chat", "Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await chatsApi.delete(workspaceId, chatId);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
    } catch {
      toast.error("Failed to delete chat");
    }
  };

  return (
    <div className="flex h-full">
      {/* Chat list sidebar */}
      <div className="w-72 border-r border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={handleNewChat}
            disabled={isCreating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {isCreating ? "Creating..." : "New Chat"}
          </button>
        </div>
        <ChatList
          chats={chats}
          activeChatId={null}
          workspaceId={workspaceId}
          isLoading={isLoading}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
        />
      </div>

      {/* Welcome panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-lg w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-600/25">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            {currentWorkspace?.name ?? "Workspace"} Knowledge Base
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8">
            Ask questions about your uploaded documents. The AI will search through your knowledge base and provide accurate, cited answers.
          </p>

          <button
            onClick={handleNewChat}
            disabled={isCreating}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors mb-10 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Start a new conversation
          </button>

          {/* Tips grid */}
          <div className="grid grid-cols-2 gap-3 text-left">
            {TIPS.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
