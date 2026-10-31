import { SimulationState } from '../types/simulation';
import { SeatInvitation, SeatInviteType, UserAccount } from '../types/user';
import { enrollUserInSimulation, loadAllUsers, saveAllUsers } from './authService';
import { broadcastRealtimeEvent } from './presenceService';

const SEAT_INVITATIONS_STORAGE_KEY = 'SIM_CREATOR_SEAT_INVITATIONS_V1';

/**
 * Loads all seat invitations from persistent localStorage.
 */
export function loadAllSeatInvitations(): SeatInvitation[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(SEAT_INVITATIONS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to parse seat invitations from localStorage:', err);
    return [];
  }
}

/**
 * Persists all seat invitations to localStorage.
 */
export function saveAllSeatInvitations(invitations: SeatInvitation[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      SEAT_INVITATIONS_STORAGE_KEY,
      JSON.stringify(invitations)
    );
  } catch (err) {
    console.error('Failed to save seat invitations to localStorage:', err);
  }
}

/**
 * Searches the user database by username, displayName, or callsign.
 */
export function searchUsersByUsername(
  query: string,
  excludeUserIds: string[] = []
): UserAccount[] {
  const users = loadAllUsers();
  const trimmed = query.trim().toLowerCase();
  const excludeSet = new Set(excludeUserIds);

  return users.filter((u) => {
    if (excludeSet.has(u.id)) return false;
    if (!trimmed) return true;
    return (
      u.username.toLowerCase().includes(trimmed) ||
      u.displayName.toLowerCase().includes(trimmed) ||
      u.callsign.toLowerCase().includes(trimmed)
    );
  });
}

/**
 * Retrieves all pending invitations for a specific user.
 */
export function getPendingInvitationsForUser(userId: string): SeatInvitation[] {
  const all = loadAllSeatInvitations();
  return all.filter((inv) => inv.toUserId === userId && inv.status === 'PENDING');
}

/**
 * Retrieves an active pending invitation for a specific character seat, if one exists.
 */
export function getPendingInvitationForSeat(
  simulationId: string,
  characterId: string
): SeatInvitation | null {
  const all = loadAllSeatInvitations();
  return (
    all.find(
      (inv) =>
        inv.simulationId === simulationId &&
        inv.characterId === characterId &&
        inv.status === 'PENDING'
    ) ?? null
  );
}

/**
 * Sends a seat invitation or role transfer request to a target user.
 */
