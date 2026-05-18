'use client';

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { chatsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ChatInterface } from "@/components/chat/chat-interface";
import { ChatList } from "@/components/chat/chat-list";
import { Plus } from "lucide-react";
import type { Message, Chat } from "@/types";

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceId as string;
  const chatId = params.chatId as string;
  const { toast } = useToast();

  const [chats, setChats] = useState<Chat[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [chatList, messages] = await Promise.all([
          chatsApi.list(workspaceId),
          chatsApi.getMessages(workspaceId, chatId),
        ]);
        setChats(chatList);
        setInitialMessages(messages);
      } catch (err) {
        console.error("Failed to load chat data:", err);
        toast.error("Failed to load chat");
      } finally {
        setIsLoading(false);
      }
    };

    if (workspaceId && chatId) loadData();
  }, [workspaceId, chatId, toast]);

  const handleNewChat = async () => {
    setIsCreating(true);
    try {
      const chat = await chatsApi.create({ workspace_id: workspaceId });
      setChats((prev) => [chat, ...prev]);
      router.push(`/workspace/${workspaceId}/chat/${chat.id}`);
    } catch {
      toast.error("Failed to create chat");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await chatsApi.delete(workspaceId, id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (id === chatId) {
        router.push(`/workspace/${workspaceId}/chat`);
      }
    } catch {
      toast.error("Failed to delete chat");
    }
  };

  return (
    <div className="flex h-full">
      {/* Chat list sidebar */}
      <div className="w-72 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
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
          activeChatId={chatId}
          workspaceId={workspaceId}
          isLoading={isLoading && chats.length === 0}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
        />
      </div>

      {/* Chat interface */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ChatInterface
            chatId={chatId}
            workspaceId={workspaceId}
            initialMessages={initialMessages}
          />
        )}
      </div>
    </div>
  );
}
