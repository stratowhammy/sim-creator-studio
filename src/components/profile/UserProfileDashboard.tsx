import React, { useMemo, useState } from 'react';
import { SimulationState } from '../../types/simulation';
import { SimulationParticipation, UserAccount } from '../../types/user';
import {
  canAccessAuthoringStudio,
  canAccessGlobalAdminOverview,
  enrollUserInSimulation,
  getPrimaryManagedSimulationId,
  resolveLiveParticipations,
  ROLE_BADGE_INFO,
  updateUserPassword,
  updateUserProfile,
} from '../../services/authService';
import {
  calculateCollectionUsageCostSims,
  hasUserUnlockedSimulation,
  unlockSimulationWithSims,
} from '../../services/simsEconomyService';
import { getActivePlayersInSimulation } from '../../services/presenceService';
import {
  acceptSeatInvitation,
  declineSeatInvitation,
  getPendingInvitationsForUser,
} from '../../services/seatInviteService';
import { UserSeatInviteModal } from '../modals/UserSeatInviteModal';
import {
  ArrowRight,
  ArrowRightLeft,
  Award,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Compass,
  Edit3,
  Globe,
  History,
  Home,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Mail,
  Mic,
  Play,
  PlusCircle,
  Radio,
  Shield,
  Sparkles,
  Terminal,
  Trophy,
  Unlock,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';

interface UserProfileDashboardProps {
  user: UserAccount;
  simulations: Record<string, SimulationState>;
  onUserUpdated: (updated: UserAccount) => void;
  onUpdateSimulation?: (updatedSim: SimulationState) => void;
  onEnterSimulation: (simulationId: string, characterId: string) => void;
  onOpenAdminDashboard?: () => void;
  onOpenAssignedSimAdmin?: (simulationId: string) => void;
  onOpenAuthoringStudio?: () => void;
  onOpenLandingPage?: () => void;
  onSignOut: () => void;
}

const AVATAR_COLOR_OPTIONS = [
  { label: 'Command Blue', value: 'from-sky-500 to-blue-700' },
  { label: 'Science Violet', value: 'from-purple-500 to-indigo-700' },
  { label: 'Engineering Emerald', value: 'from-emerald-500 to-teal-700' },
  { label: 'Covert Crimson', value: 'from-amber-500 to-rose-700' },
  { label: 'Orbital Cyan', value: 'from-cyan-500 to-sky-700' },
];

export const UserProfileDashboard: React.FC<UserProfileDashboardProps> = ({
  user,
  simulations,
  onUserUpdated,
  onUpdateSimulation,
  onEnterSimulation,
  onOpenAdminDashboard,
  onOpenAssignedSimAdmin,
  onOpenAuthoringStudio,
  onOpenLandingPage,
  onSignOut,
}) => {
  // Modals
  const [showEditProfile, setShowEditProfile] = useState<boolean>(false);
  const [showEnrollModal, setShowEnrollModal] = useState<boolean>(false);
  const [showSimsWalletModal, setShowSimsWalletModal] = useState<boolean>(false);
  const [collectionTargetSim, setCollectionTargetSim] =
    useState<SimulationState | null>(null);
  const [collectionRoleId, setCollectionRoleId] = useState<string>('vance');
  const [collectionFeedback, setCollectionFeedback] = useState<{
    type: 'ok' | 'err';
    msg: string;
  } | null>(null);

  const [selectedPastDebrief, setSelectedPastDebrief] =
    useState<SimulationParticipation | null>(null);

  // History table filter
  const [historyFilter, setHistoryFilter] = useState<
    'ALL' | 'COMPLETED' | 'ACTIVE'
  >('ALL');

  // Pending Seat Invitations state
  const [inviteNonce, setInviteNonce] = useState<number>(0);
  const [inviteActionFeedback, setInviteActionFeedback] = useState<{
    type: 'ok' | 'err';
    msg: string;
  } | null>(null);

  const pendingInvites = useMemo(
    () => getPendingInvitationsForUser(user.id),
    [user.id, inviteNonce, simulations]
  );

  // Transfer Role modal target state
  const [transferTarget, setTransferTarget] = useState<{
    simulation: SimulationState;
    characterId: string;
  } | null>(null);

  // Edit Profile state
  const [editDisplayName, setEditDisplayName] = useState<string>(
    user.displayName
  );
  const [editCallsign, setEditCallsign] = useState<string>(user.callsign);
  const [editBio, setEditBio] = useState<string>(user.bio);
  const [editAvatarColor, setEditAvatarColor] = useState<string>(
    user.avatarColor
  );
  const [profileFeedback, setProfileFeedback] = useState<{
    type: 'ok' | 'err';
    msg: string;
  } | null>(null);

  // Password Change state
  const [currentPwd, setCurrentPwd] = useState<string>('');
  const [newPwd, setNewPwd] = useState<string>('');
  const [confirmPwd, setConfirmPwd] = useState<string>('');

  // Enroll Modal state
  const simList = useMemo(() => Object.values(simulations), [simulations]);
  const [enrollSimId, setEnrollSimId] = useState<string>(
    () => simList[0]?.id ?? 'sim_helios_001'
  );
  const [enrollCharId, setEnrollCharId] = useState<string>('vance');

  // Published Collection Simulations
  const publishedCollectionSimulations = useMemo(
    () => simList.filter((s) => s.publishedToCollection),
    [simList]
  );

  // Live merged participations
  const participations = useMemo(
    () => resolveLiveParticipations(user, simulations),
    [user, simulations]
  );

  const activeSimulations = useMemo(
    () => participations.filter((p) => p.status === 'ACTIVE'),
    [participations]
  );

  const completedSimulations = useMemo(
    () => participations.filter((p) => p.status === 'COMPLETED'),
    [participations]
  );

  const filteredParticipations = useMemo(() => {
    if (historyFilter === 'ACTIVE') return activeSimulations;
    if (historyFilter === 'COMPLETED') return completedSimulations;
    return participations;
  }, [participations, activeSimulations, completedSimulations, historyFilter]);

  const totalVictoryPoints = useMemo(
    () => participations.reduce((sum, p) => sum + p.victoryPointsEarned, 0),
    [participations]
  );

  const highestVp = useMemo(
    () =>
      participations.length > 0
        ? Math.max(...participations.map((p) => p.victoryPointsEarned))
        : 0,
    [participations]
  );

  const totalRoyaltiesEarned = useMemo(
    () =>
      (user.simTransactions ?? [])
        .filter((tx) => tx.type === 'CREATOR_ROYALTY' && tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0),
    [user.simTransactions]
  );

  const initials = user.displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleOpenEditModal = () => {
    setEditDisplayName(user.displayName);
    setEditCallsign(user.callsign);
    setEditBio(user.bio);
    setEditAvatarColor(user.avatarColor);
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setProfileFeedback(null);
    setShowEditProfile(true);
  };

  const handleSaveProfileDetails = (e: React.FormEvent) => {
    e.preventDefault();
    const res = updateUserProfile(user.id, {
      displayName: editDisplayName,
      callsign: editCallsign,
      bio: editBio,
      avatarColor: editAvatarColor,
    });
    if (!res.ok) {
      setProfileFeedback({ type: 'err', msg: res.error });
      return;
    }
    onUserUpdated(res.user);
    setProfileFeedback({ type: 'ok', msg: 'Profile details updated.' });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setProfileFeedback({ type: 'err', msg: 'New passwords do not match.' });
      return;
    }
    const res = updateUserPassword(user.id, currentPwd, newPwd);
    if (!res.ok) {
      setProfileFeedback({ type: 'err', msg: res.error });
      return;
    }
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setProfileFeedback({ type: 'ok', msg: 'Password updated successfully.' });
  };

  const handleEnrollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetSim = simulations[enrollSimId];
    if (!targetSim) return;

    // Ensure published simulations charge nominal 10% Sims if not yet unlocked
    if (!hasUserUnlockedSimulation(user, targetSim)) {
      const unlockRes = unlockSimulationWithSims(user.id, targetSim);
      if (!unlockRes.ok) {
        setCollectionFeedback({ type: 'err', msg: unlockRes.error });
        setShowEnrollModal(false);
        return;
      }
      onUpdateSimulation?.(unlockRes.updatedSimulation);
    }

    const updated = enrollUserInSimulation(user.id, targetSim, enrollCharId);
    if (updated) {
      onUserUpdated(updated);
      setShowEnrollModal(false);
    }
  };

  const handleAcceptInvite = (inviteId: string) => {
    const res = acceptSeatInvitation({
      inviteId,
      acceptingUser: user,
      simulations,
    });
    if (!res.ok) {
      setInviteActionFeedback({ type: 'err', msg: res.error });
      return;
    }
    onUpdateSimulation?.(res.updatedSimulation);
    onUserUpdated(res.updatedUser);
    setInviteNonce((n) => n + 1);
    setInviteActionFeedback({
      type: 'ok',
      msg: `Seat accepted! You are now permanently assigned to ${res.updatedSimulation.title}.`,
    });
  };

  const handleDeclineInvite = (inviteId: string) => {
    const res = declineSeatInvitation(inviteId, user);
    if (!res.ok) {
      setInviteActionFeedback({ type: 'err', msg: res.error });
      return;
    }
    setInviteNonce((n) => n + 1);
    setInviteActionFeedback({
      type: 'ok',
      msg: 'Invitation declined.',
    });
  };

  const handleOpenCollectionModal = (sim: SimulationState) => {
    setCollectionFeedback(null);
    const existingPart = user.participations.find(
      (p) => p.simulationId === sim.id
    );
    const firstChar =
      existingPart?.characterId ?? Object.keys(sim.characters)[0] ?? 'vance';
    setCollectionRoleId(firstChar);
    setCollectionTargetSim(sim);
  };

  const handleConfirmCollectionUnlockAndPlay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionTargetSim) return;

    const unlockRes = unlockSimulationWithSims(user.id, collectionTargetSim);
    if (!unlockRes.ok) {
      setCollectionFeedback({ type: 'err', msg: unlockRes.error });
      return;
    }

    onUpdateSimulation?.(unlockRes.updatedSimulation);
    const enrolled = enrollUserInSimulation(
      user.id,
      unlockRes.updatedSimulation,
      collectionRoleId
    );
    if (enrolled) {
      onUserUpdated(enrolled);
    } else {
      onUserUpdated(unlockRes.updatedBuyer);
    }

    const targetSimId = collectionTargetSim.id;
    const chosenRole = collectionRoleId;
    setCollectionTargetSim(null);
    onEnterSimulation(targetSimId, chosenRole);
  };

  const roleInfo = ROLE_BADGE_INFO[user.accountRole] ?? ROLE_BADGE_INFO.PLAYER;
  const managedSimId = getPrimaryManagedSimulationId(user, simulations);
  const managedSimTitle = managedSimId
    ? simulations[managedSimId]?.title ?? managedSimId
    : null;

  return (
    <div className="h-screen w-screen overflow-y-auto bg-base-100 text-base-content font-sans select-text">
      {/* ==================================================================== */}
      {/* DAISYUI NAVBAR HEADER                                                */}
      {/* ==================================================================== */}
      <header className="navbar bg-base-200 border-b border-base-300 sticky top-0 z-20 px-4 sm:px-6 gap-2">
        <div className="navbar-start gap-2">
          {onOpenLandingPage && (
            <button
              type="button"
              onClick={onOpenLandingPage}
              className="btn btn-ghost btn-sm gap-1"
            >
              <Home className="w-3.5 h-3.5 text-primary" />
              Home
            </button>
          )}
          <span className="font-bold text-sm tracking-tight hidden sm:inline-block">
            Sim Creator Studio
          </span>
        </div>

        <div className="navbar-end gap-2 flex-wrap">
          {/* SIMS WALLET BADGE BUTTON */}
          <button
            type="button"
            onClick={() => setShowSimsWalletModal(true)}
            className="btn btn-sm btn-outline btn-warning gap-1 font-mono"
            title="View your Sims credits"
          >
            <Coins className="w-3.5 h-3.5" />
            <span>{user.simsBalance ?? 0} Sims</span>
          </button>

          {canAccessGlobalAdminOverview(user) && onOpenAdminDashboard && (
            <button
              onClick={onOpenAdminDashboard}
              className="btn btn-sm btn-warning gap-1"
            >
              <Terminal className="w-3.5 h-3.5" />
              Admin Overview
            </button>
          )}

          {user.accountRole === 'SIMULATION_ADMIN' &&
            managedSimId &&
            onOpenAssignedSimAdmin && (
              <button
                onClick={() => onOpenAssignedSimAdmin(managedSimId)}
                className="btn btn-sm btn-success gap-1"
              >
                <Terminal className="w-3.5 h-3.5" />
                Run Game
              </button>
            )}

          {canAccessAuthoringStudio(user) && onOpenAuthoringStudio && (
            <button
              onClick={onOpenAuthoringStudio}
              className="btn btn-sm btn-secondary gap-1"
            >
              <Layers className="w-3.5 h-3.5" />
              Create Game
            </button>
          )}

          <button
            onClick={handleOpenEditModal}
            className="btn btn-sm btn-ghost gap-1"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Profile
          </button>

          <button
            onClick={onSignOut}
            className="btn btn-sm btn-outline btn-error gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* MAIN PROFILE CONTENT                                                 */}
      {/* ==================================================================== */}
      <main className="max-w-6xl mx-auto px-6 py-7 space-y-8">
        {collectionFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              collectionFeedback.type === 'ok'
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
            }`}
          >
            <span>{collectionFeedback.msg}</span>
            <button
              type="button"
              onClick={() => setCollectionFeedback(null)}
              className="text-slate-400 hover:text-white ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. USER PROFILE HERO & STATS */}
        <section className="card bg-base-200 border border-base-300 p-6 shadow">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div
                className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${user.avatarColor} flex items-center justify-center text-white font-bold text-xl shadow shrink-0`}
              >
                {initials}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold">
                    {user.displayName}
                  </h1>
                  <span className="badge badge-sm badge-ghost font-mono">
                    @{user.username}
                  </span>
                  <span className="badge badge-sm badge-primary badge-outline">
                    {user.callsign}
                  </span>
                  <span className={`badge badge-sm ${roleInfo.badgeClass}`}>
                    {roleInfo.label}
                  </span>
                  {user.accountRole === 'SIMULATION_ADMIN' &&
                    managedSimTitle && (
                      <span className="badge badge-sm badge-success badge-outline">
                        {managedSimTitle}
                      </span>
                    )}
                </div>

                <p className="text-xs text-base-content/70 max-w-2xl leading-relaxed">
                  {user.bio || 'Player in Sim Creator Studio.'}
                </p>

                <div className="flex items-center gap-4 text-xs text-base-content/60 pt-0.5 flex-wrap">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {user.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Joined {user.createdAt}
                  </span>
                  {totalRoyaltiesEarned > 0 && (
                    <span className="badge badge-sm badge-success badge-outline gap-1">
                      <Coins className="w-3 h-3" />
                      +{totalRoyaltiesEarned} Sims earned
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Career & Sims Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSimsWalletModal(true)}
                className="card bg-base-100 border border-warning/40 hover:border-warning p-3 text-center transition-all cursor-pointer shadow-sm"
              >
                <div className="text-[10px] uppercase font-bold text-warning mb-1 flex items-center justify-center gap-1">
                  <Coins className="w-3.5 h-3.5" />
                  Sims
                </div>
                <div className="text-base font-bold font-mono text-warning">
                  {user.simsBalance ?? 0}
                </div>
              </button>

              <div className="card bg-base-100 border border-base-300 p-3 text-center shadow-sm">
                <div className="text-[10px] uppercase font-semibold text-base-content/60 mb-1 flex items-center justify-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-warning" />
                  Points
                </div>
                <div className="text-base font-bold">
                  {totalVictoryPoints.toLocaleString()}
                </div>
              </div>

              <div className="card bg-base-100 border border-base-300 p-3 text-center shadow-sm">
                <div className="text-[10px] uppercase font-semibold text-base-content/60 mb-1 flex items-center justify-center gap-1">
                  <Play className="w-3.5 h-3.5 text-success" />
                  Active
                </div>
                <div className="text-base font-bold text-success">
                  {activeSimulations.length}
                </div>
              </div>

              <div className="card bg-base-100 border border-base-300 p-3 text-center shadow-sm">
                <div className="text-[10px] uppercase font-semibold text-base-content/60 mb-1 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-info" />
                  Done
                </div>
                <div className="text-base font-bold text-info">
                  {completedSimulations.length}
                </div>
              </div>

              <div className="card bg-base-100 border border-base-300 p-3 text-center shadow-sm">
                <div className="text-[10px] uppercase font-semibold text-base-content/60 mb-1 flex items-center justify-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-secondary" />
                  Best
                </div>
                <div className="text-base font-bold text-secondary">
                  {highestVp.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PENDING SEAT INVITATIONS */}
        {pendingInvites.length > 0 && (
          <section className="card bg-base-200 border border-warning/40 p-4 shadow space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-warning" />
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    Game Invites
                    <span className="badge badge-sm badge-warning">
                      {pendingInvites.length}
                    </span>
                  </h2>
                  <p className="text-xs text-base-content/70">
                    You were invited to play a character.
                  </p>
                </div>
              </div>
            </div>

            {inviteActionFeedback && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center justify-between ${
                  inviteActionFeedback.type === 'ok'
                    ? 'bg-success/20 text-success'
                    : 'bg-error/20 text-error'
                }`}
              >
                <span>{inviteActionFeedback.msg}</span>
                <button
                  type="button"
                  onClick={() => setInviteActionFeedback(null)}
                  className="btn btn-ghost btn-xs btn-circle"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="card bg-base-100 border border-base-300 p-3 flex flex-col justify-between gap-2 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="badge badge-xs badge-warning">
                        {invite.inviteType === 'ROLE_TRANSFER' ? 'Role Transfer' : 'Invite'}
                      </span>
                      <span className="text-[10px] text-base-content/60">
                        {new Date(invite.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm font-bold">
                      {invite.simulationTitle}
                    </div>
                    <div className="text-xs text-base-content/70">
                      Character: <strong className="text-primary">{invite.characterName}</strong>
                    </div>
                    <div className="text-[11px] text-base-content/50">
                      From: @{invite.fromUsername}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-base-300">
                    <button
                      type="button"
                      onClick={() => handleAcceptInvite(invite.id)}
                      className="btn btn-success btn-xs flex-1 gap-1"
                    >
                      <Check className="w-3 h-3" />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeclineInvite(invite.id)}
                      className="btn btn-ghost btn-xs flex-1 gap-1"
                    >
                      <X className="w-3 h-3" />
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. CURRENTLY ACTIVE GAMES */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <h2 className="text-base font-bold">
                  Active Games ({activeSimulations.length})
                </h2>
              </div>
              <p className="text-xs text-base-content/70 mt-0.5">
                Click any game below to enter and play.
              </p>
            </div>

            <button
              onClick={() => {
                const firstSim = simList[0];
                if (firstSim) {
                  setEnrollSimId(firstSim.id);
                  setEnrollCharId(Object.keys(firstSim.characters)[0] || 'vance');
                }
                setShowEnrollModal(true);
              }}
              className="btn btn-sm btn-outline btn-primary gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Enroll / Switch Role
            </button>
          </div>

          {activeSimulations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeSimulations.map((part) => {
                const liveSim = simulations[part.simulationId];
                const liveChar = liveSim?.characters[part.characterId];
                const activePlayersInRoom = liveSim
                  ? getActivePlayersInSimulation(liveSim.id)
                  : [];
                const pendingHailsCount = liveSim
                  ? (liveSim.pendingEngagements ?? []).filter(
                      (pe) =>
                        pe.targetPlayerId === part.characterId &&
                        (pe.status === 'NOTIFYING' ||
                          pe.status === 'QUEUED_MOMENTARILY' ||
                          pe.status === 'FOCUSED')
                    ).length
                  : 0;

                return (
                  <div
                    key={`${part.simulationId}_${part.characterId}`}
                    onClick={() =>
                      onEnterSimulation(part.simulationId, part.characterId)
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onEnterSimulation(part.simulationId, part.characterId);
                      }
                    }}
                    className="card bg-base-200 border border-base-300 hover:border-primary shadow cursor-pointer transition-all"
                  >
                    <div className="card-body p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge badge-sm badge-success gap-1">
                              Active Room
                            </span>
                            {liveSim?.voiceStyle && (
                              <span className="badge badge-sm badge-outline badge-secondary">
                                {liveSim.voiceStyle.name}
                              </span>
                            )}
                            {activePlayersInRoom.length > 0 && (
                              <span className="badge badge-sm badge-info badge-outline gap-1">
                                <Users className="w-3 h-3" />
                                {activePlayersInRoom.length} online
                              </span>
                            )}
                            {pendingHailsCount > 0 && (
                              <span className="badge badge-sm badge-warning animate-pulse gap-1">
                                <Bell className="w-3 h-3" />
                                {pendingHailsCount} Incoming
                              </span>
                            )}
                          </div>

                          <h3 className="card-title text-base mt-2">
                            {part.simulationTitle}
                          </h3>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="badge badge-ghost font-mono text-xs">
                            {part.victoryPointsEarned} VP
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-base-content/70 line-clamp-2">
                        {part.scenarioSummary}
                      </p>

                      {/* Assigned Role Strip */}
                      <div className="p-3 rounded-xl bg-base-300 border border-base-300 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Shield className="w-4 h-4 text-primary shrink-0" />
                          <div className="truncate">
                            <span className="text-base-content/60">Your Role: </span>
                            <strong>
                              {part.characterName}
                            </strong>
                            <span className="mx-1 text-base-content/40">•</span>
                            <span className="text-primary font-medium">
                              {part.publicRole}
                            </span>
                          </div>
                        </div>

                        {liveSim && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTransferTarget({
                                simulation: liveSim,
                                characterId: part.characterId,
                              });
                            }}
                            className="btn btn-xs btn-outline btn-warning gap-1"
                            title="Transfer this seat to another user"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            Transfer
                          </button>
                        )}
                      </div>

                      <div className="card-actions justify-between items-center pt-2 border-t border-base-300">
                        <span className="text-xs text-base-content/60">
                          Round {part.roundsParticipated} {liveChar && `• ${liveChar.actionPoints} AP`}
                        </span>

                        <span className="btn btn-primary btn-xs gap-1">
                          Play Game
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card bg-base-200 border border-base-300 p-8 text-center space-y-2">
              <Compass className="w-8 h-8 text-base-content/40 mx-auto" />
              <div className="text-sm font-semibold">
                No Active Games
              </div>
              <p className="text-xs text-base-content/60">
                Pick a game from the library below to start playing.
              </p>
            </div>
          )}
        </section>

        {/* 3. AVAILABLE GAMES LIBRARY */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-bold">
                  Game Library ({publishedCollectionSimulations.length})
                </h2>
              </div>
              <p className="text-xs text-base-content/70 mt-0.5">
                Unlock games created by the community with your Sims credits.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {publishedCollectionSimulations.map((sim) => {
              const creatorPaid = sim.creationCostSims ?? 20;
              const playCost =
                sim.usageCostSims ??
                calculateCollectionUsageCostSims(creatorPaid);
              const isCreator = sim.creatorUserId === user.id;
              const isUnlocked = hasUserUnlockedSimulation(user, sim);

              return (
                <div
                  key={`collection_${sim.id}`}
                  className="card bg-base-200 border border-base-300 shadow hover:border-warning/50 transition-all"
                >
                  <div className="card-body p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="badge badge-sm badge-secondary">
                        {sim.complexityTier ?? 'STANDARD'}
                      </span>
                      {isCreator ? (
                        <span className="badge badge-sm badge-success">
                          Your Game
                        </span>
                      ) : isUnlocked ? (
                        <span className="badge badge-sm badge-info badge-outline gap-1">
                          <Unlock className="w-2.5 h-2.5" />
                          Unlocked
                        </span>
                      ) : (
                        <span className="badge badge-sm badge-warning gap-1">
                          <Lock className="w-2.5 h-2.5" />
                          {playCost} Sims
                        </span>
                      )}
                    </div>

                    <h3 className="card-title text-sm">
                      {sim.title}
                    </h3>

                    {sim.voiceStyle && (
                      <div className="text-[11px] text-secondary font-medium">
                        Voice: {sim.voiceStyle.name}
                      </div>
                    )}

                    <p className="text-xs text-base-content/70 line-clamp-3">
                      {sim.masterNarrative}
                    </p>

                    <div className="card-actions justify-end pt-2 border-t border-base-300">
                      <button
                        type="button"
                        onClick={() => handleOpenCollectionModal(sim)}
                        className={`btn btn-sm w-full ${
                          isUnlocked ? 'btn-outline btn-primary' : 'btn-warning'
                        }`}
                      >
                        {isUnlocked ? (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            Play Game
                          </>
                        ) : (
                          <>
                            <Coins className="w-3.5 h-3.5" />
                            Unlock for {playCost} Sims
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. GAME HISTORY */}
        <section className="space-y-4 pb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                <h2 className="text-base font-bold">
                  Game History
                </h2>
              </div>
              <p className="text-xs text-base-content/70 mt-0.5">
                Past games you joined and points earned.
              </p>
            </div>

            <div className="join">
              {(
                [
                  { id: 'ALL', label: `All (${participations.length})` },
                  {
                    id: 'ACTIVE',
                    label: `Active (${activeSimulations.length})`,
                  },
                  {
                    id: 'COMPLETED',
                    label: `Finished (${completedSimulations.length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`btn btn-xs join-item ${
                    historyFilter === tab.id ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card bg-base-200 border border-base-300 overflow-hidden shadow">
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full text-xs">
                <thead>
                  <tr className="text-xs uppercase text-base-content/70">
                    <th>Game</th>
                    <th>Character</th>
                    <th>Status</th>
                    <th>Rounds</th>
                    <th className="text-right">Victory Points</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipations.map((part) => {
                    const isLivePlayable = Boolean(
                      simulations[part.simulationId]
                    );
                    return (
                      <tr
                        key={`${part.simulationId}_${part.characterId}_row`}
                        onClick={() => {
                          if (part.status === 'ACTIVE' && isLivePlayable) {
                            onEnterSimulation(
                              part.simulationId,
                              part.characterId
                            );
                          } else {
                            setSelectedPastDebrief(part);
                          }
                        }}
                        className="hover cursor-pointer"
                      >
                        <td>
                          <div className="font-bold">
                            {part.simulationTitle}
                          </div>
                          <div className="text-[11px] text-base-content/60 line-clamp-1 max-w-md">
                            {part.outcomeSummary || part.scenarioSummary}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">
                            {part.characterName}
                          </div>
                          <div className="text-[11px] text-sky-300">
                            {part.publicRole}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {part.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                              Completed{' '}
                              {part.completedAt ? `• ${part.completedAt}` : ''}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-slate-300 font-mono">
                          {part.roundsParticipated}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center gap-1 font-bold text-amber-300 bg-amber-950/30 border border-amber-800/40 px-2.5 py-1 rounded-lg">
                            <Award className="w-3.5 h-3.5 text-amber-400" />
                            {part.victoryPointsEarned.toLocaleString()} VP
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          {part.status === 'ACTIVE' && isLivePlayable ? (
                            <span className="inline-flex items-center gap-1 text-sky-400 font-semibold hover:text-sky-300">
                              Enter Room <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200">
                              View Debrief
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* MODAL: UNLOCK / PLAY GAME */}
      {collectionTargetSim && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md bg-base-200 border border-base-300 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-warning" />
                <h3 className="text-base font-bold">
                  {hasUserUnlockedSimulation(user, collectionTargetSim)
                    ? 'Play Game'
                    : 'Unlock Game'}
                </h3>
              </div>
              <button
                onClick={() => setCollectionTargetSim(null)}
                className="btn btn-ghost btn-sm btn-square"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {collectionFeedback && (
              <div className="alert alert-error text-xs py-2">
                {collectionFeedback.msg}
              </div>
            )}

            <form
              onSubmit={handleConfirmCollectionUnlockAndPlay}
              className="space-y-4 text-xs"
            >
              <div className="card bg-base-100 border border-base-300 p-3 space-y-1">
                <div className="font-bold text-sm">
                  {collectionTargetSim.title}
                </div>
                {collectionTargetSim.voiceStyle && (
                  <div className="badge badge-xs badge-secondary">
                    {collectionTargetSim.voiceStyle.name}
                  </div>
                )}
                <p className="text-base-content/70 text-xs line-clamp-3">
                  {collectionTargetSim.masterNarrative}
                </p>
              </div>

              {!hasUserUnlockedSimulation(user, collectionTargetSim) && (
                <div className="card bg-base-100 border border-warning/40 p-3 flex flex-row items-center justify-between">
                  <div>
                    <div className="font-bold text-warning text-xs">
                      Unlock Price
                    </div>
                    <div className="text-[11px] text-base-content/60">
                      Paid to @{collectionTargetSim.creatorUsername ?? 'creator'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold font-mono text-warning">
                      {collectionTargetSim.usageCostSims ??
                        calculateCollectionUsageCostSims(
                          collectionTargetSim.creationCostSims ?? 20
                        )}{' '}
                      Sims
                    </div>
                    <div className="text-[10px] text-base-content/50">
                      Balance: {user.simsBalance ?? 0} Sims
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold">
                  Pick Your Character
                </label>
                <select
                  value={collectionRoleId}
                  onChange={(e) => setCollectionRoleId(e.target.value)}
                  className="select select-bordered select-sm w-full bg-base-100"
                >
                  {Object.values(collectionTargetSim.characters).map((c) => (
                    <option key={c.playerId} value={c.playerId}>
                      {c.characterName} — {c.publicRole}
                      {c.isAiControlled ? ' [AI]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-action mt-2">
                <button
                  type="button"
                  onClick={() => setCollectionTargetSim(null)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                >
                  {hasUserUnlockedSimulation(user, collectionTargetSim)
                    ? 'Start Playing'
                    : `Pay ${
                        collectionTargetSim.usageCostSims ??
                        calculateCollectionUsageCostSims(
                          collectionTargetSim.creationCostSims ?? 20
                        )
                      } Sims & Play`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SIMS WALLET */}
      {showSimsWalletModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg bg-base-200 border border-base-300 p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-warning" />
                <h3 className="text-base font-bold">
                  Sims Balance &amp; History
                </h3>
              </div>
              <button
                onClick={() => setShowSimsWalletModal(false)}
                className="btn btn-ghost btn-sm btn-square"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="card bg-base-100 border border-warning/40 p-4 flex flex-row items-center justify-between">
              <div>
                <div className="text-[10px] uppercase font-bold text-warning">
                  Your Balance
                </div>
                <div className="text-2xl font-bold font-mono text-warning">
                  {user.simsBalance ?? 0} Sims
                </div>
              </div>
              <div className="text-right text-xs text-base-content/60 max-w-[200px]">
                Earn Sims when other players unlock your games.
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              <div className="text-xs font-semibold text-base-content/70">
                Recent Activity
              </div>
              {(user.simTransactions ?? []).length === 0 ? (
                <p className="text-xs text-base-content/50 py-4 text-center">
                  No activity yet.
                </p>
              ) : (
                (user.simTransactions ?? []).map((tx) => (
                  <div
                    key={tx.id}
                    className="card bg-base-100 border border-base-300 p-2.5 flex flex-row items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold">
                        {tx.description}
                      </div>
                      <div className="text-[10px] text-base-content/50 font-mono">
                        {new Date(tx.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div
                        className={`font-bold ${
                          tx.amount >= 0 ? 'text-success' : 'text-error'
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} Sims
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PROFILE & PASSWORD */}
      {showEditProfile && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg bg-base-200 border border-base-300 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-primary" />
                <h3 className="text-base font-bold">
                  Edit Profile
                </h3>
              </div>
              <button
                onClick={() => setShowEditProfile(false)}
                className="btn btn-ghost btn-sm btn-square"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {profileFeedback && (
              <div
                className={`alert text-xs py-2 ${
                  profileFeedback.type === 'ok' ? 'alert-success' : 'alert-error'
                }`}
              >
                {profileFeedback.msg}
              </div>
            )}

            <form onSubmit={handleSaveProfileDetails} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="input input-bordered input-sm w-full bg-base-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={editCallsign}
                    onChange={(e) => setEditCallsign(e.target.value)}
                    className="input input-bordered input-sm w-full bg-base-100"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">
                  About Me
                </label>
                <textarea
                  rows={2}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="textarea textarea-bordered w-full bg-base-100 text-xs resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">
                  Avatar Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {AVATAR_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditAvatarColor(opt.value)}
                      className={`btn btn-xs gap-1.5 ${
                        editAvatarColor === opt.value
                          ? 'btn-primary'
                          : 'btn-outline border-base-300'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full bg-gradient-to-br ${opt.value}`}
                      />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-sm w-full"
              >
                Save Changes
              </button>
            </form>

            <form
              onSubmit={handleChangePassword}
              className="pt-3 border-t border-base-300 space-y-2.5"
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <KeyRound className="w-3.5 h-3.5 text-warning" />
                Change Password
              </div>

              <input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Current password"
                className="input input-bordered input-sm w-full bg-base-100"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="New password"
                  className="input input-bordered input-sm w-full bg-base-100"
                />
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Confirm password"
                  className="input input-bordered input-sm w-full bg-base-100"
                />
              </div>

              <button
                type="submit"
                className="btn btn-outline btn-sm w-full"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ENROLL OR SWITCH ROLE */}
      {showEnrollModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md bg-base-200 border border-base-300 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <h3 className="text-base font-bold">
                  Pick a Character
                </h3>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="btn btn-ghost btn-sm btn-square"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-semibold">
                  Game
                </label>
                <select
                  value={enrollSimId}
                  onChange={(e) => {
                    const nextSimId = e.target.value;
                    setEnrollSimId(nextSimId);
                    const nextSim = simulations[nextSimId];
                    if (nextSim) {
                      setEnrollCharId(
                        Object.keys(nextSim.characters)[0] || 'vance'
                      );
                    }
                  }}
                  className="select select-bordered select-sm w-full bg-base-100"
                >
                  {simList.map((sim) => {
                    const unlocked = hasUserUnlockedSimulation(user, sim);
                    const fee =
                      sim.usageCostSims ??
                      calculateCollectionUsageCostSims(
                        sim.creationCostSims ?? 20
                      );
                    return (
                      <option key={sim.id} value={sim.id}>
                        {sim.title} ({unlocked ? 'Free' : `${fee} Sims`})
                      </option>
                    );
                  })}
                </select>
              </div>

              {simulations[enrollSimId] && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold">
                    Character
                  </label>
                  <select
                    value={enrollCharId}
                    onChange={(e) => setEnrollCharId(e.target.value)}
                    className="select select-bordered select-sm w-full bg-base-100"
                  >
                    {Object.values(simulations[enrollSimId].characters).map(
                      (c) => (
                        <option key={c.playerId} value={c.playerId}>
                          {c.characterName} — {c.publicRole}
                        </option>
                      )
                    )}
                  </select>
                </div>
              )}

              <div className="modal-action mt-2">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                >
                  Join Game
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: COMPLETED GAME SUMMARY */}
      {selectedPastDebrief && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg bg-base-200 border border-base-300 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-base-300 pb-3">
              <div>
                <span className="badge badge-xs badge-ghost">
                  Completed
                </span>
                <h3 className="text-base font-bold mt-1">
                  {selectedPastDebrief.simulationTitle}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPastDebrief(null)}
                className="btn btn-ghost btn-sm btn-square"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="card bg-base-100 border border-base-300 p-2.5 text-center">
                <div className="text-[10px] text-base-content/60">Character</div>
                <div className="font-bold text-xs truncate mt-0.5">
                  {selectedPastDebrief.characterName}
                </div>
              </div>
              <div className="card bg-base-100 border border-base-300 p-2.5 text-center">
                <div className="text-[10px] text-base-content/60">Points</div>
                <div className="font-bold text-warning text-xs mt-0.5">
                  {selectedPastDebrief.victoryPointsEarned.toLocaleString()} VP
                </div>
              </div>
              <div className="card bg-base-100 border border-base-300 p-2.5 text-center">
                <div className="text-[10px] text-base-content/60">Rounds</div>
                <div className="font-bold text-xs mt-0.5">
                  {selectedPastDebrief.roundsParticipated}
                </div>
              </div>
            </div>

            <div className="card bg-base-100 border border-base-300 p-3 space-y-1 text-xs">
              <div className="font-semibold text-base-content/70">
                Story Ending
              </div>
              <p className="text-base-content/80">
                {selectedPastDebrief.scenarioSummary}
              </p>
              {selectedPastDebrief.outcomeSummary && (
                <p className="text-success pt-1 border-t border-base-300">
                  {selectedPastDebrief.outcomeSummary}
                </p>
              )}
            </div>

            <div className="modal-action mt-2">
              {simulations[selectedPastDebrief.simulationId] && (
                <button
                  onClick={() => {
                    const simId = selectedPastDebrief.simulationId;
                    const charId = selectedPastDebrief.characterId;
                    setSelectedPastDebrief(null);
                    onEnterSimulation(simId, charId);
                  }}
                  className="btn btn-primary btn-sm"
                >
                  View Game
                </button>
              )}
              <button
                onClick={() => setSelectedPastDebrief(null)}
                className="btn btn-ghost btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ROLE TRANSFER MODAL                                                  */}
      {/* ==================================================================== */}
      {transferTarget && (
        <UserSeatInviteModal
          isOpen={Boolean(transferTarget)}
          onClose={() => setTransferTarget(null)}
          simulation={transferTarget.simulation}
          characterId={transferTarget.characterId}
          currentUser={user}
          inviteType="ROLE_TRANSFER"
          onInviteSent={(updatedSim) => {
            onUpdateSimulation?.(updatedSim);
            setInviteNonce((n) => n + 1);
          }}
        />
      )}
    </div>
  );
};
