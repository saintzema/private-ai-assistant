'use client';

import { useRouter } from "next/navigation";
import { MessageSquare, Trash2 } from "lucide-react";
import type { Chat } from "@/types";

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  workspaceId: string;
  isLoading?: boolean;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
}

export function ChatList({ chats, activeChatId, workspaceId, onDeleteChat, isLoading }: Props) {
  const router = useRouter();

  const handleDelete = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;
    onDeleteChat?.(chatId);
  };

  if (chats.length === 0) return (
    <div className="p-4 text-center text-sm text-slate-400 py-8">
      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p>No conversations yet</p>
    </div>
  );

  const grouped: Record<string, Chat[]> = {};
  chats.forEach(c => {
    const d = new Date(c.updated_at ?? c.created_at);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
    const key = isToday ? "Today" : isYesterday ? "Yesterday" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  return (
    <div className="py-2">
      {Object.entries(grouped).map(([label, items]) => (
        <div key={label}>
          <p className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
          {items.map(chat => (
            <div key={chat.id} onClick={() => router.push(`/workspace/${workspaceId}/chat/${chat.id}`)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left group transition-colors cursor-pointer ${activeChatId === chat.id ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
              <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-60" />
              <span className="flex-1 text-sm truncate">{chat.title || "Untitled chat"}</span>
              <button onClick={(e) => handleDelete(e, chat.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-500 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
