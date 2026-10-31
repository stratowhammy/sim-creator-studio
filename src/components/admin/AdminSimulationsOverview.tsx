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
    <div className="h-screen w-screen overflow-y-auto bg-base-100 text-base-content font-sans select-text">
      {/* ==================================================================== */}
      {/* DAISYUI NAVBAR                                                       */}
      {/* ==================================================================== */}
      <header className="navbar bg-base-200 border-b border-base-300 sticky top-0 z-30 px-4 sm:px-6 gap-2">
        <div className="navbar-start gap-2">
          <div className="w-8 h-8 rounded-lg bg-warning/20 text-warning flex items-center justify-center font-bold">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold">Admin Overview</h1>
              <span className="badge badge-sm badge-warning badge-outline">All Games</span>
            </div>
          </div>
        </div>

        <div className="navbar-end gap-2 flex-wrap">
          {/* TEST V4 PRO TOGGLE */}
          <button
            type="button"
            onClick={() => onToggleTestV4Pro(!testV4Pro)}
            className={`btn btn-sm ${testV4Pro ? 'btn-secondary' : 'btn-outline'}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Test V4 Pro: {testV4Pro ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={onOpenStudio}
            className="btn btn-sm btn-ghost gap-1"
          >
            <Layers className="w-3.5 h-3.5" />
            Studio
          </button>

          <button
            onClick={onOpenProfile}
            className="btn btn-sm btn-ghost gap-1"
          >
            <User className="w-3.5 h-3.5" />
            Profile ({currentUser.simsBalance ?? 0} Sims)
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ================================================================== */}
        {/* QUICK STATS BAR                                                    */}
        {/* ================================================================== */}
        <section className="stats shadow bg-base-200 border border-base-300 w-full grid grid-cols-2 md:grid-cols-4">
          <div className="stat py-3 place-items-center">
            <div className="stat-title text-xs">Active Games</div>
            <div className="stat-value text-xl text-success">{activeSims.length}</div>
          </div>

          <div className="stat py-3 place-items-center">
            <div className="stat-title text-xs">Library Games</div>
            <div className="stat-value text-xl text-warning">{publishedCollectionSims.length}</div>
          </div>

          <div className="stat py-3 place-items-center">
            <div className="stat-title text-xs">Players Online</div>
            <div className="stat-value text-xl text-info">{platformStats.onlineCount}</div>
          </div>

          <div className="stat py-3 place-items-center">
            <div className="stat-title text-xs">AI Model</div>
            <div className="stat-value text-xs font-mono pt-1 text-primary">
              {testV4Pro ? 'v4-pro' : 'flash'}
            </div>
          </div>
        </section>

        {/* ================================================================== */}
        {/* TABS                                                               */}
        {/* ================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-3">
          <div className="join">
            <button
              type="button"
              onClick={() => setActiveTab('SIMULATIONS')}
              className={`btn btn-sm join-item ${activeTab === 'SIMULATIONS' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <Activity className="w-3.5 h-3.5" />
              Games ({activeSims.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ECONOMY_VOICES')}
              className={`btn btn-sm join-item ${activeTab === 'ECONOMY_VOICES' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <Coins className="w-3.5 h-3.5" />
              Credits &amp; Voices
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ROLES')}
              className={`btn btn-sm join-item ${activeTab === 'ROLES' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              User Roles ({users.length})
            </button>
          </div>

          {activeTab === 'SIMULATIONS' && (
            <div className="join">
              {(
                [
                  { id: 'ACTIVE', label: `Active (${activeSims.length})` },
                  { id: 'ALL', label: `All (${simList.length})` },
                  { id: 'COMPLETED', label: `Finished (${completedSims.length})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSimFilter(f.id)}
                  className={`btn btn-xs join-item ${simFilter === f.id ? 'btn-neutral' : 'btn-ghost'}`}
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
              <div className="card bg-base-200 border border-base-300 p-8 text-center space-y-2">
                <Database className="w-8 h-8 opacity-40 mx-auto" />
                <div className="text-sm font-bold">
                  No games found
                </div>
                <p className="text-xs text-base-content/60">
                  Switch the filter above or create a new game in Studio.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      className="card bg-base-200 border border-base-300 hover:border-warning/70 p-5 transition-all shadow cursor-pointer flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-3">
                        {/* Card Top Meta Row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {sim.status !== 'COMPLETED' ? (
                                <span className="badge badge-sm badge-success gap-1">
                                  Active
                                </span>
                              ) : (
                                <span className="badge badge-sm badge-ghost gap-1">
                                  Completed
                                </span>
                              )}

                              {sim.voiceStyle && (
                                <span className="badge badge-sm badge-secondary badge-outline">
                                  {sim.voiceStyle.name}
                                </span>
                              )}

                              {onlinePlayers.length > 0 && (
                                <span className="badge badge-sm badge-info badge-outline gap-1">
                                  <Eye className="w-3 h-3" />
                                  {onlinePlayers.length} Online
                                </span>
                              )}
                            </div>

                            <h2 className="text-base font-bold text-base-content mt-1">
                              {sim.title}
                            </h2>
                          </div>

                          <div className="badge badge-ghost font-mono text-xs py-2">
                            Turn {sim.currentTurnOrTick}
                          </div>
                        </div>

                        <p className="text-xs text-base-content/70 line-clamp-2">
                          {sim.masterNarrative}
                        </p>

                        {/* Metric stats */}
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="p-2 rounded bg-base-100 border border-base-300">
                            <div className="text-[10px] opacity-60">Clues</div>
                            <div className="font-bold text-primary">{cardsList.length}</div>
                          </div>
                          <div className="p-2 rounded bg-base-100 border border-base-300">
                            <div className="text-[10px] opacity-60">Goals Solved</div>
                            <div className="font-bold text-success">{solvedGoalsCount} / {goalsList.length}</div>
                          </div>
                          <div className="p-2 rounded bg-base-100 border border-base-300">
                            <div className="text-[10px] opacity-60">Actions</div>
                            <div className="font-bold text-warning">{sim.interactions.length}</div>
                          </div>
                        </div>

                        {/* Characters mini table */}
                        <div className="p-2.5 rounded-lg bg-base-100 border border-base-300 space-y-1.5">
                          <div className="text-[10px] opacity-60 font-semibold uppercase">
                            Characters ({chars.length})
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-xs">
                            {chars.map((c) => (
                              <div
                                key={c.playerId}
                                className="flex items-center justify-between p-1.5 rounded bg-base-200"
                              >
                                <span className="font-medium truncate">{c.characterName}</span>
                                <span className="badge badge-xs badge-warning font-mono font-bold">
                                  {c.victoryPoints} VP
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="pt-2 border-t border-base-300 flex items-center justify-between text-xs">
                        <span className="text-base-content/60 text-[11px]">
                          Click to manage game
                        </span>
                        <span className="btn btn-warning btn-xs gap-1">
                          Manage Game
                          <ArrowRight className="w-3 h-3" />
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Gift Sims */}
              <div className="lg:col-span-5 card bg-base-200 border border-base-300 p-4 shadow space-y-3">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-warning" />
                  <div>
                    <h2 className="text-sm font-bold">
                      Gift Sims Credits
                    </h2>
                    <p className="text-xs text-base-content/70">
                      Send Sims to any user account.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      Player
                    </label>
                    <select
                      value={giftRecipientId}
                      onChange={(e) => setGiftRecipientId(e.target.value)}
                      className="select select-bordered select-sm w-full bg-base-100"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName} (@{u.username}) — {u.simsBalance ?? 0} Sims
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      Amount
                    </label>
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      {[25, 50, 100, 250, 500].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGiftAmount(preset)}
                          className={`btn btn-xs ${
                            giftAmount === preset
                              ? 'btn-warning'
                              : 'btn-outline border-base-300'
                          }`}
                        >
                          +{preset}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={giftAmount}
                      onChange={(e) => setGiftAmount(Number(e.target.value))}
                      className="input input-bordered input-sm w-full bg-base-100 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold">
                      Note (Optional)
                    </label>
                    <input
                      type="text"
                      value={giftNote}
                      onChange={(e) => setGiftNote(e.target.value)}
                      placeholder="e.g. Reward for new game creation"
                      className="input input-bordered input-sm w-full bg-base-100"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleGiftSims(giftRecipientId, giftAmount, giftNote, false)
                    }
                    className="btn btn-warning btn-sm w-full gap-1"
                  >
                    <Gift className="w-4 h-4" />
                    Send +{giftAmount} Sims
                  </button>
                </div>

                {/* Balances Mini-List */}
                <div className="pt-2 border-t border-base-300 space-y-1.5">
                  <div className="text-[11px] font-semibold text-base-content/60">
                    User Balances
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="card bg-base-100 border border-base-300 p-2 flex flex-row items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-semibold">{u.displayName}</span>{' '}
                          <span className="opacity-60 text-[10px]">@{u.username}</span>
                        </div>
                        <span className="font-mono font-bold text-warning">
                          {u.simsBalance ?? 0} Sims
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Add New Speech Style */}
              <div className="lg:col-span-7 card bg-base-200 border border-base-300 p-4 shadow space-y-3">
                <div className="flex items-center gap-2">
                  <Mic className="w-5 h-5 text-secondary" />
                  <div>
                    <h2 className="text-sm font-bold">
                      Story Voices ({voices.length})
                    </h2>
                    <p className="text-xs text-base-content/70">
                      Available voice styles for games.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleAddSpeechStyle}
                  className="card bg-base-100 border border-base-300 p-3 space-y-2 text-xs"
                >
                  <div className="text-xs font-bold text-secondary flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    Add New Voice Style
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newVoiceName}
                      onChange={(e) => setNewVoiceName(e.target.value)}
                      placeholder="Voice Name (e.g. Gritty Noir)"
                      className="input input-bordered input-sm bg-base-200"
                    />
                    <input
                      type="text"
                      value={newVoiceGenre}
                      onChange={(e) => setNewVoiceGenre(e.target.value)}
                      placeholder="Genre (e.g. Mystery)"
                      className="input input-bordered input-sm bg-base-200"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newVoiceAuthor}
                      onChange={(e) => setNewVoiceAuthor(e.target.value)}
                      placeholder="Author (e.g. Raymond Chandler)"
                      className="input input-bordered input-sm bg-base-200"
                    />
                    <input
                      type="text"
                      value={newVoiceTagline}
                      onChange={(e) => setNewVoiceTagline(e.target.value)}
                      placeholder="Short description"
                      className="input input-bordered input-sm bg-base-200"
                    />
                  </div>
                  <textarea
                    value={newVoiceDirective}
                    onChange={(e) => setNewVoiceDirective(e.target.value)}
                    rows={2}
                    placeholder="Instructions for how characters should speak..."
                    className="textarea textarea-bordered bg-base-200 text-xs resize-none"
                  />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newVoiceSample}
                      onChange={(e) => setNewVoiceSample(e.target.value)}
                      placeholder="Sample spoken sentence..."
                      className="input input-bordered input-sm bg-base-200 flex-1"
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Voice
                    </button>
                  </div>
                </form>

                {/* Voices Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {voices.map((v) => (
                    <div
                      key={v.id}
                      className="card bg-base-100 border border-base-300 p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold">{v.name}</span>
                        {v.authorInspiration && (
                          <span className="badge badge-xs badge-ghost">
                            {v.authorInspiration}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-base-content/80">
                        {v.tagline}
                      </p>
                      <p className="text-[10px] italic text-base-content/60 line-clamp-1">
                        {v.sampleLine}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 3: USER ROLES */}
        {activeTab === 'ROLES' && (
          <section className="space-y-4 pb-10">
            {/* Role Tiers Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    className="card bg-base-200 border border-base-300 p-3 space-y-1 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`badge badge-sm ${info.badgeClass}`}>
                        {info.label}
                      </span>
                      <span className="text-xs font-mono opacity-60">
                        {users.filter((u) => u.accountRole === roleKey).length} users
                      </span>
                    </div>
                    <p className="text-[11px] opacity-70">
                      {info.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {roleFeedback && (
              <div
                className={`alert text-xs py-2 ${
                  roleFeedback.type === 'ok' ? 'alert-success' : 'alert-error'
                }`}
              >
                <span>{roleFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setRoleFeedback(null)}
                  className="btn btn-ghost btn-xs btn-circle"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Table */}
            <div className="card bg-base-200 border border-base-300 overflow-hidden shadow">
              <div className="overflow-x-auto">
                <table className="table table-zebra w-full text-xs">
                  <thead>
                    <tr className="text-[11px] uppercase opacity-70">
                      <th>User</th>
                      <th>Sims Wallet</th>
                      <th>Role</th>
                      <th>Assign Role</th>
                      <th>Game Scope</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
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
                        <tr key={u.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-7 h-7 rounded-lg bg-gradient-to-br ${u.avatarColor} flex items-center justify-center text-white font-bold text-xs shrink-0`}
                              >
                                {u.displayName.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold flex items-center gap-1">
                                  <span>{u.displayName}</span>
                                  <span className="text-[10px] opacity-60">@{u.username}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-warning">
                                {u.simsBalance ?? 0} Sims
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleGiftSims(
                                    u.id,
                                    50,
                                    'Admin gift',
                                    true
                                  )
                                }
                                className="btn btn-warning btn-xs"
                              >
                                +50
                              </button>
                            </div>
                          </td>

                          <td>
                            <span className={`badge badge-xs ${currentInfo.badgeClass}`}>
                              {currentInfo.label}
                            </span>
                          </td>

                          <td>
                            <select
                              value={effectiveRole}
                              onChange={(e) =>
                                setDraftRoles((prev) => ({
                                  ...prev,
                                  [u.id]: e.target.value as AccountRole,
                                }))
                              }
                              className="select select-bordered select-xs bg-base-100"
                            >
                              <option value="PLAYER">Player Only</option>
                              <option value="STUDIO_CREATOR">Studio Creator</option>
                              <option value="SIMULATION_ADMIN">Simulation Admin</option>
                              <option value="ADMIN">Administrator</option>
                            </select>
                          </td>

                          <td>
                            {effectiveRole === 'SIMULATION_ADMIN' ? (
                              <select
                                value={effectiveSimId}
                                onChange={(e) =>
                                  setDraftManagedSim((prev) => ({
                                    ...prev,
                                    [u.id]: e.target.value,
                                  }))
                                }
                                className="select select-bordered select-xs bg-base-100 max-w-xs"
                              >
                                {simList.map((sim) => (
                                  <option key={sim.id} value={sim.id}>
                                    {sim.title}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[11px] opacity-50 italic">
                                {effectiveRole === 'ADMIN' ? 'All games' : '—'}
                              </span>
                            )}
                          </td>

                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() => handleSaveUserRole(u)}
                              disabled={!hasUnsavedChange}
                              className={`btn btn-xs ${
                                hasUnsavedChange ? 'btn-primary' : 'btn-disabled'
                              }`}
                            >
                              Save
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