export function sendSeatInvitation({
  simulation,
  characterId,
  fromUser,
  targetUser,
  inviteType = 'CREATOR_INVITE',
}: {
  simulation: SimulationState;
  characterId: string;
  fromUser: UserAccount;
  targetUser: UserAccount;
  inviteType?: SeatInviteType;
}): { ok: true; invite: SeatInvitation; updatedSimulation: SimulationState } | { ok: false; error: string } {
  const char = simulation.characters[characterId];
  if (!char) {
    return { ok: false, error: `Character seat "${characterId}" not found in simulation.` };
  }

  if (targetUser.id === fromUser.id) {
    return { ok: false, error: 'You cannot invite yourself to fill or take over this seat.' };
  }

  if (char.assignedUserId === targetUser.id) {
    return {
      ok: false,
      error: `@${targetUser.username} is already permanently assigned to this character seat.`,
    };
  }

  // Check if an invitation is already pending for this seat
  const allInvites = loadAllSeatInvitations();
  const existingPending = allInvites.find(
    (inv) =>
      inv.simulationId === simulation.id &&
      inv.characterId === characterId &&
      inv.status === 'PENDING'
  );

  if (existingPending) {
    if (existingPending.toUserId === targetUser.id) {
      return {
        ok: false,
        error: `A pending invitation to @${targetUser.username} for this seat already exists.`,
      };
    }
    return {
      ok: false,
      error: `A seat invitation to @${existingPending.toUsername} is already pending for this seat. Cancel it first to invite another user.`,
    };
  }

  const newInvite: SeatInvitation = {
    id: `inv_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    simulationId: simulation.id,
    simulationTitle: simulation.title,
    characterId,
    characterName: char.characterName,
    characterPublicRole: char.publicRole,
    fromUserId: fromUser.id,
    fromUsername: fromUser.username,
    fromDisplayName: fromUser.displayName,
    toUserId: targetUser.id,
    toUsername: targetUser.username,
    toDisplayName: targetUser.displayName,
    inviteType,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  const nextInvites = [newInvite, ...allInvites];
  saveAllSeatInvitations(nextInvites);

  // Update simulation state's local invitations array
  const updatedSim: SimulationState = {
    ...simulation,
    seatInvitations: [
      newInvite,
      ...(simulation.seatInvitations ?? []).filter(
        (inv) =>
          !(
            inv.simulationId === simulation.id &&
            inv.characterId === characterId &&
            inv.toUserId === targetUser.id &&
            inv.status === 'PENDING'
          )
      ),
    ],
  };

  broadcastRealtimeEvent({
    type: 'NOTIFICATION_BROADCAST',
    title: inviteType === 'ROLE_TRANSFER' ? 'Role Transfer Request' : 'Seat Invitation',
    body: `@${fromUser.username} invited @${targetUser.username} to play as ${char.characterName} in "${simulation.title}"`,
    targetUserId: targetUser.id,
  });

  return { ok: true, invite: newInvite, updatedSimulation: updatedSim };
}

/**
 * Accepts a seat invitation or role transfer request.
 * Permanently assigns the role to the accepting user and transfers ownership.
 */
export function acceptSeatInvitation({
  inviteId,
  acceptingUser,
  simulations,
}: {
  inviteId: string;
  acceptingUser: UserAccount;
  simulations: Record<string, SimulationState>;
}):
  | {
      ok: true;
      updatedSimulation: SimulationState;
      updatedUser: UserAccount;
      previousUser?: UserAccount;
    }
  | { ok: false; error: string } {
  const allInvites = loadAllSeatInvitations();
  const inviteIdx = allInvites.findIndex((inv) => inv.id === inviteId);

  if (inviteIdx === -1) {
    return { ok: false, error: 'Invitation not found or has expired.' };
  }

  const invite = allInvites[inviteIdx];
  if (invite.toUserId !== acceptingUser.id) {
    return { ok: false, error: 'You are not authorized to accept this invitation.' };
  }

  if (invite.status !== 'PENDING') {
    return { ok: false, error: `Invitation is no longer pending (status: ${invite.status}).` };
  }

  const sim = simulations[invite.simulationId];
  if (!sim) {
    return { ok: false, error: `Simulation "${invite.simulationTitle}" was not found.` };
  }

  const char = sim.characters[invite.characterId];
  if (!char) {
    return { ok: false, error: `Character "${invite.characterName}" was not found in simulation.` };
  }

  const previousUserId = char.assignedUserId;
  let previousUserUpdated: UserAccount | undefined;

  // 1. Permanently assign the character role to the accepting user
  const updatedChar = {
    ...char,
    assignedUserId: acceptingUser.id,
    assignedUsername: acceptingUser.username,
    isAiControlled: false,
  };

  // 2. Mark invitation as ACCEPTED
  const updatedInvite: SeatInvitation = {
    ...invite,
    status: 'ACCEPTED',
    respondedAt: new Date().toISOString(),
  };

  const nextInvites = [...allInvites];
  nextInvites[inviteIdx] = updatedInvite;
  saveAllSeatInvitations(nextInvites);

  // 3. Update the simulation state
  const updatedSim: SimulationState = {
    ...sim,
    characters: {
      ...sim.characters,
      [invite.characterId]: updatedChar,
    },
    seatInvitations: (sim.seatInvitations ?? []).map((i) =>
      i.id === inviteId ? updatedInvite : i
    ),
  };

  // 4. Enroll the accepting user with an ACTIVE participation in their profile
  const updatedAcceptingUser = enrollUserInSimulation(
    acceptingUser.id,
    updatedSim,
    invite.characterId
  ) ?? {
    ...acceptingUser,
    participations: [
      {
        simulationId: updatedSim.id,
        simulationTitle: updatedSim.title,
        scenarioSummary: updatedSim.masterNarrative,
        characterId: updatedChar.playerId,
        characterName: updatedChar.characterName,
        publicRole: updatedChar.publicRole,
        status: 'ACTIVE',
        victoryPointsEarned: updatedChar.victoryPoints,
        roundsParticipated: updatedSim.currentTurnOrTick,
        joinedAt: new Date().toISOString().slice(0, 10),
      },
      ...acceptingUser.participations.filter(
        (p) => p.simulationId !== updatedSim.id
      ),
    ],
  };

  // 5. If this was a transfer from another user, update the previous user's record
  if (previousUserId && previousUserId !== acceptingUser.id) {
    const allUsers = loadAllUsers();
    const prevIdx = allUsers.findIndex((u) => u.id === previousUserId);
    if (prevIdx !== -1) {
      const prevUser = allUsers[prevIdx];
      const nextParticipations = prevUser.participations.map((p) => {
        if (p.simulationId === updatedSim.id && p.characterId === invite.characterId) {
          return {
            ...p,
            status: 'COMPLETED' as const,
            completedAt: new Date().toISOString().slice(0, 10),
            outcomeSummary: `Transferred role to @${acceptingUser.username}`,
          };
        }
        return p;
      });

      previousUserUpdated = {
        ...prevUser,
        participations: nextParticipations,
      };

      const nextUsers = [...allUsers];
      nextUsers[prevIdx] = previousUserUpdated;
      saveAllUsers(nextUsers);
    }
  }

  broadcastRealtimeEvent({
    type: 'NOTIFICATION_BROADCAST',
    title: 'Seat Invitation Accepted',
    body: `@${acceptingUser.username} accepted the role of ${updatedChar.characterName} in "${updatedSim.title}"`,
    targetUserId: invite.fromUserId,
  });

  return {
    ok: true,
    updatedSimulation: updatedSim,
    updatedUser: updatedAcceptingUser,
    previousUser: previousUserUpdated,
  };
}

/**
 * Declines a seat invitation.
 */
export function declineSeatInvitation(
  inviteId: string,
  decliningUser: UserAccount
): { ok: true; invite: SeatInvitation } | { ok: false; error: string } {
  const allInvites = loadAllSeatInvitations();
  const inviteIdx = allInvites.findIndex((inv) => inv.id === inviteId);

  if (inviteIdx === -1) {
    return { ok: false, error: 'Invitation not found.' };
  }

  const invite = allInvites[inviteIdx];
  if (invite.toUserId !== decliningUser.id) {
    return { ok: false, error: 'You are not authorized to decline this invitation.' };
  }

  const updatedInvite: SeatInvitation = {
    ...invite,
    status: 'DECLINED',
    respondedAt: new Date().toISOString(),
  };

  const nextInvites = [...allInvites];
  nextInvites[inviteIdx] = updatedInvite;
  saveAllSeatInvitations(nextInvites);

  return { ok: true, invite: updatedInvite };
}

/**
 * Cancels a pending seat invitation.
 */
export function cancelSeatInvitation(
  inviteId: string
): { ok: true; invite: SeatInvitation } | { ok: false; error: string } {
  const allInvites = loadAllSeatInvitations();
  const inviteIdx = allInvites.findIndex((inv) => inv.id === inviteId);

  if (inviteIdx === -1) {
    return { ok: false, error: 'Invitation not found.' };
  }

  const invite = allInvites[inviteIdx];
  const updatedInvite: SeatInvitation = {
    ...invite,
    status: 'CANCELLED',
    respondedAt: new Date().toISOString(),
  };

  const nextInvites = [...allInvites];
  nextInvites[inviteIdx] = updatedInvite;
  saveAllSeatInvitations(nextInvites);

  return { ok: true, invite: updatedInvite };
}
