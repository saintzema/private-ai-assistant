"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workspacesApi } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be at most 50 characters"),
  description: z.string().max(200, "Description must be at most 200 characters").optional(),
});

type CreateWorkspaceForm = z.infer<typeof createWorkspaceSchema>;

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({ open, onOpenChange }: CreateWorkspaceDialogProps) {
  const { toast } = useToast();
  const { addWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateWorkspaceForm>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "", description: "" },
  });

  const mutation = useMutation({
    mutationFn: workspacesApi.create,
    onSuccess: (workspace) => {
      addWorkspace(workspace);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace created!", `"${workspace.name}" is ready to use.`);
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Failed to create workspace", err.message);
    },
  });

  const onSubmit = (data: CreateWorkspaceForm) => {
    // Generate a basic slug from the name (lowercase, alphanumeric + hyphens)
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    
    // Fallback if slug generation results in empty string or too short
    const finalSlug = slug.length >= 3 ? slug : `${slug || "ws"}-${Math.random().toString(36).substring(2, 6)}`;
    
    mutation.mutate({ ...data, slug: finalSlug } as any);
  };

  const handleClose = () => {
    if (!mutation.isPending) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Create a new workspace to organize your documents and AI conversations.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Workspace name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g. Engineering Team"
              error={errors.name?.message}
              {...register("name")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What is this workspace for?"
              rows={3}
              error={errors.description?.message}
              {...register("description")}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
