"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, FileText, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { cn, formatBytes, getPlanLabel, getPlanColor } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Workspace } from "@/types";

interface WorkspaceCardProps {
  workspace: Workspace;
  onEdit?: (workspace: Workspace) => void;
  onDelete?: (workspace: Workspace) => void;
}

export function WorkspaceCard({ workspace, onEdit, onDelete }: WorkspaceCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/workspace/${workspace.id}/chat`);
  };

  return (
    <Card
      className={cn(
        "group cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30",
        "bg-card"
      )}
      onClick={handleClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          {/* Workspace icon + name */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-base">
              {workspace.logo_url ? (
                <img
                  src={workspace.logo_url}
                  alt={workspace.name}
                  className="h-10 w-10 rounded-xl object-cover"
                />
              ) : (
                workspace.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{workspace.name}</h3>
              {workspace.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {workspace.description}
                </p>
              )}
            </div>
          </div>

          {/* Options menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted text-muted-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEdit?.(workspace)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit workspace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete?.(workspace)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Plan badge */}
        <div className="mt-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
              getPlanColor(workspace.plan)
            )}
          >
            {getPlanLabel(workspace.plan)}
          </span>
        </div>

        {/* Stats */}
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            <span>{workspace.member_count} member{workspace.member_count !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            <span>{workspace.document_count} doc{workspace.document_count !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Storage bar */}
        {workspace.storage_limit_bytes > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>{formatBytes(workspace.storage_used_bytes)} used</span>
              <span>{formatBytes(workspace.storage_limit_bytes)}</span>
            </div>
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{
                  width: `${Math.min(
                    (workspace.storage_used_bytes / workspace.storage_limit_bytes) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
