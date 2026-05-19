"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  FileText,
  Users,
  Settings,
  Plus,
  ArrowLeft,
  Hexagon,
  Trash2,
  ChevronsUpDown,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, formatRelativeTime, truncate } from "@/lib/utils";
import { chatsApi, workspacesApi } from "@/lib/api";
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

  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => workspacesApi.list(),
  });

  const { data: chats, isLoading: chatsLoading } = useQuery({
    queryKey: ["chats", workspaceId],
    queryFn: () => chatsApi.list(workspaceId),
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setIsSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      {/* Header / Workspace Switcher */}
      <div className="relative border-b border-sidebar-border px-3 py-3" ref={switcherRef}>
        <button
          onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-sidebar-hover transition-colors text-left group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 shrink-0 shadow-md">
              <Hexagon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider leading-none">Workspace</p>
              <p className="text-sm font-semibold text-white truncate mt-0.5 leading-tight">{workspaceName}</p>
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-slate-500 group-hover:text-slate-300 shrink-0 ml-2" />
        </button>

        {isSwitcherOpen && (
          <div className="absolute left-3 right-3 top-[56px] z-50 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden py-1.5 animate-fade-in text-slate-900 dark:text-white">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Switch Workspace
            </div>
            
            <div className="max-h-60 overflow-y-auto px-1">
              {workspaces?.map((w) => {
                const isCurrent = w.id === workspaceId;
                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      setIsSwitcherOpen(false);
                      router.push(`/workspace/${w.id}/chat`);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-sm text-left transition-colors",
                      isCurrent
                        ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    )}
                  >
                    <span className="truncate">{w.name}</span>
                    {isCurrent && (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0 ml-1.5" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800/80 my-1.5" />
            
            <div className="px-1">
              <Link
                href="/dashboard"
                onClick={() => setIsSwitcherOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}
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
