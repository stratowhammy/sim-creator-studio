import {
  SimulationComplexityTier,
  SimulationState,
  SpeechStyle,
} from '../types/simulation';
import { SimTransaction, UserAccount } from '../types/user';
import {
  canAccessGlobalAdminOverview,
  loadAllUsers,
  saveAllUsers,
} from './authService';
import { broadcastRealtimeEvent } from './presenceService';

export const VOICE_STORAGE_KEY = 'SIM_CREATOR_VOICES_V1';

export const V4_PRO_CREATION_COST_SIMS = 30;
export const CUSTOM_VOICE_CREATION_COST_SIMS = 20;

export const COMPLEXITY_TIER_CONFIG: Record<
  SimulationComplexityTier,
  {
    id: SimulationComplexityTier;
    label: string;
    shortLabel: string;
    cardRange: [number, number];
    goalsPerCharacter: number;
    costSims: number;
    description: string;
  }
> = {
  STANDARD: {
    id: 'STANDARD',
    label: 'Standard Intrigue',
    shortLabel: 'Standard',
    cardRange: [8, 12],
    goalsPerCharacter: 1,
    costSims: 20,
    description:
      'Focused 8–12 atomic clue graph with crisp 3-clue character mysteries.',
  },
  ELEVATED: {
    id: 'ELEVATED',
    label: 'Elevated Conspiracy',
    shortLabel: 'Elevated',
    cardRange: [14, 18],
    goalsPerCharacter: 2,
    costSims: 50,
    description:
      'Expanded 14–18 atomic clue web with cross-departmental leverage and layered objectives.',
  },
  LABYRINTHINE: {
    id: 'LABYRINTHINE',
    label: 'Labyrinthine Deep-Plot',
    shortLabel: 'Labyrinthine',
    cardRange: [20, 26],
    goalsPerCharacter: 2,
    costSims: 100,
    description:
      'Maximum density 20–26 atomic clue architecture with multi-hop dependency chains.',
  },
};

