import React, { useMemo, useState } from 'react';
import { SimulationState } from '../../types/simulation';
import { SeatInvitation, SeatInviteType, UserAccount } from '../../types/user';
import {
  cancelSeatInvitation,
  getPendingInvitationForSeat,
  searchUsersByUsername,
  sendSeatInvitation,
} from '../../services/seatInviteService';
import { ROLE_BADGE_INFO } from '../../services/authService';
import {
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Clock,
  Search,
  Send,
  Shield,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

interface UserSeatInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  simulation: SimulationState;
  characterId: string;
  currentUser: UserAccount;
  inviteType?: SeatInviteType;
  onInviteSent?: (updatedSim: SimulationState, invite: SeatInvitation) => void;
}

export const UserSeatInviteModal: React.FC<UserSeatInviteModalProps> = ({
  isOpen,
  onClose,
  simulation,
  characterId,
  currentUser,
  inviteType = 'CREATOR_INVITE',
  onInviteSent,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(
    null
  );
  const [isSending, setIsSending] = useState(false);

  const character = simulation.characters[characterId];

  // Look for any existing pending invitation for this seat
  const pendingInvite = useMemo(
    () => getPendingInvitationForSeat(simulation.id, characterId),
    [simulation.id, characterId, feedback]
  );

  // Search users excluding the current user
  const matchingUsers = useMemo(
    () => searchUsersByUsername(searchQuery, [currentUser.id]),
    [searchQuery, currentUser.id]
  );

  if (!isOpen || !character) return null;

  const isTransfer = inviteType === 'ROLE_TRANSFER';

  const handleSendInvite = (targetUser: UserAccount) => {
    setIsSending(true);
    setFeedback(null);

    const result = sendSeatInvitation({
      simulation,
      characterId,
      fromUser: currentUser,
      targetUser,
      inviteType,
    });

    setIsSending(false);

    if (result.ok) {
      setFeedback({
        type: 'ok',
        msg: isTransfer
          ? `Transfer request sent to @${targetUser.username}! They will take over the role once they accept.`
          : `Seat invitation sent to @${targetUser.username}! The seat will be permanently assigned to them once accepted.`,
      });
      onInviteSent?.(result.updatedSimulation, result.invite);
    } else {
      setFeedback({ type: 'err', msg: result.error });
    }
  };

  const handleCancelInvite = (inviteId: string) => {
    const res = cancelSeatInvitation(inviteId);
    if (res.ok) {
      setFeedback({
        type: 'ok',
        msg: 'Pending invitation cancelled successfully.',
      });
      const updatedSim: SimulationState = {
        ...simulation,
        seatInvitations: (simulation.seatInvitations ?? []).filter(
          (i) => i.id !== inviteId
        ),
      };
      onInviteSent?.(updatedSim, res.invite);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                isTransfer
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-purple-500/15 border-purple-500/30 text-purple-400'
              }`}
            >
              {isTransfer ? (
                <ArrowRightLeft className="w-5 h-5" />
              ) : (
                <UserPlus className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>{isTransfer ? 'Transfer Character Role' : 'Invite User to Seat'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {character.characterName}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {character.publicRole} • Simulation: "{simulation.title}"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Explanatory Banner */}
        <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-2">
          <span className="text-purple-400 text-sm leading-none mt-0.5">ℹ️</span>
          <p className="leading-relaxed">
            {isTransfer ? (
              <>
                Search for any user to invite them to take over your seat as{' '}
                <strong className="text-white">{character.characterName}</strong>. Once they
                accept, this role and all current victory standing will be{' '}
                <strong className="text-amber-300">permanently transferred</strong> to their
                profile.
              </>
            ) : (
              <>
                Search the username database to invite a player to permanently fill{' '}
                <strong className="text-white">{character.characterName}</strong>'s seat. Once
                accepted, this character is bound to their account and removed from AI control.
              </>
            )}
          </p>
        </div>

        {/* Existing Pending Invite Banner */}
        {pendingInvite && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-950/25 border border-amber-500/40 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="text-amber-300 font-bold">
                  Pending Invite to @{pendingInvite.toUsername}
                </span>
                <div className="text-[10px] text-slate-400">
                  Sent by @{pendingInvite.fromUsername} •{' '}
                  {new Date(pendingInvite.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleCancelInvite(pendingInvite.id)}
              className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30 text-[10px] font-semibold transition"
            >
              Cancel Invite
            </button>
          </div>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mx-4 mt-3 p-3 rounded-xl text-xs flex items-center justify-between border ${
              feedback.type === 'ok'
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
            }`}
          >
            <span>{feedback.msg}</span>
            <button
              onClick={() => setFeedback(null)}
              className="p-1 hover:bg-slate-800 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Search Input Bar */}
        <div className="p-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username (e.g. thorne, kael, nyx) or callsign..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono placeholder:text-slate-500 transition"
              autoFocus
            />
          </div>
        </div>

        {/* User Search Results List */}
        <div className="p-4 pt-1 flex-1 overflow-y-auto space-y-2 max-h-[420px]">
          <div className="text-[11px] font-mono text-slate-400 px-1 py-1 flex items-center justify-between">
            <span>USERS IN DATABASE ({matchingUsers.length})</span>
            {searchQuery && (
              <span className="text-purple-400 text-[10px]">Filtering "{searchQuery}"</span>
            )}
          </div>

          {matchingUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
              No users found matching "{searchQuery}".
            </div>
          ) : (
            matchingUsers.map((u) => {
              // Check if user is already assigned to ANY seat in this simulation
              const assignedSeatInSim = Object.values(simulation.characters).find(
                (c) => c.assignedUserId === u.id
              );
              const isAssignedToThisSeat = character.assignedUserId === u.id;
              const hasPendingInviteToThisSeat =
                pendingInvite?.toUserId === u.id && pendingInvite.status === 'PENDING';

              return (
                <div
                  key={u.id}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 text-xs ${
                    isAssignedToThisSeat
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : hasPendingInviteToThisSeat
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl bg-gradient-to-br ${
                        u.avatarColor || 'from-purple-500 to-indigo-700'
                      } flex items-center justify-center text-white font-bold text-xs shadow shrink-0`}
                    >
                      {u.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-200 truncate flex items-center gap-2">
                        <span>{u.displayName}</span>
                        <span className="text-[11px] font-mono text-purple-300">
                          @{u.username}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[10px] text-slate-500">
                          [{u.callsign || 'OPERATIVE'}]
                        </span>
                        <span>•</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded border font-mono font-semibold ${
                            ROLE_BADGE_INFO[u.accountRole]?.badgeClass ??
                            'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {ROLE_BADGE_INFO[u.accountRole]?.shortLabel ?? u.accountRole}
                        </span>
                        {assignedSeatInSim && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400 text-[10px]">
                              {isAssignedToThisSeat
                                ? 'Currently in this seat'
                                : `Plays ${assignedSeatInSim.characterName}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="shrink-0">
                    {isAssignedToThisSeat ? (
                      <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Assigned
                      </span>
                    ) : hasPendingInviteToThisSeat ? (
                      <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Invited
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSendInvite(u)}
                        disabled={isSending || Boolean(assignedSeatInSim)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow disabled:opacity-40 disabled:cursor-not-allowed ${
                          isTransfer
                            ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold'
                            : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                        title={
                          assignedSeatInSim
                            ? `User is already occupying ${assignedSeatInSim.characterName} in this simulation`
                            : isTransfer
                            ? `Transfer role to @${u.username}`
                            : `Invite @${u.username} to play ${character.characterName}`
                        }
                      >
                        {isTransfer ? (
                          <>
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            Transfer Role
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            Send Invite
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span className="text-[11px]">
            Roles become active in the player's profile immediately upon acceptance.
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
