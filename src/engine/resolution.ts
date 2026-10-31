import {
  CharacterSheet,
  ConnectionToken,
  DefensivePolicy,
  Goal,
  InfoCard,
  InteractionRecord,
  InteractionType,
  SentenceBeat,
  SimulationState,
  StatVector,
  BeatOutcomeTier,
  SecrecyLevel,
} from '../types/simulation';

export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StatPair {
  offenseKey: keyof StatVector;
  defenseKey: keyof StatVector;
  baseDifficulty: number;
}

export const INTERACTION_STAT_MAP: Record<InteractionType, StatPair> = {
  ASK: { offenseKey: 'inquiry', defenseKey: 'composure', baseDifficulty: 0.5 },
  INTERROGATE: { offenseKey: 'coercion', defenseKey: 'composure', baseDifficulty: 0.45 },
  NEGOTIATE: { offenseKey: 'negotiation', defenseKey: 'insight', baseDifficulty: 0.55 },
  DECEIVE: { offenseKey: 'deception', defenseKey: 'insight', baseDifficulty: 0.45 },
};

export const STANCE_MODIFIERS: Record<'COOPERATIVE' | 'NEUTRAL' | 'SUSPICIOUS' | 'HOSTILE', number> = {
  COOPERATIVE: 0.12,
  NEUTRAL: 0.0,
  SUSPICIOUS: -0.1,
  HOSTILE: -0.2,
};

export const SECRECY_MODIFIERS: Record<SecrecyLevel, number> = {
  PUBLIC: 0.0,
  LOW: -0.05,
  MEDIUM: -0.1,
  HIGH: -0.15,
  CRITICAL: -0.22,
};

export const MAX_GUARDED_CARDS = 1;
export const MIN_SHAREABLE_CARDS = 1;
export const SHAREABLE_CARD_BONUS = 0.06;

