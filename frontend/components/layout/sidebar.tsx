"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Building2,
  ChevronDown,
  Plus,
  Hexagon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { UserAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { Workspace } from "@/types";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Workspaces",
    href: "/dashboard",
    icon: Building2,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/auth/login");
  };

  const handleWorkspaceSwitch = async (workspace: Workspace) => {
    await switchWorkspace(workspace.id);
    router.push(`/workspace/${workspace.id}/chat`);
  };

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar-bg text-sidebar-text transition-all duration-300",
        collapsed ? "w-16" : "w-64",
        className
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        {!collapsed ? (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
              <Hexagon className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">Private AI</span>
          </Link>
        ) : (
          <Link href="/dashboard" className="flex items-center justify-center w-full">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
              <Hexagon className="h-4 w-4 text-white" />
            </div>
          </Link>
        )}
      </div>

      {/* Workspace switcher */}
      {!collapsed && (
        <div className="border-b border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active transition-colors">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-white text-xs font-bold shrink-0">
                  {currentWorkspace?.name?.charAt(0) ?? "W"}
                </div>
                <span className="flex-1 truncate text-left text-xs font-medium text-slate-300">
                  {currentWorkspace?.name ?? "Select workspace"}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-56 bg-slate-800 border-slate-700 text-slate-200"
              align="start"
            >
              {(Array.isArray(workspaces) ? workspaces : []).map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => handleWorkspaceSwitch(ws)}
                  className="hover:bg-slate-700 cursor-pointer"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-white text-xs font-bold mr-2">
                    {ws.name.charAt(0)}
                  </div>
                  <span className="truncate">{ws.name}</span>
                  {currentWorkspace?.id === ws.id && (
                    <Badge variant="info" className="ml-auto text-[10px] py-0">
                      Active
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-slate-700" />
              <DropdownMenuItem
                className="hover:bg-slate-700 cursor-pointer"
                onClick={() => router.push("/dashboard")}
              >
                <Plus className="h-4 w-4 mr-2" />
                New workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-2 pt-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          if (collapsed) {
            return (
              <Tooltip key={item.label} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex h-9 w-9 mx-auto items-center justify-center rounded-md transition-colors",
                      isActive
                        ? "bg-sidebar-active text-white"
                        : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Link
              key={item.label}
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

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="flex h-9 w-9 mx-auto items-center justify-center rounded-md text-sidebar-text hover:bg-sidebar-hover hover:text-red-400 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2">
            {user && (
              <UserAvatar
                name={user.full_name}
                src={user.avatar_url}
                size="sm"
                className="shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">
                {user?.full_name ?? "User"}
              </p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-red-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-bg text-sidebar-text hover:bg-sidebar-hover transition-colors shadow-md"
        style={{ left: collapsed ? "52px" : "252px" }}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  );
}
