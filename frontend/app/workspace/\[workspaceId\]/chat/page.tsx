'use client';

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { MessageSquare, Plus, Brain } from "lucide-react";
import { chatsApi } from "@/lib/api";
import ChatList from "@/components/chat/chat-list";
import type { Chat } from "@/types";

export default function ChatListPage() {
  const router = useRouter();
  const params = useParams();
  const workspaceId = params?.workspaceId as string;
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    chatsApi.list(workspaceId).then(setChats).catch(console.error).finally(() => setIsLoading(false));
  }, [workspaceId]);

  const handleNewChat = async () => {
    try {
      const chat = await chatsApi.create({ workspace_id: workspaceId, title: "New Chat" });
      router.push(`/workspace/${workspaceId}/chat/${chat.id}`);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-slate-200 dark:border-slate-800 h-full flex flex-col bg-white dark:bg-slate-900">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <button onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ChatList chats={chats} activeChatId={null} workspaceId={workspaceId}
            onNewChat={handleNewChat} onDelete={id => setChats(p => p.filter(c => c.id !== id))} />
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 rounded-2xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center mb-5">
          <Brain className="w-10 h-10 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Start a conversation</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">Ask questions about your documents, get cited answers, and explore your knowledge base with AI.</p>
        <button onClick={handleNewChat}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> New Chat
        </button>
      </div>
    </div>
  );
}
