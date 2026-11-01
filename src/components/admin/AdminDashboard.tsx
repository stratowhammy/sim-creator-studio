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
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { UserSeatInviteModal } from '../modals/UserSeatInviteModal';
import { getPendingInvitationForSeat } from '../../services/seatInviteService';

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
  const [inviteModalCharId, setInviteModalCharId] = useState<string | null>(null);

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
      <div className="h-screen flex flex-col bg-[#fffef0] text-[#41403e] overflow-hidden">
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
    <div className="flex flex-col h-screen overflow-hidden bg-[#fffef0] text-[#41403e] font-sans">
      {/* ADMIN NAVBAR */}
      <header className="paper sticky top-0 z-30 px-4 py-2 border-b-2 border-[#41403e] bg-[#fffef0]/95 backdrop-blur-sm flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onBackToOverview && (
            <button
              type="button"
              onClick={onBackToOverview}
              className="paper-btn btn-small"
            >
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
              All Games
            </button>
          )}

          <div className="badge warning font-bold text-xs py-1">
            <Terminal className="w-3.5 h-3.5 inline mr-1" />
            <span>{roleLabel || 'Game Host'}</span>
          </div>

          {canSwitchSimulations && simulations && onSelectSimulation ? (
            <select
              value={state.id}
              onChange={(e) => onSelectSimulation(e.target.value)}
              className="bg-white border-2 border-[#41403e] rounded px-2 py-1 text-xs font-semibold"
            >
              {Object.values(simulations).map((sim) => (
                <option key={sim.id} value={sim.id}>
                  {sim.title} ({sim.status})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-bold truncate max-w-xs">
              {state.title}
            </span>
          )}

          <button
            onClick={handleToggleSimulationStatus}
            className={`badge cursor-pointer ${
              state.status === 'COMPLETED' ? '' : 'success'
            }`}
          >
            {state.status}
          </button>
        </div>

        {/* Global Turn & Controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => onToggleTestV4Pro(!testV4Pro)}
            className={`paper-btn btn-small ${testV4Pro ? 'btn-secondary' : ''}`}
          >
            <Sparkles className="w-3 h-3 inline mr-1" />
            <span>AI Pro: {testV4Pro ? 'ON' : 'OFF'}</span>
          </button>

          <div className="badge font-mono">
            <Clock className="w-3 h-3 inline mr-1" />
            Turn {state.currentTurnOrTick}
          </div>

          <button
            onClick={handleAdvanceTurn}
            className="paper-btn btn-primary btn-small"
          >
            Next Turn
          </button>

          <button
            onClick={handleResetScenario}
            className="paper-btn btn-small"
          >
            <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
            Reset
          </button>

          {canUseStudio && (
            <button
              onClick={() => setAdminMode('STUDIO')}
              className="paper-btn btn-secondary btn-small"
            >
              <Layers className="w-3.5 h-3.5 inline mr-1" />
              Studio
            </button>
          )}

          {onBackToProfile && (
            <button
              onClick={onBackToProfile}
              className="paper-btn btn-small"
            >
              <User className="w-3.5 h-3.5 inline mr-1" />
              Profile
            </button>
          )}

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="paper-btn btn-danger btn-small"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setShowApiKeyModal(true)}
            className="paper-btn btn-small"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* PLAYER ROSTER BAR */}
      <section className="px-4 py-2 border-b-2 border-[#41403e] bg-amber-50/50 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-800" />
            <span className="text-xs font-bold">
              Characters ({Object.keys(state.characters).length})
            </span>
            <span className="text-xs opacity-70">
              • {Object.values(state.characters).filter((c) => c.isAiControlled).length} AI Controlled
            </span>
          </div>
          <button
            type="button"
            onClick={handleFillEmptySeatsWithAi}
            className="paper-btn btn-secondary btn-small"
          >
            <Bot className="w-3 h-3 inline mr-1" />
            Auto-Fill Empty Seats with AI
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {Object.values(state.characters).map((char) => {
            const isActing = actingPlayerId === char.playerId;
            const knownCount = Object.values(state.cards).filter((c) =>
              c.knownByPlayerIds.includes(char.playerId)
            ).length;

            return (
              <div
                key={char.playerId}
                className={`card bg-white border-2 p-2 shadow-sm transition-all text-xs ${
                  isActing
                    ? 'border-sky-600 ring-2 ring-sky-600 bg-sky-50/30'
                    : 'border-[#41403e]'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <div className="min-w-0">
                    <div className="font-bold flex items-center gap-1 flex-wrap">
                      <span className="truncate">{char.characterName}</span>
                      {isActing && (
                        <span className="badge secondary text-[10px]">
                          Testing
                        </span>
                      )}
                      {char.isAiControlled ? (
                        <span className="badge text-[10px]">
                          AI
                        </span>
                      ) : (
                        <span className="badge text-[10px]">
                          Player
                        </span>
                      )}
                      {char.assignedUsername && (
                        <span className="badge success text-[10px]">
                          @{char.assignedUsername}
                        </span>
                      )}
                      {getPendingInvitationForSeat(state.id, char.playerId) && (
                        <span className="badge warning text-[10px]">
                          Invited
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] opacity-70 truncate">
                      {char.publicRole}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[10px] shrink-0">
                    <span className="badge warning font-bold">
                      {char.victoryPoints} VP
                    </span>
                    <span className="badge success font-bold">
                      {char.actionPoints} AP
                    </span>
                    <button
                      onClick={() => handleGrantActionPoint(char.playerId)}
                      className="cursor-pointer font-bold px-1"
                      title="Add 1 Action Point"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Character Skills */}
                <div className="grid grid-cols-6 gap-1 text-[9px] bg-[#fffef0] p-1 rounded border border-[#41403e]/20 mb-1.5 text-center">
                  <div>
                    <span className="opacity-60 block">INQ</span>
                    <span className="font-bold">{char.hiddenStats.inquiry.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="opacity-60 block">PRS</span>
                    <span className="font-bold">{char.hiddenStats.coercion.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="opacity-60 block">BAR</span>
                    <span className="font-bold">{char.hiddenStats.negotiation.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="opacity-60 block">TRK</span>
                    <span className="font-bold">{char.hiddenStats.deception.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="opacity-60 block">CAL</span>
                    <span className="font-bold">{char.hiddenStats.composure.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="opacity-60 block">INS</span>
                    <span className="font-bold">{char.hiddenStats.insight.toFixed(1)}</span>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => handleSelectActingPlayer(char.playerId)}
                    className={`paper-btn btn-small flex-1 ${
                      isActing ? 'btn-primary' : ''
                    }`}
                  >
                    <UserCheck className="w-3 h-3 inline mr-1" />
                    {isActing ? `Active (${knownCount})` : 'Select'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleAiControl(char.playerId)}
                    className="paper-btn btn-small"
                  >
                    <Bot className="w-3 h-3 inline mr-1" />
                    {char.isAiControlled ? 'AI' : 'Human'}
                  </button>

                  <button
                    onClick={() => onOpenPlayerView(char.playerId)}
                    className="paper-btn btn-small btn-secondary"
                  >
                    <Eye className="w-3 h-3 inline mr-1" />
                    View
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteModalCharId(char.playerId)}
                    className="paper-btn btn-small"
                  >
                    <UserPlus className="w-3 h-3 inline mr-1" />
                    {char.assignedUserId ? 'Reassign' : 'Invite'}
                  </button>

                  <button
                    onClick={() => handleOpenPlayerInNewTab(char.playerId)}
                    className="paper-btn btn-small"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3 h-3" />
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
        <aside className="col-span-3 border-r-2 border-[#41403e] bg-[#fffef0] flex flex-col min-h-0 overflow-y-auto p-3 space-y-3">
          {actingChar && (
            <>
              {/* Server Metadata for Acting Player */}
              <div className="card bg-white p-3 rounded border-2 border-[#41403e] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-amber-700" />
                    <span className="font-bold text-[#41403e]">
                      Server Sheet: {actingChar.characterName}
                    </span>
                  </div>
                  <span className="badge success text-[10px]">
                    RLS: STRICT
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold opacity-70 block mb-1">
                    Core Traits:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {actingChar.coreTraits.map((t) => (
                      <span
                        key={t}
                        className="badge text-[10px]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold opacity-70 block mb-1">
                    Core Motives:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {actingChar.coreMotives.map((m) => (
                      <span
                        key={m}
                        className="badge secondary text-[10px]"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Defensive Stances Matrix for Acting Player */}
                <div className="pt-2 border-t border-[#41403e]/20 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold opacity-70 block">
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
                          className="flex items-center justify-between gap-1 bg-[#fffef0] px-2 py-1 rounded border border-[#41403e]/30"
                        >
                          <span className="text-[11px] font-medium truncate">
                            {other.characterName}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {(['COOPERATIVE', 'NEUTRAL', 'SUSPICIOUS', 'HOSTILE'] as const).map(
                              (st) => (
                                <button
                                  key={st}
                                  onClick={() => handleChangeStance(other.playerId, st)}
                                  className={`px-1 py-0.5 text-[9px] rounded font-mono cursor-pointer ${
                                    currentStance === st
                                      ? STANCE_BADGE_STYLES[st] + ' font-bold ring-1'
                                      : 'opacity-50 hover:opacity-100'
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
              <div className="card bg-white p-3 rounded border-2 border-[#41403e] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#41403e] flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    Tokens (Bypass RNG)
                  </span>
                  <span className="text-[10px] opacity-70">
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
                  <p className="text-[11px] opacity-60 italic m-0">
                    No connection tokens assigned to {actingChar.characterName}.
                  </p>
                )}
              </div>

              {/* Partitioned RAG Query Debugger */}
              <div className="card bg-white p-3 rounded border-2 border-[#41403e] space-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-purple-700" />
                  <span className="font-bold text-[#41403e]">
                    RAG Partition Inspector ({actingPlayerId})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 opacity-60 shrink-0" />
                  <input
                    type="text"
                    value={ragTestQuery}
                    onChange={(e) => setRagTestQuery(e.target.value)}
                    placeholder="Test keyword isolation..."
                    className="w-full bg-[#fffef0] border border-[#41403e] rounded px-2 py-1 text-[11px] font-mono"
                  />
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {ragTestResults.length === 0 ? (
                    <div className="text-[10px] opacity-60 py-1 italic">
                      0 matching chunks in {actingPlayerId}&apos;s partition.
                    </div>
                  ) : (
                    ragTestResults.map((res) => (
                      <div
                        key={res.chunk.chunkId}
                        className="p-2 rounded bg-[#fffef0] border border-[#41403e]/30 text-[10px] font-mono"
                      >
                        <div className="flex justify-between text-sky-800 font-bold mb-0.5">
                          <span>{res.chunk.sourceType}</span>
                          <span>#{res.chunk.sourceRefId}</span>
                        </div>
                        <p className="font-sans text-[11px] line-clamp-2 m-0 opacity-80">
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
        <section className="col-span-5 border-r-2 border-[#41403e] flex flex-col min-h-0 bg-white">
          {/* Staging Console on Behalf of Acting Player */}
          <div className="p-3 border-b-2 border-[#41403e] bg-amber-50/40 shrink-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Swords className="w-4 h-4 text-rose-600" />
                <h3 className="font-bold text-xs text-[#41403e] m-0">
                  Test Action as{' '}
                  <span className="text-amber-800">{actingChar?.characterName}</span>
                </h3>
                <span className="badge success font-mono text-[10px]">
                  AP: {actingChar?.actionPoints ?? 0}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="badge success font-mono text-[10px]"
                  title="Server-side success bonus from cards marked Shareable in Acting Player's hand"
                >
                  Shareable ({actingShareableCount}): +{actingShareableBonus.toFixed(2)}
                </span>
                <span className="text-[11px] font-mono opacity-70">
                  P_k:
                </span>
                <span className="badge info font-bold font-mono text-xs">
                  {liveThreshold.toFixed(3)}
                </span>
              </div>
            </div>

            {/* Target Character Selector with Server Stance & Defense Info */}
            <div>
              <label className="text-[10px] uppercase font-bold opacity-70 block mb-1">
                Target Character:
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
                        className={`p-2 rounded border-2 text-left transition-all text-xs cursor-pointer ${
                          isSelected
                            ? 'bg-amber-100 border-amber-700 ring-2 ring-amber-700'
                            : 'bg-white border-[#41403e]/40 hover:border-[#41403e]'
                        }`}
                      >
                        <div className="font-bold truncate">
                          {target.characterName}
                        </div>
                        <div className="text-[10px] opacity-70 truncate">
                          {target.publicRole}
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span
                            className={`text-[9px] uppercase px-1 py-0.2 rounded font-mono ${stanceClass}`}
                          >
                            {stance}
                          </span>
                          <span className="text-[10px] font-mono opacity-60">
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
              <label className="text-[10px] uppercase font-bold opacity-70 block mb-1">
                Approach Vector &amp; Stat Matchup:
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
                        className={`p-2 rounded border-2 text-left transition-all text-xs flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? `${info.button} ring-2 ring-[#41403e]`
                            : 'bg-white border-[#41403e]/40 hover:border-[#41403e]'
                        }`}
                      >
                        <div className="font-bold text-xs">{type}</div>
                        <div className="text-[9px] font-mono opacity-70 mt-1">
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
                <label className="text-[10px] uppercase font-bold opacity-70 block mb-1">
                  Target Specific Card:
                </label>
                <select
                  value={targetedCardId}
                  onChange={(e) => setTargetedCardId(e.target.value)}
                  className="w-full bg-[#fffef0] border-2 border-[#41403e] rounded px-2 py-1 text-xs font-mono"
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
                  <label className="text-[10px] uppercase font-bold opacity-70">
                    Authenticity Modifier:
                  </label>
                  <button
                    onClick={handleEvaluateAuthenticity}
                    disabled={isEvaluatingAuth}
                    className="text-[10px] text-sky-800 hover:underline font-mono cursor-pointer"
                  >
                    {isEvaluatingAuth ? 'Scoring...' : 'Re-Evaluate via AI'}
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-[#fffef0] p-1.5 rounded border border-[#41403e]/40">
                  <span
                    className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
                      authenticityScore >= 0
                        ? 'badge success'
                        : 'badge danger'
                    }`}
                  >
                    {authenticityScore >= 0
                      ? `+${authenticityScore.toFixed(2)}`
                      : authenticityScore.toFixed(2)}
                  </span>
                  <span
                    className="text-[10px] opacity-70 truncate"
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
              <div className="alert alert-warning text-xs flex items-center gap-2">
                <Hourglass className="w-4 h-4 shrink-0 animate-pulse" />
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
                className="flex-1 bg-[#fffef0] border-2 border-[#41403e] rounded p-2 text-xs resize-none font-sans"
                placeholder="Enter test dialogue on behalf of the selected player..."
              />
              <button
                onClick={handleStageLiveHailAndPreviewTarget}
                disabled={isResolving || (actingChar?.actionPoints ?? 0) <= 0}
                className="paper-btn btn-small btn-secondary flex flex-col items-center justify-center shrink-0"
                title="Stage a live 30s incoming conversation notification and immediately open Target's Player Dashboard"
              >
                <Eye className="w-3.5 h-3.5 mb-0.5" />
                <span>Hail &amp; View</span>
              </button>
              <button
                onClick={handleExecuteInteractionOnBehalf}
                disabled={isResolving || (actingChar?.actionPoints ?? 0) <= 0}
                className="paper-btn btn-small btn-danger flex flex-col items-center justify-center shrink-0"
              >
                {isResolving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mb-0.5" />
                    <span>Rolling...</span>
                  </>
                ) : (
                  <>
                    <Swords className="w-3.5 h-3.5 mb-0.5" />
                    <span>Spend 1 AP</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Omniscient Interaction Log with Full RNG Beat Telemetry */}
          <div className="flex-1 overflow-y-auto p-3 min-h-0 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b-2 border-[#41403e]/20 text-xs">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-700" />
                <h4 className="font-bold text-[#41403e] m-0">
                  Omniscient Beat &amp; RNG Telemetry
                </h4>
              </div>

              {state.interactions.length > 0 && (
                <select
                  value={displayedInteraction?.id ?? ''}
                  onChange={(e) => setSelectedInteractionId(e.target.value)}
                  className="bg-[#fffef0] border border-[#41403e] rounded px-2 py-1 text-[11px] font-mono"
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
              <div className="space-y-2">
                {displayedInteraction.cardsTransferredToInitiator.length > 0 && (
                  <div className="alert alert-success text-xs font-mono flex items-center justify-between p-2">
                    <span className="flex items-center gap-1.5 font-bold">
                      <CheckCircle className="w-4 h-4" />
                      Transferred to {displayedInteraction.initiatorPlayerId}: #
                      {displayedInteraction.cardsTransferredToInitiator.join(', #')}
                    </span>
                    <span className="text-[10px]">Non-Depleting Copy</span>
                  </div>
                )}

                {displayedInteraction.cardsTransferredToTarget.length > 0 && (
                  <div className="alert alert-primary text-xs font-mono flex items-center justify-between p-2">
                    <span className="font-bold">
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
              <div className="h-44 flex flex-col items-center justify-center text-[#41403e]/60 text-xs">
                <MessageSquare className="w-7 h-7 opacity-40 mb-2" />
                <p className="m-0">No interactions recorded yet. Spend 1 AP above to test resolution math &amp; AI dialogue.</p>
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* RIGHT PANE (COLS 9-12): Global Goals, VP & Epistemic Card Matrix    */}
        {/* ------------------------------------------------------------------ */}
        <aside className="col-span-4 bg-[#fffef0] flex flex-col min-h-0">
          <div className="grid grid-cols-3 border-b-2 border-[#41403e] bg-amber-50/60 text-xs shrink-0 p-1 gap-1">
            <button
              onClick={() => setRightTab('GOALS_VP')}
              className={`paper-btn btn-small ${
                rightTab === 'GOALS_VP' ? 'btn-primary' : ''
              }`}
            >
              <Award className="w-3.5 h-3.5 inline mr-1" />
              Goals &amp; VP
            </button>

            <button
              onClick={() => setRightTab('GLOBAL_CARDS')}
              className={`paper-btn btn-small ${
                rightTab === 'GLOBAL_CARDS' ? 'btn-primary' : ''
              }`}
            >
              <Database className="w-3.5 h-3.5 inline mr-1" />
              Cards ({Object.keys(state.cards).length})
            </button>

            <button
              onClick={() => setRightTab('ACTING_HAND')}
              className={`paper-btn btn-small ${
                rightTab === 'ACTING_HAND' ? 'btn-primary' : ''
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 inline mr-1" />
              Hand ({actingOwnedCards.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 min-h-0 space-y-3">
            {/* TAB 1: GLOBAL VP STANDINGS & ALL GOALS */}
            {rightTab === 'GOALS_VP' && (
              <div className="space-y-3">
                <div className="card bg-white p-3 rounded border-2 border-[#41403e]">
                  <div className="text-[11px] font-mono opacity-70 uppercase font-bold mb-2 flex justify-between">
                    <span>Leaderboard</span>
                    <span className="text-amber-800">Target: 1500 VP</span>
                  </div>
                  <div className="space-y-1.5">
                    {sortedCharactersByVp.map((char, index) => (
                      <div
                        key={char.playerId}
                        className={`flex items-center justify-between p-1.5 rounded text-xs font-mono border ${
                          char.playerId === actingPlayerId
                            ? 'bg-amber-100 border-amber-600 font-bold'
                            : 'bg-[#fffef0] border-[#41403e]/20'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4 text-center font-bold opacity-60">
                            #{index + 1}
                          </span>
                          <span>{char.characterName}</span>
                        </div>
                        <span className="text-amber-800 font-bold">{char.victoryPoints} VP</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold">
                      All Scenario Goals (Checking {actingChar?.characterName})
                    </span>
                    <span className="text-[11px] font-mono opacity-70">
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
              <div className="space-y-2">
                {Object.values(state.cards).map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded card bg-white border-2 border-[#41403e] text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] opacity-70">
                        #{card.id} • {card.tier}
                      </span>
                      <span
                        className={`badge ${SECRECY_BADGE_STYLES[card.secrecy]}`}
                      >
                        {card.secrecy}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-[#41403e]">{card.title}</div>
                    <p className="opacity-80 text-[11px] leading-relaxed m-0">
                      {card.canonicalFact}
                    </p>
                    <div className="pt-1.5 border-t border-[#41403e]/20 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] font-bold opacity-60">Known By:</span>
                        {card.knownByPlayerIds.map((pid) => (
                          <span
                            key={pid}
                            className="badge text-[10px]"
                          >
                            {characterNamesById[pid] ?? pid}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() =>
                          setTargetedCardId(targetedCardId === card.id ? '' : card.id)
                        }
                        className={`paper-btn btn-small ${
                          targetedCardId === card.id ? 'btn-danger' : ''
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
              <div className="space-y-2">
                <div className="p-2 rounded bg-white border border-[#41403e]/40 font-mono text-[10px] flex items-center justify-between">
                  <span className="text-rose-800 font-bold">
                    Guarded:{' '}
                    {
                      actingChar.defensivePolicy.protectedCardIds
                        .filter((id) => actingOwnedCards.some((c) => c.id === id))
                        .slice(0, MAX_GUARDED_CARDS).length
                    }
                    /{MAX_GUARDED_CARDS} max
                  </span>
                  <span className="text-emerald-800 font-bold">
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card bg-white border-2 border-[#41403e] rounded max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-700" />
                <h3 className="font-bold text-sm text-[#41403e] m-0">
                  DeepSeek API Configuration
                </h3>
              </div>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs opacity-80 leading-relaxed m-0">
              Active DeepSeek Model:{' '}
              <code
                className="font-mono font-bold text-purple-800"
              >
                {testV4Pro ? DEEPSEEK_V4_PRO_MODEL : DEEPSEEK_FLASH_MODEL}
              </code>{' '}
              ({testV4Pro ? 'Test V4 Pro ON' : 'Default Flash Thinking'}) for narrative atomization, player knowledge synthesis, authenticity scoring, and batched dialogue generation.
            </p>

            <div>
              <label className="text-[10px] uppercase font-bold opacity-70 block mb-1">
                DeepSeek API Key:
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-[#fffef0] border-2 border-[#41403e] rounded px-3 py-1.5 text-xs font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setDeepSeekApiKey('');
                  setApiKeyInput(HARDCODED_DEEPSEEK_API_KEY);
                  setShowApiKeyModal(false);
                }}
                className="paper-btn btn-small"
              >
                Reset Default
              </button>
              <button
                onClick={() => {
                  setDeepSeekApiKey(apiKeyInput);
                  setShowApiKeyModal(false);
                }}
                className="paper-btn btn-small btn-primary"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Seat Invitation & Role Transfer Modal */}
      {inviteModalCharId && currentUser && (
        <UserSeatInviteModal
          isOpen={Boolean(inviteModalCharId)}
          onClose={() => setInviteModalCharId(null)}
          simulation={state}
          characterId={inviteModalCharId}
          currentUser={currentUser}
          inviteType={state.characters[inviteModalCharId]?.assignedUserId ? 'ROLE_TRANSFER' : 'CREATOR_INVITE'}
          onInviteSent={(updatedSim) => {
            onUpdateState(updatedSim);
          }}
        />
      )}
    </div>
  );
};
