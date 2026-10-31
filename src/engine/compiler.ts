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
