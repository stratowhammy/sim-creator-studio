import {
  InteractionRecord,
  InteractionResponseMode,
  InteractionType,
  PendingEngagement,
  SimulationState,
  SuggestedPlayerResponse,
} from '../types/simulation';
import {
  inferTargetCardFromPrompt,
  MAX_GUARDED_CARDS,
  resolveInteraction,
} from './resolution';
import { syncRagIndex } from './ragPartition';
import {
  buildFallbackSuggestedResponses,
  classifyAuthenticity,
  generateBatchedDialogue,
  generateSuggestedResponses,
  mediatePlayerResponseDialogue,
} from '../services/llmOrchestrator';

export const NOTIFICATION_TIMEOUT_MS = 30_000;

export function cloneSimulationStateForMutation(state: SimulationState): SimulationState {
  return {
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
    tokens: state.tokens.map((t) => ({ ...t })),
    interactions: [...state.interactions],
    pendingEngagements: (state.pendingEngagements ?? []).map((pe) => ({
      ...pe,
      suggestedResponses: pe.suggestedResponses.map((s) => ({ ...s })),
    })),
  };
}

/**
 * Determine whether a player is currently engaged in an active conversation with another player
 * (either focused/resolving an incoming engagement, or waiting on an outgoing engagement they initiated).
 */
export function isPlayerInActiveConversation(
  state: SimulationState,
  playerId: string,
  excludeEngagementId?: string
): boolean {
  const pending = state.pendingEngagements ?? [];
  return pending.some((pe) => {
    if (pe.id === excludeEngagementId || pe.status === 'COMPLETED') return false;
    if (
      pe.targetPlayerId === playerId &&
      (pe.status === 'FOCUSED' || pe.status === 'RESOLVING')
    ) {
      return true;
    }
    if (pe.initiatorPlayerId === playerId) {
      return true;
    }
    return false;
  });
}

/**
 * Promote the oldest QUEUED_MOMENTARILY engagement for `playerId` to NOTIFYING (30s timer)
 * if `playerId` is no longer in an active conversation and has no NOTIFYING engagement yet.
 */
export function promoteQueuedEngagementsIfAvailable(
  state: SimulationState,
  playerId: string,
  now: number = Date.now()
): SimulationState {
  if (isPlayerInActiveConversation(state, playerId)) {
    return state;
  }

  const pending = state.pendingEngagements ?? [];
  const alreadyNotifying = pending.some(
    (pe) => pe.targetPlayerId === playerId && pe.status === 'NOTIFYING'
  );
  if (alreadyNotifying) {
    return state;
  }

  const nextQueued = pending
    .filter(
      (pe) => pe.targetPlayerId === playerId && pe.status === 'QUEUED_MOMENTARILY'
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0];

  if (!nextQueued) {
    return state;
  }

  return {
    ...state,
    pendingEngagements: pending.map((pe) =>
      pe.id === nextQueued.id
        ? {
            ...pe,
            status: 'NOTIFYING',
            notificationStartedAt: now,
            expiresAt: now + NOTIFICATION_TIMEOUT_MS,
          }
        : pe
    ),
  };
}

/**
 * Create a live PendingEngagement targeting an active player in the simulation room.
 * Immediately inserts the notification (or QUEUED_MOMENTARILY if target is already in conversation),
 * deducts 1 AP from initiator, and returns the created engagement so async suggestion generation can enrich it.
 */
export function stageLivePendingEngagement(
  state: SimulationState,
  params: {
    initiatorPlayerId: string;
    targetPlayerId: string;
    interactionType: InteractionType;
    initiatorPrompt: string;
    targetedTopicOrCardId?: string;
    initiatorAuthScore?: number;
    initiatorAuthReasoning?: string;
  },
  now: number = Date.now()
): { nextState: SimulationState; engagement: PendingEngagement } {
  const nextState = cloneSimulationStateForMutation(state);
  const initiator = nextState.characters[params.initiatorPlayerId];
  const target = nextState.characters[params.targetPlayerId];

  if (!initiator || !target) {
    throw new Error('Invalid initiator or target character.');
  }

  if (initiator.actionPoints > 0) {
    initiator.actionPoints -= 1;
  }

  const inferredCardId =
    params.targetedTopicOrCardId ||
    inferTargetCardFromPrompt(
      nextState,
      params.initiatorPlayerId,
      params.targetPlayerId,
      params.initiatorPrompt
    );

  const guardedSet = new Set(
    target.defensivePolicy.protectedCardIds.slice(0, MAX_GUARDED_CARDS)
  );
  const targetShareableCards = Object.values(nextState.cards).filter(
    (c) =>
      c.knownByPlayerIds.includes(target.playerId) &&
      target.defensivePolicy.tradeableCardIds.includes(c.id) &&
      !guardedSet.has(c.id)
  );

  const fallbackSuggestions = buildFallbackSuggestedResponses(
    initiator,
    target,
    params.interactionType,
    targetShareableCards,
    nextState.voiceStyle
  );

  const targetBusy = isPlayerInActiveConversation(nextState, target.playerId);

  const engagement: PendingEngagement = {
    id: `eng_${now}_${Math.floor(Math.random() * 10000)}`,
    simulationId: nextState.id,
    tickOrTurn: nextState.currentTurnOrTick,
    initiatorPlayerId: initiator.playerId,
    targetPlayerId: target.playerId,
    interactionType: params.interactionType,
    initiatorPrompt: params.initiatorPrompt.trim(),
    targetedTopicOrCardId: inferredCardId,
    initiatorAuthScore: params.initiatorAuthScore ?? 0.08,
    initiatorAuthReasoning:
      params.initiatorAuthReasoning ?? 'In-character engagement evaluated.',
    status: targetBusy ? 'QUEUED_MOMENTARILY' : 'NOTIFYING',
    createdAt: now,
    notificationStartedAt: targetBusy ? undefined : now,
    expiresAt: targetBusy ? undefined : now + NOTIFICATION_TIMEOUT_MS,
    queuedNoticeShown: targetBusy,
    suggestedResponses: fallbackSuggestions,
    suggestionsLoading: true,
  };

  nextState.pendingEngagements = [
    ...(nextState.pendingEngagements ?? []),
    engagement,
  ];

  return { nextState, engagement };
}

