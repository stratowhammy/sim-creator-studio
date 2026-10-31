import {
  Goal,
  InfoCard,
  SimulationState,
} from '../types/simulation';

export interface ValidationResult {
  isValid: boolean;
  zeroSelfSufficiency: boolean;
  globalReachability: boolean;
  asymmetricLeverage: boolean;
  errors: string[];
  details: {
    playerHands: Record<string, string[]>;
    goalRequirements: Record<string, string[]>;
    uncoveredRequiredCardIds: string[];
    playerLeverageCounts: Record<string, number>;
  };
}

/**
 * Validates pre-game DAG invariants on card distribution across players.
 * Enforces:
 * 1. Zero Self-Sufficiency Invariant
 * 2. Global Reachability Invariant
 * 3. Asymmetric Dependency Seeding
 */
export function validateInitialDistribution(state: SimulationState): ValidationResult {
  const errors: string[] = [];
  const playerIds = Object.keys(state.characters);
  const playerHands: Record<string, string[]> = {};
  const goalRequirements: Record<string, string[]> = {};
  const playerLeverageCounts: Record<string, number> = {};

  // Build starting hand map for each player
  for (const playerId of playerIds) {
    playerHands[playerId] = Object.values(state.cards)
      .filter((card) => card.knownByPlayerIds.includes(playerId))
      .map((card) => card.id);
    playerLeverageCounts[playerId] = 0;
  }

  // Build goal requirements map
  for (const goal of Object.values(state.goals)) {
    goalRequirements[goal.id] = [...goal.requiredCardIds];
  }

  // 1. Zero Self-Sufficiency Invariant
  // For every player P_i and every assigned Goal G_j, |H_0(P_i) ∩ G_j.requiredCardIds| < |G_j.requiredCardIds|
  let zeroSelfSufficiency = true;
  for (const playerId of playerIds) {
    const hand = new Set(playerHands[playerId]);
    const assignedGoals = Object.values(state.goals).filter(
      (g) => g.assignedPlayerId === playerId
    );

    for (const goal of assignedGoals) {
      const matchCount = goal.requiredCardIds.filter((id) => hand.has(id)).length;
      if (matchCount === goal.requiredCardIds.length && goal.requiredCardIds.length > 0) {
        zeroSelfSufficiency = false;
        errors.push(
          `Zero Self-Sufficiency Violation: Player ${playerId} already holds all required cards for assigned Goal '${goal.id}'.`
        );
      }
    }
  }

  // 2. Global Reachability Invariant
  // The union of all starting player hands must cover 100% of all requiredCardIds across all Goals
  const unionHands = new Set<string>();
  for (const hand of Object.values(playerHands)) {
    for (const cardId of hand) {
      unionHands.add(cardId);
    }
  }

  const allRequiredCardIds = new Set<string>();
  for (const goal of Object.values(state.goals)) {
    for (const reqId of goal.requiredCardIds) {
      allRequiredCardIds.add(reqId);
    }
  }

  const uncoveredRequiredCardIds: string[] = [];
  for (const reqId of allRequiredCardIds) {
    if (!unionHands.has(reqId)) {
      uncoveredRequiredCardIds.push(reqId);
    }
  }

  const globalReachability = uncoveredRequiredCardIds.length === 0;
  if (!globalReachability) {
    errors.push(
      `Global Reachability Violation: Required cards [${uncoveredRequiredCardIds.join(', ')}] are not held in any player's initial hand.`
    );
  }

  // 3. Asymmetric Dependency Seeding
  // Every player must hold at least 2 cards required by other players' goals
  let asymmetricLeverage = true;
  for (const playerId of playerIds) {
    const hand = new Set(playerHands[playerId]);

    // Cards required by OTHER players' goals
    const otherPlayersRequiredCards = new Set<string>();
    for (const goal of Object.values(state.goals)) {
      if (goal.assignedPlayerId !== playerId) {
        for (const reqId of goal.requiredCardIds) {
          otherPlayersRequiredCards.add(reqId);
        }
      }
    }

    let leverageCount = 0;
    for (const cardId of hand) {
      if (otherPlayersRequiredCards.has(cardId)) {
        leverageCount += 1;
      }
    }

    playerLeverageCounts[playerId] = leverageCount;
    if (leverageCount < 2) {
      asymmetricLeverage = false;
      errors.push(
        `Asymmetric Dependency Violation: Player ${playerId} holds only ${leverageCount} cards required by other players' goals (minimum 2 required).`
      );
    }
  }

  const isValid = zeroSelfSufficiency && globalReachability && asymmetricLeverage;

  return {
    isValid,
    zeroSelfSufficiency,
    globalReachability,
    asymmetricLeverage,
    errors,
    details: {
      playerHands,
      goalRequirements,
      uncoveredRequiredCardIds,
      playerLeverageCounts,
    },
  };
}

/**
 * Automatically rebalances and partitions starting card distribution across characters
 * to satisfy all three Pre-Game Solvability Invariants:
 * 1. Zero Self-Sufficiency (no player starts holding all cards for their own goal)
 * 2. Global Reachability (100% of required clues are distributed into player hands)
 * 3. Asymmetric Dependency Seeding (every player holds at least 2 leverage cards required by others)
 */