export const DEFAULT_SPEECH_STYLES: SpeechStyle[] = [
  {
    id: 'voice_direct',
    name: 'Hemingway Spare Realism',
    genre: 'Literary Realism',
    authorInspiration: 'Ernest Hemingway',
    tagline: 'Iceberg minimalism, unadorned declarative clauses & stoic unspoken subtext',
    styleDirective:
      'Tailor all prose and dialogue strictly after the literary craft of Ernest Hemingway (the Iceberg Theory). Favor short, muscular declarative sentences linked by clean parataxis ("and", "but", "then") over tangled subordinate clauses. Strip away adverbs, ornamental adjectives, and melodramatic commentary. Anchor moments in concrete nouns and plain physical verbs. Characters speak with clipped, stoic directness and understated restraint, leaving nine-tenths of the suspicion, calculation, and tension unspoken beneath plain words.',
    sampleLine:
      '"Set the log down on the table. You were at the switch or you were not. It is very simple."',
    source: 'BUILT_IN',
  },
  {
    id: 'voice_noir',
    name: 'Chandler Hardboiled Noir',
    genre: 'Hardboiled Detective Noir',
    authorInspiration: 'Raymond Chandler',
    tagline: 'Rain-slicked twilight cynicism, razor-edged similes & bruised streetwise wit',
    styleDirective:
      'Tailor all prose and dialogue strictly after the hardboiled detective prose of Raymond Chandler. Pair bruised, world-weary moral observation with sudden, electric hardboiled similes and atmospheric twilight melancholy. Dialogue snaps with guarded streetwise rhythm, dry gallows irony, and tough vernacular cadence—every speaker sounding like they have stayed awake two nights too long in a room full of cheap smoke and expensive lies.',
    sampleLine:
      '"That alibi has more holes in it than a harbor screen door, friend, and twice as much salt rusting the hinges."',
    source: 'BUILT_IN',
  },
  {
    id: 'voice_fantasy',
    name: 'Tolkien Mythic Chronicle',
    genre: 'High Epic Fantasy',
    authorInspiration: 'J.R.R. Tolkien',
    tagline: 'Elevated Anglo-Saxon cadence, ancient lineage, sworn oaths & grave poetic dignity',
    styleDirective:
      'Tailor all prose and dialogue strictly after the high mythic chronicle prose of J.R.R. Tolkien. Write with grave, cadenced dignity, elevated courtly courtesy, and resonant Anglo-Saxon lexical clarity rather than modern technical slang or cheap parody. Employ measured syntactic inversions, solemn rhythms of counsel, and imagery of shadow, hearth, heirloom, watchfire, and sworn word so every exchange carries the weight of old history turning upon a perilous hour.',
    sampleLine:
      '"Dark grows the hour beneath these vaulted stones, and ill sits silence upon one who swore to keep the watch."',
    source: 'BUILT_IN',
  },
  {
    id: 'voice_scifi',
    name: 'Clarke Orbital Hard Sci-Fi',
    genre: 'Hard Science Fiction',
    authorInspiration: 'Arthur C. Clarke',
    tagline: 'Lucid scientific rigor, zero-margin engineering precision & composed cosmic poise',
    styleDirective:
      'Tailor all prose and dialogue strictly after the hard science-fiction prose of Arthur C. Clarke. Write with crystalline, unhurried British lucidity, exact physical and orbital precision, and calm intellectual composure amid unforgiving vacuum and engineering laws. Avoid pulp melodrama; let mortal urgency emerge cleanly from precise telemetry, pressure differentials, orbital mechanics, and the quiet discipline of specialists confronting a physical contradiction.',
    sampleLine:
      '"Physics does not improvise, Commander—a forty-kilopascal drop across Loop Four means a human hand turned that valve."',
    source: 'BUILT_IN',
  },
  {
    id: 'voice_thriller',
    name: 'Le Carré Diplomatic Espionage',
    genre: 'Cold War & Diplomatic Espionage',
    authorInspiration: 'John le Carré',
    tagline: 'Oblique Whitehall courtesy, institutional euphemism & quiet bureaucratic betrayal',
    styleDirective:
      'Tailor all prose and dialogue strictly after the espionage fiction of John le Carré. Replace blunt threats with understated diplomatic courtesy, oblique institutional euphemisms ("housekeeping", "irregularities", "our friends across the hall"), and elliptical half-admissions. Characters circle the truth like weary mandarins over cold tea—impeccably polite, syntactically nuanced, morally fatigued, and surgical in what they imply between clauses.',
    sampleLine:
      '"No one is suggesting impropriety, my dear fellow; it is merely that eleven unlogged minutes in Anteroom B look awfully untidy on paper."',
    source: 'BUILT_IN',
  },
  {
    id: 'voice_gothic',
    name: 'Conan Doyle Gaslight Deduction',
    genre: 'Victorian Gaslight Mystery',
    authorInspiration: 'Arthur Conan Doyle',
    tagline: 'Fog-draped 1890s parlor decorum, clinical scrutiny of trifles & brisk deduction',
    styleDirective:
      'Tailor all prose and dialogue strictly after the late-Victorian mystery prose of Sir Arthur Conan Doyle. Blend refined 1890s drawing-room decorum and crisp British diction with razor-sharp deductive scrutiny of telling physical trifles—a scuffed wax seal, a damp cuff, an altered ledger entry. Characters speak with composed Victorian precision, measured understatement, and the taut intellectual energy of an inquiry closing around a singular contradiction.',
    sampleLine:
      '"Pray examine the wax upon the cabinet latch, Doctor—singular trifles seldom deceive when one eliminates the impossible."',
    source: 'BUILT_IN',
  },
];

export function getBuiltInVoiceById(id: string): SpeechStyle {
  return (
    DEFAULT_SPEECH_STYLES.find((v) => v.id === id) ?? DEFAULT_SPEECH_STYLES[0]
  );
}