/**
 * Async helper to enrich an active PendingEngagement with AI-generated suggested responses
 * and initiator authenticity evaluation without blocking the 30s notification toast.
 */
export async function enrichEngagementSuggestionsAndAuth(
  state: SimulationState,
  engagementId: string
): Promise<{
  suggestedResponses: SuggestedPlayerResponse[];
  initiatorAuthScore: number;
  initiatorAuthReasoning: string;
} | null> {
  const engagement = (state.pendingEngagements ?? []).find(
    (pe) => pe.id === engagementId
  );
  if (!engagement) return null;

  const initiator = state.characters[engagement.initiatorPlayerId];
  const target = state.characters[engagement.targetPlayerId];
  if (!initiator || !target) return null;

  const initiatorCards = Object.values(state.cards).filter((c) =>
    c.knownByPlayerIds.includes(initiator.playerId)
  );
  const targetCards = Object.values(state.cards).filter((c) =>
    c.knownByPlayerIds.includes(target.playerId)
  );

  const [authRes, suggestions] = await Promise.all([
    classifyAuthenticity(initiator, initiatorCards, engagement.initiatorPrompt),
    generateSuggestedResponses(
      state.title,
      initiator,
      target,
      engagement.interactionType,
      engagement.initiatorPrompt,
      targetCards,
      target.defensivePolicy.protectedCardIds.slice(0, MAX_GUARDED_CARDS),
      target.defensivePolicy.tradeableCardIds,
      state.voiceStyle
    ),
  ]);

  return {
    suggestedResponses: suggestions,
    initiatorAuthScore: authRes.authenticityScore,
    initiatorAuthReasoning: authRes.authenticityReasoning,
  };
}

/**
 * Called when the active player clicks "Focus & Respond" on an incoming notification within 30s.
 * Marks this engagement FOCUSED and transitions any other pending engagements targeting this player
 * to QUEUED_MOMENTARILY so second inquiring players are immediately informed the player will be available momentarily.
 */
export function focusPendingEngagement(
  state: SimulationState,
  engagementId: string
): SimulationState {
  const pending = state.pendingEngagements ?? [];
  const targetEngagement = pending.find((pe) => pe.id === engagementId);
  if (!targetEngagement || targetEngagement.status === 'COMPLETED' || targetEngagement.status === 'RESOLVING') {
    return state;
  }

  const responderId = targetEngagement.targetPlayerId;

  return {
    ...state,
    pendingEngagements: pending.map((pe) => {
      if (pe.id === engagementId) {
        return {
          ...pe,
          status: 'FOCUSED',
        };
      }
      // Any other incoming inquiry targeting this responder is informed they'll be available momentarily
      if (
        pe.targetPlayerId === responderId &&
        pe.status === 'NOTIFYING'
      ) {
        return {
          ...pe,
          status: 'QUEUED_MOMENTARILY',
          queuedNoticeShown: true,
          notificationStartedAt: undefined,
          expiresAt: undefined,
        };
      }
      return pe;
    }),
  };
}

/**
 * Execute full AI automated takeover when the 30s notification expires (or player delegates to AI).
 */
