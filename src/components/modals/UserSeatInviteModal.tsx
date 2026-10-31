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
  Clock,
  Search,
  Send,
  UserCheck,
  UserPlus,
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
          ? `Invite sent to @${targetUser.username}. They will take over once accepted.`
          : `Invite sent to @${targetUser.username}. The role is theirs once accepted.`,
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
        msg: 'Invite cancelled.',
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
    <div className="modal modal-open">
      <div className="modal-box bg-base-200 border border-base-300 p-5 max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-base-300">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/20 text-primary">
              {isTransfer ? <ArrowRightLeft className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-sm">
                {isTransfer ? 'Transfer Role' : 'Invite Player'}
              </h3>
              <p className="text-xs text-base-content/70">
                Play as <strong className="text-base-content">{character.characterName}</strong> ({character.publicRole})
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-xs btn-circle">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Existing Pending Invite */}
        {pendingInvite && (
          <div className="alert alert-warning text-xs py-2 my-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Invite waiting for @{pendingInvite.toUsername}</span>
            </div>
            <button
              type="button"
              onClick={() => handleCancelInvite(pendingInvite.id)}
              className="btn btn-ghost btn-xs text-error"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`alert text-xs py-2 my-3 ${
              feedback.type === 'ok' ? 'alert-success' : 'alert-error'
            }`}
          >
            <span>{feedback.msg}</span>
            <button type="button" onClick={() => setFeedback(null)} className="btn btn-ghost btn-xs">
              ✕
            </button>
          </div>
        )}

        {/* Search Bar */}
        <div className="my-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username or name..."
              className="input input-bordered input-sm w-full pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* User Search Results */}
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {matchingUsers.length > 0 ? (
            matchingUsers.map((targetUser) => {
              const isAlreadyAssigned = character.assignedUserId === targetUser.id;
              const hasActiveInvite = pendingInvite?.toUserId === targetUser.id;
              const roleBadge = ROLE_BADGE_INFO[targetUser.accountRole] ?? ROLE_BADGE_INFO.PLAYER;

              return (
                <div
                  key={targetUser.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-base-100 border border-base-300 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="avatar placeholder">
                      <div className="bg-primary/20 text-primary w-6 h-6 rounded text-xs">
                        <span>{targetUser.displayName[0]}</span>
                      </div>
                    </div>
                    <div className="truncate">
                      <div className="font-bold truncate">{targetUser.displayName}</div>
                      <div className="text-[10px] text-base-content/60">@{targetUser.username}</div>
                    </div>
                  </div>

                  <div>
                    {isAlreadyAssigned ? (
                      <span className="badge badge-sm badge-success gap-1">
                        <UserCheck className="w-3 h-3" />
                        Current Player
                      </span>
                    ) : hasActiveInvite ? (
                      <span className="badge badge-sm badge-warning">
                        Invite Sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isSending}
                        onClick={() => handleSendInvite(targetUser)}
                        className="btn btn-primary btn-xs gap-1"
                      >
                        <Send className="w-3 h-3" />
                        {isTransfer ? 'Transfer' : 'Invite'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-6 text-xs text-base-content/50">
              No users found matching &ldquo;{searchQuery}&rdquo;.
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="modal-action mt-4 pt-3 border-t border-base-300">
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
            Close
          </button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/50" onClick={onClose} />
    </div>
  );
};