export function loadSpeechStyleCollection(): SpeechStyle[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [...DEFAULT_SPEECH_STYLES];
  }
  try {
    const raw = window.localStorage.getItem(VOICE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SpeechStyle[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        let mutated = false;
        const merged = [...parsed];
        for (const builtIn of DEFAULT_SPEECH_STYLES) {
          const existingIdx = merged.findIndex((v) => v.id === builtIn.id);
          if (existingIdx === -1) {
            merged.push(builtIn);
            mutated = true;
          } else if (merged[existingIdx].source === 'BUILT_IN') {
            const cur = merged[existingIdx];
            if (
              cur.name !== builtIn.name ||
              cur.genre !== builtIn.genre ||
              cur.authorInspiration !== builtIn.authorInspiration ||
              cur.tagline !== builtIn.tagline ||
              cur.styleDirective !== builtIn.styleDirective ||
              cur.sampleLine !== builtIn.sampleLine
            ) {
              merged[existingIdx] = builtIn;
              mutated = true;
            }
          }
        }
        if (mutated) {
          window.localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(merged));
        }
        return merged;
      }
    }
  } catch {
    // Fall back to defaults
  }
  saveSpeechStyleCollection(DEFAULT_SPEECH_STYLES);
  return [...DEFAULT_SPEECH_STYLES];
}

export function saveSpeechStyleCollection(styles: SpeechStyle[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(styles));
    broadcastRealtimeEvent({ type: 'VOICES_UPDATED' });
  } catch {
    // Ignore storage quota errors
  }
}

