export type SimulationMode = 'TURN_BASED' | 'CONTINUOUS';

export type InteractionType = 'ASK' | 'INTERROGATE' | 'NEGOTIATE' | 'DECEIVE';

export type CardTier = 'ATOMIC' | 'COMPOSITE';

export type SecrecyLevel = 'PUBLIC' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type BeatOutcomeTier =
  | 'CRITICAL_REVEAL'      // Delta >= +0.25
  | 'PARTIAL_CONCESSION'   // +0.05 <= Delta < +0.25
  | 'NEUTRAL_EXCHANGE'     // -0.05 < Delta < +0.05
  | 'DEFLECTION'           // -0.25 < Delta <= -0.05
  | 'HOSTILE_STONEWALL';   // Delta <= -0.25

export interface StatVector {
  // Hidden backend values normalized on [0.00, 1.00]
  // Players never see raw numbers; they only read qualitative prose in narrativeBio.
  inquiry: number;      // Offensive weight for ASK
  coercion: number;     // Offensive weight for INTERROGATE
  negotiation: number;  // Offensive weight for NEGOTIATE
  deception: number;    // Offensive weight for DECEIVE
  composure: number;    // Defensive resistance against INTERROGATE and ASK
  insight: number;      // Defensive resistance against DECEIVE and NEGOTIATE
}

export interface DefensivePolicy {
  protectedCardIds: string[]; // Cards the AI proxy will heavily penalize revealing (+0.20 defense bonus)
  tradeableCardIds: string[]; // Cards the AI proxy is authorized to exchange in NEGOTIATE
  stanceByPlayerId: Record<string, 'COOPERATIVE' | 'NEUTRAL' | 'SUSPICIOUS' | 'HOSTILE'>;
}

export interface InfoCard {
  id: string;
  simulationId: string;
  tier: CardTier;
  title: string;
  canonicalFact: string;        // Ground-truth statement
  subjectCharacterIds: string[];
  topicTags: string[];
  secrecy: SecrecyLevel;
  parentCardIds: string[];      // Empty for ATOMIC; populated with source card IDs for COMPOSITE
  sourceGoalId?: string;        // Populated if synthesized from completing a Goal
  knownByPlayerIds: string[];   // Row-Level Security (RLS) partition array for RAG queries
  createdAtTick: number;
}

export interface Goal {
  id: string;
  simulationId: string;
  assignedPlayerId: string;
  veiledPrompt: string;         // Player-facing mystery hook (invites inquiry without naming card IDs)
  requiredCardIds: string[];    // Set of InfoCard IDs required to satisfy this goal
  baseVpValue: number;
  decayMultipliers: number[];   // e.g., [1.0, 0.6, 0.3] based on order of completion across players
  completedByPlayerIds: string[];
  synthesizedCardTemplate: {
    title: string;
    canonicalFactSummary: string;
    secrecy: SecrecyLevel;
  };
}

export interface ConnectionToken {
  id: string;
  ownerPlayerId: string;
  targetPlayerId: string;
  actionType: 'PEEK_RANDOM_GOAL' | 'PEEK_RANDOM_CARD';
  isConsumed: boolean;
  narrativeJustification: string; // e.g., "Former guild partner", "Blackmail ledger"
}

export interface CharacterSheet {
  playerId: string;
  simulationId: string;
  characterName: string;
  publicRole: string;
  privateNarrativeBio: string;  // Generated from starting InfoCards; implies StatVector strengths
  coreTraits: string[];         // Used by Authenticity Evaluator
  coreMotives: string[];        // Used by Authenticity Evaluator
  hiddenStats: StatVector;      // Strictly server-side
  defensivePolicy: DefensivePolicy;
  actionPoints: number;         // Used in TURN_BASED mode
  staminaCooldownUntil?: number;// Unix timestamp used in CONTINUOUS mode
  victoryPoints: number;
}

export interface SentenceBeat {
  sentenceIndex: number;        // 1 to N
  speakerId: string;
  rngRoll: number;              // Float on [0.00, 1.00]
  successThreshold: number;     // Clamped on [0.05, 0.95]
  delta: number;                // successThreshold - rngRoll
  outcomeTier: BeatOutcomeTier;
  revealedCardId?: string;      // Populated if this specific beat triggers an InfoCard copy
  generatedSentence?: string;   // Populated by LLM batch generation
}

export interface InteractionRecord {
  id: string;
  simulationId: string;
  tickOrTurn: number;
  initiatorPlayerId: string;
  targetPlayerId: string;
  interactionType: InteractionType;
  initiatorPrompt: string;
  targetedTopicOrCardId?: string;
  authenticityScore: number;    // Float on [-0.15, +0.20]
  authenticityReasoning: string;
  sentenceCountN: number;
  beats: SentenceBeat[];
  cardsTransferredToInitiator: string[];
  cardsTransferredToTarget: string[]; // Populated during successful NEGOTIATE
}

export interface RagDocumentChunk {
  chunkId: string;
  simulationId: string;
  content: string;
  sourceType: 'GLOBAL_LORE' | 'CHARACTER_BACKSTORY' | 'INFO_CARD' | 'INTERACTION_TRANSCRIPT';
  sourceRefId: string;
  knownByPlayerIds: string[];   // Hard metadata pre-filter before semantic similarity search
  embedding?: number[];
}

export interface SimulationState {
  id: string;
  title: string;
  mode: SimulationMode;
  status: 'COMPILING' | 'RECONCILING_RAG' | 'ACTIVE' | 'COMPLETED';
  currentTurnOrTick: number;
  masterNarrative: string;
  characters: Record<string, CharacterSheet>;
  cards: Record<string, InfoCard>;
  goals: Record<string, Goal>;
  tokens: ConnectionToken[];
  interactions: InteractionRecord[];
  ragIndex: RagDocumentChunk[];
}
