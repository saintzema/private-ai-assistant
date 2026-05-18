'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { UserPlus, Mail, Shield, User, Crown, Eye, Loader2, Trash2 } from "lucide-react";
import { workspacesApi } from "@/lib/api";
import type { Membership, Role } from "@/types";

const roleIcons: Record<string, React.ElementType> = { owner: Crown, admin: Shield, member: User, viewer: Eye };
const roleColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  member: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
  viewer: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-500",
};

export default function MembersPage() {
  const params = useParams();
  const workspaceId = params?.workspaceId as string;
  const [members, setMembers] = useState<Membership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member" as Role);
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    workspacesApi.getMembers(workspaceId).then(setMembers).finally(() => setIsLoading(false));
  }, [workspaceId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const m = await workspacesApi.inviteMember(workspaceId, { email: inviteEmail, role: inviteRole });
      setMembers(p => [...p, m]);
      setInviteEmail(""); setShowInvite(false);
    } catch (e) { console.error(e); }
    finally { setInviting(false); }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Remove this member?")) return;
    try { await workspacesApi.removeMember(workspaceId, memberId); setMembers(p => p.filter(m => m.id !== memberId)); }
    catch (e) { console.error(e); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Members</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors">
          <UserPlus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} className="mb-6 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Invite a team member</h3>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required
                placeholder="colleague@company.com"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)}
              className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="submit" disabled={inviting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Invite"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" /></div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>
                {["Member", "Role", "Joined", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map(m => {
                const RoleIcon = roleIcons[m.role] ?? User;
                return (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                          {m.user?.full_name?.split(" ").map((n: string) => n[0]).join("") ?? "?"}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{m.user?.full_name}</p>
                          <p className="text-xs text-slate-500">{m.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[m.role]}`}>
                        <RoleIcon className="w-3 h-3" /> {m.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5">
                      {m.role !== "owner" && (
                        <button onClick={() => handleRemove(m.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
