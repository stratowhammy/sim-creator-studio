export type SimulationMode = 'TURN_BASED' | 'CONTINUOUS';

export type SimulationComplexityTier =
  | 'STANDARD'
  | 'ELEVATED'
  | 'LABYRINTHINE';

export interface SpeechStyle {
  id: string;
  name: string;
  genre?: string;
  authorInspiration?: string;
  tagline: string;
  styleDirective: string;
  sampleLine: string;
  source: 'BUILT_IN' | 'ADMIN_ADDED' | 'USER_CUSTOM';
  createdByUsername?: string;
}

export type ReadabilityLevel = 'EASY' | 'NORMAL' | 'COMPLEX';

export interface ReadabilityConfig {
  id: ReadabilityLevel;
  label: string;
  gradeLevel: string;
  targetLexile: string;
  description: string;
  promptDirective: string;
  badgeClass: string;
}

export const READABILITY_CONFIG: Record<ReadabilityLevel, ReadabilityConfig> = {
  EASY: {
    id: 'EASY',
    label: 'Easy',
    gradeLevel: '6th Grade Level',
    targetLexile: '~800L–950L',
    description:
      'Clear, accessible prose around a 6th-grade reading level. Uses common vocabulary, straightforward sentence structures, and direct action verbs without convoluted jargon.',
    promptDirective:
      'STRICT READABILITY CONSTRAINT: Target an accessible 6th-grade reading level (Lexile ~800L-950L). Use direct, clear vocabulary, short simple sentences (average 8-14 words), active voice, and minimal technical jargon. Ensure complex deductive concepts are explained with straightforward, concrete phrasing.',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  NORMAL: {
    id: 'NORMAL',
    label: 'Normal',
    gradeLevel: '8th Grade Level',
    targetLexile: '~950L–1100L',
    description:
      'Standard conversational mystery prose around an 8th-grade reading level. Features balanced compound sentences, engaging atmospheric depth, and moderate technical lore.',
    promptDirective:
      'STRICT READABILITY CONSTRAINT: Target an 8th-grade reading level (Lexile ~950L-1100L). Use natural conversational mystery prose, balanced compound and complex sentences (average 14-20 words), and engaging atmospheric tone with clear investigative terminology.',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  COMPLEX: {
    id: 'COMPLEX',
    label: 'Complex',
    gradeLevel: '12th Grade Reading Level',
    targetLexile: '~1150L–1350L+',
    description:
      'Advanced literary prose around a 12th-grade reading level. Features sophisticated vocabulary, nuanced syntactic structures, intricate psychological subtext, and rich technical detail.',
    promptDirective:
      'STRICT READABILITY CONSTRAINT: Target an advanced 12th-grade reading level (Lexile ~1150L-1350L+). Employ elevated literary vocabulary, nuanced subordinate clauses, intricate psychological subtext, and authentic domain-specific technical terminology.',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
};

export type InteractionType = 'ASK' | 'INTERROGATE' | 'NEGOTIATE' | 'DECEIVE';

export type CardTier = 'ATOMIC' | 'COMPOSITE';

export type SecrecyLevel = 'PUBLIC' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type BeatOutcomeTier =
  | 'CRITICAL_REVEAL'      // Delta >= +0.25
  | 'PARTIAL_CONCESSION'   // +0.05 <= Delta < +0.25
  | 'NEUTRAL_EXCHANGE'     // -0.05 < Delta < +0.05
  | 'DEFLECTION'           // -0.25 < Delta <= -0.05
  | 'HOSTILE_STONEWALL';   // Delta <= -0.25

export type InteractionResponseMode =
  | 'AI_AUTOMATED'
  | 'PLAYER_DIRECT'
  | 'PLAYER_SUGGESTED';

export interface SuggestedPlayerResponse {
  id: string;
  stanceLabel: string;
  responseText: string;
}

export type PendingEngagementStatus =
  | 'NOTIFYING'
  | 'QUEUED_MOMENTARILY'
  | 'FOCUSED'
  | 'RESOLVING'
  | 'COMPLETED';

export interface PendingEngagement {
  id: string;
  simulationId: string;
  tickOrTurn: number;
  initiatorPlayerId: string;
  targetPlayerId: string;
  interactionType: InteractionType;
  initiatorPrompt: string;
  targetedTopicOrCardId?: string;
  initiatorAuthScore: number;
  initiatorAuthReasoning: string;
  status: PendingEngagementStatus;
  createdAt: number;
  notificationStartedAt?: number;
  expiresAt?: number;
  queuedNoticeShown?: boolean;
  suggestedResponses: SuggestedPlayerResponse[];
  suggestionsLoading?: boolean;
  resolvedInteractionId?: string;
  resolutionMode?: InteractionResponseMode;
  resolvingLockId?: string;
}

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
  knownByPlayerIds?: string[];  // Players who know this goal (assigned player + PEEK_RANDOM_GOAL tokens)
  synthesizedCardTemplate: {
    title: string;
    canonicalFactSummary: string;
    secrecy: SecrecyLevel;
  };
}

export interface PlayerKnowledgeBriefing {
  playerId: string;
  cardSignature: string;
  narrative: string;
  keyQuestions: string[];
  generatedAtTurn: number;
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
  isAiControlled?: boolean;     // Set by Admin if not enough human players to fill character seat
  assignedUserId?: string;      // Human user occupying this seat (if any)
  assignedUsername?: string;
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
  responseMode?: InteractionResponseMode;
  targetRawResponse?: string;
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
  knowledgeBriefings?: Record<string, PlayerKnowledgeBriefing>;
  pendingEngagements?: PendingEngagement[];
  // Complexity, AI Voice Style, Readability, and 'Sims' Creator Economy Metadata
  complexityTier?: SimulationComplexityTier;
  readabilityLevel?: ReadabilityLevel;
  characterCount?: number;
  voiceStyle?: SpeechStyle;
  createdWithV4Pro?: boolean;
  creatorUserId?: string;
  creatorUsername?: string;
  creatorDisplayName?: string;
  creationCostSims?: number;
  usageCostSims?: number;
  publishedToCollection?: boolean;
  publishedAt?: string;
  unlockedByUserIds?: string[];
  totalRoyaltiesEarnedSims?: number;
  seatInvitations?: import('./user').SeatInvitation[];
}