export function reconcileCardDistribution(state: SimulationState): SimulationState {
  const playerIds = Object.keys(state.characters);
  if (playerIds.length < 2) return state;

  const cards = { ...state.cards };
  const goals = Object.values(state.goals);

  // If no cards or goals exist, nothing to distribute
  if (Object.keys(cards).length === 0 || goals.length === 0) {
    return state;
  }

  // Clear existing card ownership to start from clean slate
  for (const cardId of Object.keys(cards)) {
    cards[cardId] = {
      ...cards[cardId],
      knownByPlayerIds: [],
    };
  }

  // Map other players for each player
  const otherPlayersMap: Record<string, string[]> = {};
  for (const pId of playerIds) {
    otherPlayersMap[pId] = playerIds.filter((p) => p !== pId);
  }

  // 1. Distribute required cards circularly among OTHER players
  // This guarantees that the assigned player does not start with all cards (Zero Self-Sufficiency)
  // and other players receive bargaining leverage cards
  for (let i = 0; i < playerIds.length; i++) {
    const pId = playerIds[i];
    const playerGoals = goals.filter((g) => g.assignedPlayerId === pId);
    const others = otherPlayersMap[pId];

    let shift = 0;
    for (const goal of playerGoals) {
      goal.requiredCardIds.forEach((cardId, cIdx) => {
        if (!cards[cardId]) return;
        const target = others[(shift + cIdx) % others.length];
        if (!cards[cardId].knownByPlayerIds.includes(target)) {
          cards[cardId].knownByPlayerIds.push(target);
        }
      });
      shift++;
    }
  }

  // 2. Guarantee Global Reachability: any cards not yet held are distributed round-robin
  Object.values(cards).forEach((card, idx) => {
    if (card.knownByPlayerIds.length === 0) {
      const recipient = playerIds[idx % playerIds.length];
      card.knownByPlayerIds.push(recipient);
    }
  });

  // 3. Guarantee Asymmetric Leverage >= 2 per player
  for (const pId of playerIds) {
    const othersGoalsCards = new Set<string>();
    for (const goal of goals) {
      if (goal.assignedPlayerId !== pId) {
        goal.requiredCardIds.forEach((id) => othersGoalsCards.add(id));
      }
    }

    const currentLeverage = Object.values(cards).filter(
      (c) => c.knownByPlayerIds.includes(pId) && othersGoalsCards.has(c.id)
    ).length;

    if (currentLeverage < 2) {
      for (const cardId of othersGoalsCards) {
        if (cards[cardId] && !cards[cardId].knownByPlayerIds.includes(pId)) {
          // Verify that giving cardId to pId does not violate Zero Self-Sufficiency for pId's goals
          const pGoals = goals.filter((g) => g.assignedPlayerId === pId);
          const wouldViolate = pGoals.some((g) => {
            const matchCount = g.requiredCardIds.filter(
              (id) => id === cardId || cards[id]?.knownByPlayerIds.includes(pId)
            ).length;
            return matchCount === g.requiredCardIds.length && g.requiredCardIds.length > 0;
          });

          if (!wouldViolate) {
            cards[cardId].knownByPlayerIds.push(pId);
            const updatedCount = Object.values(cards).filter(
              (c) => c.knownByPlayerIds.includes(pId) && othersGoalsCards.has(c.id)
            ).length;
            if (updatedCount >= 2) break;
          }
        }
      }
    }
  }

  // 3b. Strict Zero Self-Sufficiency enforcement
  for (const pId of playerIds) {
    const pGoals = goals.filter((g) => g.assignedPlayerId === pId);
    for (const g of pGoals) {
      const held = g.requiredCardIds.filter((id) => cards[id]?.knownByPlayerIds.includes(pId));
      if (held.length === g.requiredCardIds.length && g.requiredCardIds.length > 0) {
        // Remove 1 card from pId's hand and ensure at least one other player holds it
        const cardToRemove = held[0];
        cards[cardToRemove].knownByPlayerIds = cards[cardToRemove].knownByPlayerIds.filter(
          (id) => id !== pId
        );
        const others = otherPlayersMap[pId] || [];
        const hasOtherHolder = others.some((otherId) =>
          cards[cardToRemove].knownByPlayerIds.includes(otherId)
        );
        if (!hasOtherHolder && others.length > 0) {
          cards[cardToRemove].knownByPlayerIds.push(others[0]);
        }
      }
    }
  }

  // 4. Update defensive policy (guard 1 highest secrecy card, mark 1 lowest secrecy card tradeable)
  const secrecyRank: Record<string, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    PUBLIC: 1,
  };

  const updatedCharacters = { ...state.characters };
  for (const pId of playerIds) {
    const hand = Object.values(cards).filter((c) => c.knownByPlayerIds.includes(pId));
    const sorted = [...hand].sort(
      (a, b) => (secrecyRank[b.secrecy] ?? 0) - (secrecyRank[a.secrecy] ?? 0)
    );
    const char = updatedCharacters[pId];
    if (char) {
      updatedCharacters[pId] = {
        ...char,
        defensivePolicy: {
          ...char.defensivePolicy,
          protectedCardIds: sorted.length > 0 ? [sorted[0].id] : [],
          tradeableCardIds:
            sorted.length > 1
              ? [sorted[sorted.length - 1].id]
              : sorted.length === 1
              ? [sorted[0].id]
              : [],
        },
      };
    }
  }

  return {
    ...state,
    cards,
    characters: updatedCharacters,
  };
}
