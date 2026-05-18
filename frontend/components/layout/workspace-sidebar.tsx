"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  FileText,
  Users,
  Settings,
  Plus,
  ArrowLeft,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, formatRelativeTime, truncate } from "@/lib/utils";
import { chatsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { Chat } from "@/types";

interface WorkspaceSidebarProps {
  workspaceId: string;
  workspaceName: string;
}

const workspaceNavItems = (workspaceId: string) => [
  {
    label: "Chat",
    href: `/workspace/${workspaceId}/chat`,
    icon: MessageSquare,
  },
  {
    label: "Documents",
    href: `/workspace/${workspaceId}/documents`,
    icon: FileText,
  },
  {
    label: "Members",
    href: `/workspace/${workspaceId}/members`,
    icon: Users,
  },
  {
    label: "Settings",
    href: `/workspace/${workspaceId}/settings`,
    icon: Settings,
  },
];

export function WorkspaceSidebar({ workspaceId, workspaceName }: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: chats, isLoading: chatsLoading } = useQuery({
    queryKey: ["chats", workspaceId],
    queryFn: () => chatsApi.list(workspaceId),
  });

  const createChatMutation = useMutation({
    mutationFn: () => chatsApi.create({ workspace_id: workspaceId }),
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ["chats", workspaceId] });
      router.push(`/workspace/${workspaceId}/chat/${chat.id}`);
    },
    onError: () => {
      toast.error("Failed to create chat");
    },
  });

  const deleteChatMutation = useMutation({
    mutationFn: (chatId: string) => chatsApi.delete(workspaceId, chatId),
    onSuccess: (_, chatId) => {
      queryClient.invalidateQueries({ queryKey: ["chats", workspaceId] });
      if (pathname.includes(chatId)) {
        router.push(`/workspace/${workspaceId}/chat`);
      }
    },
    onError: () => {
      toast.error("Failed to delete chat");
    },
  });

  const navItems = workspaceNavItems(workspaceId);

  return (
    <aside className="flex w-64 flex-col border-r bg-sidebar-bg text-sidebar-text">
      {/* Header */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 shrink-0">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white truncate">{workspaceName}</span>
      </div>

      {/* Navigation */}
      <nav className="space-y-0.5 p-2 pt-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href.includes("/chat") && pathname.includes("/chat"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-active text-white font-medium"
                  : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Chat list */}
      {pathname.includes("/chat") && (
        <div className="flex-1 flex flex-col min-h-0 mt-2">
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Conversations
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => createChatMutation.mutate()}
              loading={createChatMutation.isPending}
              className="h-6 w-6 text-slate-500 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-0.5 px-2 pb-4">
              {chatsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 rounded-md bg-slate-800" />
                ))
              ) : chats && chats.length > 0 ? (
                chats.map((chat: Chat) => {
                  const isActive = pathname.includes(chat.id);
                  return (
                    <div
                      key={chat.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors",
                        isActive
                          ? "bg-sidebar-hover text-sidebar-text-active"
                          : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
                      )}
                      onClick={() =>
                        router.push(`/workspace/${workspaceId}/chat/${chat.id}`)
                      }
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {truncate(chat.title || "New conversation", 28)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {chat.last_message_at
                            ? formatRelativeTime(chat.last_message_at)
                            : "Just now"}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChatMutation.mutate(chat.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="text-[11px] text-slate-500 px-2 py-4 text-center">
                  No conversations yet
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Back to dashboard */}
      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>
      </div>
    </aside>
  );
}