const SECRECY_SORT_ORDER: Record<SecrecyLevel, number> = {
  PUBLIC: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Count how many cards in a character's hand are validly marked Shareable.
 */
export function getShareableCardCount(
  character: CharacterSheet,
  cards?: Record<string, InfoCard>
): number {
  const guardedSet = new Set(
    character.defensivePolicy.protectedCardIds.slice(0, MAX_GUARDED_CARDS)
  );
  const validShareableIds = character.defensivePolicy.tradeableCardIds.filter((id) => {
    if (guardedSet.has(id)) return false;
    if (cards) {
      const card = cards[id];
      return Boolean(card && card.knownByPlayerIds.includes(character.playerId));
    }
    return true;
  });
  return validShareableIds.length;
}

/**
 * Enforce policy invariants for a character:
 * - At most 1 card in hand can be Guarded (protectedCardIds.length <= 1)
 * - At least 1 card in hand must be labelled Shareable (tradeableCardIds.length >= 1)
 * - A Guarded card cannot simultaneously be Shareable
 */
export function normalizeCharacterPolicy(
  character: CharacterSheet,
  cards: Record<string, InfoCard>
): DefensivePolicy {
  const ownedCards = Object.values(cards)
    .filter((c) => c.knownByPlayerIds.includes(character.playerId))
    .sort((a, b) => SECRECY_SORT_ORDER[a.secrecy] - SECRECY_SORT_ORDER[b.secrecy]);

  const ownedIdSet = new Set(ownedCards.map((c) => c.id));

  if (ownedCards.length === 0) {
    return {
      ...character.defensivePolicy,
      protectedCardIds: [],
      tradeableCardIds: [],
    };
  }

  if (ownedCards.length === 1) {
    return {
      ...character.defensivePolicy,
      protectedCardIds: [],
      tradeableCardIds: [ownedCards[0].id],
    };
  }

  const protectedCardIds = character.defensivePolicy.protectedCardIds
    .filter((id) => ownedIdSet.has(id))
    .slice(0, MAX_GUARDED_CARDS);

  const protectedSet = new Set(protectedCardIds);

  const tradeableCardIds = Array.from(
    new Set(
      character.defensivePolicy.tradeableCardIds.filter(
        (id) => ownedIdSet.has(id) && !protectedSet.has(id)
      )
    )
  );

  if (tradeableCardIds.length < MIN_SHAREABLE_CARDS) {
    const candidate = ownedCards.find((c) => !protectedSet.has(c.id));
    if (candidate) {
      tradeableCardIds.push(candidate.id);
    }
  }

  return {
    ...character.defensivePolicy,
    protectedCardIds,
    tradeableCardIds,
  };
}

export function normalizeAllCharacterPolicies(state: SimulationState): SimulationState {
  for (const char of Object.values(state.characters)) {
    char.defensivePolicy = normalizeCharacterPolicy(char, state.cards);
  }
  return state;
}

export interface CardPolicyControlState {
  isGuarded: boolean;
  isShareable: boolean;
  guardDisabled: boolean;
  guardReason: string;
  shareableDisabled: boolean;
  shareableReason: string;
}

export function getCardPolicyControls(
  character: CharacterSheet,
  cardId: string,
  ownedCardIds: string[]
): CardPolicyControlState {
  const ownedSet = new Set(ownedCardIds);
  const guardedIds = character.defensivePolicy.protectedCardIds
    .filter((id) => ownedSet.has(id))
    .slice(0, MAX_GUARDED_CARDS);
  const guardedSet = new Set(guardedIds);

  const shareableIds = character.defensivePolicy.tradeableCardIds.filter(
    (id) => ownedSet.has(id) && !guardedSet.has(id)
  );

  const isGuarded = guardedSet.has(cardId);
  const isShareable = shareableIds.includes(cardId);

  let guardDisabled = false;
  let guardReason = 'Guard this card from being shared (max 1 card)';

  if (isGuarded) {
    guardDisabled = false;
    guardReason = 'Guarded from being shared — click to unguard';
  } else if (ownedCardIds.length <= 1) {
    guardDisabled = true;
    guardReason = 'At least 1 card must remain Shareable';
  } else if (guardedIds.length >= MAX_GUARDED_CARDS) {
    guardDisabled = true;
    guardReason = 'Only 1 card can be guarded at a time — unguard your current card first';
  } else if (isShareable && shareableIds.length <= MIN_SHAREABLE_CARDS) {
    guardDisabled = true;
    guardReason = 'At least 1 card must remain Shareable — mark another card Shareable first';
  }

  let shareableDisabled = false;
  let shareableReason =
    'Mark as Shareable to increase your success of garnering new information in exchanges';

  if (isShareable) {
    if (shareableIds.length <= MIN_SHAREABLE_CARDS) {
      shareableDisabled = true;
      shareableReason =
        'Required: at least 1 card must remain Shareable — mark another card Shareable first';
    } else {
      shareableDisabled = false;
      shareableReason =
        'Labelled Shareable (boosts exchange success) — click to unmark';
    }
  } else if (isGuarded) {
    shareableDisabled = true;
    shareableReason = 'Guarded cards cannot be shared — unguard this card first';
  }

  return {
    isGuarded,
    isShareable,
    guardDisabled,
    guardReason,
    shareableDisabled,
    shareableReason,
  };
}

export function toggleGuardCardPolicy(
  character: CharacterSheet,
  cardId: string,
  cards: Record<string, InfoCard>
): DefensivePolicy {
  const normalized = normalizeCharacterPolicy(character, cards);
  const ownedCardIds = Object.values(cards)
    .filter((c) => c.knownByPlayerIds.includes(character.playerId))
    .map((c) => c.id);

  const tempChar: CharacterSheet = { ...character, defensivePolicy: normalized };
  const controls = getCardPolicyControls(tempChar, cardId, ownedCardIds);
  if (controls.guardDisabled) {
    return normalized;
  }

  if (controls.isGuarded) {
    return {
      ...normalized,
      protectedCardIds: [],
    };
  }

  return {
    ...normalized,
    protectedCardIds: [cardId],
    tradeableCardIds: normalized.tradeableCardIds.filter((id) => id !== cardId),
  };
}

export function toggleShareableCardPolicy(
  character: CharacterSheet,
  cardId: string,
  cards: Record<string, InfoCard>
): DefensivePolicy {
  const normalized = normalizeCharacterPolicy(character, cards);
  const ownedCardIds = Object.values(cards)
    .filter((c) => c.knownByPlayerIds.includes(character.playerId))
    .map((c) => c.id);

  const tempChar: CharacterSheet = { ...character, defensivePolicy: normalized };
  const controls = getCardPolicyControls(tempChar, cardId, ownedCardIds);
  if (controls.shareableDisabled) {
    return normalized;
  }

  if (controls.isShareable) {
    return {
      ...normalized,
      tradeableCardIds: normalized.tradeableCardIds.filter((id) => id !== cardId),
    };
  }

  return {
    ...normalized,
    tradeableCardIds: [...normalized.tradeableCardIds, cardId],
  };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Determining N (Sentence Count)
 * Base N = 4 sentences.
 * If InteractionType === 'INTERROGATE' or 'NEGOTIATE', increment N by +1.
 * If |Offense_A - Defense_B| <= 0.15 (closely matched contest), increment N by +1.
 * Hard bounds: 3 <= N <= 7.
 */
export function determineSentenceCount(
  interactionType: InteractionType,
  offenseA: number,
  defenseB: number
): number {
  let n = 4;
  if (interactionType === 'INTERROGATE' || interactionType === 'NEGOTIATE') {
    n += 1;
  }
  if (Math.abs(offenseA - defenseB) <= 0.15) {
    n += 1;
  }
  return clamp(n, 3, 7);
}

/**
 * Map Delta to BeatOutcomeTier
 */
export function mapDeltaToOutcomeTier(delta: number): BeatOutcomeTier {
  if (delta >= 0.25) return 'CRITICAL_REVEAL';
  if (delta >= 0.05) return 'PARTIAL_CONCESSION';
  if (delta > -0.05) return 'NEUTRAL_EXCHANGE';
  if (delta > -0.25) return 'DEFLECTION';
  return 'HOSTILE_STONEWALL';
}

/**
 * Calculate per-sentence threshold P_k
 * P_k = clamp(BaseDifficulty + (Offense_A - Defense_B) * 0.50 + AuthenticityBonus + M_shareable + M_stance + M_protect + M_secrecy, 0.05, 0.95)
 */
export function calculateThreshold(
  initiator: CharacterSheet,
  target: CharacterSheet,
  interactionType: InteractionType,
  targetCard?: InfoCard,
  authenticityScore: number = 0.0,
  cards?: Record<string, InfoCard>
): number {
  const statPair = INTERACTION_STAT_MAP[interactionType];
  const offenseA = initiator.hiddenStats[statPair.offenseKey];
  const defenseB = target.hiddenStats[statPair.defenseKey];

  const stance = target.defensivePolicy.stanceByPlayerId[initiator.playerId] ?? 'NEUTRAL';
  const mStance = STANCE_MODIFIERS[stance];

  const mProtect =
    targetCard &&
    target.defensivePolicy.protectedCardIds.slice(0, MAX_GUARDED_CARDS).includes(targetCard.id)
      ? -0.15
      : 0.0;

  const mSecrecy = targetCard ? SECRECY_MODIFIERS[targetCard.secrecy] : 0.0;
  const mShareable = getShareableCardCount(initiator, cards) * SHAREABLE_CARD_BONUS;

  const rawThreshold =
    statPair.baseDifficulty +
    (offenseA - defenseB) * 0.5 +
    authenticityScore +
    mShareable +
    mStance +
    mProtect +
    mSecrecy;

  return clamp(rawThreshold, 0.05, 0.95);
}

export interface ResolveInteractionParams {
  initiatorPlayerId: string;
  targetPlayerId: string;
  interactionType: InteractionType;
  initiatorPrompt: string;
  targetedTopicOrCardId?: string;
  authenticityScore?: number;
  authenticityReasoning?: string;
  alreadyDeductedAp?: boolean;
  responseMode?: 'AI_AUTOMATED' | 'PLAYER_DIRECT' | 'PLAYER_SUGGESTED';
  targetRawResponse?: string;
}

/**
 * Execute batched pre-roll & delta resolution for all N sentences in memory
 */
export function resolveInteraction(
  state: SimulationState,
  params: ResolveInteractionParams,
  prng: () => number = Math.random
): {
  record: InteractionRecord;
  transferredToInitiator: InfoCard[];
  transferredToTarget: InfoCard[];
  completedGoals: Goal[];
} {
  const initiator = state.characters[params.initiatorPlayerId];
  const target = state.characters[params.targetPlayerId];
  if (!initiator || !target) {
    throw new Error(`Invalid initiator or target player ID: ${params.initiatorPlayerId}, ${params.targetPlayerId}`);
  }

  const statPair = INTERACTION_STAT_MAP[params.interactionType];
  const offenseA = initiator.hiddenStats[statPair.offenseKey];
  const defenseB = target.hiddenStats[statPair.defenseKey];

  const targetCard = params.targetedTopicOrCardId
    ? state.cards[params.targetedTopicOrCardId]
    : undefined;

  const authScore = clamp(params.authenticityScore ?? 0.0, -0.15, 0.2);
  const sentenceCountN = determineSentenceCount(params.interactionType, offenseA, defenseB);
  const successThreshold = calculateThreshold(
    initiator,
    target,
    params.interactionType,
    targetCard,
    authScore,
    state.cards
  );

  const beats: SentenceBeat[] = [];
  for (let k = 1; k <= sentenceCountN; k++) {
    const rngRoll = prng();
    const delta = successThreshold - rngRoll;
    const outcomeTier = mapDeltaToOutcomeTier(delta);

    // Odd sentences: initiator; Even sentences: target; Final sentence: resolution by target or narrator
    const speakerId = k % 2 === 1 ? initiator.playerId : target.playerId;

    beats.push({
      sentenceIndex: k,
      speakerId,
      rngRoll,
      successThreshold,
      delta,
      outcomeTier,
    });
  }

  // 3.6 Card Duplication & Transfer Trigger
  // Condition 1: Mean delta >= +0.08
  const meanDelta = beats.reduce((acc, b) => acc + b.delta, 0) / beats.length;
  // Condition 2: At least one CRITICAL_REVEAL AND final beat is not HOSTILE_STONEWALL
  const hasCriticalReveal = beats.some((b) => b.outcomeTier === 'CRITICAL_REVEAL');
  const finalBeatIsStonewall = beats[beats.length - 1].outcomeTier === 'HOSTILE_STONEWALL';
  const transferTriggered = meanDelta >= 0.08 || (hasCriticalReveal && !finalBeatIsStonewall);

  const transferredToInitiator: InfoCard[] = [];
  const transferredToTarget: InfoCard[] = [];

  const targetGuardedSet = new Set(
    target.defensivePolicy.protectedCardIds.slice(0, MAX_GUARDED_CARDS)
  );
  const initiatorGuardedSet = new Set(
    initiator.defensivePolicy.protectedCardIds.slice(0, MAX_GUARDED_CARDS)
  );

  // Determine card to transfer from Target to Initiator (guarded card cannot be shared)
  let cardToTransfer =
    targetCard && !targetGuardedSet.has(targetCard.id) ? targetCard : undefined;

  if (!cardToTransfer && transferTriggered && !targetCard) {
    // Pick an unknown, unguarded card from target's hand (preferring Shareable cards in NEGOTIATE)
    const unknownUnguardedTargetCards = Object.values(state.cards).filter(
      (c) =>
        c.knownByPlayerIds.includes(target.playerId) &&
        !c.knownByPlayerIds.includes(initiator.playerId) &&
        !targetGuardedSet.has(c.id)
    );
    const preferredPool =
      params.interactionType === 'NEGOTIATE'
        ? unknownUnguardedTargetCards.filter((c) =>
            target.defensivePolicy.tradeableCardIds.includes(c.id)
          )
        : [];
    const pool = preferredPool.length > 0 ? preferredPool : unknownUnguardedTargetCards;
    if (pool.length > 0) {
      cardToTransfer = pool[Math.floor(prng() * pool.length)];
    }
  }

  if (transferTriggered && cardToTransfer) {
    // Mark revealedCardId on the beat
    // Prefer first critical reveal beat, or final beat if no critical reveal
    const revealBeat = beats.find((b) => b.outcomeTier === 'CRITICAL_REVEAL') ?? beats[beats.length - 1];
    revealBeat.revealedCardId = cardToTransfer.id;

    if (!cardToTransfer.knownByPlayerIds.includes(initiator.playerId)) {
      cardToTransfer.knownByPlayerIds.push(initiator.playerId);
      transferredToInitiator.push(cardToTransfer);
    }

    // Reciprocal Trade (NEGOTIATE only): share strictly from initiator's Shareable cards, never Guarded
    if (params.interactionType === 'NEGOTIATE') {
      const initiatorTradeables = Object.values(state.cards).filter(
        (c) =>
          c.knownByPlayerIds.includes(initiator.playerId) &&
          !c.knownByPlayerIds.includes(target.playerId) &&
          !initiatorGuardedSet.has(c.id) &&
          initiator.defensivePolicy.tradeableCardIds.includes(c.id)
      );
      if (initiatorTradeables.length > 0) {
        const tradeCard = initiatorTradeables[Math.floor(prng() * initiatorTradeables.length)];
        tradeCard.knownByPlayerIds.push(target.playerId);
        transferredToTarget.push(tradeCard);
      }
    }
  }

  // Deduct action point in turn-based mode (unless already reserved on pending engagement)
  if (!params.alreadyDeductedAp && initiator.actionPoints > 0) {
    initiator.actionPoints -= 1;
  }

  const record: InteractionRecord = {
    id: `interaction_${Date.now()}_${Math.floor(prng() * 10000)}`,
    simulationId: state.id,
    tickOrTurn: state.currentTurnOrTick,
    initiatorPlayerId: initiator.playerId,
    targetPlayerId: target.playerId,
    interactionType: params.interactionType,
    initiatorPrompt: params.initiatorPrompt,
    targetedTopicOrCardId: params.targetedTopicOrCardId,
    authenticityScore: authScore,
    authenticityReasoning: params.authenticityReasoning ?? 'Evaluated against character traits.',
    sentenceCountN,
    beats,
    cardsTransferredToInitiator: transferredToInitiator.map((c) => c.id),
    cardsTransferredToTarget: transferredToTarget.map((c) => c.id),
    responseMode: params.responseMode ?? 'AI_AUTOMATED',
    targetRawResponse: params.targetRawResponse,
  };

  state.interactions.push(record);

  // Evaluate Goal completions for initiator and target (if received a card)
  const completedGoals: Goal[] = [];
  if (transferredToInitiator.length > 0) {
    const goalsDone = evaluateGoalCompletions(state, initiator.playerId);
    completedGoals.push(...goalsDone);
  }
  if (transferredToTarget.length > 0) {
    const goalsDone = evaluateGoalCompletions(state, target.playerId);
    completedGoals.push(...goalsDone);
  }

  return {
    record,
    transferredToInitiator,
    transferredToTarget,
    completedGoals,
  };
}

/**
 * 3.7 Goal Completion, Exclusivity Decay, and Composite Synthesis
 * Evaluates all uncompleted goals for the player.
 */
export function evaluateGoalCompletions(state: SimulationState, playerId: string): Goal[] {
  const player = state.characters[playerId];
  if (!player) return [];

  const newlyCompleted: Goal[] = [];

  for (const goal of Object.values(state.goals)) {
    // If player already completed this goal, skip
    if (goal.completedByPlayerIds.includes(playerId)) {
      continue;
    }

    // Check if player knows all required cards
    const satisfiesRequirements = goal.requiredCardIds.every((reqCardId) => {
      const card = state.cards[reqCardId];
      return card && card.knownByPlayerIds.includes(playerId);
    });

    if (satisfiesRequirements) {
      // Exclusivity decay VP calculation
      const completionIndex = goal.completedByPlayerIds.length;
      const multiplier =
        goal.decayMultipliers[completionIndex] ??
        goal.decayMultipliers[goal.decayMultipliers.length - 1] ??
        1.0;

      const awardedVp = Math.round(goal.baseVpValue * multiplier);
      player.victoryPoints += awardedVp;

      goal.completedByPlayerIds.push(playerId);
      newlyCompleted.push(goal);

      // Composite InfoCard Creation
      const compositeCardId = `card_comp_${goal.id}_${playerId}_${Date.now()}`;
      const compositeCard: InfoCard = {
        id: compositeCardId,
        simulationId: state.id,
        tier: 'COMPOSITE',
        title: goal.synthesizedCardTemplate.title,
        canonicalFact: goal.synthesizedCardTemplate.canonicalFactSummary,
        subjectCharacterIds: [playerId],
        topicTags: ['COMPOSITE', 'DEDUCTION'],
        secrecy: goal.synthesizedCardTemplate.secrecy,
        parentCardIds: [...goal.requiredCardIds],
        sourceGoalId: goal.id,
        knownByPlayerIds: [playerId],
        createdAtTick: state.currentTurnOrTick,
      };

      state.cards[compositeCardId] = compositeCard;
    }
  }

  return newlyCompleted;
}

/**
 * Consume Connection Token
 * PEEK_RANDOM_CARD or PEEK_RANDOM_GOAL
 */
export function consumeConnectionToken(
  state: SimulationState,
  tokenId: string,
  prng: () => number = Math.random
): {
  success: boolean;
  transferredCard?: InfoCard;
  peekedGoal?: Goal;
  completedGoals: Goal[];
} {
  const token = state.tokens.find((t) => t.id === tokenId);
  if (!token || token.isConsumed) {
    return { success: false, completedGoals: [] };
  }

  const owner = state.characters[token.ownerPlayerId];
  const target = state.characters[token.targetPlayerId];
  if (!owner || !target) {
    return { success: false, completedGoals: [] };
  }

  token.isConsumed = true;
  let transferredCard: InfoCard | undefined;
  let peekedGoal: Goal | undefined;

  if (token.actionType === 'PEEK_RANDOM_CARD') {
    // Find target's cards unknown to owner
    const candidateCards = Object.values(state.cards).filter(
      (c) =>
        c.knownByPlayerIds.includes(target.playerId) &&
        !c.knownByPlayerIds.includes(owner.playerId)
    );

    if (candidateCards.length > 0) {
      const idx = Math.floor(prng() * candidateCards.length);
      transferredCard = candidateCards[idx];
      transferredCard.knownByPlayerIds.push(owner.playerId);
    }
  } else if (token.actionType === 'PEEK_RANDOM_GOAL') {
    const candidateGoals = Object.values(state.goals).filter(
      (g) => g.assignedPlayerId === target.playerId
    );
    if (candidateGoals.length > 0) {
      const idx = Math.floor(prng() * candidateGoals.length);
      peekedGoal = candidateGoals[idx];
      if (!peekedGoal.knownByPlayerIds) {
        peekedGoal.knownByPlayerIds = [peekedGoal.assignedPlayerId];
      }
      if (!peekedGoal.knownByPlayerIds.includes(owner.playerId)) {
        peekedGoal.knownByPlayerIds.push(owner.playerId);
      }
    }
  }

  const completedGoals = transferredCard
    ? evaluateGoalCompletions(state, owner.playerId)
    : [];

  return {
    success: true,
    transferredCard,
    peekedGoal,
    completedGoals,
  };
}

/**
 * Server-side topic matcher for player-initiated interactions (avoids exposing unknown card IDs in Player UI).
 */
export function inferTargetCardFromPrompt(
  state: SimulationState,
  initiatorPlayerId: string,
  targetPlayerId: string,
  prompt: string
): string | undefined {
  const target = state.characters[targetPlayerId];
  const targetGuardedSet = new Set(
    target?.defensivePolicy.protectedCardIds.slice(0, MAX_GUARDED_CARDS) ?? []
  );

  const unknownTargetCards = Object.values(state.cards).filter(
    (c) =>
      c.knownByPlayerIds.includes(targetPlayerId) &&
      !c.knownByPlayerIds.includes(initiatorPlayerId) &&
      !targetGuardedSet.has(c.id)
  );
  if (unknownTargetCards.length === 0) return undefined;

  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  if (tokens.length === 0) return undefined;

  let bestCardId: string | undefined;
  let bestScore = 0;

  for (const card of unknownTargetCards) {
    const searchable = `${card.title} ${card.canonicalFact} ${card.topicTags.join(' ')}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (searchable.includes(token)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCardId = card.id;
    }
  }

  return bestScore > 0 ? bestCardId : undefined;
}
