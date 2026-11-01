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
    <div className="min-h-screen w-screen overflow-y-auto bg-[#fffef0] text-[#41403e] font-sans select-text">
      {/* ==================================================================== */}
      {/* PAPERCSS NAVBAR                                                      */}
      {/* ==================================================================== */}
      <header className="paper sticky top-0 z-30 px-4 sm:px-6 py-3 border-b-2 border-[#41403e] bg-[#fffef0]/95 backdrop-blur-sm flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg border-2 border-[#41403e] bg-amber-100 flex items-center justify-center font-bold">
            <Terminal className="w-4 h-4 text-[#41403e]" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold m-0">Admin Overview</h1>
            <span className="badge warning">All Games</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* TEST V4 PRO TOGGLE */}
          <button
            type="button"
            onClick={() => onToggleTestV4Pro(!testV4Pro)}
            className={`paper-btn btn-small ${testV4Pro ? 'btn-secondary' : ''}`}
          >
            <Sparkles className="w-3.5 h-3.5 inline mr-1" />
            <span>Test V4 Pro: {testV4Pro ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={onOpenStudio}
            className="paper-btn btn-small"
          >
            <Layers className="w-3.5 h-3.5 inline mr-1" />
            Studio
          </button>

          <button
            onClick={onOpenProfile}
            className="paper-btn btn-small"
          >
            <User className="w-3.5 h-3.5 inline mr-1" />
            Profile ({currentUser.simsBalance ?? 0} Sims)
          </button>

          <button
            onClick={onSignOut}
            className="paper-btn btn-small btn-danger"
          >
            <LogOut className="w-3.5 h-3.5 inline mr-1" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="w-full max-w-[96vw] xl:max-w-[94vw] mx-auto px-2 sm:px-4 lg:px-[1.5vw] py-4 lg:py-[1.5vw] space-y-4 lg:space-y-[1.5vw]">
        {/* ================================================================== */}
        {/* QUICK STATS BAR                                                    */}
        {/* ================================================================== */}
        <div className="flex flex-row flex-nowrap items-stretch gap-[1vw] w-full my-2">
          <div className="flex-1 w-[22.5vw] min-w-0 p-[0.7vw] text-center border-2 border-[#41403e] bg-white rounded shadow-[2px_2px_0px_0px_rgba(65,64,62,0.25)] flex flex-col justify-center items-center">
            <div className="text-xs lg:text-[0.75vw] uppercase opacity-70 font-bold tracking-wider">Active Games</div>
            <div className="text-2xl lg:text-[1.8vw] font-bold text-emerald-700 leading-tight mt-0.5">{activeSims.length}</div>
          </div>

          <div className="flex-1 w-[22.5vw] min-w-0 p-[0.7vw] text-center border-2 border-[#41403e] bg-white rounded shadow-[2px_2px_0px_0px_rgba(65,64,62,0.25)] flex flex-col justify-center items-center">
            <div className="text-xs lg:text-[0.75vw] uppercase opacity-70 font-bold tracking-wider">Library Games</div>
            <div className="text-2xl lg:text-[1.8vw] font-bold text-amber-700 leading-tight mt-0.5">{publishedCollectionSims.length}</div>
          </div>

          <div className="flex-1 w-[22.5vw] min-w-0 p-[0.7vw] text-center border-2 border-[#41403e] bg-white rounded shadow-[2px_2px_0px_0px_rgba(65,64,62,0.25)] flex flex-col justify-center items-center">
            <div className="text-xs lg:text-[0.75vw] uppercase opacity-70 font-bold tracking-wider">Players Online</div>
            <div className="text-2xl lg:text-[1.8vw] font-bold text-sky-700 leading-tight mt-0.5">{platformStats.onlineCount}</div>
          </div>

          <div className="flex-1 w-[22.5vw] min-w-0 p-[0.7vw] text-center border-2 border-[#41403e] bg-white rounded shadow-[2px_2px_0px_0px_rgba(65,64,62,0.25)] flex flex-col justify-center items-center">
            <div className="text-xs lg:text-[0.75vw] uppercase opacity-70 font-bold tracking-wider">AI Model</div>
            <div className="text-lg lg:text-[1.4vw] font-mono font-bold pt-0.5 text-purple-700 leading-tight">
              {testV4Pro ? 'v4-pro' : 'flash'}
            </div>
          </div>
        </div>

        {/* ================================================================== */}
        {/* TABS                                                               */}
        {/* ================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#41403e] pb-3">
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('SIMULATIONS')}
              className={`paper-btn btn-small ${activeTab === 'SIMULATIONS' ? 'btn-primary' : ''}`}
            >
              <Activity className="w-3.5 h-3.5 inline mr-1" />
              Games ({activeSims.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ECONOMY_VOICES')}
              className={`paper-btn btn-small ${activeTab === 'ECONOMY_VOICES' ? 'btn-primary' : ''}`}
            >
              <Coins className="w-3.5 h-3.5 inline mr-1" />
              Credits &amp; Voices
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ROLES')}
              className={`paper-btn btn-small ${activeTab === 'ROLES' ? 'btn-primary' : ''}`}
            >
              <ShieldCheck className="w-3.5 h-3.5 inline mr-1" />
              User Roles ({users.length})
            </button>
          </div>

          {activeTab === 'SIMULATIONS' && (
            <div className="flex gap-1.5 flex-wrap">
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
                  className={`paper-btn btn-small ${simFilter === f.id ? 'btn-secondary' : ''}`}
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
              <p className="text-xs text-[#41403e]/70">
                Click into any running game below to open its single-game{' '}
                <strong className="text-amber-800">Admin Dashboard</strong> (live AP testing, exact Player Dashboard preview, server stats, and RAG partition inspector).
              </p>
            </div>

            {displayedSims.length === 0 ? (
              <div className="card bg-white border-2 border-[#41403e] p-8 text-center space-y-2">
                <Database className="w-8 h-8 opacity-40 mx-auto" />
                <div className="text-sm font-bold">
                  No games found
                </div>
                <p className="text-xs text-[#41403e]/60">
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
                      className="card bg-white border-2 border-[#41403e] hover:shadow-lg p-5 transition-all shadow cursor-pointer flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-3">
                        {/* Card Top Meta Row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {sim.status !== 'COMPLETED' ? (
                                <span className="badge success gap-1">
                                  Active
                                </span>
                              ) : (
                                <span className="badge gap-1">
                                  Completed
                                </span>
                              )}

                              {sim.voiceStyle && (
                                <span className="badge secondary">
                                  {sim.voiceStyle.name}
                                </span>
                              )}

                              {onlinePlayers.length > 0 && (
                                <span className="badge info gap-1">
                                  <Eye className="w-3 h-3 inline mr-0.5" />
                                  {onlinePlayers.length} Online
                                </span>
                              )}
                            </div>

                            <h2 className="text-base font-bold text-[#41403e] mt-1">
                              {sim.title}
                            </h2>
                          </div>

                          <div className="badge font-mono text-xs py-1">
                            Turn {sim.currentTurnOrTick}
                          </div>
                        </div>

                        <p className="text-xs text-[#41403e]/80 line-clamp-2">
                          {sim.masterNarrative}
                        </p>

                        {/* Metric stats */}
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="p-2 rounded border border-[#41403e]/30 bg-[#fffef0]">
                            <div className="text-[10px] opacity-60">Clues</div>
                            <div className="font-bold text-sky-800">{cardsList.length}</div>
                          </div>
                          <div className="p-2 rounded border border-[#41403e]/30 bg-[#fffef0]">
                            <div className="text-[10px] opacity-60">Goals Solved</div>
                            <div className="font-bold text-emerald-800">{solvedGoalsCount} / {goalsList.length}</div>
                          </div>
                          <div className="p-2 rounded border border-[#41403e]/30 bg-[#fffef0]">
                            <div className="text-[10px] opacity-60">Actions</div>
                            <div className="font-bold text-amber-800">{sim.interactions.length}</div>
                          </div>
                        </div>

                        {/* Characters mini table */}
                        <div className="p-2.5 rounded border border-[#41403e]/30 bg-[#fffef0] space-y-1.5">
                          <div className="text-[10px] opacity-70 font-bold uppercase">
                            Characters ({chars.length})
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-xs">
                            {chars.map((c) => (
                              <div
                                key={c.playerId}
                                className="flex items-center justify-between p-1.5 rounded bg-white border border-[#41403e]/20"
                              >
                                <span className="font-medium truncate">{c.characterName}</span>
                                <span className="badge warning font-mono font-bold text-[10px]">
                                  {c.victoryPoints} VP
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="pt-2 border-t border-[#41403e]/20 flex items-center justify-between text-xs">
                        <span className="text-[#41403e]/60 text-[11px]">
                          Click to manage game
                        </span>
                        <span className="paper-btn btn-small btn-warning">
                          Manage Game
                          <ArrowRight className="w-3 h-3 inline ml-1" />
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
                className={`alert ${
                  economyFeedback.type === 'ok' ? 'alert-success' : 'alert-danger'
                } text-xs flex items-center justify-between`}
              >
                <span>{economyFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setEconomyFeedback(null)}
                  className="font-bold ml-4 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Gift Sims */}
              <div className="lg:col-span-5 card bg-white border-2 border-[#41403e] p-4 shadow space-y-3">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-amber-600" />
                  <div>
                    <h2 className="text-sm font-bold m-0">
                      Gift Sims Credits
                    </h2>
                    <p className="text-xs text-[#41403e]/70 m-0">
                      Send Sims to any user account.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold block">
                      Player
                    </label>
                    <select
                      value={giftRecipientId}
                      onChange={(e) => setGiftRecipientId(e.target.value)}
                      className="w-full bg-[#fffef0] border-2 border-[#41403e] rounded p-1.5 text-xs"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName} (@{u.username}) — {u.simsBalance ?? 0} Sims
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold block">
                      Amount
                    </label>
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      {[25, 50, 100, 250, 500].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setGiftAmount(preset)}
                          className={`paper-btn btn-small ${
                            giftAmount === preset ? 'btn-warning' : ''
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
                      className="w-full bg-[#fffef0] border-2 border-[#41403e] rounded p-1.5 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold block">
                      Note (Optional)
                    </label>
                    <input
                      type="text"
                      value={giftNote}
                      onChange={(e) => setGiftNote(e.target.value)}
                      placeholder="e.g. Reward for new game creation"
                      className="w-full bg-[#fffef0] border-2 border-[#41403e] rounded p-1.5 text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleGiftSims(giftRecipientId, giftAmount, giftNote, false)
                    }
                    className="paper-btn btn-warning w-full"
                  >
                    <Gift className="w-4 h-4 inline mr-1" />
                    Send +{giftAmount} Sims
                  </button>
                </div>

                {/* Balances Mini-List */}
                <div className="pt-2 border-t border-[#41403e]/20 space-y-1.5">
                  <div className="text-[11px] font-bold text-[#41403e]/70">
                    User Balances
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="bg-[#fffef0] border border-[#41403e]/30 rounded p-2 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-semibold">{u.displayName}</span>{' '}
                          <span className="opacity-60 text-[10px]">@{u.username}</span>
                        </div>
                        <span className="font-mono font-bold text-amber-700">
                          {u.simsBalance ?? 0} Sims
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Add New Speech Style */}
              <div className="lg:col-span-7 card bg-white border-2 border-[#41403e] p-4 shadow space-y-3">
                <div className="flex items-center gap-2">
                  <Mic className="w-5 h-5 text-purple-700" />
                  <div>
                    <h2 className="text-sm font-bold m-0">
                      Story Voices ({voices.length})
                    </h2>
                    <p className="text-xs text-[#41403e]/70 m-0">
                      Available voice styles for games.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleAddSpeechStyle}
                  className="paper bg-[#fffef0] border-2 border-[#41403e] p-3 space-y-2 text-xs"
                >
                  <div className="text-xs font-bold text-purple-800 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    Add New Voice Style
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newVoiceName}
                      onChange={(e) => setNewVoiceName(e.target.value)}
                      placeholder="Voice Name (e.g. Gritty Noir)"
                      className="bg-white border-2 border-[#41403e] rounded p-1.5 text-xs"
                    />
                    <input
                      type="text"
                      value={newVoiceGenre}
                      onChange={(e) => setNewVoiceGenre(e.target.value)}
                      placeholder="Genre (e.g. Mystery)"
                      className="bg-white border-2 border-[#41403e] rounded p-1.5 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newVoiceAuthor}
                      onChange={(e) => setNewVoiceAuthor(e.target.value)}
                      placeholder="Author (e.g. Raymond Chandler)"
                      className="bg-white border-2 border-[#41403e] rounded p-1.5 text-xs"
                    />
                    <input
                      type="text"
                      value={newVoiceTagline}
                      onChange={(e) => setNewVoiceTagline(e.target.value)}
                      placeholder="Short description"
                      className="bg-white border-2 border-[#41403e] rounded p-1.5 text-xs"
                    />
                  </div>
                  <textarea
                    value={newVoiceDirective}
                    onChange={(e) => setNewVoiceDirective(e.target.value)}
                    rows={2}
                    placeholder="Instructions for how characters should speak..."
                    className="bg-white border-2 border-[#41403e] rounded p-1.5 text-xs resize-none w-full"
                  />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newVoiceSample}
                      onChange={(e) => setNewVoiceSample(e.target.value)}
                      placeholder="Sample spoken sentence..."
                      className="bg-white border-2 border-[#41403e] rounded p-1.5 text-xs flex-1"
                    />
                    <button
                      type="submit"
                      className="paper-btn btn-primary btn-small"
                    >
                      <Plus className="w-3.5 h-3.5 inline mr-1" />
                      Add Voice
                    </button>
                  </div>
                </form>

                {/* Voices Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {voices.map((v) => (
                    <div
                      key={v.id}
                      className="card bg-[#fffef0] border border-[#41403e]/40 p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold">{v.name}</span>
                        {v.authorInspiration && (
                          <span className="badge text-[10px]">
                            {v.authorInspiration}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#41403e]/80 m-0">
                        {v.tagline}
                      </p>
                      <p className="text-[10px] italic text-[#41403e]/60 line-clamp-1 m-0">
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
                    className="card bg-white border-2 border-[#41403e] p-3 space-y-1 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`badge ${info.badgeClass}`}>
                        {info.label}
                      </span>
                      <span className="text-xs font-mono opacity-70 font-semibold">
                        {users.filter((u) => u.accountRole === roleKey).length} users
                      </span>
                    </div>
                    <p className="text-[11px] opacity-80 m-0">
                      {info.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {roleFeedback && (
              <div
                className={`alert ${
                  roleFeedback.type === 'ok' ? 'alert-success' : 'alert-danger'
                } text-xs flex items-center justify-between`}
              >
                <span>{roleFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setRoleFeedback(null)}
                  className="font-bold ml-4 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Table */}
            <div className="card bg-white border-2 border-[#41403e] overflow-hidden shadow p-3">
              <div className="overflow-x-auto">
                <table className="table-hover table-alternating w-full text-xs">
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
                                className={`w-7 h-7 rounded border border-[#41403e] bg-gradient-to-br ${u.avatarColor} flex items-center justify-center text-white font-bold text-xs shrink-0`}
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
                              <span className="font-mono font-bold text-amber-700">
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
                                className="paper-btn btn-warning btn-small"
                              >
                                +50
                              </button>
                            </div>
                          </td>

                          <td>
                            <span className={`badge ${currentInfo.badgeClass}`}>
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
                              className="bg-[#fffef0] border border-[#41403e] rounded p-1 text-xs"
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
                                className="bg-[#fffef0] border border-[#41403e] rounded p-1 text-xs max-w-xs"
                              >
                                {simList.map((sim) => (
                                  <option key={sim.id} value={sim.id}>
                                    {sim.title}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[11px] opacity-60 italic">
                                {effectiveRole === 'ADMIN' ? 'All games' : '—'}
                              </span>
                            )}
                          </td>

                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() => handleSaveUserRole(u)}
                              disabled={!hasUnsavedChange}
                              className={`paper-btn btn-small ${
                                hasUnsavedChange ? 'btn-primary' : 'disabled opacity-50'
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