export function addSpeechStyleToCollection(
  actorUser: UserAccount,
  payload: {
    name: string;
    genre?: string;
    authorInspiration?: string;
    tagline: string;
    styleDirective: string;
    sampleLine?: string;
  }
):
  | { ok: true; created: SpeechStyle; collection: SpeechStyle[] }
  | { ok: false; error: string } {
  if (!canAccessGlobalAdminOverview(actorUser)) {
    return {
      ok: false,
      error: 'Only Global Administrators can add new speech styles to the platform collection.',
    };
  }

  const name = payload.name.trim();
  const genre = payload.genre?.trim() || undefined;
  const authorInspiration = payload.authorInspiration?.trim() || undefined;
  const tagline = payload.tagline.trim();
  const rawDirective = payload.styleDirective.trim();
  const sampleLine =
    payload.sampleLine?.trim() ||
    `"Every word in this room carries weight—choose yours carefully."`;

  if (!name || !rawDirective) {
    return {
      ok: false,
      error: 'Speech style name and AI prompt directive are required.',
    };
  }

  const styleDirective =
    authorInspiration &&
    !rawDirective.toLowerCase().includes(authorInspiration.toLowerCase())
      ? `Tailor all prose and dialogue strictly after the literary writing style of ${authorInspiration}${
          genre ? ` (${genre})` : ''
        }. ${rawDirective}`
      : rawDirective;

  const existing = loadSpeechStyleCollection();
  if (existing.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
    return {
      ok: false,
      error: 'A speech style with that name already exists in the collection.',
    };
  }

  const created: SpeechStyle = {
    id: `voice_admin_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name,
    genre,
    authorInspiration,
    tagline:
      tagline ||
      (authorInspiration
        ? `${genre ? `${genre} · ` : ''}Tailored after ${authorInspiration}`
        : 'Custom Admin-curated narrative speech style'),
    styleDirective,
    sampleLine,
    source: 'ADMIN_ADDED',
    createdByUsername: actorUser.username,
  };

  const next = [...existing, created];
  saveSpeechStyleCollection(next);
  return { ok: true, created, collection: next };
}

export const DEFAULT_CHARACTER_COUNT = 4;
export const ADDITIONAL_CHARACTER_COST_SIMS = 10;

/**
 * Total Sims cost paid by the creator when compiling a simulation.
 * Default is 4 characters. Every additional character (+1 above 4) costs +10 Sims.
 */
export function calculateCreationCostSims(options: {
  complexityTier: SimulationComplexityTier;
  useV4Pro: boolean;
  useCustomVoice: boolean;
  characterCount?: number;
}): number {
  const base =
    COMPLEXITY_TIER_CONFIG[options.complexityTier]?.costSims ??
    COMPLEXITY_TIER_CONFIG.STANDARD.costSims;
  const v4Addon = options.useV4Pro ? V4_PRO_CREATION_COST_SIMS : 0;
  const voiceAddon = options.useCustomVoice ? CUSTOM_VOICE_CREATION_COST_SIMS : 0;
  const count = options.characterCount ?? DEFAULT_CHARACTER_COUNT;
  const extraChars = Math.max(0, count - DEFAULT_CHARACTER_COUNT);
  const characterAddon = extraChars * ADDITIONAL_CHARACTER_COST_SIMS;
  return base + v4Addon + voiceAddon + characterAddon;
}

/**
 * Nominal play/unlock cost in Sims when another user uses a published simulation:
 * strictly 10% of the total Sims paid by the creator (minimum 1 Sim).
 */
export function calculateCollectionUsageCostSims(
  totalCreationCostSims: number
): number {
  return Math.max(1, Math.round(totalCreationCostSims * 0.1));
}

function makeTransactionId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

/**
 * Admin gifts 'Sims' credits to any user account.
 */
export function giftSimsFromAdmin(
  adminUser: UserAccount,
  recipientUserId: string,
  rawAmount: number,
  note?: string
):
  | { ok: true; recipient: UserAccount; allUsers: UserAccount[] }
  | { ok: false; error: string } {
  if (!canAccessGlobalAdminOverview(adminUser)) {
    return { ok: false, error: 'Only Global Administrators can gift Sims.' };
  }

  const amount = Math.floor(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Gift amount must be a positive whole number of Sims.' };
  }

  const users = loadAllUsers();
  const idx = users.findIndex((u) => u.id === recipientUserId);
  if (idx === -1) {
    return { ok: false, error: 'Recipient account not found.' };
  }

  const target = users[idx];
  const nextBalance = (target.simsBalance ?? 0) + amount;
  const tx: SimTransaction = {
    id: makeTransactionId('tx_gift'),
    timestamp: new Date().toISOString(),
    amount,
    balanceAfter: nextBalance,
    type: 'ADMIN_GIFT',
    description: note?.trim()
      ? `Admin gift from @${adminUser.username}: ${note.trim()}`
      : `Admin gift of +${amount} Sims from @${adminUser.username}`,
    counterpartyUsername: adminUser.username,
  };

  const updatedRecipient: UserAccount = {
    ...target,
    simsBalance: nextBalance,
    simTransactions: [tx, ...(target.simTransactions ?? [])],
  };

  const nextUsers = [...users];
  nextUsers[idx] = updatedRecipient;
  saveAllUsers(nextUsers);

  return { ok: true, recipient: updatedRecipient, allUsers: nextUsers };
}

/**
 * Deducts Sims when a creator compiles/builds a simulation in the Authoring Studio.
 */
export function chargeSimsForCreation(
  creatorUserId: string,
  costSims: number,
  simulationTitle: string,
  breakdownSummary: string
):
  | { ok: true; updatedCreator: UserAccount; allUsers: UserAccount[] }
  | { ok: false; error: string } {
  const users = loadAllUsers();
  const idx = users.findIndex((u) => u.id === creatorUserId);
  if (idx === -1) {
    return { ok: false, error: 'Creator account not found.' };
  }

  const creator = users[idx];
  const currentBalance = creator.simsBalance ?? 0;
  if (currentBalance < costSims) {
    return {
      ok: false,
      error: `Insufficient Sims: compiling this configuration requires ${costSims} Sims, but your balance is ${currentBalance} Sims.`,
    };
  }

  const nextBalance = currentBalance - costSims;
  const tx: SimTransaction = {
    id: makeTransactionId('tx_create'),
    timestamp: new Date().toISOString(),
    amount: -costSims,
    balanceAfter: nextBalance,
    type: 'SIMULATION_CREATION',
    description: `Compiled "${simulationTitle}" (${breakdownSummary})`,
  };

  const updatedCreator: UserAccount = {
    ...creator,
    simsBalance: nextBalance,
    simTransactions: [tx, ...(creator.simTransactions ?? [])],
  };

  const nextUsers = [...users];
  nextUsers[idx] = updatedCreator;
  saveAllUsers(nextUsers);

  return { ok: true, updatedCreator, allUsers: nextUsers };
}

/**
 * Checks whether a user already owns/unlocked a published simulation without needing to pay again.
 */
export function hasUserUnlockedSimulation(
  user: UserAccount,
  sim: SimulationState
): boolean {
  if (!sim.publishedToCollection) return true;
  if (sim.creatorUserId && sim.creatorUserId === user.id) return true;
  if ((sim.unlockedByUserIds ?? []).includes(user.id)) return true;
  if (user.participations.some((p) => p.simulationId === sim.id)) return true;
  return false;
}

/**
 * Spends nominal Sims (10% of creator's paid creation cost) to unlock & use a published simulation,
 * and transfers 100% of that nominal fee directly to the creator's Sims wallet!
 */
export function unlockSimulationWithSims(
  buyerUserId: string,
  sim: SimulationState
):
  | {
      ok: true;
      chargedSims: number;
      updatedBuyer: UserAccount;
      updatedSimulation: SimulationState;
      allUsers: UserAccount[];
    }
  | { ok: false; error: string } {
  const users = loadAllUsers();
  const buyerIdx = users.findIndex((u) => u.id === buyerUserId);
  if (buyerIdx === -1) {
    return { ok: false, error: 'User account not found.' };
  }

  const buyer = users[buyerIdx];

  // Free if already unlocked or if buyer is the creator
  if (hasUserUnlockedSimulation(buyer, sim)) {
    return {
      ok: true,
      chargedSims: 0,
      updatedBuyer: buyer,
      updatedSimulation: sim,
      allUsers: users,
    };
  }

  const creatorPaid = sim.creationCostSims ?? COMPLEXITY_TIER_CONFIG.STANDARD.costSims;
  const usageCost =
    sim.usageCostSims ?? calculateCollectionUsageCostSims(creatorPaid);

  const buyerBalance = buyer.simsBalance ?? 0;
  if (buyerBalance < usageCost) {
    return {
      ok: false,
      error: `Unlocking "${sim.title}" costs ${usageCost} Sims (10% of ${creatorPaid} Sims creator cost), but you only have ${buyerBalance} Sims.`,
    };
  }

  const nextUsers = [...users];

  // 1. Deduct nominal 10% usage cost from buyer
  const nextBuyerBalance = buyerBalance - usageCost;
  const buyerTx: SimTransaction = {
    id: makeTransactionId('tx_unlock'),
    timestamp: new Date().toISOString(),
    amount: -usageCost,
    balanceAfter: nextBuyerBalance,
    type: 'COLLECTION_UNLOCK',
    description: `Unlocked "${sim.title}" from Available Simulations Collection${
      sim.creatorUsername ? ` (by @${sim.creatorUsername})` : ''
    }`,
    relatedSimulationId: sim.id,
    counterpartyUsername: sim.creatorUsername,
  };

  const updatedBuyer: UserAccount = {
    ...buyer,
    simsBalance: nextBuyerBalance,
    simTransactions: [buyerTx, ...(buyer.simTransactions ?? [])],
  };
  nextUsers[buyerIdx] = updatedBuyer;

  // 2. Credit creator royalty (+usageCost Sims) if creator exists and is distinct from buyer
  if (sim.creatorUserId && sim.creatorUserId !== buyer.id) {
    const creatorIdx = nextUsers.findIndex((u) => u.id === sim.creatorUserId);
    if (creatorIdx !== -1) {
      const creator = nextUsers[creatorIdx];
      const nextCreatorBalance = (creator.simsBalance ?? 0) + usageCost;
      const royaltyTx: SimTransaction = {
        id: makeTransactionId('tx_royalty'),
        timestamp: new Date().toISOString(),
        amount: usageCost,
        balanceAfter: nextCreatorBalance,
        type: 'CREATOR_ROYALTY',
        description: `Earned +${usageCost} Sims royalty — @${buyer.username} unlocked "${sim.title}"`,
        relatedSimulationId: sim.id,
        counterpartyUsername: buyer.username,
      };
      nextUsers[creatorIdx] = {
        ...creator,
        simsBalance: nextCreatorBalance,
        simTransactions: [royaltyTx, ...(creator.simTransactions ?? [])],
      };
    }
  }

  saveAllUsers(nextUsers);

  const updatedSimulation: SimulationState = {
    ...sim,
    unlockedByUserIds: Array.from(
      new Set([...(sim.unlockedByUserIds ?? []), buyer.id])
    ),
    totalRoyaltiesEarnedSims:
      (sim.totalRoyaltiesEarnedSims ?? 0) +
      (sim.creatorUserId && sim.creatorUserId !== buyer.id ? usageCost : 0),
  };

  return {
    ok: true,
    chargedSims: usageCost,
    updatedBuyer,
    updatedSimulation,
    allUsers: nextUsers,
  };
}
