import React, { useEffect, useMemo, useState } from 'react';
import { SimulationState, SpeechStyle } from '../../types/simulation';
import { AccountRole, UserAccount } from '../../types/user';
import {
  loadAllUsers,
  ROLE_BADGE_INFO,
  updateUserRoleAndPermissions,
} from '../../services/authService';
import { getActivePlayersInSimulation } from '../../services/presenceService';
import {
  DEEPSEEK_FLASH_MODEL,
  DEEPSEEK_V4_PRO_MODEL,
} from '../../services/llmOrchestrator';
import {
  addSpeechStyleToCollection,
  giftSimsFromAdmin,
  loadSpeechStyleCollection,
} from '../../services/simsEconomyService';
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  Database,
  Eye,
  Gift,
  KeyRound,
  Layers,
  LogOut,
  MessageSquare,
  Mic,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  Terminal,
  User,
  Users,
} from 'lucide-react';

interface AdminSimulationsOverviewProps {
  currentUser: UserAccount;
  simulations: Record<string, SimulationState>;
  voiceCollection?: SpeechStyle[];
  testV4Pro: boolean;
  onToggleTestV4Pro: (enabled: boolean) => void;
  onSelectGameAdmin: (simulationId: string) => void;
  onOpenStudio: () => void;
  onOpenProfile: () => void;
  onUsersChanged: (updatedUsers: UserAccount[]) => void;
  onVoicesChanged?: (updatedVoices: SpeechStyle[]) => void;
  onSignOut: () => void;
}

