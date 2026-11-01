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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="paper max-w-lg w-full bg-[#fffef0] border-2 border-[#41403e] shadow-2xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-dashed border-[#ccc]">
          <div className="flex items-center gap-2">
            <div className="text-secondary">
              {isTransfer ? <ArrowRightLeft className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-base m-0">
                {isTransfer ? 'Transfer Role' : 'Invite Player'}
              </h3>
              <p className="text-xs text-[#666] m-0">
                Play as <strong>{character.characterName}</strong> ({character.publicRole})
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="paper-btn btn-small py-1 px-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Existing Pending Invite */}
        {pendingInvite && (
          <div className="alert alert-warning text-xs py-2 my-2 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Invite waiting for @{pendingInvite.toUsername}</span>
            </div>
            <button
              type="button"
              onClick={() => handleCancelInvite(pendingInvite.id)}
              className="paper-btn btn-small btn-danger py-0.5 px-2 text-xs"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`alert text-xs py-2 my-2 ${
              feedback.type === 'ok' ? 'alert-success' : 'alert-danger'
            }`}
          >
            <span>{feedback.msg}</span>
            <button type="button" onClick={() => setFeedback(null)} className="float-right font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        {/* Search Bar */}
        <div className="my-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username or name..."
              className="w-full text-sm pl-9"
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

              return (
                <div
                  key={targetUser.id}
                  className="flex items-center justify-between p-2 rounded bg-white border border-[#ccc] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="badge secondary text-xs w-6 h-6 flex items-center justify-center p-0">
                      {targetUser.displayName[0]}
                    </span>
                    <div className="truncate">
                      <div className="font-bold truncate">{targetUser.displayName}</div>
                      <div className="text-[10px] text-[#777]">@{targetUser.username}</div>
                    </div>
                  </div>

                  <div>
                    {isAlreadyAssigned ? (
                      <span className="badge success gap-1">
                        <UserCheck className="w-3 h-3 inline mr-1" />
                        Current Player
                      </span>
                    ) : hasActiveInvite ? (
                      <span className="badge warning">
                        Invite Sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isSending}
                        onClick={() => handleSendInvite(targetUser)}
                        className="paper-btn btn-small btn-primary py-0.5 px-2 inline-flex items-center gap-1"
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
            <div className="text-center py-6 text-xs text-[#777]">
              No users found matching &ldquo;{searchQuery}&rdquo;.
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="pt-3 border-t border-dashed border-[#ccc] flex justify-end">
          <button type="button" onClick={onClose} className="paper-btn btn-small">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
