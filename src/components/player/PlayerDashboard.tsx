import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionRecord,
  InteractionType,
  PendingEngagement,
  PlayerKnowledgeBriefing,
  SimulationState,
  SuggestedPlayerResponse,
} from '../../types/simulation';
import {
  consumeConnectionToken,
  getCardPolicyControls,
  getShareableCardCount,
  inferTargetCardFromPrompt,
  MAX_GUARDED_CARDS,
  MIN_SHAREABLE_CARDS,
  resolveInteraction,
  toggleGuardCardPolicy,
  toggleShareableCardPolicy,
} from '../../engine/resolution';
import {
  completePendingEngagementWithAI,
  completePendingEngagementWithPlayerResponse,
  enrichEngagementSuggestionsAndAuth,
  focusPendingEngagement,
  NOTIFICATION_TIMEOUT_MS,
  stageLivePendingEngagement,
} from '../../engine/engagementManager';
import {
  queryPartitionedRag,
  syncRagIndex,
} from '../../engine/ragPartition';
import {
  classifyAuthenticity,
  generateBatchedDialogue,
  generatePlayerKnowledgeBriefing,
} from '../../services/llmOrchestrator';
import {
  getActivePlayersInSimulation,
  isPlayerActivelyInRoom,
  removeRoomPresence,
  subscribeRealtimeEvents,
  upsertRoomPresence,
} from '../../services/presenceService';
import { IncomingEngagementToast } from './IncomingEngagementToast';
import { CharacterHistoryModal } from './CharacterHistoryModal';
import { InfoCardItem } from '../primitives/InfoCardItem';
import { GoalTrackerCard } from '../primitives/GoalTrackerCard';
import { SentenceBeatRow } from '../primitives/SentenceBeatRow';
import { ConnectionTokenButton } from '../primitives/ConnectionTokenButton';
import {
  INTERACTION_TYPE_STYLES,
  STANCE_BADGE_STYLES,
} from '../ui/themeMaps';
import {
  ArrowLeft,
  ArrowLeftRight,
  Award,
  BookOpen,
  Bot,
  Brain,
  CheckCircle,
  Clock,
  Compass,
  FileText,
  HelpCircle,
  History,
  Hourglass,
  Loader2,
  Maximize2,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Swords,
  User,
  Zap,
} from 'lucide-react';

interface PlayerDashboardProps {
  state: SimulationState;
  playerId: string;
  onUpdateState: (
    updater: SimulationState | ((prev: SimulationState) => SimulationState)
  ) => void;
  onBackToProfile?: () => void;
  onBackToAdmin?: () => void;
}

interface AdvisorMessage {
  id: string;
  sender: 'user' | 'advisor';
  text: string;
  citedCardTitles?: string[];
  timestamp: string;
}

const PLAYER_APPROACH_DESCRIPTIONS: Record<
  InteractionType,
  { label: string; subtitle: string }
> = {
  ASK: {
    label: 'Ask',
    subtitle: 'Direct inquiry',
  },
  INTERROGATE: {
    label: 'Interrogate',
    subtitle: 'Press hard for answers',
  },
  NEGOTIATE: {
    label: 'Negotiate',
    subtitle: 'Trade mutual intel',
  },
  DECEIVE: {
    label: 'Deceive',
    subtitle: 'Bluff or misdirect',
  },
};

const INITIAL_ADVISOR_GREETINGS: Record<string, string> = {
  vance:
    'Commander Vance, our internal command channel is secure. Sub-deck 9 quarantine and primary coolant loop 4 remain flashpoints across the station. Ask me anytime to cross-check what is already confirmed in your personal files.',
  thorne:
    'Dr. Thorne, your private laboratory terminal is encrypted. Keep our sensitive research closely guarded while we determine who compromised station operations. Query me anytime to review your confirmed records.',
  kael:
    'Chief Kael, engineering diagnostics are standing by on this private channel. Tensions are running high after the coolant surge—let me know whenever you want to cross-reference your logs and schematics.',
  nyx:
    'Operative Nyx, your covert relay is active and isolated. Nobody aboard suspects your external mandate. Query this channel anytime to review the intelligence currently in your possession.',
};

const AUTONOMOUS_PEER_PROMPTS: Record<
  string,
  { type: InteractionType; prompt: string }[]
> = {
  vance: [
    {
      type: 'INTERROGATE',
      prompt:
        'I want an immediate account of your department’s movements in the two hours leading up to the primary system alert.',
    },
    {
      type: 'ASK',
      prompt:
        'Have any irregular access logs or unscheduled transfers crossed your desk today?',
    },
  ],
  thorne: [
    {
      type: 'ASK',
      prompt:
        'Can you account for the anomalous thermal and filtration readings our instruments registered just before lockdown?',
    },
    {
      type: 'NEGOTIATE',
      prompt:
        'If you share what your logs captured during the incident window, I can clarify what our technical diagnostics ruled out.',
    },
  ],
  kael: [
    {
      type: 'NEGOTIATE',
      prompt:
        'Look, everyone is pointing fingers at infrastructure—compare notes with me fairly and we can figure out who actually had override access.',
    },
    {
      type: 'ASK',
      prompt:
        'Did you authorize or witness any off-schedule maintenance access before the surge hit?',
    },
  ],
  nyx: [
    {
      type: 'ASK',
      prompt:
        'Walk me through your timeline before the alert sounded—some of the security handshakes do not line up.',
    },
    {
      type: 'DECEIVE',
      prompt:
        'External audit relays already flagged unusual traffic from this sector; you may want to clarify your side of the record first.',
    },
  ],
};

