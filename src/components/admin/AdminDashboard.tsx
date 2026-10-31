import React, { useMemo, useState } from 'react';
import {
  InteractionType,
  SimulationState,
  SpeechStyle,
} from '../../types/simulation';
import { UserAccount } from '../../types/user';
import {
  calculateThreshold,
  consumeConnectionToken,
  getCardPolicyControls,
  getShareableCardCount,
  INTERACTION_STAT_MAP,
  MAX_GUARDED_CARDS,
  MIN_SHAREABLE_CARDS,
  resolveInteraction,
  SHAREABLE_CARD_BONUS,
  toggleGuardCardPolicy,
  toggleShareableCardPolicy,
} from '../../engine/resolution';
import {
  buildRagIndexFromState,
  queryPartitionedRag,
  syncRagIndex,
} from '../../engine/ragPartition';
import {
  classifyAuthenticity,
  DEEPSEEK_FLASH_MODEL,
  DEEPSEEK_V4_PRO_MODEL,
  generateBatchedDialogue,
  getDeepSeekApiKey,
  HARDCODED_DEEPSEEK_API_KEY,
  setDeepSeekApiKey,
} from '../../services/llmOrchestrator';
import {
  enrichEngagementSuggestionsAndAuth,
  stageLivePendingEngagement,
} from '../../engine/engagementManager';
import {
  isPlayerActivelyInRoom,
} from '../../services/presenceService';
import {
  createFantasyValdrisScenario,
  createGenevaAccordScenario,
  createMeridianBlackoutScenario,
  createNoirPier19Scenario,
  createStationHeliosScenario,
} from '../../alpha/scenarioData';
import { AuthoringStudio } from '../studio/AuthoringStudio';
import { InfoCardItem } from '../primitives/InfoCardItem';
import { GoalTrackerCard } from '../primitives/GoalTrackerCard';
import { SentenceBeatRow } from '../primitives/SentenceBeatRow';
import { ConnectionTokenButton } from '../primitives/ConnectionTokenButton';
import {
  INTERACTION_TYPE_STYLES,
  SECRECY_BADGE_STYLES,
  STANCE_BADGE_STYLES,
} from '../ui/themeMaps';
import {
  Activity,
  ArrowLeft,
  Award,
  BookOpen,
  Bot,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  Hourglass,
  Layers,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Terminal,
  User,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';

interface AdminDashboardProps {
  state: SimulationState;
  simulations?: Record<string, SimulationState>;
  currentUser?: UserAccount;
  voiceCollection?: SpeechStyle[];
  onUserUpdated?: (updatedUser: UserAccount) => void;
  onCreateSimulation?: (newState: SimulationState) => void;
  onSelectSimulation?: (simulationId: string) => void;
  onUpdateState: (
    updater: SimulationState | ((prev: SimulationState) => SimulationState)
  ) => void;
  onOpenPlayerView: (playerId: string) => void;
  testV4Pro: boolean;
  onToggleTestV4Pro: (enabled: boolean) => void;
  onBackToOverview?: () => void;
  canSwitchSimulations?: boolean;
  canUseStudio?: boolean;
  roleLabel?: string;
  onBackToProfile?: () => void;
  onSignOut?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  state,
  simulations,
  currentUser,
  voiceCollection,
  onUserUpdated,
  onCreateSimulation,
  onSelectSimulation,
  onUpdateState,
  onOpenPlayerView,
  testV4Pro,
  onToggleTestV4Pro,
  onBackToOverview,
  canSwitchSimulations = true,
  canUseStudio = true,
  roleLabel,
  onBackToProfile,
  onSignOut,
}) => {
  // Admin Sub-View: Live Simulation Tester vs Authoring Studio Compiler
  const [adminMode, setAdminMode] = useState<'LIVE_CONTROL' | 'STUDIO'>('LIVE_CONTROL');

  // Player currently controlled by Admin for AP testing
  const [actingPlayerId, setActingPlayerId] = useState<string>('vance');
  const [targetPlayerId, setTargetPlayerId] = useState<string>('kael');
  const [interactionType, setInteractionType] = useState<InteractionType>('INTERROGATE');
  const [targetedCardId, setTargetedCardId] = useState<string>('');
  const [initiatorPrompt, setInitiatorPrompt] = useState<string>(
    'Explain the anomalous pressure surge in coolant loop 4 immediately.'
  );
  const [authenticityScore, setAuthenticityScore] = useState<number>(0.15);
  const [authenticityReason, setAuthenticityReason] = useState<string>(
    'Leverages command rank and direct factual pressure.'
  );
  const [isEvaluatingAuth, setIsEvaluatingAuth] = useState<boolean>(false);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null);

  // Admin Right Pane Tabs
  const [rightTab, setRightTab] = useState<'GOALS_VP' | 'GLOBAL_CARDS' | 'ACTING_HAND'>(
    'GOALS_VP'
  );

  // Admin RAG Partition Tester
  const [ragTestQuery, setRagTestQuery] = useState<string>('coolant');

  // DeepSeek API Key Modal
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(getDeepSeekApiKey());

  const actingChar = state.characters[actingPlayerId];
  const targetChar =
    state.characters[targetPlayerId] && targetPlayerId !== actingPlayerId
      ? state.characters[targetPlayerId]
      : Object.values(state.characters).find((c) => c.playerId !== actingPlayerId);

  const characterNamesById = useMemo(
    () =>
      Object.fromEntries(
        Object.values(state.characters).map((c) => [c.playerId, c.characterName])
      ),
    [state.characters]
  );

  const actingOwnedCards = useMemo(
    () =>
      Object.values(state.cards).filter((c) =>
        c.knownByPlayerIds.includes(actingPlayerId)
      ),
    [state.cards, actingPlayerId]
  );

  const actingTokens = useMemo(
    () => state.tokens.filter((t) => t.ownerPlayerId === actingPlayerId),
    [state.tokens, actingPlayerId]
  );

  const actingShareableCount = actingChar
    ? getShareableCardCount(actingChar, state.cards)
    : 0;
  const actingShareableBonus = actingShareableCount * SHAREABLE_CARD_BONUS;

  // Live Calculated Threshold P_k (Server-side math preview)
  const liveThreshold =
    actingChar && targetChar
      ? calculateThreshold(
          actingChar,
          targetChar,
          interactionType,
          targetedCardId ? state.cards[targetedCardId] : undefined,
          authenticityScore,
          state.cards
        )
      : 0.5;

  const displayedInteraction = useMemo(() => {
    if (state.interactions.length === 0) return undefined;
    if (selectedInteractionId) {
      const found = state.interactions.find((ix) => ix.id === selectedInteractionId);
      if (found) return found;
    }
    return state.interactions[state.interactions.length - 1];
  }, [state.interactions, selectedInteractionId]);

  const sortedCharactersByVp = useMemo(
    () =>
      Object.values(state.characters).sort(
        (a, b) => b.victoryPoints - a.victoryPoints
      ),
    [state.characters]
  );

  const ragTestResults = useMemo(() => {
    if (!ragTestQuery.trim()) return [];
    return queryPartitionedRag(state.ragIndex, actingPlayerId, ragTestQuery, 4);
  }, [state.ragIndex, actingPlayerId, ragTestQuery]);

  // Switch which player the Admin is currently acting on behalf of
  const handleSelectActingPlayer = (newPlayerId: string) => {
    setActingPlayerId(newPlayerId);
    if (targetPlayerId === newPlayerId) {
      const fallbackTarget =
        Object.keys(state.characters).find((id) => id !== newPlayerId) ?? '';
      setTargetPlayerId(fallbackTarget);
    }
  };

  // Toggle whether a character seat is played by AI or Human
  const handleToggleAiControl = (charPlayerId: string) => {
    const char = state.characters[charPlayerId];
    if (!char) return;
    onUpdateState({
      ...state,
      characters: {
        ...state.characters,
        [charPlayerId]: {
          ...char,
          isAiControlled: !char.isAiControlled,
        },
      },
    });
  };

  // Set all unoccupied character seats to be played by AI
  const handleFillEmptySeatsWithAi = () => {
    const nextChars = { ...state.characters };
    for (const [id, c] of Object.entries(nextChars)) {
      if (!c.assignedUserId) {
        nextChars[id] = { ...c, isAiControlled: true };
      }
    }
    onUpdateState({ ...state, characters: nextChars });
  };

  // Grant +1 AP to a player for rapid Admin testing
  const handleGrantActionPoint = (playerId: string) => {
    const char = state.characters[playerId];
    if (!char) return;
    onUpdateState({
      ...state,
      characters: {
        ...state.characters,
        [playerId]: {
          ...char,
          actionPoints: char.actionPoints + 1,
        },
      },
    });
  };

  // Advance Turn & Reset All Players to 3 AP
  const handleAdvanceTurn = () => {
    const updatedChars = Object.fromEntries(
      Object.entries(state.characters).map(([id, char]) => [
        id,
        { ...char, actionPoints: 3 },
      ])
    );
    onUpdateState({
      ...state,
      currentTurnOrTick: state.currentTurnOrTick + 1,
      characters: updatedChars,
    });
  };

  // Reset scenario to Turn 0
  const handleResetScenario = () => {
    let fresh: SimulationState;
    if (state.id === 'sim_geneva_002') {
      fresh = createGenevaAccordScenario();
    } else if (state.id === 'sim_meridian_003') {
      fresh = createMeridianBlackoutScenario();
    } else if (state.id === 'sim_noir_004') {
      fresh = createNoirPier19Scenario();
    } else if (state.id === 'sim_fantasy_005') {
      fresh = createFantasyValdrisScenario();
    } else if (state.id === 'sim_helios_001') {
      fresh = createStationHeliosScenario();
    } else {
      fresh = {
        ...state,
        status: 'ACTIVE',
        currentTurnOrTick: 0,
        interactions: [],
        pendingEngagements: [],
        knowledgeBriefings: {},
        characters: Object.fromEntries(
          Object.entries(state.characters).map(([id, char]) => [
            id,
            { ...char, actionPoints: 3, victoryPoints: 0 },
          ])
        ),
      };
    }
    fresh.ragIndex = buildRagIndexFromState(fresh);
    setSelectedInteractionId(null);
    onUpdateState(fresh);
  };

  // Toggle ACTIVE <-> COMPLETED status (reflects immediately on User Profiles)
  const handleToggleSimulationStatus = () => {
    onUpdateState((prev) => ({
      ...prev,
      status: prev.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED',
    }));
  };

  // Open Player Dashboard in a brand-new standalone tab
  const handleOpenPlayerInNewTab = (playerId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'player');
    url.searchParams.set('player', playerId);
    url.searchParams.set('sim', state.id);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  // Admin Re-Evaluate Authenticity Bonus
  const handleEvaluateAuthenticity = async () => {
    if (!actingChar) return;
    setIsEvaluatingAuth(true);
    try {
      const result = await classifyAuthenticity(
        actingChar,
        actingOwnedCards,
        initiatorPrompt
      );
      setAuthenticityScore(result.authenticityScore);
      setAuthenticityReason(result.authenticityReasoning);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEvaluatingAuth(false);
    }
  };

  // Stage a live 30s incoming conversation & immediately preview Target's Player Dashboard
  const handleStageLiveHailAndPreviewTarget = () => {
    if (!actingChar || !targetChar || actingChar.actionPoints <= 0) return;
    const staged = stageLivePendingEngagement(state, {
      initiatorPlayerId: actingPlayerId,
      targetPlayerId: targetChar.playerId,
      interactionType,
      initiatorPrompt,
      targetedTopicOrCardId: targetedCardId || undefined,
      initiatorAuthScore: authenticityScore,
      initiatorAuthReasoning: authenticityReason,
    });
    onUpdateState(staged.nextState);
    enrichEngagementSuggestionsAndAuth(staged.nextState, staged.engagement.id)
      .then((enriched) => {
        if (!enriched) return;
        onUpdateState((prev) => ({
          ...prev,
          pendingEngagements: (prev.pendingEngagements ?? []).map((pe) =>
            pe.id === staged.engagement.id
              ? {
                  ...pe,
                  suggestedResponses: enriched.suggestedResponses,
                  suggestionsLoading: false,
                }
              : pe
          ),
        }));
      })
      .catch(() => {});

    onOpenPlayerView(targetChar.playerId);
  };

  // Admin Spend 1 AP & Execute Interaction on behalf of actingPlayerId
  const handleExecuteInteractionOnBehalf = async () => {
    if (!actingChar || !targetChar || isResolving) return;
    if (actingChar.actionPoints <= 0) return;

    // If the target player is actively inside the simulation room (e.g. in another tab),
    // route as a live 30s notification (or busy queue if target is in another conversation)!
    if (isPlayerActivelyInRoom(state.id, targetChar.playerId)) {
      const staged = stageLivePendingEngagement(state, {
        initiatorPlayerId: actingPlayerId,
        targetPlayerId: targetChar.playerId,
        interactionType,
        initiatorPrompt,
        targetedTopicOrCardId: targetedCardId || undefined,
        initiatorAuthScore: authenticityScore,
        initiatorAuthReasoning: authenticityReason,
      });
      onUpdateState(staged.nextState);
      enrichEngagementSuggestionsAndAuth(staged.nextState, staged.engagement.id)
        .then((enriched) => {
          if (!enriched) return;
          onUpdateState((prev) => ({
            ...prev,
            pendingEngagements: (prev.pendingEngagements ?? []).map((pe) =>
              pe.id === staged.engagement.id
                ? {
                    ...pe,
                    suggestedResponses: enriched.suggestedResponses,
                    suggestionsLoading: false,
                  }
                : pe
            ),
          }));
        })
        .catch(() => {});
      return;
    }

    setIsResolving(true);
    try {
      const newState: SimulationState = {
        ...state,
        characters: Object.fromEntries(
          Object.entries(state.characters).map(([k, v]) => [
            k,
            {
              ...v,
              defensivePolicy: {
                ...v.defensivePolicy,
                protectedCardIds: [...v.defensivePolicy.protectedCardIds],
                tradeableCardIds: [...v.defensivePolicy.tradeableCardIds],
                stanceByPlayerId: { ...v.defensivePolicy.stanceByPlayerId },
              },
            },
          ])
        ),
        cards: Object.fromEntries(
          Object.entries(state.cards).map(([k, v]) => [
            k,
            { ...v, knownByPlayerIds: [...v.knownByPlayerIds] },
          ])
        ),
        goals: Object.fromEntries(
          Object.entries(state.goals).map(([k, v]) => [
            k,
            {
              ...v,
              completedByPlayerIds: [...v.completedByPlayerIds],
              knownByPlayerIds: v.knownByPlayerIds ? [...v.knownByPlayerIds] : undefined,
            },
          ])
        ),
        interactions: [...state.interactions],
      };

      const targetCard = targetedCardId ? newState.cards[targetedCardId] : undefined;

      const resolution = resolveInteraction(newState, {
        initiatorPlayerId: actingPlayerId,
        targetPlayerId: targetChar.playerId,
        interactionType,
        initiatorPrompt,
        targetedTopicOrCardId: targetedCardId || undefined,
        authenticityScore,
        authenticityReasoning: authenticityReason,
        responseMode: 'AI_AUTOMATED',
      });

      const generatedSentences = await generateBatchedDialogue(
        actingChar.characterName,
        targetChar.characterName,
        interactionType,
        initiatorPrompt,
        resolution.record.beats,
        targetCard ?? resolution.transferredToInitiator[0],
        newState.voiceStyle
      );

      for (let i = 0; i < resolution.record.beats.length; i++) {
        if (generatedSentences[i]) {
          resolution.record.beats[i].generatedSentence = generatedSentences[i];
        }
      }

      syncRagIndex(newState);
      setSelectedInteractionId(resolution.record.id);
      onUpdateState(newState);
    } catch (e) {
      console.error('Admin interaction execution error:', e);
    } finally {
      setIsResolving(false);
    }
  };

  // Admin Consume Connection Token on behalf of actingPlayerId
  const handleConsumeTokenOnBehalf = (tokenId: string) => {
    const newState: SimulationState = {
      ...state,
      cards: Object.fromEntries(
        Object.entries(state.cards).map(([k, v]) => [
          k,
          { ...v, knownByPlayerIds: [...v.knownByPlayerIds] },
        ])
      ),
      goals: Object.fromEntries(
        Object.entries(state.goals).map(([k, v]) => [
          k,
          {
            ...v,
            completedByPlayerIds: [...v.completedByPlayerIds],
            knownByPlayerIds: v.knownByPlayerIds ? [...v.knownByPlayerIds] : undefined,
          },
        ])
      ),
      characters: Object.fromEntries(
        Object.entries(state.characters).map(([k, v]) => [k, { ...v }])
      ),
      tokens: state.tokens.map((t) => ({ ...t })),
    };

    consumeConnectionToken(newState, tokenId);
    syncRagIndex(newState);
    onUpdateState(newState);
  };

  const handleToggleProtect = (cardId: string) => {
    if (!actingChar) return;
    onUpdateState({
      ...state,
      characters: {
        ...state.characters,
        [actingPlayerId]: {
          ...actingChar,
          defensivePolicy: toggleGuardCardPolicy(actingChar, cardId, state.cards),
        },
      },
    });
  };

  const handleToggleTradeable = (cardId: string) => {
    if (!actingChar) return;
    onUpdateState({
      ...state,
      characters: {
        ...state.characters,
        [actingPlayerId]: {
          ...actingChar,
          defensivePolicy: toggleShareableCardPolicy(actingChar, cardId, state.cards),
        },
      },
    });
  };

  const handleChangeStance = (
    otherPlayerId: string,
    stance: 'COOPERATIVE' | 'NEUTRAL' | 'SUSPICIOUS' | 'HOSTILE'
  ) => {
    if (!actingChar) return;
    onUpdateState({
      ...state,
      characters: {
        ...state.characters,
        [actingPlayerId]: {
          ...actingChar,
          defensivePolicy: {
            ...actingChar.defensivePolicy,
            stanceByPlayerId: {
              ...actingChar.defensivePolicy.stanceByPlayerId,
              [otherPlayerId]: stance,
            },
          },
        },
      },
    });
  };

  if (adminMode === 'STUDIO' && canUseStudio) {
    return (
      <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
        <AuthoringStudio
          simulationState={state}
          simulations={simulations}
          currentUser={currentUser}
          voiceCollection={voiceCollection}
          onUserUpdated={onUserUpdated}
          onCreateSimulation={onCreateSimulation}
          onSelectSimulation={onSelectSimulation}
          onUpdateState={onUpdateState}
          onLaunchSimulation={() => setAdminMode('LIVE_CONTROL')}
          onExitStudio={() => setAdminMode('LIVE_CONTROL')}
          exitLabel="Back to Admin Control"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* ==================================================================== */}
      {/* ADMIN COMMAND HEADER                                                 */}
      {/* ==================================================================== */}
      <header className="h-14 border-b border-amber-900/40 bg-slate-900 px-4 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBackToOverview && (
            <button
              type="button"
              onClick={onBackToOverview}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/40 text-xs font-bold transition-colors shrink-0"
              title="Return to Global Admin Multi-Simulation Overview"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All Simulations
            </button>
          )}

          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/40 shrink-0">
            <Terminal className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-xs tracking-wider text-amber-300 uppercase font-mono">
              {roleLabel || 'Admin Dashboard'}
            </span>
          </div>

          <span className="text-slate-700">|</span>

          {canSwitchSimulations && simulations && onSelectSimulation ? (
            <select
              value={state.id}
              onChange={(e) => onSelectSimulation(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
            >
              {Object.values(simulations).map((sim) => (
                <option key={sim.id} value={sim.id}>
                  {sim.title} ({sim.status})
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-slate-200 truncate">
                {state.title}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 shrink-0">
                Single-Sim Scope
              </span>
            </div>
          )}

          <button
            onClick={handleToggleSimulationStatus}
            className={`text-[10px] px-2 py-0.5 rounded border font-mono transition-colors shrink-0 ${
              state.status === 'COMPLETED'
                ? 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'
                : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900/60'
            }`}
            title="Click to toggle simulation status between ACTIVE and COMPLETED on User Profiles"
          >
            {state.status}
          </button>
        </div>

        {/* Global Turn, Test V4 Pro Toggle & Authoring Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* TEST V4 PRO TOGGLE */}
          <button
            type="button"
            onClick={() => onToggleTestV4Pro(!testV4Pro)}
            role="switch"
            aria-checked={testV4Pro}
            title={
              testV4Pro
                ? `Test V4 Pro ENABLED (${DEEPSEEK_V4_PRO_MODEL}). Click to switch back to ${DEEPSEEK_FLASH_MODEL}.`
                : `Test V4 Pro OFF (using ${DEEPSEEK_FLASH_MODEL}). Click to toggle ${DEEPSEEK_V4_PRO_MODEL}.`
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-bold transition-all ${
              testV4Pro
                ? 'bg-fuchsia-950/80 border-fuchsia-400/80 text-fuchsia-200 shadow shadow-fuchsia-500/20 ring-1 ring-fuchsia-400/30'
                : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Sparkles
              className={`w-3.5 h-3.5 ${
                testV4Pro ? 'text-fuchsia-300 animate-pulse' : 'text-slate-400'
              }`}
            />
            <span>Test V4 Pro</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
                testV4Pro
                  ? 'bg-fuchsia-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {testV4Pro ? 'ON' : 'OFF'}
            </span>
          </button>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Turn:</span>
            <span className="font-bold text-amber-300">{state.currentTurnOrTick}</span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-400">Interactions:</span>
            <span className="font-bold text-sky-400">{state.interactions.length}</span>
          </div>

          <button
            onClick={handleAdvanceTurn}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
            title="Increment turn and refill all players to 3 Action Points"
          >
            Advance Turn
          </button>

          <button
            onClick={handleResetScenario}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Reset simulation to Turn 0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          {canUseStudio && (
            <button
              onClick={() => setAdminMode('STUDIO')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-800 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              Studio
            </button>
          )}

          {onBackToProfile && (
            <button
              onClick={onBackToProfile}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Open your User Profile & Simulation History"
            >
              <User className="w-3.5 h-3.5 text-sky-400" />
              Profile
            </button>
          )}

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-200 hover:bg-rose-950/50 border border-slate-800 transition-colors"
              title="Sign Out / Switch Account"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setShowApiKeyModal(true)}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 transition-colors"
            title="Configure DeepSeek API Key"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* PLAYER ROSTER BAR: AP Control + Open Exact Player Dashboard           */}
      {/* ==================================================================== */}
      <section className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/50 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-slate-200">
              Character Seats ({Object.keys(state.characters).length})
            </span>
            <span className="text-[11px] text-slate-400">
              • {Object.values(state.characters).filter((c) => c.isAiControlled).length} AI Controlled
            </span>
          </div>
          <button
            type="button"
            onClick={handleFillEmptySeatsWithAi}
            className="px-2.5 py-1 rounded bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border border-purple-500/30 text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
            title="Set unoccupied seats to be played by AI when not enough human players are available"
          >
            <Bot className="w-3.5 h-3.5 text-purple-400" />
            Auto-Fill Empty Seats with AI
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.values(state.characters).map((char) => {
            const isActing = actingPlayerId === char.playerId;
            const knownCount = Object.values(state.cards).filter((c) =>
              c.knownByPlayerIds.includes(char.playerId)
            ).length;

            return (
              <div
                key={char.playerId}
                className={`rounded-lg border p-2.5 transition-all text-xs ${
                  isActing
                    ? 'bg-amber-950/25 border-amber-500/70 ring-1 ring-amber-500/30'
                    : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-100 truncate flex items-center gap-1.5">
                      <span>{char.characterName}</span>
                      {isActing && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-mono font-bold uppercase">
                          Acting
                        </span>
                      )}
                      {char.isAiControlled ? (
                        <span
                          className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono font-bold uppercase flex items-center gap-1"
                          title="This character seat is actively controlled by AI"
                        >
                          <Bot className="w-2.5 h-2.5" /> AI
                        </span>
                      ) : (
                        <span
                          className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono font-semibold uppercase flex items-center gap-1"
                          title="This character seat is reserved for human player occupancy"
                        >
                          <User className="w-2.5 h-2.5" /> Human
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {char.publicRole} • ID: <span className="font-mono">{char.playerId}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300 font-bold">
                      {char.victoryPoints} VP
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400 font-bold">
                      {char.actionPoints} AP
                    </span>
                    <button
                      onClick={() => handleGrantActionPoint(char.playerId)}
                      className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700"
                      title="Grant +1 Action Point for testing"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Server-Side Hidden Stat Vector */}
                <div className="grid grid-cols-6 gap-1 font-mono text-[9px] bg-slate-900/90 p-1 rounded border border-slate-800/80 mb-2 text-center">
                  <div title="Inquiry">
                    <span className="text-slate-500 block">INQ</span>
                    <span className="text-sky-400 font-bold">
                      {char.hiddenStats.inquiry.toFixed(2)}
                    </span>
                  </div>
                  <div title="Coercion">
                    <span className="text-slate-500 block">COE</span>
                    <span className="text-rose-400 font-bold">
                      {char.hiddenStats.coercion.toFixed(2)}
                    </span>
                  </div>
                  <div title="Negotiation">
                    <span className="text-slate-500 block">NEG</span>
                    <span className="text-emerald-400 font-bold">
                      {char.hiddenStats.negotiation.toFixed(2)}
                    </span>
                  </div>
                  <div title="Deception">
                    <span className="text-slate-500 block">DEC</span>
                    <span className="text-purple-400 font-bold">
                      {char.hiddenStats.deception.toFixed(2)}
                    </span>
                  </div>
                  <div title="Composure">
                    <span className="text-slate-500 block">CMP</span>
                    <span className="text-amber-400 font-bold">
                      {char.hiddenStats.composure.toFixed(2)}
                    </span>
                  </div>
                  <div title="Insight">
                    <span className="text-slate-500 block">INS</span>
                    <span className="text-teal-400 font-bold">
                      {char.hiddenStats.insight.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Action Bar: Act on Behalf, Toggle AI Controller, Open Exact Player Dashboard */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => handleSelectActingPlayer(char.playerId)}
                    className={`flex-1 min-w-[90px] py-1 px-2 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                      isActing
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                    title={`Control ${char.characterName} and spend their Action Points to test`}
                  >
                    <UserCheck className="w-3 h-3" />
                    {isActing ? `Acting (${knownCount} cards)` : 'Act As (Test AP)'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleAiControl(char.playerId)}
                    className={`py-1 px-2 rounded text-[11px] font-semibold flex items-center gap-1 border transition-colors ${
                      char.isAiControlled
                        ? 'bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border-purple-500/40'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
                    }`}
                    title={
                      char.isAiControlled
                        ? 'Currently AI controlled. Click to switch to human player seat.'
                        : 'Currently human player seat. Click to set this character to be played by AI.'
                    }
                  >
                    <Bot className="w-3 h-3" />
                    {char.isAiControlled ? 'AI' : 'Set AI'}
                  </button>

                  <button
                    onClick={() => onOpenPlayerView(char.playerId)}
                    className="py-1 px-2 rounded text-[11px] font-semibold bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1 transition-colors"
                    title={`Open ${char.characterName}'s exact Player Dashboard`}
                  >
                    <Eye className="w-3 h-3" />
                    Player View
                  </button>

                  <button
                    onClick={() => handleOpenPlayerInNewTab(char.playerId)}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition-colors"
                    title={`Open ${char.characterName}'s Player Dashboard in a new tab`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3-COLUMN ADMIN TELEMETRY & AP TESTING WORKSPACE                      */}
      {/* ==================================================================== */}
      <main className="flex-1 overflow-hidden grid grid-cols-12 min-h-0">
        {/* ------------------------------------------------------------------ */}
        {/* LEFT PANE (COLS 1-3): Acting Player Server Sheet & RAG Inspector     */}
        {/* ------------------------------------------------------------------ */}
        <aside className="col-span-3 border-r border-slate-800 bg-slate-900/40 flex flex-col min-h-0 overflow-y-auto p-3.5 space-y-4">
          {actingChar && (
            <>
              {/* Server Metadata for Acting Player */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-slate-100">
                      Server Sheet: {actingChar.characterName}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    RLS: STRICT
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                    Core Traits (Authenticity Classifier):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {actingChar.coreTraits.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                    Core Motives:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {actingChar.coreMotives.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/40 border border-purple-900/60 text-purple-200 font-mono"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Defensive Stances Matrix for Acting Player */}
                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">
                    Defensive Stance Policy (+0.12 to -0.20):
                  </span>
                  {Object.values(state.characters)
                    .filter((c) => c.playerId !== actingPlayerId)
                    .map((other) => {
                      const currentStance =
                        actingChar.defensivePolicy.stanceByPlayerId[other.playerId] ??
                        'NEUTRAL';
                      return (
                        <div
                          key={other.playerId}
                          className="flex items-center justify-between gap-1 bg-slate-900 px-2 py-1.5 rounded border border-slate-800"
                        >
                          <span className="text-[11px] text-slate-300 truncate">
                            {other.characterName}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {(['COOPERATIVE', 'NEUTRAL', 'SUSPICIOUS', 'HOSTILE'] as const).map(
                              (st) => (
                                <button
                                  key={st}
                                  onClick={() => handleChangeStance(other.playerId, st)}
                                  className={`px-1 py-0.5 text-[9px] rounded font-mono ${
                                    currentStance === st
                                      ? STANCE_BADGE_STYLES[st] + ' font-bold ring-1'
                                      : 'bg-slate-950 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {st.slice(0, 4)}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Connection Tokens on Behalf of Acting Player */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Tokens (Bypass RNG)
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {actingTokens.filter((t) => !t.isConsumed).length} unconsumed
                  </span>
                </div>

                {actingTokens.length > 0 ? (
                  actingTokens.map((tok) => (
                    <ConnectionTokenButton
                      key={tok.id}
                      token={tok}
                      targetName={characterNamesById[tok.targetPlayerId] ?? tok.targetPlayerId}
                      onConsume={handleConsumeTokenOnBehalf}
                    />
                  ))
                ) : (
                  <p className="text-[11px] text-slate-500 font-mono">
                    No connection tokens assigned to {actingChar.characterName}.
                  </p>
                )}
              </div>

              {/* Partitioned RAG Query Debugger */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-bold text-slate-200">
                    RAG Partition Inspector ({actingPlayerId})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <input
                    type="text"
                    value={ragTestQuery}
                    onChange={(e) => setRagTestQuery(e.target.value)}
                    placeholder="Test keyword isolation..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {ragTestResults.length === 0 ? (
                    <div className="text-[10px] font-mono text-slate-500 py-1">
                      0 matching chunks in {actingPlayerId}&apos;s partition.
                    </div>
                  ) : (
                    ragTestResults.map((res) => (
                      <div
                        key={res.chunk.chunkId}
                        className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300"
                      >
                        <div className="flex justify-between text-sky-400 mb-0.5">
                          <span>{res.chunk.sourceType}</span>
                          <span>#{res.chunk.sourceRefId}</span>
                        </div>
                        <p className="font-sans text-slate-300 text-[11px] line-clamp-2">
                          {res.chunk.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* ------------------------------------------------------------------ */}
        {/* CENTER PANE (COLS 4-8): Admin AP Testing Console & Beat Telemetry    */}
        {/* ------------------------------------------------------------------ */}
        <section className="col-span-5 border-r border-slate-800 flex flex-col min-h-0 bg-slate-950/70">
          {/* Staging Console on Behalf of Acting Player */}
          <div className="p-4 border-b border-slate-800 bg-slate-900/50 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Swords className="w-4 h-4 text-rose-400" />
                <h3 className="font-bold text-xs text-slate-100">
                  Test Action as{' '}
                  <span className="text-amber-300">{actingChar?.characterName}</span>
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  AP: {actingChar?.actionPoints ?? 0}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono"
                  title="Server-side success bonus from cards marked Shareable in Acting Player's hand"
                >
                  Shareable ({actingShareableCount}): +{actingShareableBonus.toFixed(2)}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  P_k:
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-bold font-mono">
                  {liveThreshold.toFixed(3)}
                </span>
              </div>
            </div>

            {/* Target Character Selector with Server Stance & Defense Info */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1">
                Target Character (Showing Server Stance & AP):
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(state.characters)
                  .filter((c) => c.playerId !== actingPlayerId)
                  .map((target) => {
                    const stance =
                      target.defensivePolicy.stanceByPlayerId[actingPlayerId] ?? 'NEUTRAL';
                    const stanceClass = STANCE_BADGE_STYLES[stance];
                    const isSelected = targetChar?.playerId === target.playerId;

                    return (
                      <button
                        key={target.playerId}
                        onClick={() => setTargetPlayerId(target.playerId)}
                        className={`p-2 rounded-lg text-left transition-all border text-xs ${
                          isSelected
                            ? 'bg-rose-950/40 border-rose-500 text-rose-100 ring-1 ring-rose-500/50'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400'
                        }`}
                      >
                        <div className="font-bold text-slate-200 truncate">
                          {target.characterName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {target.publicRole}
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span
                            className={`text-[9px] uppercase px-1.5 py-0.2 rounded border font-mono ${stanceClass}`}
                          >
                            {stance}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            AP:{target.actionPoints}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Approach Vector with Server Stat Matchups */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1">
                Approach Vector & Stat Matchup:
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['ASK', 'INTERROGATE', 'NEGOTIATE', 'DECEIVE'] as InteractionType[]).map(
                  (type) => {
                    const info = INTERACTION_TYPE_STYLES[type];
                    const isSelected = interactionType === type;
                    const statPair = INTERACTION_STAT_MAP[type];

                    return (
                      <button
                        key={type}
                        onClick={() => setInteractionType(type)}
                        className={`p-2 rounded-lg text-left transition-all border text-xs flex flex-col justify-between ${
                          isSelected
                            ? `${info.button} ring-1`
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                        }`}
                      >
                        <div className="font-bold text-xs">{type}</div>
                        <div className="text-[9px] font-mono text-slate-400 mt-1">
                          {statPair.offenseKey} vs {statPair.defenseKey}
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Admin Target Card Override & Authenticity Evaluator */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1">
                  Target Specific Card (Admin Override):
                </label>
                <select
                  value={targetedCardId}
                  onChange={(e) => setTargetedCardId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                >
                  <option value="">-- Auto / Untargeted Inquiry --</option>
                  {Object.values(state.cards).map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.id} — {c.title} [{c.secrecy}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                    Authenticity Modifier:
                  </label>
                  <button
                    onClick={handleEvaluateAuthenticity}
                    disabled={isEvaluatingAuth}
                    className="text-[10px] text-sky-400 hover:text-sky-300 font-mono underline"
                  >
                    {isEvaluatingAuth ? 'Scoring...' : 'Re-Evaluate via AI'}
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded border border-slate-800">
                  <span
                    className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                      authenticityScore >= 0
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {authenticityScore >= 0
                      ? `+${authenticityScore.toFixed(2)}`
                      : authenticityScore.toFixed(2)}
                  </span>
                  <span
                    className="text-[10px] text-slate-400 truncate"
                    title={authenticityReason}
                  >
                    {authenticityReason}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Pending Engagement Telemetry Banner */}
            {(state.pendingEngagements ?? []).some(
              (pe) =>
                pe.initiatorPlayerId === actingPlayerId &&
                pe.status !== 'COMPLETED'
            ) && (
              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-600/50 flex items-center gap-2 text-xs text-amber-200">
                <Hourglass className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                <span>
                  {(() => {
                    const pe = (state.pendingEngagements ?? []).find(
                      (p) =>
                        p.initiatorPlayerId === actingPlayerId &&
                        p.status !== 'COMPLETED'
                    );
                    if (!pe) return null;
                    const tName =
                      state.characters[pe.targetPlayerId]?.characterName ??
                      pe.targetPlayerId;
                    if (pe.status === 'QUEUED_MOMENTARILY') {
                      return `${tName} is currently in another conversation and will be available momentarily.`;
                    }
                    return `Live engagement active with ${tName} (${pe.status})...`;
                  })()}
                </span>
              </div>
            )}

            {/* Prompt Input & Spend AP Button */}
            <div className="flex items-stretch gap-2">
              <textarea
                value={initiatorPrompt}
                onChange={(e) => setInitiatorPrompt(e.target.value)}
                rows={2}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 resize-none font-sans"
                placeholder="Enter test dialogue on behalf of the selected player..."
              />
              <button
                onClick={handleStageLiveHailAndPreviewTarget}
                disabled={isResolving || (actingChar?.actionPoints ?? 0) <= 0}
                className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] flex flex-col items-center justify-center gap-1 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                title="Stage a live 30s incoming conversation notification and immediately open Target's Player Dashboard"
              >
                <Eye className="w-4 h-4" />
                <span>Hail & View</span>
              </button>
              <button
                onClick={handleExecuteInteractionOnBehalf}
                disabled={isResolving || (actingChar?.actionPoints ?? 0) <= 0}
                className="px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {isResolving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Rolling...</span>
                  </>
                ) : (
                  <>
                    <Swords className="w-4 h-4" />
                    <span>Spend 1 AP</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Omniscient Interaction Log with Full RNG Beat Telemetry */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-slate-200">
                  Omniscient Beat & RNG Telemetry
                </h4>
              </div>

              {state.interactions.length > 0 && (
                <select
                  value={displayedInteraction?.id ?? ''}
                  onChange={(e) => setSelectedInteractionId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  {state.interactions.map((ix, idx) => (
                    <option key={ix.id} value={ix.id}>
                      #{idx + 1} [T{ix.tickOrTurn}] {ix.initiatorPlayerId} → {ix.targetPlayerId} ({ix.interactionType}, N={ix.sentenceCountN})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {displayedInteraction ? (
              <div>
                {displayedInteraction.cardsTransferredToInitiator.length > 0 && (
                  <div className="p-2.5 mb-3 rounded-lg bg-emerald-950/40 border border-emerald-500/60 flex items-center justify-between text-xs font-mono">
                    <span className="flex items-center gap-2 text-emerald-200 font-semibold">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Transferred to {displayedInteraction.initiatorPlayerId}: #
                      {displayedInteraction.cardsTransferredToInitiator.join(', #')}
                    </span>
                    <span className="text-[10px] text-emerald-300">Non-Depleting Copy</span>
                  </div>
                )}

                {displayedInteraction.cardsTransferredToTarget.length > 0 && (
                  <div className="p-2.5 mb-3 rounded-lg bg-sky-950/40 border border-sky-500/60 flex items-center justify-between text-xs font-mono">
                    <span className="text-sky-200 font-semibold">
                      Reciprocal Trade to {displayedInteraction.targetPlayerId}: #
                      {displayedInteraction.cardsTransferredToTarget.join(', #')}
                    </span>
                  </div>
                )}

                <div className="space-y-1">
                  {displayedInteraction.beats.map((beat) => {
                    const speakerChar = state.characters[beat.speakerId];
                    return (
                      <SentenceBeatRow
                        key={beat.sentenceIndex}
                        beat={beat}
                        speakerName={speakerChar?.characterName ?? beat.speakerId}
                        isInitiator={
                          beat.speakerId === displayedInteraction.initiatorPlayerId
                        }
                        showServerStats={true}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-44 flex flex-col items-center justify-center text-slate-500 text-xs">
                <MessageSquare className="w-7 h-7 text-slate-700 mb-2" />
                <p>No interactions recorded yet. Spend 1 AP above to test resolution math & AI dialogue.</p>
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* RIGHT PANE (COLS 9-12): Global Goals, VP & Epistemic Card Matrix    */}
        {/* ------------------------------------------------------------------ */}
        <aside className="col-span-4 bg-slate-900/40 flex flex-col min-h-0">
          <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-900/80 text-xs shrink-0">
            <button
              onClick={() => setRightTab('GOALS_VP')}
              className={`py-3 px-2 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                rightTab === 'GOALS_VP'
                  ? 'border-amber-500 text-amber-300 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              All Goals & VP
            </button>

            <button
              onClick={() => setRightTab('GLOBAL_CARDS')}
              className={`py-3 px-2 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                rightTab === 'GLOBAL_CARDS'
                  ? 'border-amber-500 text-amber-300 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Global Cards ({Object.keys(state.cards).length})
            </button>

            <button
              onClick={() => setRightTab('ACTING_HAND')}
              className={`py-3 px-2 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                rightTab === 'ACTING_HAND'
                  ? 'border-amber-500 text-amber-300 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {actingPlayerId} Hand ({actingOwnedCards.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-4">
            {/* TAB 1: GLOBAL VP STANDINGS & ALL GOALS */}
            {rightTab === 'GOALS_VP' && (
              <div className="space-y-4">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2.5 flex justify-between">
                    <span>Global Victory Points Leaderboard</span>
                    <span className="text-amber-400">Target: 1500 VP</span>
                  </div>
                  <div className="space-y-1.5">
                    {sortedCharactersByVp.map((char, index) => (
                      <div
                        key={char.playerId}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono ${
                          char.playerId === actingPlayerId
                            ? 'bg-amber-950/40 border border-amber-600/50 text-amber-200 font-bold'
                            : 'bg-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4 text-center font-bold text-slate-500">
                            #{index + 1}
                          </span>
                          <span>{char.characterName}</span>
                        </div>
                        <span className="text-amber-400 font-bold">{char.victoryPoints} VP</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">
                      All Scenario Goals (Checking against {actingChar?.characterName})
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {Object.keys(state.goals).length} Total
                    </span>
                  </div>

                  {Object.values(state.goals).map((goal) => (
                    <GoalTrackerCard
                      key={goal.id}
                      goal={goal}
                      ownedCardIds={actingOwnedCards.map((c) => c.id)}
                      currentPlayerId={actingPlayerId}
                      isAdmin={true}
                      cardsById={state.cards}
                      characterNamesById={characterNamesById}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: GLOBAL EPISTEMIC CARD MATRIX */}
            {rightTab === 'GLOBAL_CARDS' && (
              <div className="space-y-2.5">
                {Object.values(state.cards).map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-slate-400">
                        #{card.id} • {card.tier}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                          SECRECY_BADGE_STYLES[card.secrecy]
                        }`}
                      >
                        {card.secrecy}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-100">{card.title}</div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      {card.canonicalFact}
                    </p>
                    <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-500">Known By:</span>
                        {card.knownByPlayerIds.map((pid) => (
                          <span
                            key={pid}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800"
                          >
                            {characterNamesById[pid] ?? pid}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() =>
                          setTargetedCardId(targetedCardId === card.id ? '' : card.id)
                        }
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          targetedCardId === card.id
                            ? 'bg-rose-500 text-white font-bold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {targetedCardId === card.id ? 'Targeted' : 'Target in Console'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 3: ACTING PLAYER HAND */}
            {rightTab === 'ACTING_HAND' && actingChar && (
              <div className="space-y-2.5">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-400 flex items-center justify-between">
                  <span className="text-rose-300">
                    Guarded:{' '}
                    {
                      actingChar.defensivePolicy.protectedCardIds
                        .filter((id) => actingOwnedCards.some((c) => c.id === id))
                        .slice(0, MAX_GUARDED_CARDS).length
                    }
                    /{MAX_GUARDED_CARDS} max
                  </span>
                  <span className="text-emerald-300">
                    Shareable: {actingShareableCount} (min {MIN_SHAREABLE_CARDS}, +{actingShareableBonus.toFixed(2)} P_k)
                  </span>
                </div>
                {(() => {
                  const ownedIds = actingOwnedCards.map((c) => c.id);
                  return actingOwnedCards.map((card) => {
                    const controls = getCardPolicyControls(
                      actingChar,
                      card.id,
                      ownedIds
                    );
                    return (
                      <InfoCardItem
                        key={card.id}
                        card={card}
                        isProtected={controls.isGuarded}
                        onToggleProtect={handleToggleProtect}
                        guardDisabled={controls.guardDisabled}
                        guardTooltip={controls.guardReason}
                        isTradeable={controls.isShareable}
                        onToggleTradeable={handleToggleTradeable}
                        shareableDisabled={controls.shareableDisabled}
                        shareableTooltip={controls.shareableReason}
                        isSelected={targetedCardId === card.id}
                        onSelectForInteraction={(id) =>
                          setTargetedCardId(id === targetedCardId ? '' : id)
                        }
                        isAdmin={true}
                      />
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* ==================================================================== */}
      {/* DEEPSEEK API KEY MODAL (Admin Only)                                  */}
      {/* ==================================================================== */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-sm text-slate-100">
                  DeepSeek API Configuration
                </h3>
              </div>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Active DeepSeek Model:{' '}
              <code
                className={
                  testV4Pro ? 'text-fuchsia-300 font-bold' : 'text-sky-400 font-bold'
                }
              >
                {testV4Pro ? DEEPSEEK_V4_PRO_MODEL : DEEPSEEK_FLASH_MODEL}
              </code>{' '}
              ({testV4Pro ? 'Test V4 Pro ON' : 'Default Flash Thinking'}) for narrative atomization, player knowledge synthesis, authenticity scoring, and batched dialogue generation.
            </p>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1">
                DeepSeek API Key:
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setDeepSeekApiKey('');
                  setApiKeyInput(HARDCODED_DEEPSEEK_API_KEY);
                  setShowApiKeyModal(false);
                }}
                className="px-3 py-1.5 text-xs rounded text-slate-400 hover:text-slate-200"
              >
                Reset Default
              </button>
              <button
                onClick={() => {
                  setDeepSeekApiKey(apiKeyInput);
                  setShowApiKeyModal(false);
                }}
                className="px-4 py-1.5 text-xs font-bold rounded bg-sky-500 hover:bg-sky-400 text-slate-950"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