export const AdminSimulationsOverview: React.FC<AdminSimulationsOverviewProps> = ({
  currentUser,
  simulations,
  voiceCollection,
  testV4Pro,
  onToggleTestV4Pro,
  onSelectGameAdmin,
  onOpenStudio,
  onOpenProfile,
  onUsersChanged,
  onVoicesChanged,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<
    'SIMULATIONS' | 'ROLES' | 'ECONOMY_VOICES'
  >('SIMULATIONS');
  const [simFilter, setSimFilter] = useState<'ACTIVE' | 'ALL' | 'COMPLETED'>(
    'ACTIVE'
  );

  // Role Management state
  const [users, setUsers] = useState<UserAccount[]>(() => loadAllUsers());
  const [draftRoles, setDraftRoles] = useState<Record<string, AccountRole>>({});
  const [draftManagedSim, setDraftManagedSim] = useState<Record<string, string>>(
    {}
  );
  const [roleFeedback, setRoleFeedback] = useState<{
    type: 'ok' | 'err';
    message: string;
  } | null>(null);

  // Gift 'Sims' state
  const [giftRecipientId, setGiftRecipientId] = useState<string>(
    () => loadAllUsers().find((u) => u.id !== currentUser.id)?.id ?? currentUser.id
  );
  const [giftAmount, setGiftAmount] = useState<number>(50);
  const [giftNote, setGiftNote] = useState<string>('');
  const [economyFeedback, setEconomyFeedback] = useState<{
    type: 'ok' | 'err';
    message: string;
  } | null>(null);

  // Speech Style Collection Manager state
  const [voices, setVoices] = useState<SpeechStyle[]>(
    () => voiceCollection ?? loadSpeechStyleCollection()
  );
  const [newVoiceName, setNewVoiceName] = useState<string>('');
  const [newVoiceGenre, setNewVoiceGenre] = useState<string>('');
  const [newVoiceAuthor, setNewVoiceAuthor] = useState<string>('');
  const [newVoiceTagline, setNewVoiceTagline] = useState<string>('');
  const [newVoiceDirective, setNewVoiceDirective] = useState<string>('');
  const [newVoiceSample, setNewVoiceSample] = useState<string>('');

  // Refresh local user & voice lists whenever props update
  useEffect(() => {
    setUsers(loadAllUsers());
  }, [currentUser]);

  useEffect(() => {
    if (voiceCollection) {
      setVoices(voiceCollection);
    }
  }, [voiceCollection]);

  const simList = useMemo(() => Object.values(simulations), [simulations]);
  const defaultSimId = simList[0]?.id ?? 'sim_helios_001';

  const activeSims = useMemo(
    () => simList.filter((s) => s.status !== 'COMPLETED'),
    [simList]
  );
  const completedSims = useMemo(
    () => simList.filter((s) => s.status === 'COMPLETED'),
    [simList]
  );
  const publishedCollectionSims = useMemo(
    () => simList.filter((s) => s.publishedToCollection),
    [simList]
  );

  const displayedSims = useMemo(() => {
    if (simFilter === 'ACTIVE') return activeSims;
    if (simFilter === 'COMPLETED') return completedSims;
    return simList;
  }, [simList, activeSims, completedSims, simFilter]);

  // Platform-wide aggregated telemetry
  const platformStats = useMemo(() => {
    let onlineCount = 0;
    let totalInteractions = 0;
    let pendingHails = 0;

    for (const sim of simList) {
      onlineCount += getActivePlayersInSimulation(sim.id).length;
      totalInteractions += sim.interactions.length;
      pendingHails += (sim.pendingEngagements ?? []).filter(
        (pe) =>
          pe.status === 'NOTIFYING' ||
          pe.status === 'FOCUSED' ||
          pe.status === 'QUEUED_MOMENTARILY'
      ).length;
    }

    return { onlineCount, totalInteractions, pendingHails };
  }, [simList]);

  const handleSaveUserRole = (targetUser: UserAccount) => {
    setRoleFeedback(null);
    const chosenRole = draftRoles[targetUser.id] ?? targetUser.accountRole;
    const chosenSimId =
      draftManagedSim[targetUser.id] ??
      targetUser.managedSimulationIds?.[0] ??
      defaultSimId;

    const result = updateUserRoleAndPermissions(
      currentUser,
      targetUser.id,
      chosenRole,
      chosenRole === 'SIMULATION_ADMIN' ? [chosenSimId] : undefined
    );

    if (!result.ok) {
      setRoleFeedback({ type: 'err', message: result.error });
      return;
    }

    setUsers(result.allUsers);
    onUsersChanged(result.allUsers);
    const simTitle = simulations[chosenSimId]?.title ?? chosenSimId;
    setRoleFeedback({
      type: 'ok',
      message:
        chosenRole === 'SIMULATION_ADMIN'
          ? `Updated @${targetUser.username} to Simulation Admin for "${simTitle}".`
          : `Updated @${targetUser.username} to ${ROLE_BADGE_INFO[chosenRole].label}.`,
    });
  };

  const handleGiftSims = (
    targetUserId: string,
    amount: number,
    note?: string,
    showInRoleTab: boolean = false
  ) => {
    const res = giftSimsFromAdmin(currentUser, targetUserId, amount, note);
    if (!res.ok) {
      if (showInRoleTab) {
        setRoleFeedback({ type: 'err', message: res.error });
      } else {
        setEconomyFeedback({ type: 'err', message: res.error });
      }
      return;
    }

    setUsers(res.allUsers);
    onUsersChanged(res.allUsers);
    setGiftNote('');

    const msg = `Gifted +${amount} Sims to ${res.recipient.displayName} (@${res.recipient.username}). New wallet balance: ${res.recipient.simsBalance} Sims.`;
    if (showInRoleTab) {
      setRoleFeedback({ type: 'ok', message: msg });
    } else {
      setEconomyFeedback({ type: 'ok', message: msg });
    }
  };

  const handleAddSpeechStyle = (e: React.FormEvent) => {
    e.preventDefault();
    setEconomyFeedback(null);

    const res = addSpeechStyleToCollection(currentUser, {
      name: newVoiceName,
      genre: newVoiceGenre,
      authorInspiration: newVoiceAuthor,
      tagline: newVoiceTagline,
      styleDirective: newVoiceDirective,
      sampleLine: newVoiceSample,
    });

    if (!res.ok) {
      setEconomyFeedback({ type: 'err', message: res.error });
      return;
    }

    setVoices(res.collection);
    onVoicesChanged?.(res.collection);
    setNewVoiceName('');
    setNewVoiceGenre('');
    setNewVoiceAuthor('');
    setNewVoiceTagline('');
    setNewVoiceDirective('');
    setNewVoiceSample('');
    setEconomyFeedback({
      type: 'ok',
      message: `Added "${res.created.name}" to the Global AI Speech Style Collection! Creators can now select it immediately.`,
    });
  };

  return (
    <div className="h-screen w-screen overflow-y-auto bg-slate-950 text-slate-100 font-sans select-text">
      {/* ==================================================================== */}
      {/* GLOBAL ADMIN MULTI-GAME HEADER                                       */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-30 border-b border-amber-900/40 bg-slate-900/95 backdrop-blur px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">
                Global Admin Command Center
              </h1>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Multi-Game Overview
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Monitor running games, gift 'Sims' credits, curate AI Speech Styles, and manage user roles
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* TEST V4 PRO TOGGLE */}
          <button
            type="button"
            onClick={() => onToggleTestV4Pro(!testV4Pro)}
            role="switch"
            aria-checked={testV4Pro}
            title={
              testV4Pro
                ? 'Active: DeepSeek prompts use deepseek-v4-pro. Click to revert to deepseek-flash.'
                : 'Default: DeepSeek prompts use deepseek-flash. Toggle ON to test deepseek-v4-pro.'
            }
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
              testV4Pro
                ? 'bg-fuchsia-950/70 border-fuchsia-400/70 text-fuchsia-200 shadow-lg shadow-fuchsia-500/15 ring-1 ring-fuchsia-400/30'
                : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            <Sparkles
              className={`w-3.5 h-3.5 ${
                testV4Pro ? 'text-fuchsia-300 animate-pulse' : 'text-slate-400'
              }`}
            />
            <span>Test V4 Pro</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                testV4Pro
                  ? 'bg-fuchsia-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {testV4Pro ? 'ON (v4-pro)' : 'OFF (flash)'}
            </span>
          </button>

          <button
            onClick={onOpenStudio}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-200 border border-purple-700/50 text-xs font-semibold transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            Authoring Studio
          </button>

          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
          >
            <User className="w-3.5 h-3.5 text-sky-400" />
            My Profile ({currentUser.simsBalance ?? 0} Sims)
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

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ================================================================== */}
        {/* PLATFORM KPI TELEMETRY BAR                                         */}
        {/* ================================================================== */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="bg-slate-900/75 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>Active Games Running</span>
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            </div>
            <div className="text-2xl font-bold text-emerald-300">
              {activeSims.length}
              <span className="text-xs font-normal text-slate-500 ml-1.5">
                / {simList.length} total
              </span>
            </div>
          </div>

          <div className="bg-slate-900/75 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>Published in Collection</span>
              <Coins className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-300">
              {publishedCollectionSims.length}
              <span className="text-xs font-normal text-slate-500 ml-1.5">
                • {voices.length} voices
              </span>
            </div>
          </div>

          <div className="bg-slate-900/75 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>Live Players in Rooms</span>
              <Users className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-2xl font-bold text-sky-300">
              {platformStats.onlineCount}
            </div>
          </div>

          <div className="bg-slate-900/75 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>Logged Interactions</span>
              <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-purple-300">
              {platformStats.totalInteractions}
              {platformStats.pendingHails > 0 && (
                <span className="text-xs font-normal text-amber-300 ml-1.5">
                  ({platformStats.pendingHails} live)
                </span>
              )}
            </div>
          </div>

          <div
            className={`rounded-xl p-4 border ${
              testV4Pro
                ? 'bg-fuchsia-950/35 border-fuchsia-500/50'
                : 'bg-slate-900/75 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span>Active DeepSeek Model</span>
              <Cpu
                className={`w-3.5 h-3.5 ${
                  testV4Pro ? 'text-fuchsia-400' : 'text-sky-400'
                }`}
              />
            </div>
            <div
              className={`text-sm font-mono font-bold truncate pt-1 ${
                testV4Pro ? 'text-fuchsia-300' : 'text-sky-300'
              }`}
            >
              {testV4Pro ? DEEPSEEK_V4_PRO_MODEL : DEEPSEEK_FLASH_MODEL}
            </div>
          </div>
        </section>

        {/* ================================================================== */}
        {/* WORKSPACE SECTION TABS                                             */}
        {/* ================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('SIMULATIONS')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors ${
                activeTab === 'SIMULATIONS'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Running Simulations ({activeSims.length} Active)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ECONOMY_VOICES')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors ${
                activeTab === 'ECONOMY_VOICES'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              'Sims' Gifting &amp; AI Speech Styles ({voices.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ROLES')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors ${
                activeTab === 'ROLES'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              User Roles &amp; Permissions ({users.length} Accounts)
            </button>
          </div>

          {activeTab === 'SIMULATIONS' && (
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              {(
                [
                  { id: 'ACTIVE', label: `Active Running (${activeSims.length})` },
                  { id: 'ALL', label: `All Games (${simList.length})` },
                  { id: 'COMPLETED', label: `Completed (${completedSims.length})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSimFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    simFilter === f.id
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ================================================================== */}
        {/* TAB 1: MULTI-GAME SIMULATIONS OVERVIEW GRID                        */}
        {/* ================================================================== */}
        {activeTab === 'SIMULATIONS' && (
          <section className="space-y-4 pb-10">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Click into any running game below to open its single-game{' '}
                <strong className="text-amber-300">Admin Dashboard</strong> (live AP testing, exact Player Dashboard preview, server stats, and RAG partition inspector).
              </p>
            </div>

            {displayedSims.length === 0 ? (
              <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-10 text-center space-y-2">
                <Database className="w-8 h-8 text-slate-600 mx-auto" />
                <div className="text-sm font-bold text-slate-300">
                  No simulations match the selected status filter
                </div>
                <p className="text-xs text-slate-500">
                  Switch the filter above to view other simulations or compile a new scenario in the Authoring Studio.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {displayedSims.map((sim) => {
                  const chars = Object.values(sim.characters).sort(
                    (a, b) => b.victoryPoints - a.victoryPoints
                  );
                  const cardsList = Object.values(sim.cards);
                  const goalsList = Object.values(sim.goals);
                  const solvedGoalsCount = goalsList.filter(
                    (g) => g.completedByPlayerIds.length > 0
                  ).length;
                  const onlinePlayers = getActivePlayersInSimulation(sim.id);
                  const activePending = (sim.pendingEngagements ?? []).filter(
                    (pe) =>
                      pe.status === 'NOTIFYING' ||
                      pe.status === 'FOCUSED' ||
                      pe.status === 'QUEUED_MOMENTARILY'
                  );
                  const assignedSimAdmins = users.filter(
                    (u) =>
                      u.accountRole === 'SIMULATION_ADMIN' &&
                      (u.managedSimulationIds ?? []).includes(sim.id)
                  );

                  return (
                    <div
                      key={sim.id}
                      onClick={() => onSelectGameAdmin(sim.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectGameAdmin(sim.id);
                        }
                      }}
                      className="group cursor-pointer rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/70 p-5 transition-all shadow-xl flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3.5">
                        {/* Card Top Meta Row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {sim.status !== 'COMPLETED' ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/35">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Active Simulation
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                  <CheckCircle2 className="w-3 h-3 text-slate-400" />
                                  Completed
                                </span>
                              )}

                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                                {sim.id}
                              </span>

                              {sim.voiceStyle && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-700/50 font-semibold">
                                  Voice: {sim.voiceStyle.name}
                                </span>
                              )}

                              {sim.publishedToCollection && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-700/50">
                                  Play Cost: {sim.usageCostSims ?? 2} Sims (10%)
                                </span>
                              )}

                              {onlinePlayers.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/35">
                                  <Eye className="w-3 h-3" />
                                  {onlinePlayers.length} Online
                                </span>
                              )}

                              {activePending.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/45 animate-pulse">
                                  <Bell className="w-3 h-3 text-amber-400" />
                                  {activePending.length} Live Hail
                                </span>
                              )}
                            </div>

                            <h2 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors">
                              {sim.title}
                            </h2>
                          </div>

                          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-right shrink-0">
                            <div className="text-[10px] font-mono uppercase text-slate-400">
                              Round / Tick
                            </div>
                            <div className="text-base font-bold font-mono text-amber-300">
                              {sim.currentTurnOrTick}
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {sim.masterNarrative}
                        </p>

                        {/* Telemetry Pill Metrics */}
                        <div className="grid grid-cols-4 gap-2 text-center font-mono text-[11px]">
                          <div className="bg-slate-950/90 border border-slate-800/90 rounded-lg py-2 px-2">
                            <div className="text-[9px] uppercase text-slate-500">
                              Complexity
                            </div>
                            <div className="font-bold text-purple-300">
                              {sim.complexityTier ?? 'STANDARD'}
                            </div>
                          </div>
                          <div className="bg-slate-950/90 border border-slate-800/90 rounded-lg py-2 px-2">
                            <div className="text-[9px] uppercase text-slate-500">
                              InfoCards
                            </div>
                            <div className="font-bold text-sky-300">
                              {cardsList.length}
                            </div>
                          </div>
                          <div className="bg-slate-950/90 border border-slate-800/90 rounded-lg py-2 px-2">
                            <div className="text-[9px] uppercase text-slate-500">
                              Goals Solved
                            </div>
                            <div className="font-bold text-emerald-300">
                              {solvedGoalsCount} / {goalsList.length}
                            </div>
                          </div>
                          <div className="bg-slate-950/90 border border-slate-800/90 rounded-lg py-2 px-2">
                            <div className="text-[9px] uppercase text-slate-500">
                              Interactions
                            </div>
                            <div className="font-bold text-amber-300">
                              {sim.interactions.length}
                            </div>
                          </div>
                        </div>

                        {/* Character Roster Standings Mini-Table */}
                        <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
                            <span>Live Character Standings &amp; AP</span>
                            <span>
                              {assignedSimAdmins.length > 0
                                ? `Sim Admin: ${assignedSimAdmins
                                    .map((a) => `@${a.username}`)
                                    .join(', ')}`
                                : sim.creatorUsername
                                ? `Creator: @${sim.creatorUsername}`
                                : 'Sim Admin: Global Admin'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-xs">
                            {chars.map((c) => (
                              <div
                                key={c.playerId}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800/70"
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="font-semibold text-slate-200 truncate text-[11px]">
                                    {c.characterName}
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {c.publicRole}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
                                  <span className="text-amber-300 font-bold">
                                    {c.victoryPoints} VP
                                  </span>
                                  <span className="text-slate-600">•</span>
                                  <span className="text-emerald-400">
                                    {c.actionPoints} AP
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Footer Action Bar */}
                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            {sim.interactions.length > 0
                              ? `Last exchange on Turn ${
                                  sim.interactions[sim.interactions.length - 1]
                                    .tickOrTurn
                                }`
                              : 'Ready at Turn 0 — awaiting initial exchanges'}
                          </span>
                        </div>

                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 group-hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow">
                          Open Game Admin
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ================================================================== */}
        {/* TAB 2: 'SIMS' GIFTING & GLOBAL AI SPEECH STYLE COLLECTION          */}
        {/* ================================================================== */}
        {activeTab === 'ECONOMY_VOICES' && (
          <section className="space-y-6 pb-10">
            {economyFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                  economyFeedback.type === 'ok'
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                }`}
              >
                <span>{economyFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setEconomyFeedback(null)}
                  className="text-slate-400 hover:text-white ml-4"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Admin Gift 'Sims' Credits Panel */}
              <div className="lg:col-span-5 bg-slate-900/75 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
                    <Gift className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      Gift 'Sims' Credits to Users
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Grant Sims for simulation authoring, V4 Pro compilation, custom voices, or collection unlocks
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Recipient User Account
                    </label>
                    <select
                      value={giftRecipientId}
                      onChange={(e) => setGiftRecipientId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName} (@{u.username}) — Balance: {u.simsBalance ?? 0}{' '}
                          Sims
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Sims Amount to Gift
                    </label>
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      {[25, 50, 100, 250, 500].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGiftAmount(preset)}
                          className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border transition-colors ${
                            giftAmount === preset
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-slate-950 text-amber-300 border-slate-800 hover:border-amber-500/50'
                          }`}
                        >
                          +{preset} Sims
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={giftAmount}
                      onChange={(e) => setGiftAmount(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-amber-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Optional Gift Note
                    </label>
                    <input
                      type="text"
                      value={giftNote}
                      onChange={(e) => setGiftNote(e.target.value)}
                      placeholder="e.g., Creator grant for Labyrinthine V4 Pro scenario"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleGiftSims(giftRecipientId, giftAmount, giftNote, false)
                    }
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow transition-colors"
                  >
                    <Gift className="w-4 h-4" />
                    Gift +{giftAmount} Sims to Selected User
                  </button>
                </div>

                {/* Live Wallet Standings Mini-List */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Current User 'Sims' Balances
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800/80 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-slate-200">
                            {u.displayName}
                          </span>{' '}
                          <span className="font-mono text-[10px] text-sky-400">
                            @{u.username}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-amber-300">
                          {u.simsBalance ?? 0} Sims
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Add New Speech Style to Global Collection */}
              <div className="lg:col-span-7 bg-slate-900/75 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/40 flex items-center justify-center">
                      <Mic className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">
                        AI Speech Styles Collection ({voices.length} Styles)
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        Add new shared AI voices to the studio collection so all creators can apply them to simulations
                      </p>
                    </div>
                  </div>
                </div>

                <form
                  onSubmit={handleAddSpeechStyle}
                  className="p-4 rounded-xl bg-slate-950/80 border border-violet-500/30 space-y-3 text-xs"
                >
                  <div className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" />
                    Add New Single-Author Genre Speech Style to Global Collection
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={newVoiceName}
                      onChange={(e) => setNewVoiceName(e.target.value)}
                      placeholder="Speech Style Name (e.g., McCarthy Borderland Grit)"
                      className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                    />
                    <input
                      type="text"
                      value={newVoiceGenre}
                      onChange={(e) => setNewVoiceGenre(e.target.value)}
                      placeholder="Genre (e.g., Frontier Neo-Western)"
                      className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={newVoiceAuthor}
                      onChange={(e) => setNewVoiceAuthor(e.target.value)}
                      placeholder="Focal Author (e.g., Cormac McCarthy)"
                      className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                    />
                    <input
                      type="text"
                      value={newVoiceTagline}
                      onChange={(e) => setNewVoiceTagline(e.target.value)}
                      placeholder="Short Tagline (e.g., Stark paratactic cadence & desert fatalism)"
                      className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                    />
                  </div>
                  <textarea
                    value={newVoiceDirective}
                    onChange={(e) => setNewVoiceDirective(e.target.value)}
                    rows={2}
                    placeholder="Authorial Tone Directive: Describe how the AI should channel this author's syntax, rhythm, diction, and subtext..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-violet-400 resize-none"
                  />
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={newVoiceSample}
                      onChange={(e) => setNewVoiceSample(e.target.value)}
                      placeholder='Optional Sample Line (e.g., "He set the ledger on the pine plank and waited in the dust.")'
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-400"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition-colors shadow"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add to Collection
                    </button>
                  </div>
                </form>

                {/* Collection Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                  {voices.map((v) => (
                    <div
                      key={v.id}
                      className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">
                          {v.name}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded border shrink-0 ${
                            v.source === 'ADMIN_ADDED'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                              : 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                          }`}
                        >
                          {v.source === 'ADMIN_ADDED' ? 'ADMIN ADDED' : 'BUILT-IN'}
                        </span>
                      </div>
                      {(v.genre || v.authorInspiration) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {v.genre && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 border border-slate-800">
                              {v.genre}
                            </span>
                          )}
                          {v.authorInspiration && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-200 border border-amber-500/30">
                              Author: {v.authorInspiration}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-[11px] text-violet-200/90 font-medium">
                        {v.tagline}
                      </p>
                      <p className="text-[10px] text-slate-400 line-clamp-2">
                        {v.styleDirective}
                      </p>
                      <p className="text-[10px] italic text-slate-300 pt-1 border-t border-slate-800/80">
                        {v.sampleLine}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================== */}
        {/* TAB 3: USER ROLES & ACCESS CONTROL (RBAC)                          */}
        {/* ================================================================== */}
        {activeTab === 'ROLES' && (
          <section className="space-y-5 pb-10">
            {/* Role Tiers Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {(
                [
                  'PLAYER',
                  'STUDIO_CREATOR',
                  'SIMULATION_ADMIN',
                  'ADMIN',
                ] as AccountRole[]
              ).map((roleKey) => {
                const info = ROLE_BADGE_INFO[roleKey];
                return (
                  <div
                    key={roleKey}
                    className="bg-slate-900/75 border border-slate-800 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${info.badgeClass}`}
                      >
                        {info.label}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {users.filter((u) => u.accountRole === roleKey).length} users
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {info.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {roleFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                  roleFeedback.type === 'ok'
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                }`}
              >
                <span>{roleFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setRoleFeedback(null)}
                  className="text-slate-400 hover:text-white ml-4"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Accounts & Role Assignment Table */}
            <div className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-white">
                    Platform Accounts, 'Sims' Balances &amp; Role Assignments
                  </h2>
                </div>
                <span className="text-[11px] text-slate-400">
                  Changes apply immediately across active browser tabs
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4 font-semibold">User Account</th>
                      <th className="py-3 px-4 font-semibold">'Sims' Wallet</th>
                      <th className="py-3 px-4 font-semibold">Current Access Tier</th>
                      <th className="py-3 px-4 font-semibold">Assign Role</th>
                      <th className="py-3 px-4 font-semibold">
                        Scoped Simulation (For Single-Sim Admin)
                      </th>
                      <th className="py-3 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {users.map((u) => {
                      const effectiveRole = draftRoles[u.id] ?? u.accountRole;
                      const effectiveSimId =
                        draftManagedSim[u.id] ??
                        u.managedSimulationIds?.[0] ??
                        defaultSimId;
                      const currentInfo = ROLE_BADGE_INFO[u.accountRole];
                      const hasUnsavedChange =
                        effectiveRole !== u.accountRole ||
                        (effectiveRole === 'SIMULATION_ADMIN' &&
                          effectiveSimId !== (u.managedSimulationIds?.[0] ?? ''));

                      return (
                        <tr
                          key={u.id}
                          className="hover:bg-slate-800/30 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-lg bg-gradient-to-br ${u.avatarColor} flex items-center justify-center text-white font-bold text-xs shrink-0`}
                              >
                                {u.displayName
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  <span>{u.displayName}</span>
                                  <span className="text-[10px] font-mono text-sky-400">
                                    @{u.username}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {u.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-amber-300">
                                {u.simsBalance ?? 0} Sims
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleGiftSims(
                                    u.id,
                                    50,
                                    'Quick +50 Sims Admin gift',
                                    true
                                  )
                                }
                                className="px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[10px] font-bold transition-colors"
                                title={`Gift +50 Sims to @${u.username}`}
                              >
                                +50 Gift
                              </button>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full border ${currentInfo.badgeClass}`}
                            >
                              {currentInfo.label}
                            </span>
                            {u.accountRole === 'SIMULATION_ADMIN' &&
                              u.managedSimulationIds?.[0] && (
                                <div className="text-[11px] text-emerald-300 mt-1 font-medium">
                                  Scope:{' '}
                                  {simulations[u.managedSimulationIds[0]]?.title ??
                                    u.managedSimulationIds[0]}
                                </div>
                              )}
                          </td>

                          <td className="py-3.5 px-4">
                            <select
                              value={effectiveRole}
                              onChange={(e) =>
                                setDraftRoles((prev) => ({
                                  ...prev,
                                  [u.id]: e.target.value as AccountRole,
                                }))
                              }
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                            >
                              <option value="PLAYER">Player Only</option>
                              <option value="STUDIO_CREATOR">
                                Studio Creator (Studio + Player)
                              </option>
                              <option value="SIMULATION_ADMIN">
                                Simulation Admin (Single Game)
                              </option>
                              <option value="ADMIN">
                                Global Administrator (All Games + Studio)
                              </option>
                            </select>
                          </td>

                          <td className="py-3.5 px-4">
                            {effectiveRole === 'SIMULATION_ADMIN' ? (
                              <select
                                value={effectiveSimId}
                                onChange={(e) =>
                                  setDraftManagedSim((prev) => ({
                                    ...prev,
                                    [u.id]: e.target.value,
                                  }))
                                }
                                className="bg-slate-950 border border-emerald-700/70 rounded-lg px-2.5 py-1.5 text-xs text-emerald-200 focus:outline-none focus:border-emerald-400 w-full max-w-xs"
                              >
                                {simList.map((sim) => (
                                  <option key={sim.id} value={sim.id}>
                                    {sim.title} ({sim.id})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[11px] text-slate-500 italic">
                                {effectiveRole === 'ADMIN'
                                  ? 'All running simulations'
                                  : 'Not applicable'}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleSaveUserRole(u)}
                              disabled={!hasUnsavedChange}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                hasUnsavedChange
                                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow'
                                  : 'bg-slate-800/60 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              Save Role
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
