'use client';

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  UserPlus,
  MoreVertical,
  Trash2,
  Shield,
  Eye,
  Users,
  Loader2,
  Crown,
} from "lucide-react";
import { workspacesApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatRelativeTime, generateAvatar, getAvatarColor, cn } from "@/lib/utils";
import type { Membership, Role } from "@/types";
import { Role as RoleEnum } from "@/types";

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<Role, string> = {
  owner: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  member: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  viewer: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function InviteDialog({
  workspaceId,
  onClose,
  onInvited,
}: {
  workspaceId: string;
  onClose: () => void;
  onInvited: (m: Membership) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(RoleEnum.Member);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const membership = await workspacesApi.inviteMember(workspaceId, { email, role });
      onInvited(membership);
      toast.success("Invitation sent", `${email} has been invited.`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send invitation";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-1">Invite member</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          Send an invitation to join this workspace.
        </p>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="colleague@company.com"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value={RoleEnum.Admin}>Admin — Can manage workspace settings and members</option>
              <option value={RoleEnum.Member}>Member — Can upload documents and chat</option>
              <option value={RoleEnum.Viewer}>Viewer — Read-only access to chats</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Send invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MembersPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const { user } = useAuth();
  const { toast } = useToast();

  const [members, setMembers] = useState<Membership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const myMembership = members.find((m) => m.user_id === user?.id);
  const isAdmin = myMembership?.role === RoleEnum.Admin || myMembership?.role === RoleEnum.Owner;

  useEffect(() => {
    const load = async () => {
      try {
        const data = await workspacesApi.getMembers(workspaceId);
        setMembers(data);
      } catch {
        toast.error("Failed to load members");
      } finally {
        setIsLoading(false);
      }
    };
    if (workspaceId) load();
  }, [workspaceId, toast]);

  const handleRoleChange = async (memberId: string, newRole: Role) => {
    try {
      const updated = await workspacesApi.updateRole(workspaceId, memberId, newRole);
      setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    }
    setOpenMenuId(null);
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    setRemovingId(memberId);
    try {
      await workspacesApi.removeMember(workspaceId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Members</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {members.length} member{members.length !== 1 ? "s" : ""} in this workspace
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite member
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  <div className="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">No members yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {members.map((member) => {
              const initials = generateAvatar(member.user.full_name);
              const avatarColor = getAvatarColor(member.user.full_name);
              const isMe = member.user_id === user?.id;
              const isOwner = member.role === RoleEnum.Owner;

              return (
                <div key={member.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0 ${avatarColor}`}>
                    {member.user.avatar_url ? (
                      <img src={member.user.avatar_url} alt={member.user.full_name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-900 dark:text-white truncate">
                        {member.user.full_name}
                      </span>
                      {isMe && (
                        <span className="text-xs text-slate-400">(you)</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{member.user.email}</p>
                  </div>

                  {/* Joined */}
                  <div className="hidden md:block text-xs text-slate-400 shrink-0">
                    Joined {formatRelativeTime(member.joined_at)}
                  </div>

                  {/* Role badge */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${ROLE_COLORS[member.role]}`}>
                    {isOwner && <Crown className="w-3 h-3" />}
                    {ROLE_LABELS[member.role]}
                  </span>

                  {/* Actions */}
                  {isAdmin && !isOwner && !isMe && (
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {openMenuId === member.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                          <div className="absolute right-0 top-8 z-20 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                            <div className="py-1">
                              <p className="px-3 py-1.5 text-xs text-slate-400 font-medium">Change role</p>
                              {([RoleEnum.Admin, RoleEnum.Member, RoleEnum.Viewer] as Role[]).map((r) => (
                                <button
                                  key={r}
                                  onClick={() => handleRoleChange(member.id, r)}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors",
                                    member.role === r ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"
                                  )}
                                >
                                  {r === RoleEnum.Admin && <Shield className="w-3.5 h-3.5" />}
                                  {r === RoleEnum.Viewer && <Eye className="w-3.5 h-3.5" />}
                                  {r === RoleEnum.Member && <Users className="w-3.5 h-3.5" />}
                                  {ROLE_LABELS[r]}
                                </button>
                              ))}
                              <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                              <button
                                onClick={() => handleRemove(member.id)}
                                disabled={removingId === member.id}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                              >
                                {removingId === member.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                                Remove member
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteDialog
          workspaceId={workspaceId}
          onClose={() => setShowInvite(false)}
          onInvited={(m) => setMembers((prev) => [...prev, m])}
        />
      )}
    </div>
  );
}