export async function completePendingEngagementWithAI(
  latestState: SimulationState,
  engagementId: string
): Promise<{ nextState: SimulationState; record: InteractionRecord } | null> {
  const engagement = (latestState.pendingEngagements ?? []).find(
    (pe) => pe.id === engagementId
  );
  if (!engagement || engagement.status === 'COMPLETED') {
    return null;
  }

  const workingState = cloneSimulationStateForMutation(latestState);
  const initiator = workingState.characters[engagement.initiatorPlayerId];
  const target = workingState.characters[engagement.targetPlayerId];
  if (!initiator || !target) return null;

  const targetCard = engagement.targetedTopicOrCardId
    ? workingState.cards[engagement.targetedTopicOrCardId]
    : undefined;

  const resolution = resolveInteraction(workingState, {
    initiatorPlayerId: engagement.initiatorPlayerId,
    targetPlayerId: engagement.targetPlayerId,
    interactionType: engagement.interactionType,
    initiatorPrompt: engagement.initiatorPrompt,
    targetedTopicOrCardId: engagement.targetedTopicOrCardId,
    authenticityScore: engagement.initiatorAuthScore,
    authenticityReasoning: engagement.initiatorAuthReasoning,
    alreadyDeductedAp: true,
    responseMode: 'AI_AUTOMATED',
  });

  const sentences = await generateBatchedDialogue(
    initiator.characterName,
    target.characterName,
    engagement.interactionType,
    engagement.initiatorPrompt,
    resolution.record.beats,
    targetCard ?? resolution.transferredToInitiator[0],
    workingState.voiceStyle
  );

  for (let i = 0; i < resolution.record.beats.length; i++) {
    if (sentences[i]) {
      resolution.record.beats[i].generatedSentence = sentences[i];
    }
  }

  workingState.pendingEngagements = (workingState.pendingEngagements ?? []).map(
    (pe) =>
      pe.id === engagementId
        ? {
            ...pe,
            status: 'COMPLETED',
            resolutionMode: 'AI_AUTOMATED',
            resolvedInteractionId: resolution.record.id,
          }
        : pe
  );

  syncRagIndex(workingState);

  let promoted = promoteQueuedEngagementsIfAvailable(
    workingState,
    engagement.targetPlayerId
  );
  promoted = promoteQueuedEngagementsIfAvailable(
    promoted,
    engagement.initiatorPlayerId
  );

  return { nextState: promoted, record: resolution.record };
}

/**
 * Execute player-driven response (either Direct Custom Response or Selected Suggested Response),
 * applying AI language & detail mediation to preserve full simulation integrity.
 */
export async function completePendingEngagementWithPlayerResponse(
  latestState: SimulationState,
  engagementId: string,
  playerResponseText: string,
  responseMode: Extract<InteractionResponseMode, 'PLAYER_DIRECT' | 'PLAYER_SUGGESTED'>
): Promise<{ nextState: SimulationState; record: InteractionRecord } | null> {
  const engagement = (latestState.pendingEngagements ?? []).find(
    (pe) => pe.id === engagementId
  );
  if (!engagement || engagement.status === 'COMPLETED') {
    return null;
  }

  const workingState = cloneSimulationStateForMutation(latestState);
  const initiator = workingState.characters[engagement.initiatorPlayerId];
  const target = workingState.characters[engagement.targetPlayerId];
  if (!initiator || !target) return null;

  const targetCards = Object.values(workingState.cards).filter((c) =>
    c.knownByPlayerIds.includes(target.playerId)
  );
  const guardedIdSet = new Set(
    target.defensivePolicy.protectedCardIds.slice(0, MAX_GUARDED_CARDS)
  );
  const guardedCards = targetCards.filter((c) => guardedIdSet.has(c.id));

  const targetCard = engagement.targetedTopicOrCardId
    ? workingState.cards[engagement.targetedTopicOrCardId]
    : undefined;

  const resolution = resolveInteraction(workingState, {
    initiatorPlayerId: engagement.initiatorPlayerId,
    targetPlayerId: engagement.targetPlayerId,
    interactionType: engagement.interactionType,
    initiatorPrompt: engagement.initiatorPrompt,
    targetedTopicOrCardId: engagement.targetedTopicOrCardId,
    authenticityScore: engagement.initiatorAuthScore,
    authenticityReasoning: engagement.initiatorAuthReasoning,
    alreadyDeductedAp: true,
    responseMode,
    targetRawResponse: playerResponseText.trim(),
  });

  const sentences = await mediatePlayerResponseDialogue(
    workingState.title,
    initiator,
    target,
    engagement.interactionType,
    engagement.initiatorPrompt,
    playerResponseText.trim(),
    responseMode,
    resolution.record.beats,
    targetCards,
    guardedCards,
    resolution.transferredToInitiator[0] ??
      (resolution.record.beats.some((b) => b.revealedCardId) ? targetCard : undefined),
    resolution.transferredToTarget[0],
    workingState.voiceStyle
  );

  for (let i = 0; i < resolution.record.beats.length; i++) {
    if (sentences[i]) {
      resolution.record.beats[i].generatedSentence = sentences[i];
    }
  }

  workingState.pendingEngagements = (workingState.pendingEngagements ?? []).map(
    (pe) =>
      pe.id === engagementId
        ? {
            ...pe,
            status: 'COMPLETED',
            resolutionMode: responseMode,
            resolvedInteractionId: resolution.record.id,
          }
        : pe
  );

  syncRagIndex(workingState);

  let promoted = promoteQueuedEngagementsIfAvailable(
    workingState,
    engagement.targetPlayerId
  );
  promoted = promoteQueuedEngagementsIfAvailable(
    promoted,
    engagement.initiatorPlayerId
  );

  return { nextState: promoted, record: resolution.record };
}
