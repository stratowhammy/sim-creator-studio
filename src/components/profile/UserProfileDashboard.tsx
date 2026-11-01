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

    if (!hasUserUnlockedSimulation(user, targetSim)) {
      const unlockRes = unlockSimulationWithSims(user.id, targetSim);
      if (!unlockRes.ok) {
        alert(unlockRes.error);
        return;
      }
      onUpdateSimulation?.(unlockRes.updatedSimulation);
      const enrolled = enrollUserInSimulation(
        user.id,
        unlockRes.updatedSimulation,
        enrollCharId
      );
      if (enrolled) onUserUpdated(enrolled);
      setShowEnrollModal(false);
      onEnterSimulation(targetSim.id, enrollCharId);
      return;
    }

    const updated = enrollUserInSimulation(user.id, targetSim, enrollCharId);
    if (updated) {
      onUserUpdated(updated);
      setShowEnrollModal(false);
      onEnterSimulation(targetSim.id, enrollCharId);
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
      msg: `Accepted role in ${res.updatedSimulation.title}! The seat is now yours.`,
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
    <div className="h-screen w-screen overflow-y-auto bg-[#fffef0] text-[#41403e] select-text">
      {/* ==================================================================== */}
      {/* PAPER.CSS NAVBAR HEADER                                              */}
      {/* ==================================================================== */}
      <nav className="border split-nav sticky top-0 z-20 bg-[#fffef0] px-4 py-2">
        <div className="nav-brand flex items-center gap-2">
          {onOpenLandingPage && (
            <button
              type="button"
              onClick={onOpenLandingPage}
              className="paper-btn btn-small inline-flex items-center gap-1"
            >
              <Home className="w-3.5 h-3.5 text-secondary" />
              Home
            </button>
          )}
          <h3 className="m-0 font-bold tracking-tight hidden sm:inline-block">
            Sim Creator Studio
          </h3>
        </div>

        <div className="collapsible">
          <ul className="inline flex items-center gap-2 m-0 p-0 flex-wrap">
            {/* SIMS WALLET BADGE BUTTON */}
            <li>
              <button
                type="button"
                onClick={() => setShowSimsWalletModal(true)}
                className="paper-btn btn-small btn-warning inline-flex items-center gap-1 font-bold"
                title="View your Sims credits"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>{user.simsBalance ?? 0} Sims</span>
              </button>
            </li>

            {canAccessGlobalAdminOverview(user) && onOpenAdminDashboard && (
              <li>
                <button
                  type="button"
                  onClick={onOpenAdminDashboard}
                  className="paper-btn btn-small btn-secondary inline-flex items-center gap-1"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Admin Overview
                </button>
              </li>
            )}

            {user.accountRole === 'SIMULATION_ADMIN' &&
              managedSimId &&
              onOpenAssignedSimAdmin && (
                <li>
                  <button
                    type="button"
                    onClick={() => onOpenAssignedSimAdmin(managedSimId)}
                    className="paper-btn btn-small btn-success inline-flex items-center gap-1"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Run Game
                  </button>
                </li>
              )}

            {canAccessAuthoringStudio(user) && onOpenAuthoringStudio && (
              <li>
                <button
                  type="button"
                  onClick={onOpenAuthoringStudio}
                  className="paper-btn btn-small btn-primary inline-flex items-center gap-1"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Create Game
                </button>
              </li>
            )}

            <li>
              <button
                type="button"
                onClick={handleOpenEditModal}
                className="paper-btn btn-small inline-flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Profile
              </button>
            </li>

            <li>
              <button
                type="button"
                onClick={onSignOut}
                className="paper-btn btn-small btn-danger inline-flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* ==================================================================== */}
      {/* MAIN PROFILE CONTENT                                                 */}
      {/* ==================================================================== */}
      <main className="max-w-6xl mx-auto px-6 py-7 space-y-8">
        {collectionFeedback && (
          <div
            className={`alert ${
              collectionFeedback.type === 'ok' ? 'alert-success' : 'alert-danger'
            } text-xs py-2 flex items-center justify-between`}
          >
            <span>{collectionFeedback.msg}</span>
            <button
              type="button"
              onClick={() => setCollectionFeedback(null)}
              className="float-right font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. USER PROFILE HERO & STATS */}
        <section className="paper bg-white p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div
                className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${user.avatarColor} flex items-center justify-center text-white font-bold text-xl border-2 border-[#41403e] shrink-0`}
              >
                {initials}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold m-0">
                    {user.displayName}
                  </h2>
                  <span className="badge">
                    @{user.username}
                  </span>
                  <span className="badge secondary">
                    {user.callsign}
                  </span>
                  <span className={roleInfo.badgeClass}>
                    {roleInfo.label}
                  </span>
                  {user.accountRole === 'SIMULATION_ADMIN' &&
                    managedSimTitle && (
                      <span className="badge success">
                        {managedSimTitle}
                      </span>
                    )}
                </div>

                <p className="text-sm text-[#555] max-w-2xl leading-relaxed m-0">
                  {user.bio || 'Player in Sim Creator Studio.'}
                </p>

                <div className="flex items-center gap-4 text-xs text-[#777] pt-1 flex-wrap">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {user.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Joined {user.createdAt}
                  </span>
                  {totalRoyaltiesEarned > 0 && (
                    <span className="badge success gap-1">
                      <Coins className="w-3 h-3 inline mr-1" />
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
                className="paper p-2 text-center transition-all cursor-pointer m-0 border-2 hover:bg-[#fff9d9]"
              >
                <div className="text-[10px] uppercase font-bold text-amber-800 mb-0.5 flex items-center justify-center gap-1">
                  <Coins className="w-3.5 h-3.5" />
                  Sims
                </div>
                <div className="text-lg font-bold text-amber-800">
                  {user.simsBalance ?? 0}
                </div>
              </button>

              <div className="paper p-2 text-center m-0 border-2">
                <div className="text-[10px] uppercase font-semibold text-[#777] mb-0.5 flex items-center justify-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-secondary" />
                  Points
                </div>
                <div className="text-lg font-bold">
                  {totalVictoryPoints.toLocaleString()}
                </div>
              </div>

              <div className="paper p-2 text-center m-0 border-2">
                <div className="text-[10px] uppercase font-semibold text-[#777] mb-0.5 flex items-center justify-center gap-1">
                  <Play className="w-3.5 h-3.5 text-success" />
                  Active
                </div>
                <div className="text-lg font-bold text-success">
                  {activeSimulations.length}
                </div>
              </div>

              <div className="paper p-2 text-center m-0 border-2">
                <div className="text-[10px] uppercase font-semibold text-[#777] mb-0.5 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-secondary" />
                  Done
                </div>
                <div className="text-lg font-bold text-secondary">
                  {completedSimulations.length}
                </div>
              </div>

              <div className="paper p-2 text-center m-0 border-2">
                <div className="text-[10px] uppercase font-semibold text-[#777] mb-0.5 flex items-center justify-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Best
                </div>
                <div className="text-lg font-bold text-primary">
                  {highestVp.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PENDING SEAT INVITATIONS */}
        {pendingInvites.length > 0 && (
          <section className="paper bg-[#fffcf0] border-2 border-warning p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-warning" />
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2 m-0">
                    Game Invites
                    <span className="badge warning">
                      {pendingInvites.length}
                    </span>
                  </h3>
                  <p className="text-xs text-[#666] m-0">
                    You were invited to play a character.
                  </p>
                </div>
              </div>
            </div>

            {inviteActionFeedback && (
              <div
                className={`alert text-xs py-1.5 ${
                  inviteActionFeedback.type === 'ok' ? 'alert-success' : 'alert-danger'
                }`}
              >
                <span>{inviteActionFeedback.msg}</span>
                <button
                  type="button"
                  onClick={() => setInviteActionFeedback(null)}
                  className="float-right font-bold ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="card p-3 flex flex-col justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="badge warning">
                        {invite.inviteType === 'ROLE_TRANSFER' ? 'Role Transfer' : 'Invite'}
                      </span>
                      <span className="text-[10px] text-[#777]">
                        {new Date(invite.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold m-0">
                      {invite.simulationTitle}
                    </h4>
                    <div className="text-xs text-[#555]">
                      Character: <strong className="text-secondary">{invite.characterName}</strong>
                    </div>
                    <div className="text-[11px] text-[#777]">
                      From: @{invite.fromUsername}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-dashed border-[#ccc]">
                    <button
                      type="button"
                      onClick={() => handleAcceptInvite(invite.id)}
                      className="paper-btn btn-small btn-success flex-1 inline-flex items-center justify-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeclineInvite(invite.id)}
                      className="paper-btn btn-small flex-1 inline-flex items-center justify-center gap-1"
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
                <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                <h3 className="text-lg font-bold m-0">
                  Active Games ({activeSimulations.length})
                </h3>
              </div>
              <p className="text-xs text-[#666] m-0">
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
              className="paper-btn btn-small btn-primary inline-flex items-center gap-1"
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
                    className="card cursor-pointer"
                  >
                    <div className="card-body p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge success">
                              Active Room
                            </span>
                            {liveSim?.voiceStyle && (
                              <span className="badge secondary">
                                {liveSim.voiceStyle.name}
                              </span>
                            )}
                            {activePlayersInRoom.length > 0 && (
                              <span className="badge">
                                <Users className="w-3 h-3 inline mr-1" />
                                {activePlayersInRoom.length} online
                              </span>
                            )}
                            {pendingHailsCount > 0 && (
                              <span className="badge warning animate-pulse">
                                <Bell className="w-3 h-3 inline mr-1" />
                                {pendingHailsCount} Incoming
                              </span>
                            )}
                          </div>

                          <h4 className="card-title text-base mt-2 mb-0">
                            {part.simulationTitle}
                          </h4>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="badge font-bold">
                            {part.victoryPointsEarned} VP
                          </span>
                        </div>
                      </div>

                      <p className="card-text text-xs text-[#555] line-clamp-2 m-0">
                        {part.scenarioSummary}
                      </p>

                      {/* Assigned Role Strip */}
                      <div className="p-2.5 rounded bg-[#f5f4e6] border border-dashed border-[#ccc] flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Shield className="w-4 h-4 text-secondary shrink-0" />
                          <div className="truncate">
                            <span className="text-[#666]">Your Role: </span>
                            <strong>
                              {part.characterName}
                            </strong>
                            <span className="mx-1 text-[#aaa]">•</span>
                            <span className="text-secondary font-bold">
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
                            className="paper-btn btn-small btn-warning py-0.5 px-2 inline-flex items-center gap-1"
                            title="Transfer this seat to another user"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            Transfer
                          </button>
                        )}
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-dashed border-[#ccc]">
                        <span className="text-xs text-[#777]">
                          Round {part.roundsParticipated} {liveChar && `• ${liveChar.actionPoints} AP`}
                        </span>

                        <span className="paper-btn btn-small btn-primary py-0.5 px-3 inline-flex items-center gap-1">
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
            <div className="paper p-8 text-center space-y-2">
              <Compass className="w-8 h-8 text-[#999] mx-auto" />
              <div className="text-base font-bold">
                No Active Games
              </div>
              <p className="text-xs text-[#666]">
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
                <Globe className="w-4 h-4 text-secondary" />
                <h3 className="text-lg font-bold m-0">
                  Game Library ({publishedCollectionSimulations.length})
                </h3>
              </div>
              <p className="text-xs text-[#666] m-0">
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
                  className="card flex flex-col justify-between"
                >
                  <div className="card-body p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="badge secondary">
                        {sim.complexityTier ?? 'STANDARD'}
                      </span>
                      {isCreator ? (
                        <span className="badge success">
                          Your Game
                        </span>
                      ) : isUnlocked ? (
                        <span className="badge secondary">
                          <Unlock className="w-2.5 h-2.5 inline mr-1" />
                          Unlocked
                        </span>
                      ) : (
                        <span className="badge warning">
                          <Lock className="w-2.5 h-2.5 inline mr-1" />
                          {playCost} Sims
                        </span>
                      )}
                    </div>

                    <h4 className="card-title text-base m-0">
                      {sim.title}
                    </h4>

                    {sim.voiceStyle && (
                      <div className="text-xs text-secondary font-bold">
                        Voice: {sim.voiceStyle.name}
                      </div>
                    )}

                    <p className="card-text text-xs text-[#555] line-clamp-3 m-0">
                      {sim.masterNarrative}
                    </p>

                    <div className="pt-2 border-t border-dashed border-[#ccc]">
                      <button
                        type="button"
                        onClick={() => handleOpenCollectionModal(sim)}
                        className={`paper-btn btn-small w-full ${
                          isUnlocked ? 'btn-primary' : 'btn-warning'
                        }`}
                      >
                        {isUnlocked ? (
                          <span className="inline-flex items-center gap-1 justify-center">
                            <Play className="w-3.5 h-3.5" />
                            Play Game
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 justify-center">
                            <Coins className="w-3.5 h-3.5" />
                            Unlock for {playCost} Sims
                          </span>
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
                <History className="w-4 h-4 text-secondary" />
                <h3 className="text-lg font-bold m-0">
                  Game History
                </h3>
              </div>
              <p className="text-xs text-[#666] m-0">
                Past games you joined and points earned.
              </p>
            </div>

            <div className="flex gap-1">
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
                  className={`paper-btn btn-small py-0.5 px-2 ${
                    historyFilter === tab.id ? 'btn-primary' : ''
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="table-hover table-alternating w-full text-xs">
              <thead>
                <tr className="uppercase text-[#666]">
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
                      className="cursor-pointer"
                    >
                      <td>
                        <div className="font-bold text-sm">
                          {part.simulationTitle}
                        </div>
                        <div className="text-[11px] text-[#666] line-clamp-1 max-w-md">
                          {part.outcomeSummary || part.scenarioSummary}
                        </div>
                      </td>

                      <td>
                        <div className="font-bold">
                          {part.characterName}
                        </div>
                        <div className="text-[11px] text-secondary">
                          {part.publicRole}
                        </div>
                      </td>

                      <td>
                        {part.status === 'ACTIVE' ? (
                          <span className="badge success">
                            Active
                          </span>
                        ) : (
                          <span className="badge">
                            Completed{' '}
                            {part.completedAt ? `• ${part.completedAt}` : ''}
                          </span>
                        )}
                      </td>

                      <td className="font-mono">
                        {part.roundsParticipated}
                      </td>

                      <td className="text-right">
                        <span className="badge warning font-bold">
                          <Award className="w-3.5 h-3.5 inline mr-1 text-amber-700" />
                          {part.victoryPointsEarned.toLocaleString()} VP
                        </span>
                      </td>

                      <td className="text-right">
                        {part.status === 'ACTIVE' && isLivePlayable ? (
                          <span className="text-secondary font-bold inline-flex items-center gap-1 hover:underline">
                            Enter Room <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="text-[#666] hover:underline">
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
        </section>
      </main>

      {/* MODAL: UNLOCK / PLAY GAME */}
      {collectionTargetSim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="paper max-w-md w-full bg-[#fffef0] border-2 border-[#41403e] shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-dashed border-[#ccc] pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-warning" />
                <h3 className="text-base font-bold m-0">
                  {hasUserUnlockedSimulation(user, collectionTargetSim)
                    ? 'Play Game'
                    : 'Unlock Game'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCollectionTargetSim(null)}
                className="paper-btn btn-small py-0.5 px-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {collectionFeedback && (
              <div className="alert alert-danger text-xs py-2">
                {collectionFeedback.msg}
              </div>
            )}

            <form
              onSubmit={handleConfirmCollectionUnlockAndPlay}
              className="space-y-4 text-xs"
            >
              <div className="paper bg-white p-3 space-y-1 m-0">
                <div className="font-bold text-sm">
                  {collectionTargetSim.title}
                </div>
                {collectionTargetSim.voiceStyle && (
                  <span className="badge secondary">
                    {collectionTargetSim.voiceStyle.name}
                  </span>
                )}
                <p className="text-[#555] text-xs line-clamp-3 m-0">
                  {collectionTargetSim.masterNarrative}
                </p>
              </div>

              {!hasUserUnlockedSimulation(user, collectionTargetSim) && (
                <div className="paper bg-[#fffcf0] border-2 border-warning p-3 flex flex-row items-center justify-between m-0">
                  <div>
                    <div className="font-bold text-amber-800 text-xs">
                      Unlock Price
                    </div>
                    <div className="text-[11px] text-[#666]">
                      Paid to @{collectionTargetSim.creatorUsername ?? 'creator'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-amber-800">
                      {collectionTargetSim.usageCostSims ??
                        calculateCollectionUsageCostSims(
                          collectionTargetSim.creationCostSims ?? 20
                        )}{' '}
                      Sims
                    </div>
                    <div className="text-[10px] text-[#777]">
                      Balance: {user.simsBalance ?? 0} Sims
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold block">
                  Pick Your Character
                </label>
                <select
                  value={collectionRoleId}
                  onChange={(e) => setCollectionRoleId(e.target.value)}
                  className="w-full text-sm"
                >
                  {Object.values(collectionTargetSim.characters).map((c) => (
                    <option key={c.playerId} value={c.playerId}>
                      {c.characterName} — {c.publicRole}
                      {c.isAiControlled ? ' [AI]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-dashed border-[#ccc] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCollectionTargetSim(null)}
                  className="paper-btn btn-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="paper-btn btn-small btn-primary"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="paper max-w-lg w-full bg-[#fffef0] border-2 border-[#41403e] shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-dashed border-[#ccc] pb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-warning" />
                <h3 className="text-base font-bold m-0">
                  Sims Balance &amp; History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSimsWalletModal(false)}
                className="paper-btn btn-small py-0.5 px-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="paper bg-[#fffcf0] border-2 border-warning p-4 flex flex-row items-center justify-between m-0">
              <div>
                <div className="text-[10px] uppercase font-bold text-amber-800">
                  Your Balance
                </div>
                <div className="text-2xl font-bold text-amber-800">
                  {user.simsBalance ?? 0} Sims
                </div>
              </div>
              <div className="text-right text-xs text-[#666] max-w-[200px]">
                Earn Sims when other players unlock your games.
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              <div className="text-xs font-bold text-[#666]">
                Recent Activity
              </div>
              {(user.simTransactions ?? []).length === 0 ? (
                <p className="text-xs text-[#777] py-4 text-center">
                  No activity yet.
                </p>
              ) : (
                (user.simTransactions ?? []).map((tx) => (
                  <div
                    key={tx.id}
                    className="p-2.5 rounded bg-white border border-[#ccc] flex flex-row items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold">
                        {tx.description}
                      </div>
                      <div className="text-[10px] text-[#777]">
                        {new Date(tx.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right font-bold shrink-0">
                      <div
                        className={
                          tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="paper max-w-lg w-full bg-[#fffef0] border-2 border-[#41403e] shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-dashed border-[#ccc] pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-secondary" />
                <h3 className="text-base font-bold m-0">
                  Edit Profile
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                className="paper-btn btn-small py-0.5 px-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {profileFeedback && (
              <div
                className={`alert text-xs py-2 ${
                  profileFeedback.type === 'ok' ? 'alert-success' : 'alert-danger'
                }`}
              >
                {profileFeedback.msg}
              </div>
            )}

            <form onSubmit={handleSaveProfileDetails} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold block">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold block">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={editCallsign}
                    onChange={(e) => setEditCallsign(e.target.value)}
                    className="w-full text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold block">
                  About Me
                </label>
                <textarea
                  rows={2}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="w-full text-sm resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold block">
                  Avatar Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {AVATAR_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditAvatarColor(opt.value)}
                      className={`paper-btn btn-small py-1 px-2 inline-flex items-center gap-1.5 ${
                        editAvatarColor === opt.value ? 'btn-primary' : ''
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
                className="paper-btn btn-primary btn-block"
              >
                Save Changes
              </button>
            </form>

            <form
              onSubmit={handleChangePassword}
              className="pt-3 border-t border-dashed border-[#ccc] space-y-2.5"
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
                className="w-full text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="New password"
                  className="w-full text-sm"
                />
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full text-sm"
                />
              </div>

              <button
                type="submit"
                className="paper-btn btn-secondary btn-block"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ENROLL OR SWITCH ROLE */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="paper max-w-md w-full bg-[#fffef0] border-2 border-[#41403e] shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-dashed border-[#ccc] pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-secondary" />
                <h3 className="text-base font-bold m-0">
                  Pick a Character
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEnrollModal(false)}
                className="paper-btn btn-small py-0.5 px-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-bold block">
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
                  className="w-full text-sm"
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
                  <label className="text-xs font-bold block">
                    Character
                  </label>
                  <select
                    value={enrollCharId}
                    onChange={(e) => setEnrollCharId(e.target.value)}
                    className="w-full text-sm"
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

              <div className="pt-2 border-t border-dashed border-[#ccc] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="paper-btn btn-small"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="paper-btn btn-small btn-primary"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="paper max-w-lg w-full bg-[#fffef0] border-2 border-[#41403e] shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-dashed border-[#ccc] pb-3">
              <div>
                <span className="badge">
                  Completed
                </span>
                <h3 className="text-base font-bold mt-1 m-0">
                  {selectedPastDebrief.simulationTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPastDebrief(null)}
                className="paper-btn btn-small py-0.5 px-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="paper p-2.5 text-center m-0">
                <div className="text-[10px] text-[#777]">Character</div>
                <div className="font-bold text-xs truncate mt-0.5">
                  {selectedPastDebrief.characterName}
                </div>
              </div>
              <div className="paper p-2.5 text-center m-0">
                <div className="text-[10px] text-[#777]">Points</div>
                <div className="font-bold text-amber-800 text-xs mt-0.5">
                  {selectedPastDebrief.victoryPointsEarned.toLocaleString()} VP
                </div>
              </div>
              <div className="paper p-2.5 text-center m-0">
                <div className="text-[10px] text-[#777]">Rounds</div>
                <div className="font-bold text-xs mt-0.5">
                  {selectedPastDebrief.roundsParticipated}
                </div>
              </div>
            </div>

            <div className="paper bg-white p-3 space-y-1 text-xs m-0">
              <div className="font-bold text-[#666]">
                Story Ending
              </div>
              <p className="text-[#444] m-0">
                {selectedPastDebrief.scenarioSummary}
              </p>
              {selectedPastDebrief.outcomeSummary && (
                <p className="text-emerald-700 pt-1 border-t border-dashed border-[#ccc] m-0 font-bold">
                  {selectedPastDebrief.outcomeSummary}
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-dashed border-[#ccc] flex justify-end gap-2">
              {simulations[selectedPastDebrief.simulationId] && (
                <button
                  type="button"
                  onClick={() => {
                    const simId = selectedPastDebrief.simulationId;
                    const charId = selectedPastDebrief.characterId;
                    setSelectedPastDebrief(null);
                    onEnterSimulation(simId, charId);
                  }}
                  className="paper-btn btn-small btn-primary"
                >
                  View Game
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedPastDebrief(null)}
                className="paper-btn btn-small"
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