export const PlayerDashboard: React.FC<PlayerDashboardProps> = ({
  state,
  playerId,
  onUpdateState,
  onBackToProfile,
  onBackToAdmin,
}) => {
  const activeChar = state.characters[playerId];
  const otherCharacters = useMemo(
    () => Object.values(state.characters).filter((c) => c.playerId !== playerId),
    [state.characters, playerId]
  );

  // Per-tab presence identifier
  const tabIdRef = useRef<string>(
    `tab_${Date.now()}_${Math.floor(Math.random() * 100000)}`
  );
  const latestStateRef = useRef<SimulationState>(state);
  latestStateRef.current = state;

  const resolvingIdsRef = useRef<Set<string>>(new Set());
  const autoHailTriggeredTurnRef = useRef<string | null>(null);
  const engagementDialogRef = useRef<HTMLDivElement | null>(null);

  // Online active room participants
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<string[]>(() =>
    getActivePlayersInSimulation(state.id)
  );
  const [clockTick, setClockTick] = useState<number>(() => Date.now());

  // Target & Outgoing Conversation Staging
  const [targetPlayerId, setTargetPlayerId] = useState<string>(
    () => otherCharacters[0]?.playerId ?? ''
  );
  const [interactionType, setInteractionType] = useState<InteractionType>('ASK');
  const [initiatorPrompt, setInitiatorPrompt] = useState<string>('');
  const [isResolvingOutgoing, setIsResolvingOutgoing] = useState<boolean>(false);

  // Incoming Focused Engagement Response State
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(
    null
  );
  const [customResponseText, setCustomResponseText] = useState<string>('');
  const [isSubmittingResponse, setIsSubmittingResponse] = useState<boolean>(false);
  const [engagementStatusBanner, setEngagementStatusBanner] = useState<
    string | null
  >(null);

  // Character Interaction History & Multi-Round Display State
  const [characterFilterId, setCharacterFilterId] = useState<string>('ALL');
  const [logViewMode, setLogViewMode] = useState<'ALL_ROUNDS' | 'SINGLE'>(
    'ALL_ROUNDS'
  );
  const [selectedInteractionId, setSelectedInteractionId] = useState<
    string | null
  >(null);
  const [historyModalCharId, setHistoryModalCharId] = useState<string | null>(
    null
  );

  // Right Pane Tabs
  const [rightTab, setRightTab] = useState<
    'KNOWLEDGE' | 'GOALS' | 'CARDS' | 'TOKENS' | 'POLICY'
  >('KNOWLEDGE');
  const [cardTierFilter, setCardTierFilter] = useState<
    'ALL' | 'ATOMIC' | 'COMPOSITE'
  >('ALL');
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);

  // Current Knowledge AI Synthesis State
  const [isGeneratingKnowledge, setIsGeneratingKnowledge] =
    useState<boolean>(false);
  const inFlightSignatureRef = useRef<string | null>(null);

  // Private Advisor Chat State
  const [advisorQuery, setAdvisorQuery] = useState<string>('');
  const [advisorMessages, setAdvisorMessages] = useState<
    Record<string, AdvisorMessage[]>
  >(() => {
    const initial: Record<string, AdvisorMessage[]> = {};
    for (const char of Object.values(state.characters)) {
      initial[char.playerId] = [
        {
          id: `msg_init_${char.playerId}`,
          sender: 'advisor',
          text:
            INITIAL_ADVISOR_GREETINGS[char.playerId] ??
            `${char.characterName}, this private channel is isolated to your verified intelligence. How would you like to proceed?`,
          timestamp: '03:15',
        },
      ];
    }
    return initial;
  });

  // Register live presence while player is actively inside this simulation room
  useEffect(() => {
    const tabId = tabIdRef.current;
    const simId = state.id;

    upsertRoomPresence(simId, playerId, tabId);
    setOnlinePlayerIds(getActivePlayersInSimulation(simId));

    const heartbeat = window.setInterval(() => {
      upsertRoomPresence(simId, playerId, tabId);
      setOnlinePlayerIds(getActivePlayersInSimulation(simId));
    }, 2500);

    const unsub = subscribeRealtimeEvents((msg) => {
      if (msg.type === 'PRESENCE_UPDATED') {
        setOnlinePlayerIds(getActivePlayersInSimulation(simId));
      }
    });

    const handleBeforeUnload = () => {
      removeRoomPresence(simId, playerId, tabId);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.clearInterval(heartbeat);
      unsub();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      removeRoomPresence(simId, playerId, tabId);
    };
  }, [state.id, playerId]);

  // Live clock tick for outgoing/incoming countdown indicators
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick(Date.now());
    }, 300);
    return () => window.clearInterval(timer);
  }, []);

  // Ensure valid targetPlayerId when switching playerId or simulation
  useEffect(() => {
    if (!otherCharacters.some((c) => c.playerId === targetPlayerId)) {
      setTargetPlayerId(otherCharacters[0]?.playerId ?? '');
    }
    setSelectedInteractionId(null);
    setTokenNotice(null);
  }, [playerId, state.id, otherCharacters, targetPlayerId]);

  const targetChar = state.characters[targetPlayerId] ?? otherCharacters[0];

  // Active Pending Engagements involving this player
  const pendingEngagements = state.pendingEngagements ?? [];

  const focusedIncomingEngagement: PendingEngagement | undefined = useMemo(
    () =>
      pendingEngagements.find(
        (pe) => pe.targetPlayerId === playerId && pe.status === 'FOCUSED'
      ),
    [pendingEngagements, playerId]
  );

  const notifyingIncomingEngagements = useMemo(
    () =>
      pendingEngagements
        .filter(
          (pe) => pe.targetPlayerId === playerId && pe.status === 'NOTIFYING'
        )
        .sort((a, b) => a.createdAt - b.createdAt),
    [pendingEngagements, playerId]
  );

  const queuedIncomingEngagements = useMemo(
    () =>
      pendingEngagements
        .filter(
          (pe) =>
            pe.targetPlayerId === playerId &&
            pe.status === 'QUEUED_MOMENTARILY'
        )
        .sort((a, b) => a.createdAt - b.createdAt),
    [pendingEngagements, playerId]
  );

  const primaryToastEngagement = !focusedIncomingEngagement
    ? notifyingIncomingEngagements[0]
    : undefined;

  const additionalWaitingCount =
    Math.max(0, notifyingIncomingEngagements.length - (primaryToastEngagement ? 1 : 0)) +
    queuedIncomingEngagements.length;

  // Outgoing pending engagement initiated by THIS player
  const activeOutgoingEngagement: PendingEngagement | undefined = useMemo(
    () =>
      pendingEngagements.find(
        (pe) =>
          pe.initiatorPlayerId === playerId && pe.status !== 'COMPLETED'
      ),
    [pendingEngagements, playerId]
  );

  // Reset response inputs whenever a new incoming engagement becomes focused
  useEffect(() => {
    if (focusedIncomingEngagement) {
      setSelectedSuggestionId(null);
      setCustomResponseText('');
      engagementDialogRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [focusedIncomingEngagement?.id]);

  // Helper to enrich newly created live engagements asynchronously
  const triggerAsyncSuggestionEnrichment = useCallback(
    async (simSnapshot: SimulationState, engagementId: string) => {
      try {
        const enriched = await enrichEngagementSuggestionsAndAuth(
          simSnapshot,
          engagementId
        );
        if (!enriched) return;

        onUpdateState((prev) => ({
          ...prev,
          pendingEngagements: (prev.pendingEngagements ?? []).map((pe) =>
            pe.id === engagementId
              ? {
                  ...pe,
                  suggestedResponses: enriched.suggestedResponses,
                  initiatorAuthScore: enriched.initiatorAuthScore,
                  initiatorAuthReasoning: enriched.initiatorAuthReasoning,
                  suggestionsLoading: false,
                }
              : pe
          ),
        }));
      } catch (e) {
        console.warn('Suggestion enrichment fallback kept:', e);
        onUpdateState((prev) => ({
          ...prev,
          pendingEngagements: (prev.pendingEngagements ?? []).map((pe) =>
            pe.id === engagementId ? { ...pe, suggestionsLoading: false } : pe
          ),
        }));
      }
    },
    [onUpdateState]
  );

  // Automatic 30-second AI takeover when an incoming notification is ignored
  useEffect(() => {
    const expiredList = (latestStateRef.current.pendingEngagements ?? []).filter(
      (pe) => {
        if (pe.status !== 'NOTIFYING') return false;
        if (
          pe.targetPlayerId !== playerId &&
          pe.initiatorPlayerId !== playerId
        ) {
          return false;
        }
        const deadline =
          pe.expiresAt ??
          (pe.notificationStartedAt ?? pe.createdAt) + NOTIFICATION_TIMEOUT_MS;
        return clockTick >= deadline;
      }
    );

    if (expiredList.length === 0) return;

    for (const expired of expiredList) {
      if (resolvingIdsRef.current.has(expired.id)) continue;
      resolvingIdsRef.current.add(expired.id);

      const lockId = `${tabIdRef.current}_${Date.now()}`;
      let claimed = false;

      onUpdateState((prev) => {
        const current = (prev.pendingEngagements ?? []).find(
          (p) => p.id === expired.id
        );
        if (!current || current.status !== 'NOTIFYING') {
          return prev;
        }
        claimed = true;
        return {
          ...prev,
          pendingEngagements: (prev.pendingEngagements ?? []).map((p) =>
            p.id === expired.id
              ? { ...p, status: 'RESOLVING', resolvingLockId: lockId }
              : p
          ),
        };
      });

      if (!claimed) {
        resolvingIdsRef.current.delete(expired.id);
        continue;
      }

      (async () => {
        try {
          const result = await completePendingEngagementWithAI(
            latestStateRef.current,
            expired.id
          );
          if (result) {
            onUpdateState(result.nextState);
            setSelectedInteractionId(result.record.id);
            if (expired.targetPlayerId === playerId) {
              const initChar =
                result.nextState.characters[expired.initiatorPlayerId];
              setEngagementStatusBanner(
                `30s elapsed without manual focus — AI automatically handled your response to ${
                  initChar?.characterName ?? expired.initiatorPlayerId
                }.`
              );
            }
          }
        } catch (err) {
          console.error('Auto AI takeover error:', err);
        } finally {
          resolvingIdsRef.current.delete(expired.id);
        }
      })();
    }
  }, [clockTick, playerId, onUpdateState]);

  // Single-player / Offline-peer autonomous conversation initiation once per round
  // so an active player inside a simulation room experiences live incoming engagements
  // even when other characters are not staffed by separate browser tabs.
  useEffect(() => {
    if (state.status !== 'ACTIVE') return;
    const turnKey = `${state.id}::${playerId}::${state.currentTurnOrTick}`;
    if (autoHailTriggeredTurnRef.current === turnKey) return;

    const timer = window.setTimeout(() => {
      const current = latestStateRef.current;
      if (current.status !== 'ACTIVE') return;
      if (autoHailTriggeredTurnRef.current === turnKey) return;

      const existingActiveForPlayer = (current.pendingEngagements ?? []).some(
        (pe) =>
          (pe.targetPlayerId === playerId ||
            pe.initiatorPlayerId === playerId) &&
          pe.status !== 'COMPLETED'
      );
      if (existingActiveForPlayer) return;

      // Pick a peer not controlled by another human tab who has spare action points
      const activeHumanIds = new Set(getActivePlayersInSimulation(current.id));
      const candidatePeers = Object.values(current.characters).filter(
        (c) =>
          c.playerId !== playerId &&
          !activeHumanIds.has(c.playerId) &&
          c.actionPoints >= 2
      );

      if (candidatePeers.length === 0) return;

      autoHailTriggeredTurnRef.current = turnKey;
      const peer =
        candidatePeers[current.currentTurnOrTick % candidatePeers.length];
      const templates = AUTONOMOUS_PEER_PROMPTS[peer.playerId] ?? [
        {
          type: 'ASK' as InteractionType,
          prompt: `We need to align our timelines before this situation escalates—what have your records confirmed so far?`,
        },
      ];
      const chosen =
        templates[current.currentTurnOrTick % templates.length];

      const staged = stageLivePendingEngagement(current, {
        initiatorPlayerId: peer.playerId,
        targetPlayerId: playerId,
        interactionType: chosen.type,
        initiatorPrompt: chosen.prompt,
      });

      onUpdateState(staged.nextState);
      triggerAsyncSuggestionEnrichment(staged.nextState, staged.engagement.id);
    }, 8500);

    return () => window.clearTimeout(timer);
  }, [
    state.id,
    state.status,
    state.currentTurnOrTick,
    playerId,
    onUpdateState,
    triggerAsyncSuggestionEnrichment,
  ]);

  // Strictly partitioned player-owned cards
  const ownedCards = useMemo(
    () =>
      Object.values(state.cards).filter((c) =>
        c.knownByPlayerIds.includes(playerId)
      ),
    [state.cards, playerId]
  );

  const ownedCardIds = useMemo(
    () => ownedCards.map((c) => c.id),
    [ownedCards]
  );

  const filteredOwnedCards = useMemo(
    () =>
      ownedCards.filter((c) => {
        if (cardTierFilter === 'ALL') return true;
        return c.tier === cardTierFilter;
      }),
    [ownedCards, cardTierFilter]
  );

  // Strictly partitioned player-visible goals
  const visibleGoals = useMemo(
    () =>
      Object.values(state.goals).filter(
        (g) =>
          g.assignedPlayerId === playerId ||
          g.knownByPlayerIds?.includes(playerId) ||
          g.completedByPlayerIds.includes(playerId)
      ),
    [state.goals, playerId]
  );

  // Strictly partitioned player-participated conversations ONLY
  const playerInteractions = useMemo(
    () =>
      state.interactions.filter(
        (ix) =>
          ix.initiatorPlayerId === playerId || ix.targetPlayerId === playerId
      ),
    [state.interactions, playerId]
  );

  // Exchange counts per character across all rounds
  const interactionCountByChar = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const other of otherCharacters) {
      counts[other.playerId] = playerInteractions.filter(
        (ix) =>
          ix.initiatorPlayerId === other.playerId ||
          ix.targetPlayerId === other.playerId
      ).length;
    }
    return counts;
  }, [otherCharacters, playerInteractions]);

  // Filtered interactions for inline multi-round display
  const filteredPlayerInteractions = useMemo(() => {
    if (characterFilterId === 'ALL') return playerInteractions;
    return playerInteractions.filter(
      (ix) =>
        ix.initiatorPlayerId === characterFilterId ||
        ix.targetPlayerId === characterFilterId
    );
  }, [playerInteractions, characterFilterId]);

  const interactionsGroupedByRound = useMemo(() => {
    const map = new Map<number, InteractionRecord[]>();
    for (const ix of filteredPlayerInteractions) {
      const arr = map.get(ix.tickOrTurn) ?? [];
      arr.push(ix);
      map.set(ix.tickOrTurn, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [filteredPlayerInteractions]);

  const displayedSingleInteraction = useMemo(() => {
    if (filteredPlayerInteractions.length === 0) return undefined;
    if (selectedInteractionId) {
      const found = filteredPlayerInteractions.find(
        (ix) => ix.id === selectedInteractionId
      );
      if (found) return found;
    }
    return filteredPlayerInteractions[filteredPlayerInteractions.length - 1];
  }, [filteredPlayerInteractions, selectedInteractionId]);

  // Active player's connection tokens
  const activePlayerTokens = useMemo(
    () => state.tokens.filter((t) => t.ownerPlayerId === playerId),
    [state.tokens, playerId]
  );

  // Signature of everything this player currently knows so Current Knowledge stays up to date
  const cardSignature = useMemo(() => {
    const sortedCardIds = ownedCards
      .map((c) => c.id)
      .sort()
      .join(',');
    const sortedGoalIds = visibleGoals
      .map((g) => g.id)
      .sort()
      .join(',');
    const voiceKey = `${state.voiceStyle?.id ?? 'default'}:${state.voiceStyle?.authorInspiration ?? ''}`;
    return `${state.id}::${playerId}::${voiceKey}::${sortedCardIds}::${sortedGoalIds}`;
  }, [
    state.id,
    playerId,
    state.voiceStyle?.id,
    state.voiceStyle?.authorInspiration,
    ownedCards,
    visibleGoals,
  ]);

  const cachedBriefing: PlayerKnowledgeBriefing | undefined =
    state.knowledgeBriefings?.[playerId];
  const isBriefingUpToDate =
    cachedBriefing !== undefined &&
    cachedBriefing.cardSignature === cardSignature;

  const synthesizeKnowledgeBriefing = async (force = false) => {
    if (!activeChar) return;
    if (!force && isBriefingUpToDate) return;
    if (!force && inFlightSignatureRef.current === cardSignature) return;

    inFlightSignatureRef.current = cardSignature;
    setIsGeneratingKnowledge(true);

    try {
      const allCharacterNames = Object.values(state.characters).map(
        (c) => c.characterName
      );
      const output = await generatePlayerKnowledgeBriefing(
        state.title,
        state.masterNarrative,
        activeChar,
        ownedCards,
        visibleGoals,
        allCharacterNames,
        state.voiceStyle,
        state.readabilityLevel
      );

      const briefing: PlayerKnowledgeBriefing = {
        playerId,
        cardSignature,
        narrative: output.narrative,
        keyQuestions: output.keyQuestions,
        generatedAtTurn: state.currentTurnOrTick,
      };

      onUpdateState((prev) => ({
        ...prev,
        knowledgeBriefings: {
          ...(prev.knowledgeBriefings ?? {}),
          [playerId]: briefing,
        },
      }));
    } catch (e) {
      console.error('Failed to synthesize player knowledge briefing:', e);
    } finally {
      setIsGeneratingKnowledge(false);
      if (inFlightSignatureRef.current === cardSignature) {
        inFlightSignatureRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (rightTab === 'KNOWLEDGE' && !isBriefingUpToDate) {
      synthesizeKnowledgeBriefing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab, cardSignature, isBriefingUpToDate]);

  // Focus an incoming conversation from the bottom-right notification
  const handleFocusIncomingConversation = (engagementId: string) => {
    setEngagementStatusBanner(null);
    onUpdateState((prev) => focusPendingEngagement(prev, engagementId));
  };

  // Submit active player's response (Suggested Option or Direct Typed Response mediated by AI)
  const handleSubmitFocusedResponse = async (
    explicitSuggestion?: SuggestedPlayerResponse
  ) => {
    if (!focusedIncomingEngagement || isSubmittingResponse) return;

    const chosenText = explicitSuggestion
      ? explicitSuggestion.responseText
      : customResponseText.trim();

    if (!chosenText) return;

    const matchedSuggestion =
      explicitSuggestion ??
      focusedIncomingEngagement.suggestedResponses.find(
        (s) =>
          s.id === selectedSuggestionId && s.responseText.trim() === chosenText
      );

    const mode = matchedSuggestion ? 'PLAYER_SUGGESTED' : 'PLAYER_DIRECT';

    setIsSubmittingResponse(true);
    try {
      onUpdateState((prev) => ({
        ...prev,
        pendingEngagements: (prev.pendingEngagements ?? []).map((pe) =>
          pe.id === focusedIncomingEngagement.id
            ? { ...pe, status: 'RESOLVING' }
            : pe
        ),
      }));

      const result = await completePendingEngagementWithPlayerResponse(
        latestStateRef.current,
        focusedIncomingEngagement.id,
        chosenText,
        mode
      );

      if (result) {
        onUpdateState(result.nextState);
        setSelectedInteractionId(result.record.id);
        setCustomResponseText('');
        setSelectedSuggestionId(null);
        setEngagementStatusBanner(
          mode === 'PLAYER_DIRECT'
            ? 'Your direct response was woven into the conversation with simulation integrity preserved.'
            : 'Your selected response has been delivered.'
        );
      }
    } catch (e) {
      console.error('Failed to submit player response:', e);
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  // Let AI handle a focused engagement if player explicitly delegates
  const handleDelegateFocusedToAI = async () => {
    if (!focusedIncomingEngagement || isSubmittingResponse) return;
    setIsSubmittingResponse(true);
    try {
      onUpdateState((prev) => ({
        ...prev,
        pendingEngagements: (prev.pendingEngagements ?? []).map((pe) =>
          pe.id === focusedIncomingEngagement.id
            ? { ...pe, status: 'RESOLVING' }
            : pe
        ),
      }));

      const result = await completePendingEngagementWithAI(
        latestStateRef.current,
        focusedIncomingEngagement.id
      );
      if (result) {
        onUpdateState(result.nextState);
        setSelectedInteractionId(result.record.id);
        setEngagementStatusBanner('AI handled the response on your behalf.');
      }
    } catch (e) {
      console.error('Failed to delegate to AI:', e);
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  // Initiate an outgoing conversation with another character
  const handleEngage = async () => {
    if (
      !activeChar ||
      !targetChar ||
      isResolvingOutgoing ||
      Boolean(activeOutgoingEngagement) ||
      !initiatorPrompt.trim()
    ) {
      return;
    }
    if (activeChar.actionPoints <= 0) return;

    setEngagementStatusBanner(null);

    // Check if the target player is actively inside this simulation room AND not set to AI
    const targetIsAi = targetChar.isAiControlled === true;
    const targetIsActivelyInRoom =
      !targetIsAi && isPlayerActivelyInRoom(state.id, targetChar.playerId);

    if (targetIsActivelyInRoom) {
      const staged = stageLivePendingEngagement(latestStateRef.current, {
        initiatorPlayerId: playerId,
        targetPlayerId: targetChar.playerId,
        interactionType,
        initiatorPrompt: initiatorPrompt.trim(),
      });

      setInitiatorPrompt('');
      onUpdateState(staged.nextState);
      triggerAsyncSuggestionEnrichment(staged.nextState, staged.engagement.id);
      return;
    }

    // Target is NOT active in the simulation room -> fully automated AI resolution
    setIsResolvingOutgoing(true);
    try {
      const authEval = await classifyAuthenticity(
        activeChar,
        ownedCards,
        initiatorPrompt.trim()
      );

      const currentSnap = latestStateRef.current;
      const newState: SimulationState = {
        ...currentSnap,
        characters: Object.fromEntries(
          Object.entries(currentSnap.characters).map(([k, v]) => [
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
          Object.entries(currentSnap.cards).map(([k, v]) => [
            k,
            { ...v, knownByPlayerIds: [...v.knownByPlayerIds] },
          ])
        ),
        goals: Object.fromEntries(
          Object.entries(currentSnap.goals).map(([k, v]) => [
            k,
            {
              ...v,
              completedByPlayerIds: [...v.completedByPlayerIds],
              knownByPlayerIds: v.knownByPlayerIds
                ? [...v.knownByPlayerIds]
                : undefined,
            },
          ])
        ),
        interactions: [...currentSnap.interactions],
      };

      const inferredCardId = inferTargetCardFromPrompt(
        newState,
        playerId,
        targetChar.playerId,
        initiatorPrompt
      );
      const targetCard = inferredCardId
        ? newState.cards[inferredCardId]
        : undefined;

      const resolution = resolveInteraction(newState, {
        initiatorPlayerId: playerId,
        targetPlayerId: targetChar.playerId,
        interactionType,
        initiatorPrompt: initiatorPrompt.trim(),
        targetedTopicOrCardId: inferredCardId,
        authenticityScore: authEval.authenticityScore,
        authenticityReasoning: authEval.authenticityReasoning,
        responseMode: 'AI_AUTOMATED',
      });

      const generatedSentences = await generateBatchedDialogue(
        activeChar.characterName,
        targetChar.characterName,
        interactionType,
        initiatorPrompt.trim(),
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
      setInitiatorPrompt('');
      onUpdateState(newState);
    } catch (e) {
      console.error('Interaction execution error:', e);
    } finally {
      setIsResolvingOutgoing(false);
    }
  };

  // Activate a Connection Token
  const handleConsumeToken = (tokenId: string) => {
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
            knownByPlayerIds: v.knownByPlayerIds
              ? [...v.knownByPlayerIds]
              : undefined,
          },
        ])
      ),
      characters: Object.fromEntries(
        Object.entries(state.characters).map(([k, v]) => [k, { ...v }])
      ),
      tokens: state.tokens.map((t) => ({ ...t })),
    };

    const res = consumeConnectionToken(newState, tokenId);
    if (res.transferredCard) {
      setTokenNotice(`New intelligence acquired: "${res.transferredCard.title}"`);
    } else if (res.peekedGoal) {
      setTokenNotice(`Uncovered hidden objective: "${res.peekedGoal.veiledPrompt}"`);
    } else {
      setTokenNotice('Connection used, but no new intelligence remained to uncover.');
    }

    syncRagIndex(newState);
    onUpdateState(newState);
  };

  const handleToggleProtect = (cardId: string) => {
    onUpdateState((prev) => {
      const char = prev.characters[playerId];
      if (!char) return prev;
      return {
        ...prev,
        characters: {
          ...prev.characters,
          [playerId]: {
            ...char,
            defensivePolicy: toggleGuardCardPolicy(char, cardId, prev.cards),
          },
        },
      };
    });
  };

  const handleToggleTradeable = (cardId: string) => {
    onUpdateState((prev) => {
      const char = prev.characters[playerId];
      if (!char) return prev;
      return {
        ...prev,
        characters: {
          ...prev.characters,
          [playerId]: {
            ...char,
            defensivePolicy: toggleShareableCardPolicy(char, cardId, prev.cards),
          },
        },
      };
    });
  };

  const handleChangeStance = (
    otherPlayerId: string,
    stance: 'COOPERATIVE' | 'NEUTRAL' | 'SUSPICIOUS' | 'HOSTILE'
  ) => {
    onUpdateState((prev) => {
      const char = prev.characters[playerId];
      if (!char) return prev;
      return {
        ...prev,
        characters: {
          ...prev.characters,
          [playerId]: {
            ...char,
            defensivePolicy: {
              ...char.defensivePolicy,
              stanceByPlayerId: {
                ...char.defensivePolicy.stanceByPlayerId,
                [otherPlayerId]: stance,
              },
            },
          },
        },
      };
    });
  };

  const handleSendAdvisorQuery = (queryText: string) => {
    if (!queryText.trim() || !activeChar) return;

    const userMsg: AdvisorMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const ragResults = queryPartitionedRag(state.ragIndex, playerId, queryText, 3);
    let reply = '';
    const citedCardTitles: string[] = [];

    if (ragResults.length === 0) {
      reply = `I searched your personal logs and intelligence files for "${queryText}", but nothing in your possession corroborates that yet. You will need to question others aboard to learn more.`;
    } else {
      const facts = ragResults.map((r) => {
        if (r.chunk.sourceType === 'INFO_CARD') {
          const title = state.cards[r.chunk.sourceRefId]?.title;
          if (title && !citedCardTitles.includes(title)) {
            citedCardTitles.push(title);
          }
        }
        return `• ${r.chunk.content}`;
      });
      reply = `From your verified files:\n${facts.join('\n')}`;
    }

    const advisorMsg: AdvisorMessage = {
      id: `adv_${Date.now()}`,
      sender: 'advisor',
      text: reply,
      citedCardTitles,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setAdvisorMessages((prev) => ({
      ...prev,
      [playerId]: [...(prev[playerId] || []), userMsg, advisorMsg],
    }));
    setAdvisorQuery('');
  };

  if (!activeChar) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950 text-slate-300 text-sm">
        Character profile not found.
      </div>
    );
  }

  // Render helper for a single InteractionRecord card (strictly player-safe)
  const renderInteractionExchangeCard = (
    ix: InteractionRecord,
    compactHeader: boolean = false
  ) => {
    const youInitiated = ix.initiatorPlayerId === playerId;
    const otherId = youInitiated ? ix.targetPlayerId : ix.initiatorPlayerId;
    const otherChar = state.characters[otherId];
    const gainedTitles = (
      youInitiated
        ? ix.cardsTransferredToInitiator
        : ix.cardsTransferredToTarget
    )
      .map((cid) => state.cards[cid]?.title)
      .filter((t): t is string => Boolean(t));

    return (
      <div
        key={ix.id}
        className="rounded-xl bg-slate-900/60 border border-slate-800/90 p-3.5 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="font-bold text-slate-100">
              {youInitiated
                ? `You → ${otherChar?.characterName ?? otherId}`
                : `${otherChar?.characterName ?? otherId} → You`}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 text-[10px] font-semibold">
              {PLAYER_APPROACH_DESCRIPTIONS[ix.interactionType].label}
            </span>
            {ix.responseMode && ix.responseMode !== 'AI_AUTOMATED' && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                Personal Response
              </span>
            )}
          </div>
          {!compactHeader && (
            <span className="text-[10px] font-mono text-slate-400 shrink-0">
              Turn {ix.tickOrTurn}
            </span>
          )}
        </div>

        {gainedTitles.length > 0 && (
          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/60 flex items-center gap-2 text-xs">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold text-emerald-200">
              New Intelligence Uncovered: {gainedTitles.join(', ')}
            </span>
          </div>
        )}

        <div className="space-y-1">
          {ix.beats.map((beat) => {
            const speakerChar = state.characters[beat.speakerId];
            const playerGainedRevealed =
              beat.revealedCardId &&
              ownedCardIds.includes(beat.revealedCardId) &&
              ((ix.initiatorPlayerId === playerId &&
                ix.cardsTransferredToInitiator.includes(beat.revealedCardId)) ||
                (ix.targetPlayerId === playerId &&
                  ix.cardsTransferredToTarget.includes(beat.revealedCardId)));

            return (
              <SentenceBeatRow
                key={beat.sentenceIndex}
                beat={beat}
                speakerName={speakerChar?.characterName ?? 'Speaker'}
                isInitiator={beat.speakerId === ix.initiatorPlayerId}
                showServerStats={false}
                revealedCardTitle={
                  playerGainedRevealed && beat.revealedCardId
                    ? state.cards[beat.revealedCardId]?.title
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>
    );
  };

  // Outgoing live countdown if target is notifying
  const outgoingSecondsLeft = activeOutgoingEngagement?.expiresAt
    ? Math.max(
        0,
        Math.ceil((activeOutgoingEngagement.expiresAt - clockTick) / 1000)
      )
    : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* ==================================================================== */}
      {/* PLAYER TERMINAL HEADER (Zero Server/Admin Telemetry)                  */}
      {/* ==================================================================== */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-5 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors mr-1"
              title="Exit player view and return to Admin Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Admin
            </button>
          )}
          {onBackToProfile && (
            <button
              onClick={() => {
                removeRoomPresence(state.id, playerId, tabIdRef.current);
                onBackToProfile();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors mr-1"
              title="Leave simulation room and return to your User Profile"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              My Profile
            </button>
          )}
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="font-bold text-sm tracking-wide text-white">
              {state.title}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
              In Room
            </span>
            {state.voiceStyle && (
              <span
                className="hidden xl:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30 font-semibold"
                title={
                  state.voiceStyle.authorInspiration
                    ? `${state.voiceStyle.genre ?? 'Genre Voice'} · Style of ${state.voiceStyle.authorInspiration} — ${state.voiceStyle.tagline}`
                    : state.voiceStyle.tagline
                }
              >
                Voice: {state.voiceStyle.name}
              </span>
            )}
          </div>
        </div>

        {/* Active Player Persona Badge */}
        <div className="flex items-center gap-2.5 bg-slate-950 px-3.5 py-1.5 rounded-lg border border-sky-900/60">
          <User className="w-4 h-4 text-sky-400" />
          <div className="text-xs">
            <span className="font-bold text-white">{activeChar.characterName}</span>
            <span className="text-slate-500 mx-1.5">•</span>
            <span className="text-sky-300">{activeChar.publicRole}</span>
          </div>
        </div>

        {/* Personal Status Indicators + Character History Shortcut */}
        <div className="flex items-center gap-2.5 text-xs">
          <button
            type="button"
            onClick={() =>
              setHistoryModalCharId(
                characterFilterId !== 'ALL'
                  ? characterFilterId
                  : targetChar?.playerId ?? 'ALL'
              )
            }
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-sky-500/50 text-sky-300 font-semibold transition-colors"
            title="View all interactions with any character over all rounds"
          >
            <History className="w-3.5 h-3.5" />
            <span>Character History</span>
          </button>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Turn</span>
            <span className="font-bold text-amber-300">
              {state.currentTurnOrTick}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Actions</span>
            <span className="font-bold text-emerald-400">
              {activeChar.actionPoints}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <Award className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-400">Score</span>
            <span className="font-bold text-sky-300">
              {activeChar.victoryPoints} VP
            </span>
          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 3-COLUMN IMMERSIVE PLAYER WORKSPACE                                  */}
      {/* ==================================================================== */}
      <main className="flex-1 overflow-hidden grid grid-cols-12 min-h-0">
        {/* ------------------------------------------------------------------ */}
        {/* LEFT PANE (COLS 1-3): Personal Dossier & Private Advisor            */}
        {/* ------------------------------------------------------------------ */}
        <aside className="col-span-3 border-r border-slate-800 bg-slate-900/40 flex flex-col min-h-0">
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/70 shrink-0 space-y-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <h3 className="font-bold text-xs text-slate-200">
                Personal Dossier & Advisor
              </h3>
            </div>
            <p className="text-[11px] text-slate-300/90 leading-relaxed italic bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
              "{activeChar.privateNarrativeBio}"
            </p>
          </div>

          <div className="p-2 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap gap-1.5 shrink-0">
            <button
              onClick={() =>
                handleSendAdvisorQuery('What confidential records do I hold?')
              }
              className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              My Records
            </button>
            <button
              onClick={() =>
                handleSendAdvisorQuery('What do I know about the incident?')
              }
              className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Incident Details
            </button>
            <button
              onClick={() =>
                handleSendAdvisorQuery('What is my primary objective?')
              }
              className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              My Objective
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {(advisorMessages[playerId] || []).map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col text-xs ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-1">
                  <span>
                    {msg.sender === 'user' ? 'You' : 'Private Advisor'}
                  </span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>
                <div
                  className={`p-3 rounded-lg max-w-[95%] leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-sky-600 text-white rounded-br-none'
                      : 'bg-slate-800/90 border border-slate-700 text-slate-200 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>
                  {msg.citedCardTitles && msg.citedCardTitles.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400">
                        Sources:
                      </span>
                      {msg.citedCardTitles.map((title) => (
                        <span
                          key={title}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-200 border border-purple-800/60"
                        >
                          {title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-2.5 border-t border-slate-800 bg-slate-900/60 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAdvisorQuery(advisorQuery);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={advisorQuery}
                onChange={(e) => setAdvisorQuery(e.target.value)}
                placeholder="Consult your private advisor..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </aside>

        {/* ------------------------------------------------------------------ */}
        {/* CENTER PANE (COLS 4-8): Live Engagement Dialog & Multi-Round Log    */}
        {/* ------------------------------------------------------------------ */}
        <section className="col-span-5 border-r border-slate-800 flex flex-col min-h-0 bg-slate-950/70">
          {/* ACTIVE INCOMING ENGAGEMENT RESPONSE DIALOG (When Focused within 30s) */}
          {focusedIncomingEngagement ? (
            <div
              ref={engagementDialogRef}
              className="p-4 border-b-2 border-sky-500/70 bg-gradient-to-b from-sky-950/40 to-slate-900/90 shrink-0 space-y-3.5 max-h-[58vh] overflow-y-auto"
            >
              {(() => {
                const initiatorChar =
                  state.characters[
                    focusedIncomingEngagement.initiatorPlayerId
                  ];
                const waitingOthers =
                  notifyingIncomingEngagements.length +
                  queuedIncomingEngagements.length;

                return (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                        <h3 className="font-bold text-xs text-white">
                          Live Conversation with{' '}
                          {initiatorChar?.characterName ??
                            focusedIncomingEngagement.initiatorPlayerId}
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold">
                          {
                            PLAYER_APPROACH_DESCRIPTIONS[
                              focusedIncomingEngagement.interactionType
                            ].label
                          }
                        </span>
                      </div>

                      {waitingOthers > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-700/50">
                          {waitingOthers} other{' '}
                          {waitingOthers === 1 ? 'caller' : 'callers'} notified
                          you will be available momentarily
                        </span>
                      )}
                    </div>

                    {/* Engagement Dialog: Initiator's Opening Prompt */}
                    <div className="rounded-xl bg-slate-950/95 border border-slate-700 p-3.5 space-y-1">
                      <div className="text-[10px] font-semibold text-sky-300">
                        {initiatorChar?.characterName} (
                        {initiatorChar?.publicRole}) says:
                      </div>
                      <p className="text-xs text-slate-100 leading-relaxed italic">
                        "{focusedIncomingEngagement.initiatorPrompt}"
                      </p>
                    </div>

                    {/* Option 1: Choose from AI Suggested Responses */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-200">
                          Suggested Responses (click to select or send):
                        </span>
                        {focusedIncomingEngagement.suggestionsLoading && (
                          <span className="flex items-center gap-1 text-[10px] text-sky-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Tailoring options...
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {focusedIncomingEngagement.suggestedResponses.map(
                          (sug) => {
                            const isPicked = selectedSuggestionId === sug.id;
                            return (
                              <div
                                key={sug.id}
                                onClick={() => {
                                  setSelectedSuggestionId(sug.id);
                                  setCustomResponseText(sug.responseText);
                                }}
                                className={`cursor-pointer rounded-xl border p-2.5 text-xs transition-all ${
                                  isPicked
                                    ? 'bg-sky-950/60 border-sky-400 text-white ring-1 ring-sky-400/40'
                                    : 'bg-slate-950/75 border-slate-800 hover:border-slate-600 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                                    {sug.stanceLabel}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isSubmittingResponse}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSubmitFocusedResponse(sug);
                                    }}
                                    className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 text-[10px] font-bold transition-colors disabled:opacity-40"
                                  >
                                    Send Option →
                                  </button>
                                </div>
                                <p className="text-[11px] leading-relaxed">
                                  "{sug.responseText}"
                                </p>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>

                    {/* Option 2: Direct Custom Response Box */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                      <label className="block text-[11px] font-semibold text-slate-200">
                        Or Type Your Direct Response:
                      </label>
                      <textarea
                        rows={2}
                        value={customResponseText}
                        onChange={(e) => {
                          setCustomResponseText(e.target.value);
                        }}
                        placeholder={`Reply directly as ${activeChar.characterName} (AI will adapt phrasing & details as needed to preserve simulation integrity)...`}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500 resize-none"
                      />

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isSubmittingResponse}
                          onClick={handleDelegateFocusedToAI}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40"
                        >
                          <Bot className="w-3.5 h-3.5 text-slate-400" />
                          Let AI Automate
                        </button>

                        <button
                          type="button"
                          disabled={
                            isSubmittingResponse || !customResponseText.trim()
                          }
                          onClick={() => handleSubmitFocusedResponse()}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md disabled:opacity-40"
                        >
                          {isSubmittingResponse ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Weaving Response...
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              Send Response
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            /* STANDARD CONVERSATION INITIATION PANEL */
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Swords className="w-4 h-4 text-sky-400" />
                  <h3 className="font-bold text-xs text-slate-200">
                    Initiate Conversation
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  Each conversation uses{' '}
                  <strong className="text-emerald-400">1 Action</strong>
                </span>
              </div>

              {/* Outgoing Live Engagement / Busy Notice ("Available Momentarily") */}
              {activeOutgoingEngagement && (
                <div
                  className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                    activeOutgoingEngagement.status === 'QUEUED_MOMENTARILY'
                      ? 'bg-amber-950/40 border-amber-500/60 text-amber-100'
                      : 'bg-sky-950/40 border-sky-500/60 text-sky-100'
                  }`}
                >
                  {(() => {
                    const outTarget =
                      state.characters[activeOutgoingEngagement.targetPlayerId];
                    const outName =
                      outTarget?.characterName ??
                      activeOutgoingEngagement.targetPlayerId;

                    if (
                      activeOutgoingEngagement.status === 'QUEUED_MOMENTARILY'
                    ) {
                      return (
                        <div className="flex items-start gap-2.5">
                          <Hourglass className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                          <div>
                            <div className="font-bold text-amber-200">
                              {outName} is currently in another conversation and
                              will be available momentarily.
                            </div>
                            <p className="text-[11px] text-amber-200/80 mt-0.5">
                              Your inquiry has been queued—they will be notified
                              as soon as their active exchange concludes.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    if (activeOutgoingEngagement.status === 'FOCUSED') {
                      return (
                        <div className="flex items-center gap-2.5">
                          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                          <div>
                            <span className="font-bold text-emerald-300">
                              {outName}
                            </span>{' '}
                            has focused on your conversation and is formulating
                            a response...
                          </div>
                        </div>
                      );
                    }

                    if (activeOutgoingEngagement.status === 'RESOLVING') {
                      return (
                        <div className="flex items-center gap-2.5">
                          <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                          <span>Finalizing conversation exchange...</span>
                        </div>
                      );
                    }

                    return (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                          <span>
                            Hailing <strong>{outName}</strong> in room...
                          </span>
                        </div>
                        {outgoingSecondsLeft !== null && (
                          <span className="font-mono text-[11px] text-amber-300">
                            {outgoingSecondsLeft}s before auto-response
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Person to Approach + Quick Per-Character History Count */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1.5">
                  Who to Approach:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {otherCharacters.map((other) => {
                    const isSelected = targetChar?.playerId === other.playerId;
                    const isOnline = onlinePlayerIds.includes(other.playerId);
                    const pastCount = interactionCountByChar[other.playerId] ?? 0;

                    return (
                      <div
                        key={other.playerId}
                        onClick={() => setTargetPlayerId(other.playerId)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setTargetPlayerId(other.playerId);
                          }
                        }}
                        className={`cursor-pointer p-2.5 rounded-lg text-left transition-all border text-xs ${
                          isSelected
                            ? 'bg-sky-950/50 border-sky-500 text-sky-100 ring-1 ring-sky-500/40'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-slate-100 truncate">
                            {other.characterName}
                          </span>
                          {isOnline && (
                            <span
                              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                              title="Actively in simulation room"
                            />
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {other.publicRole}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCharacterFilterId(other.playerId);
                            setLogViewMode('ALL_ROUNDS');
                          }}
                          className="mt-1.5 text-[10px] text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1"
                          title={`Filter log to all ${pastCount} interactions with ${other.characterName}`}
                        >
                          <History className="w-2.5 h-2.5" />
                          <span>
                            {pastCount}{' '}
                            {pastCount === 1 ? 'exchange' : 'exchanges'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Conversational Approach */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1.5">
                  Conversational Approach:
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      'ASK',
                      'INTERROGATE',
                      'NEGOTIATE',
                      'DECEIVE',
                    ] as InteractionType[]
                  ).map((type) => {
                    const styleInfo = INTERACTION_TYPE_STYLES[type];
                    const desc = PLAYER_APPROACH_DESCRIPTIONS[type];
                    const isSelected = interactionType === type;

                    return (
                      <button
                        key={type}
                        onClick={() => setInteractionType(type)}
                        className={`p-2 rounded-lg text-left transition-all border text-xs flex flex-col justify-between ${
                          isSelected
                            ? `${styleInfo.button} ring-1`
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                        }`}
                      >
                        <div className="font-bold text-xs">{desc.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                          {desc.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dialogue Input & Engage Button */}
              <div className="flex items-stretch gap-2">
                <textarea
                  value={initiatorPrompt}
                  onChange={(e) => setInitiatorPrompt(e.target.value)}
                  rows={2}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 resize-none font-sans"
                  placeholder={
                    targetChar
                      ? `Speak to ${targetChar.characterName} in character...`
                      : 'Enter what you say...'
                  }
                />
                <button
                  onClick={handleEngage}
                  disabled={
                    isResolvingOutgoing ||
                    Boolean(activeOutgoingEngagement) ||
                    activeChar.actionPoints <= 0 ||
                    !initiatorPrompt.trim()
                  }
                  className="px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {isResolvingOutgoing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Speaking...</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4" />
                      <span>Engage</span>
                    </>
                  )}
                </button>
              </div>

              {activeChar.actionPoints <= 0 && (
                <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded px-2.5 py-1.5">
                  You have no remaining actions this turn. You can still respond
                  to incoming conversations from others.
                </p>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* MULTI-ROUND CHARACTER INTERACTION LOG & FILTER MECHANISM         */}
          {/* ================================================================ */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-3">
            {engagementStatusBanner && (
              <div className="p-2.5 rounded-lg bg-slate-900 border border-sky-700/50 flex items-center justify-between gap-2 text-[11px] text-sky-200">
                <span>{engagementStatusBanner}</span>
                <button
                  type="button"
                  onClick={() => setEngagementStatusBanner(null)}
                  className="text-slate-400 hover:text-white text-[10px]"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Header + View Mode Toggle + Full Archive Button */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                <h4 className="font-bold text-slate-200">
                  Conversation History
                </h4>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setLogViewMode('ALL_ROUNDS')}
                    className={`px-2 py-1 rounded font-semibold transition-colors ${
                      logViewMode === 'ALL_ROUNDS'
                        ? 'bg-slate-800 text-sky-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Rounds
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogViewMode('SINGLE')}
                    className={`px-2 py-1 rounded font-semibold transition-colors ${
                      logViewMode === 'SINGLE'
                        ? 'bg-slate-800 text-sky-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Single
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setHistoryModalCharId(characterFilterId)}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-sky-300 transition-colors"
                  title="Expand full-screen Character Interaction Archive across all rounds"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Specific Character Filter Pills (View all interactions with any character over all rounds) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setCharacterFilterId('ALL')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  characterFilterId === 'ALL'
                    ? 'bg-sky-500 text-slate-950 border-sky-400'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                All ({playerInteractions.length})
              </button>

              {otherCharacters.map((other) => {
                const count = interactionCountByChar[other.playerId] ?? 0;
                const active = characterFilterId === other.playerId;
                return (
                  <button
                    key={other.playerId}
                    type="button"
                    onClick={() => {
                      setCharacterFilterId(other.playerId);
                      setLogViewMode('ALL_ROUNDS');
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      active
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {other.characterName} ({count})
                  </button>
                );
              })}
            </div>

            {/* Transcript Display */}
            {filteredPlayerInteractions.length > 0 ? (
              logViewMode === 'ALL_ROUNDS' ? (
                <div className="space-y-5 pt-1">
                  {interactionsGroupedByRound.map(([roundNum, items]) => (
                    <div key={roundNum} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold font-mono">
                          Round / Turn {roundNum}
                        </span>
                        <div className="flex-1 h-px bg-slate-800" />
                      </div>
                      {items.map((ix) =>
                        renderInteractionExchangeCard(ix, true)
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPlayerInteractions.length > 1 && (
                    <select
                      value={displayedSingleInteraction?.id ?? ''}
                      onChange={(e) => setSelectedInteractionId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-sky-500"
                    >
                      {filteredPlayerInteractions.map((ix, idx) => {
                        const otherId =
                          ix.initiatorPlayerId === playerId
                            ? ix.targetPlayerId
                            : ix.initiatorPlayerId;
                        const otherName =
                          state.characters[otherId]?.characterName ?? otherId;
                        return (
                          <option key={ix.id} value={ix.id}>
                            Exchange #{idx + 1}: with {otherName} (Turn{' '}
                            {ix.tickOrTurn})
                          </option>
                        );
                      })}
                    </select>
                  )}
                  {displayedSingleInteraction &&
                    renderInteractionExchangeCard(displayedSingleInteraction)}
                </div>
              )
            ) : (
              <div className="h-44 flex flex-col items-center justify-center text-slate-500 text-xs text-center px-6">
                <MessageSquare className="w-8 h-8 text-slate-700 mb-2" />
                <p className="text-slate-400 font-medium mb-1">
                  {characterFilterId === 'ALL'
                    ? 'No conversations recorded yet'
                    : `No conversations with ${
                        state.characters[characterFilterId]?.characterName ??
                        characterFilterId
                      } yet`}
                </p>
                <p className="text-[11px] text-slate-500">
                  Review your{' '}
                  <strong className="text-slate-300">Current Knowledge</strong>{' '}
                  briefing on the right for key questions to explore, then
                  engage a participant.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* RIGHT PANE (COLS 9-12): Knowledge, Goals, Hand, Tokens & Policy     */}
        {/* ------------------------------------------------------------------ */}
        <aside className="col-span-4 bg-slate-900/40 flex flex-col min-h-0">
          <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-900/80 text-[11px] shrink-0">
            <button
              onClick={() => setRightTab('KNOWLEDGE')}
              className={`py-3 px-1.5 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
                rightTab === 'KNOWLEDGE'
                  ? 'border-sky-500 text-sky-400 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
              title="AI Intelligence Briefing & Investigative Questions"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Knowledge</span>
            </button>

            <button
              onClick={() => setRightTab('GOALS')}
              className={`py-3 px-1.5 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
                rightTab === 'GOALS'
                  ? 'border-sky-500 text-sky-400 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Goals</span>
            </button>

            <button
              onClick={() => setRightTab('CARDS')}
              className={`py-3 px-1.5 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
                rightTab === 'CARDS'
                  ? 'border-sky-500 text-sky-400 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Hand ({ownedCards.length})</span>
            </button>

            <button
              onClick={() => setRightTab('TOKENS')}
              className={`py-3 px-1.5 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
                rightTab === 'TOKENS'
                  ? 'border-sky-500 text-sky-400 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Tokens</span>
            </button>

            <button
              onClick={() => setRightTab('POLICY')}
              className={`py-3 px-1.5 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
                rightTab === 'POLICY'
                  ? 'border-sky-500 text-sky-400 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Policy</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-4">
            {/* TAB 1: CURRENT KNOWLEDGE */}
            {rightTab === 'KNOWLEDGE' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <h4 className="font-bold text-xs text-slate-100">
                      Current Knowledge & Situation Briefing
                    </h4>
                  </div>

                  <button
                    onClick={() => synthesizeKnowledgeBriefing(true)}
                    disabled={isGeneratingKnowledge}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        isGeneratingKnowledge ? 'animate-spin text-sky-400' : ''
                      }`}
                    />
                    {isGeneratingKnowledge ? 'Synthesizing...' : 'Refresh'}
                  </button>
                </div>

                {isGeneratingKnowledge && !cachedBriefing ? (
                  <div className="p-8 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col items-center justify-center text-center space-y-3">
                    <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                    <div className="text-xs font-medium text-slate-200">
                      Compiling your personal intelligence narrative...
                    </div>
                    <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                      Weaving scenario background with the {ownedCards.length}{' '}
                      intelligence records currently in your possession.
                    </p>
                  </div>
                ) : cachedBriefing ? (
                  <>
                    {isGeneratingKnowledge && (
                      <div className="px-3 py-2 rounded-lg bg-sky-950/40 border border-sky-800/60 flex items-center gap-2 text-[11px] text-sky-200">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                        Updating briefing with newly acquired intelligence...
                      </div>
                    )}

                    <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-sky-400 font-semibold">
                        <span>What You Know So Far</span>
                        <span className="text-slate-500 normal-case font-normal">
                          Based on {ownedCards.length} known{' '}
                          {ownedCards.length === 1 ? 'record' : 'records'}
                        </span>
                      </div>

                      <div className="space-y-3 text-xs text-slate-200 leading-relaxed">
                        {cachedBriefing.narrative
                          .split(/\n\n+/)
                          .filter((p) => p.trim().length > 0)
                          .map((paragraph, idx) => (
                            <p key={idx}>{paragraph.trim()}</p>
                          ))}
                      </div>
                    </div>

                    <div className="bg-slate-950/80 p-4 rounded-xl border border-amber-900/40 space-y-3">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <h5 className="font-bold text-xs text-amber-200">
                            Key Questions to Pursue
                          </h5>
                          <p className="text-[10px] text-slate-400">
                            Unresolved threads to inquire further about or press
                            on in interrogations
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {cachedBriefing.keyQuestions.map((question, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-amber-700/50 transition-colors group"
                          >
                            <p className="text-xs text-slate-200 leading-relaxed">
                              {question}
                            </p>
                            <button
                              onClick={() => setInitiatorPrompt(question)}
                              className="mt-2 text-[10px] text-sky-400 hover:text-sky-300 font-medium opacity-80 group-hover:opacity-100 transition-opacity"
                            >
                              Use as conversation opener →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* TAB 2: GOALS */}
            {rightTab === 'GOALS' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Your Objectives
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {visibleGoals.length} Active
                  </span>
                </div>

                {visibleGoals.map((goal) => (
                  <GoalTrackerCard
                    key={goal.id}
                    goal={goal}
                    ownedCardIds={ownedCardIds}
                    currentPlayerId={playerId}
                    isAdmin={false}
                    cardsById={state.cards}
                  />
                ))}
              </div>
            )}

            {/* TAB 3: HAND */}
            {rightTab === 'CARDS' && (
              <div className="space-y-3">
                {(() => {
                  const guardedCount =
                    activeChar.defensivePolicy.protectedCardIds
                      .filter((id) => ownedCardIds.includes(id))
                      .slice(0, MAX_GUARDED_CARDS).length;
                  const shareableCount = getShareableCardCount(
                    activeChar,
                    state.cards
                  );

                  return (
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-rose-300">
                          Guarded: {guardedCount} / {MAX_GUARDED_CARDS} max
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-300">
                          Shareable: {shareableCount} ({MIN_SHAREABLE_CARDS} min
                          required)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        You may guard at most 1 card from being shared, and at
                        least 1 card must remain labelled{' '}
                        <strong className="text-emerald-300">Shareable</strong>.
                        Each card marked Shareable increases your likelihood of
                        garnering new information in exchanges.
                      </p>
                    </div>
                  );
                })()}

                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setCardTierFilter('ALL')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      cardTierFilter === 'ALL'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({ownedCards.length})
                  </button>
                  <button
                    onClick={() => setCardTierFilter('ATOMIC')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      cardTierFilter === 'ATOMIC'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Records (
                    {ownedCards.filter((c) => c.tier === 'ATOMIC').length})
                  </button>
                  <button
                    onClick={() => setCardTierFilter('COMPOSITE')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      cardTierFilter === 'COMPOSITE'
                        ? 'bg-purple-900/60 text-purple-200 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Dossiers (
                    {ownedCards.filter((c) => c.tier === 'COMPOSITE').length})
                  </button>
                </div>

                <div className="space-y-2.5">
                  {filteredOwnedCards.map((card) => {
                    const controls = getCardPolicyControls(
                      activeChar,
                      card.id,
                      ownedCardIds
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
                        isAdmin={false}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 4: CONNECTION TOKENS */}
            {rightTab === 'TOKENS' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Personal Leverage & Warrants
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {activePlayerTokens.filter((t) => !t.isConsumed).length}{' '}
                    Available
                  </span>
                </div>

                {tokenNotice && (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/50 text-amber-200 text-xs leading-relaxed">
                    {tokenNotice}
                  </div>
                )}

                {activePlayerTokens.length > 0 ? (
                  activePlayerTokens.map((token) => {
                    const target = state.characters[token.targetPlayerId];
                    return (
                      <ConnectionTokenButton
                        key={token.id}
                        token={token}
                        targetName={
                          target?.characterName ?? token.targetPlayerId
                        }
                        onConsume={handleConsumeToken}
                      />
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-lg border border-slate-800">
                    <Zap className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    You hold no active leverage tokens at this time.
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: POLICY */}
            {rightTab === 'POLICY' && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <h4 className="font-bold text-slate-200">
                      Personal Dispositions
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Set how receptive or guarded you remain when each person
                    approaches you for information.
                  </p>

                  <div className="space-y-2.5 pt-2 border-t border-slate-800">
                    {otherCharacters.map((other) => {
                      const currentStance =
                        activeChar.defensivePolicy.stanceByPlayerId[
                          other.playerId
                        ] ?? 'NEUTRAL';
                      return (
                        <div
                          key={other.playerId}
                          className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-200 truncate">
                              {other.characterName}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {other.publicRole}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {(
                              [
                                'COOPERATIVE',
                                'NEUTRAL',
                                'SUSPICIOUS',
                                'HOSTILE',
                              ] as const
                            ).map((stance) => (
                              <button
                                key={stance}
                                onClick={() =>
                                  handleChangeStance(other.playerId, stance)
                                }
                                className={`px-1.5 py-0.5 text-[9px] rounded font-mono transition-colors ${
                                  currentStance === stance
                                    ? STANCE_BADGE_STYLES[stance] +
                                      ' font-bold ring-1'
                                    : 'bg-slate-950 text-slate-500 hover:text-slate-300'
                                }`}
                              >
                                {stance.slice(0, 4)}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300">
                      Guarded Card (Max 1)
                    </span>
                    <span className="text-[10px] text-rose-400">
                      Protected from Sharing
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    {activeChar.defensivePolicy.protectedCardIds.slice(
                      0,
                      MAX_GUARDED_CARDS
                    ).length > 0
                      ? activeChar.defensivePolicy.protectedCardIds
                          .slice(0, MAX_GUARDED_CARDS)
                          .map(
                            (id) =>
                              state.cards[id]?.title ?? 'Classified Record'
                          )
                          .join(' • ')
                      : 'None guarded — you may guard 1 card in your Hand.'}
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300">
                      Shareable Cards (Min 1 Required)
                    </span>
                    <span className="text-[10px] text-emerald-400">
                      {getShareableCardCount(activeChar, state.cards) >= 3
                        ? 'High Exchange Leverage'
                        : getShareableCardCount(activeChar, state.cards) === 2
                        ? 'Elevated Exchange Leverage'
                        : 'Baseline Exchange Leverage'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    {activeChar.defensivePolicy.tradeableCardIds
                      .filter(
                        (id) =>
                          !activeChar.defensivePolicy.protectedCardIds
                            .slice(0, MAX_GUARDED_CARDS)
                            .includes(id) &&
                          state.cards[id]?.knownByPlayerIds.includes(playerId)
                      )
                      .map((id) => state.cards[id]?.title ?? 'Record')
                      .join(' • ')}
                  </div>
                  <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                    Marking additional cards Shareable in your Hand improves
                    your odds of uncovering new intelligence in conversations.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* ==================================================================== */}
      {/* BOTTOM-RIGHT INCOMING CONVERSATION NOTIFICATION (30s Countdown)      */}
      {/* ==================================================================== */}
      {primaryToastEngagement && (
        <IncomingEngagementToast
          engagement={primaryToastEngagement}
          initiator={state.characters[primaryToastEngagement.initiatorPlayerId]}
          additionalQueuedCount={additionalWaitingCount}
          onFocusConversation={handleFocusIncomingConversation}
        />
      )}

      {/* ==================================================================== */}
      {/* FULL-SCREEN CHARACTER INTERACTION ARCHIVE MODAL (ALL ROUNDS)         */}
      {/* ==================================================================== */}
      {historyModalCharId !== null && (
        <CharacterHistoryModal
          currentPlayerId={playerId}
          characters={state.characters}
          cards={state.cards}
          playerInteractions={playerInteractions}
          ownedCardIds={ownedCardIds}
          initialSelectedCharacterId={historyModalCharId}
          onClose={() => setHistoryModalCharId(null)}
        />
      )}
    </div>
  );
};
