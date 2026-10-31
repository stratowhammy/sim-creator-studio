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
    <div className="h-screen w-screen overflow-y-auto bg-slate-950 text-slate-100 font-sans select-text">
      {/* ==================================================================== */}
      {/* TOP NAVIGATION HEADER                                                */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-20 min-h-14 py-2 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onOpenLandingPage && (
            <button
              type="button"
              onClick={onOpenLandingPage}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition-colors"
              title="Visit Sim Creator Studio Landing Page"
            >
              <Home className="w-3.5 h-3.5 text-sky-400" />
              Landing Page
            </button>
          )}
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/40 flex items-center justify-center">
            <Radio className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white">
              Sim Creator Studio
            </span>
            <span className="text-slate-600 mx-2">•</span>
            <span className="text-xs text-slate-400">
              Operative Dossier &amp; Simulation Hub
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* SIMS WALLET BADGE BUTTON */}
          <button
            type="button"
            onClick={() => setShowSimsWalletModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40 text-xs font-bold transition-colors"
            title="View your 'Sims' Credit Balance & Ledger"
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono">{user.simsBalance ?? 0} Sims</span>
          </button>

          {canAccessGlobalAdminOverview(user) && onOpenAdminDashboard && (
            <button
              onClick={onOpenAdminDashboard}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 text-xs font-bold transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              Global Admin Overview
            </button>
          )}

          {user.accountRole === 'SIMULATION_ADMIN' &&
            managedSimId &&
            onOpenAssignedSimAdmin && (
              <button
                onClick={() => onOpenAssignedSimAdmin(managedSimId)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/50 text-xs font-bold transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                Run Simulation: {managedSimTitle}
              </button>
            )}

          {canAccessAuthoringStudio(user) && onOpenAuthoringStudio && (
            <button
              onClick={onOpenAuthoringStudio}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/50 text-xs font-bold transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              Open Authoring Studio
            </button>
          )}

          <button
            onClick={handleOpenEditModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-sky-400" />
            Manage Profile
          </button>

          <button
            onClick={onSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-300 hover:text-rose-200 border border-slate-800 hover:border-rose-700/50 text-xs font-medium transition-colors"
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

        {/* 1. USER PROFILE HERO & CAREER METRICS */}
        <section className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div
                className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${user.avatarColor} flex items-center justify-center text-white font-bold text-xl shadow-lg shrink-0`}
              >
                {initials}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-bold text-white">
                    {user.displayName}
                  </h1>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700">
                    @{user.username}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    {user.callsign}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${roleInfo.badgeClass}`}
                  >
                    {roleInfo.label}
                  </span>
                  {user.accountRole === 'SIMULATION_ADMIN' &&
                    managedSimTitle && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-200 border border-emerald-700/50">
                        Scoped: {managedSimTitle}
                      </span>
                    )}
                </div>

                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  {user.bio || 'No biography set yet.'}
                </p>

                <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-0.5 flex-wrap">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {user.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    Joined {user.createdAt}
                  </span>
                  {totalRoyaltiesEarned > 0 && (
                    <span className="flex items-center gap-1 text-emerald-300 font-semibold">
                      <Coins className="w-3.5 h-3.5 text-emerald-400" />
                      +{totalRoyaltiesEarned} Sims earned from published simulations
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Career & Sims Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowSimsWalletModal(true)}
                className="bg-amber-950/35 hover:bg-amber-950/55 border border-amber-500/40 rounded-xl px-4 py-3 text-center transition-colors"
              >
                <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-amber-200/80 mb-1">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  'Sims' Credits
                </div>
                <div className="text-lg font-bold font-mono text-amber-300">
                  {user.simsBalance ?? 0}
                </div>
              </button>

              <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  Total VP
                </div>
                <div className="text-lg font-bold text-amber-300">
                  {totalVictoryPoints.toLocaleString()}
                </div>
              </div>

              <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  Active Rooms
                </div>
                <div className="text-lg font-bold text-emerald-300">
                  {activeSimulations.length}
                </div>
              </div>

              <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                  Completed
                </div>
                <div className="text-lg font-bold text-sky-300">
                  {completedSimulations.length}
                </div>
              </div>

              <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Best Score
                </div>
                <div className="text-lg font-bold text-purple-300">
                  {highestVp.toLocaleString()} VP
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PENDING SEAT INVITATIONS & ROLE OFFERS */}
        {pendingInvites.length > 0 && (
          <section className="space-y-3 p-5 rounded-2xl bg-amber-950/20 border border-amber-500/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-amber-400 animate-bounce" />
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Pending Seat Invitations &amp; Role Offers
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500 text-slate-950">
                      {pendingInvites.length}
                    </span>
                  </h2>
                  <p className="text-xs text-amber-200/80 mt-0.5">
                    You have been invited to occupy or take over a character seat. Accepting will permanently assign this role to your account.
                  </p>
                </div>
              </div>
            </div>

            {inviteActionFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center justify-between ${
                  inviteActionFeedback.type === 'ok'
                    ? 'bg-emerald-950/70 border border-emerald-500/50 text-emerald-200'
                    : 'bg-rose-950/70 border border-rose-500/50 text-rose-200'
                }`}
              >
                <span>{inviteActionFeedback.msg}</span>
                <button
                  type="button"
                  onClick={() => setInviteActionFeedback(null)}
                  className="text-slate-400 hover:text-white ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 flex flex-col justify-between gap-3 shadow-md"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {invite.inviteType === 'ROLE_TRANSFER' ? 'Role Transfer' : 'Seat Invitation'}
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(invite.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white">
                      {invite.simulationTitle}
                    </div>
                    <div className="text-xs text-slate-300 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-sky-400" />
                      Character: <strong className="text-sky-300">{invite.characterName}</strong>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Offered by: <span className="text-slate-200 font-mono">@{invite.fromUsername}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleAcceptInvite(invite.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Accept Role
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeclineInvite(invite.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. CURRENTLY ACTIVE SIMULATIONS (Click to Enter Room) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <h2 className="text-base font-bold text-white">
                  Active Simulation Rooms ({activeSimulations.length})
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any active simulation below to enter its live room as your assigned character. While inside a room, you can respond directly or pick suggested responses within 30 seconds of any incoming conversation.
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-800 text-xs font-semibold transition-colors shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Enroll / Change Role
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
                    className="group cursor-pointer rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-sky-500/70 p-5 transition-all shadow-lg flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active Room
                            </span>
                            {liveSim?.voiceStyle && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30 font-semibold">
                                <Mic className="w-2.5 h-2.5" />
                                {liveSim.voiceStyle.name}
                              </span>
                            )}
                            {activePlayersInRoom.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                <Users className="w-3 h-3" />
                                {activePlayersInRoom.length} online
                              </span>
                            )}
                            {pendingHailsCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/50 animate-pulse">
                                <Bell className="w-3 h-3 text-amber-400" />
                                {pendingHailsCount} Incoming Hail
                              </span>
                            )}
                          </div>

                          <h3 className="text-base font-bold text-white mt-2 group-hover:text-sky-300 transition-colors">
                            {part.simulationTitle}
                          </h3>
                        </div>

                        <div className="text-right shrink-0 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                          <div className="text-[10px] text-slate-400">
                            Earned VP
                          </div>
                          <div className="text-sm font-bold text-sky-300">
                            {part.victoryPointsEarned.toLocaleString()} VP
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {part.scenarioSummary}
                      </p>

                      {/* Assigned Role Strip */}
                      <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/90 flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Shield className="w-4 h-4 text-sky-400 shrink-0" />
                          <div className="truncate">
                            <span className="text-slate-400">Your Role: </span>
                            <strong className="text-white">
                              {part.characterName}
                            </strong>
                            <span className="text-slate-500 mx-1.5">•</span>
                            <span className="text-sky-300">
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
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-500/50 text-[11px] font-semibold transition-colors shrink-0"
                            title="Transfer this seat to another user by username"
                          >
                            <ArrowRightLeft className="w-3 h-3 text-amber-400" />
                            <span>Transfer Role</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3 text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          Round{' '}
                          <strong className="text-slate-200">
                            {part.roundsParticipated}
                          </strong>
                        </span>
                        {liveChar && (
                          <span className="flex items-center gap-1">
                            <Zap className="w-3.5 h-3.5 text-emerald-400" />
                            <strong className="text-emerald-300">
                              {liveChar.actionPoints}
                            </strong>{' '}
                            AP ready
                          </span>
                        )}
                      </div>

                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-500 group-hover:bg-sky-400 text-slate-950 font-bold text-xs transition-colors">
                        Enter Simulation
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-900/40 border border-slate-800 p-8 text-center space-y-2">
              <Compass className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">
                No Active Simulations
              </div>
              <p className="text-xs text-slate-500">
                Unlock a scenario from the Available Simulations Collection below to enter a live simulation room.
              </p>
            </div>
          )}
        </section>

        {/* 3. AVAILABLE SIMULATIONS COLLECTION ('SIMS' CREATOR ECONOMY) */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-bold text-white">
                  Available Simulations Collection ({publishedCollectionSimulations.length})
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Unlock community &amp; studio simulations for a nominal{' '}
                <strong className="text-amber-300">10% of the creator's 'Sims' cost</strong>. 100% of your unlock fee is credited directly to the creator!
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
                  className="rounded-2xl bg-slate-900/75 border border-slate-800 hover:border-amber-500/50 p-5 flex flex-col justify-between transition-all space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-700/50">
                        {sim.complexityTier ?? 'STANDARD'}
                      </span>
                      {sim.createdWithV4Pro && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-fuchsia-950/70 text-fuchsia-300 border border-fuchsia-700/50">
                          V4 Pro Authored
                        </span>
                      )}
                      {isCreator ? (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-700/50">
                          Your Work (+{sim.totalRoyaltiesEarnedSims ?? 0} Sims Earned)
                        </span>
                      ) : isUnlocked ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-700/50">
                          <Unlock className="w-2.5 h-2.5" />
                          Unlocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-600/50">
                          <Lock className="w-2.5 h-2.5" />
                          {playCost} Sims (10%)
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-white leading-snug">
                      {sim.title}
                    </h3>

                    {sim.voiceStyle && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] text-violet-300 bg-violet-950/40 px-2.5 py-1 rounded-lg border border-violet-800/50">
                        <Mic className="w-3 h-3 text-violet-400 shrink-0" />
                        <span className="truncate">
                          Voice: <strong>{sim.voiceStyle.name}</strong>
                        </span>
                      </div>
                    )}

                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                      {sim.masterNarrative}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        By{' '}
                        <strong className="text-slate-200">
                          @{sim.creatorUsername ?? 'studio'}
                        </strong>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        Creator Paid: {creatorPaid} Sims
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenCollectionModal(sim)}
                      className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                        isUnlocked
                          ? 'bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow'
                      }`}
                    >
                      {isUnlocked ? (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          Choose Role &amp; Play (Unlocked)
                        </>
                      ) : (
                        <>
                          <Coins className="w-3.5 h-3.5" />
                          Unlock &amp; Play for {playCost} Sims
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. ALL PARTICIPATED SIMULATIONS & VICTORY POINTS RECORD */}
        <section className="space-y-4 pb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-purple-400" />
                <h2 className="text-base font-bold text-white">
                  Simulation Participation &amp; Victory Point History
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete record of every simulation you have participated in, your assigned role, and Victory Points earned.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs self-start">
              {(
                [
                  { id: 'ALL', label: `All (${participations.length})` },
                  {
                    id: 'ACTIVE',
                    label: `Active (${activeSimulations.length})`,
                  },
                  {
                    id: 'COMPLETED',
                    label: `Completed (${completedSimulations.length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    historyFilter === tab.id
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4 font-semibold">Simulation</th>
                    <th className="py-3.5 px-4 font-semibold">
                      Character &amp; Role
                    </th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Rounds</th>
                    <th className="py-3.5 px-4 font-semibold text-right">
                      Victory Points
                    </th>
                    <th className="py-3.5 px-4 font-semibold text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
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
                        className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-100">
                            {part.simulationTitle}
                          </div>
                          <div className="text-[11px] text-slate-400 line-clamp-1 max-w-md mt-0.5">
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

      {/* ==================================================================== */}
      {/* MODAL: UNLOCK / PLAY COLLECTION SIMULATION                           */}
      {/* ==================================================================== */}
      {collectionTargetSim && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  {hasUserUnlockedSimulation(user, collectionTargetSim)
                    ? 'Enter Collection Simulation'
                    : 'Unlock Simulation with Sims'}
                </h3>
              </div>
              <button
                onClick={() => setCollectionTargetSim(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {collectionFeedback && (
              <div className="p-3 rounded-xl text-xs bg-rose-950/50 border border-rose-500/50 text-rose-200">
                {collectionFeedback.msg}
              </div>
            )}

            <form
              onSubmit={handleConfirmCollectionUnlockAndPlay}
              className="space-y-4 text-xs"
            >
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-bold text-white text-sm">
                  {collectionTargetSim.title}
                </div>
                {collectionTargetSim.voiceStyle && (
                  <div className="text-[11px] text-violet-300">
                    Speech Style: {collectionTargetSim.voiceStyle.name}
                  </div>
                )}
                <p className="text-slate-400 leading-relaxed">
                  {collectionTargetSim.masterNarrative}
                </p>
              </div>

              {!hasUserUnlockedSimulation(user, collectionTargetSim) && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-amber-200">
                      Nominal 10% Collection Cost
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Paid directly to creator @
                      {collectionTargetSim.creatorUsername ?? 'architect'}
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-amber-300">
                      {collectionTargetSim.usageCostSims ??
                        calculateCollectionUsageCostSims(
                          collectionTargetSim.creationCostSims ?? 20
                        )}{' '}
                      Sims
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Wallet: {user.simsBalance ?? 0} Sims
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-300 mb-1.5">
                  Choose Your Character Role
                </label>
                <select
                  value={collectionRoleId}
                  onChange={(e) => setCollectionRoleId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  {Object.values(collectionTargetSim.characters).map((c) => (
                    <option key={c.playerId} value={c.playerId}>
                      {c.characterName} — {c.publicRole}
                      {c.isAiControlled ? ' [AI Controlled Seat]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCollectionTargetSim(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                >
                  {hasUserUnlockedSimulation(user, collectionTargetSim)
                    ? 'Enter Room Now'
                    : `Spend ${
                        collectionTargetSim.usageCostSims ??
                        calculateCollectionUsageCostSims(
                          collectionTargetSim.creationCostSims ?? 20
                        )
                      } Sims & Enter Room`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: 'SIMS' WALLET & TRANSACTION LEDGER                            */}
      {/* ==================================================================== */}
      {showSimsWalletModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  'Sims' Credit Wallet &amp; Ledger
                </h3>
              </div>
              <button
                onClick={() => setShowSimsWalletModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-amber-200/80">
                  Available Balance
                </div>
                <div className="text-2xl font-bold font-mono text-amber-300">
                  {user.simsBalance ?? 0} Sims
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-400 max-w-[230px]">
                Earn Sims when Admins gift credits or when other users spend 10% Sims unlocking your published simulations.
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Recent Transactions
              </div>
              {(user.simTransactions ?? []).length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No transactions recorded yet.
                </p>
              ) : (
                (user.simTransactions ?? []).map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-200">
                        {tx.description}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {new Date(tx.timestamp).toLocaleString()} •{' '}
                        {tx.type.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div
                        className={`font-bold ${
                          tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} Sims
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Bal: {tx.balanceAfter}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: EDIT PROFILE & PASSWORD MANAGEMENT                          */}
      {/* ==================================================================== */}
      {showEditProfile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white">
                  Profile &amp; Security Settings
                </h3>
              </div>
              <button
                onClick={() => setShowEditProfile(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {profileFeedback && (
              <div
                className={`p-3 rounded-xl text-xs border ${
                  profileFeedback.type === 'ok'
                    ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                    : 'bg-rose-950/50 border-rose-500/50 text-rose-200'
                }`}
              >
                {profileFeedback.msg}
              </div>
            )}

            <form onSubmit={handleSaveProfileDetails} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Callsign
                  </label>
                  <input
                    type="text"
                    value={editCallsign}
                    onChange={(e) => setEditCallsign(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Operative Bio
                </label>
                <textarea
                  rows={2}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Avatar Badge Theme
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {AVATAR_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditAvatarColor(opt.value)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center gap-2 transition-all ${
                        editAvatarColor === opt.value
                          ? 'border-sky-400 bg-slate-800 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${opt.value}`}
                      />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-colors"
              >
                Save Profile Changes
              </button>
            </form>

            <form
              onSubmit={handleChangePassword}
              className="pt-4 border-t border-slate-800 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                Change Password
              </div>

              <input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Current password"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="New password (6+ chars)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: ENROLL OR SWITCH ROLE IN SIMULATION                         */}
      {/* ==================================================================== */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white">
                  Simulation Role Assignment
                </h3>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1.5">
                  Select Simulation Scenario
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500"
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
                        {sim.title} ({unlocked ? 'Unlocked' : `${fee} Sims`})
                      </option>
                    );
                  })}
                </select>
              </div>

              {simulations[enrollSimId] && (
                <div>
                  <label className="block font-medium text-slate-300 mb-1.5">
                    Assigned Character Role
                  </label>
                  <select
                    value={enrollCharId}
                    onChange={(e) => setEnrollCharId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    {Object.values(simulations[enrollSimId].characters).map(
                      (c) => (
                        <option key={c.playerId} value={c.playerId}>
                          {c.characterName} — {c.publicRole} ({c.victoryPoints}{' '}
                          VP)
                        </option>
                      )
                    )}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: COMPLETED SIMULATION DEBRIEF                                */}
      {/* ==================================================================== */}
      {selectedPastDebrief && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Archive Record
                </span>
                <h3 className="text-base font-bold text-white">
                  {selectedPastDebrief.simulationTitle}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPastDebrief(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400">Role Played</div>
                <div className="font-bold text-white mt-0.5">
                  {selectedPastDebrief.characterName}
                </div>
                <div className="text-[11px] text-sky-300">
                  {selectedPastDebrief.publicRole}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400">Victory Points</div>
                <div className="text-base font-bold text-amber-300 mt-0.5">
                  {selectedPastDebrief.victoryPointsEarned.toLocaleString()} VP
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400">Duration</div>
                <div className="text-base font-bold text-slate-200 mt-0.5">
                  {selectedPastDebrief.roundsParticipated} Rounds
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs">
              <div className="font-semibold text-slate-300">
                Scenario &amp; Outcome
              </div>
              <p className="text-slate-400 leading-relaxed">
                {selectedPastDebrief.scenarioSummary}
              </p>
              {selectedPastDebrief.outcomeSummary && (
                <p className="text-emerald-300 pt-1.5 border-t border-slate-800/80">
                  Outcome: {selectedPastDebrief.outcomeSummary}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              {simulations[selectedPastDebrief.simulationId] && (
                <button
                  onClick={() => {
                    const simId = selectedPastDebrief.simulationId;
                    const charId = selectedPastDebrief.characterId;
                    setSelectedPastDebrief(null);
                    onEnterSimulation(simId, charId);
                  }}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs"
                >
                  Inspect Simulation Room
                </button>
              )}
              <button
                onClick={() => setSelectedPastDebrief(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
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
