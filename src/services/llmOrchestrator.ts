import {
  CharacterSheet,
  Goal,
  InfoCard,
  InteractionResponseMode,
  InteractionType,
  READABILITY_CONFIG,
  ReadabilityLevel,
  SecrecyLevel,
  SentenceBeat,
  SimulationComplexityTier,
  SpeechStyle,
  StatVector,
  SuggestedPlayerResponse,
} from '../types/simulation';
import { broadcastRealtimeEvent } from './presenceService';
import { COMPLEXITY_TIER_CONFIG } from './simsEconomyService';

export const DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/chat/completions';
export const DEEPSEEK_FLASH_MODEL = 'deepseek-flash';
export const DEEPSEEK_V4_PRO_MODEL = 'deepseek-v4-pro';
export const DEEPSEEK_MODEL = DEEPSEEK_FLASH_MODEL;
export const HARDCODED_DEEPSEEK_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DEEPSEEK_API_KEY) || '';

const TEST_V4_PRO_SESSION_KEY = 'SIM_CREATOR_TEST_V4_PRO_ACTIVE';

let customApiKey: string | null = null;
let testV4ProToggleState: boolean = false;

/**
 * Returns true ONLY when the Admin Dashboard 'Test V4 Pro' toggle is explicitly ON.
 * Defaults strictly to false (using deepseek-flash).
 */
export function isTestV4ProEnabled(): boolean {
  if (testV4ProToggleState) return true;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage.getItem(TEST_V4_PRO_SESSION_KEY) === 'true';
  }
  return false;
}

export function setTestV4ProEnabled(
  enabled: boolean,
  broadcast: boolean = true
): void {
  testV4ProToggleState = Boolean(enabled);
  if (typeof window !== 'undefined' && window.sessionStorage) {
    if (testV4ProToggleState) {
      window.sessionStorage.setItem(TEST_V4_PRO_SESSION_KEY, 'true');
    } else {
      window.sessionStorage.removeItem(TEST_V4_PRO_SESSION_KEY);
    }
  }
  if (broadcast) {
    broadcastRealtimeEvent({
      type: 'LLM_MODEL_UPDATED',
      testV4Pro: testV4ProToggleState,
    });
  }
}

export function getActiveDeepSeekModel(): string {
  return isTestV4ProEnabled() ? DEEPSEEK_V4_PRO_MODEL : DEEPSEEK_FLASH_MODEL;
}

/**
 * Resolves the DeepSeek model to use for a given prompt call.
 * Strictly returns deepseek-flash UNLESS:
 *  1) Admin Dashboard 'Test V4 Pro' is explicitly toggled ON, OR
 *  2) The creator explicitly paid Sims to enable V4 Pro during narrative creation (forceV4Pro === true).
 */
export function resolveDeepSeekModel(forceV4Pro?: boolean): string {
  return forceV4Pro || isTestV4ProEnabled()
    ? DEEPSEEK_V4_PRO_MODEL
    : DEEPSEEK_FLASH_MODEL;
}

type AuthorToneArchetype =
  | 'hemingway'
  | 'chandler'
  | 'tolkien'
  | 'clarke'
  | 'lecarre'
  | 'conandoyle';

function resolveAuthorToneArchetype(voice?: SpeechStyle): AuthorToneArchetype {
  if (!voice) return 'hemingway';
  if (voice.id === 'voice_noir') return 'chandler';
  if (voice.id === 'voice_fantasy') return 'tolkien';
  if (voice.id === 'voice_scifi') return 'clarke';
  if (voice.id === 'voice_thriller') return 'lecarre';
  if (voice.id === 'voice_gothic') return 'conandoyle';
  if (voice.id === 'voice_direct') return 'hemingway';

  const haystack = `${voice.authorInspiration ?? ''} ${voice.genre ?? ''} ${voice.name}`.toLowerCase();
  if (haystack.includes('chandler') || haystack.includes('noir')) return 'chandler';
  if (haystack.includes('tolkien') || haystack.includes('fantasy')) return 'tolkien';
  if (haystack.includes('clarke') || haystack.includes('sci-fi') || haystack.includes('science fiction')) {
    return 'clarke';
  }
  if (haystack.includes('carré') || haystack.includes('carre') || haystack.includes('espionage')) {
    return 'lecarre';
  }
  if (haystack.includes('doyle') || haystack.includes('victorian') || haystack.includes('gaslight')) {
    return 'conandoyle';
  }
  return 'hemingway';
}

export function formatVoiceLabel(voice?: SpeechStyle): string {
  if (!voice) return 'Hemingway Spare Realism (Ernest Hemingway · Literary Realism)';
  if (voice.authorInspiration && voice.genre) {
    return `${voice.name} (${voice.authorInspiration} · ${voice.genre})`;
  }
  if (voice.authorInspiration) {
    return `${voice.name} (${voice.authorInspiration})`;
  }
  return voice.name;
}

export function buildVoiceInstruction(voice?: SpeechStyle): string {
  if (!voice || !voice.styleDirective.trim()) return '';
  const authorLine = voice.authorInspiration
    ? `\nFocal Literary Model: ${voice.authorInspiration}${
        voice.genre ? ` (${voice.genre})` : ''
      } — Emulate ${voice.authorInspiration}'s signature sentence architecture, rhythmic cadence, lexical register, dialogue pacing, and subtext mechanics throughout every generated sentence.`
    : voice.genre
    ? `\nGenre Register: ${voice.genre}`
    : '';

  return `\n\nSINGLE-AUTHOR LITERARY VOICE MANDATE ("${voice.name}"):${authorLine}\nCraft Directive: ${voice.styleDirective.trim()}\nImmersion Constraint: Channel this author's unmistakable prose and dialogue style naturally from within the simulation world—NEVER mention the real-world author's name or book titles in-universe, and strictly preserve all canonical facts, epistemic boundaries, and mechanical rules.`;
}

export function buildReadabilityInstruction(
  readabilityLevel?: ReadabilityLevel
): string {
  if (!readabilityLevel) return '';
  const cfg = READABILITY_CONFIG[readabilityLevel];
  if (!cfg) return '';
  return `\n\nREADABILITY LEVEL REQUIREMENT ("${cfg.label}" — ${cfg.gradeLevel}):\nTarget Lexile: ${cfg.targetLexile}\nDirective: ${cfg.promptDirective}`;
}

export function setDeepSeekApiKey(key: string): void {
  const trimmed = key.trim();
  customApiKey = trimmed || null;
  if (typeof window !== 'undefined' && window.localStorage) {
    if (trimmed) {
      window.localStorage.setItem('SIM_CREATOR_DEEPSEEK_KEY', trimmed);
    } else {
      window.localStorage.removeItem('SIM_CREATOR_DEEPSEEK_KEY');
    }
  }
}

export function getDeepSeekApiKey(): string {
  if (customApiKey) return customApiKey;
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem('SIM_CREATOR_DEEPSEEK_KEY');
    if (saved && saved.trim()) return saved.trim();
  }
  return HARDCODED_DEEPSEEK_API_KEY;
}

interface DeepSeekChatOptions {
  systemInstruction: string;
  userContent: string;
  jsonMode?: boolean;
  reasoningEffort?: 'low' | 'high' | 'max';
  forceV4Pro?: boolean;
}

async function callDeepSeekChat({
  systemInstruction,
  userContent,
  jsonMode = false,
  reasoningEffort = 'high',
  forceV4Pro = false,
}: DeepSeekChatOptions): Promise<string | null> {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) return null;

  // Strictly use deepseek-flash unless 'Test V4 Pro' is ON or forceV4Pro is paid/enabled for narrative creation
  const selectedModel = resolveDeepSeekModel(forceV4Pro);

  const response = await fetch(DEEPSEEK_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: selectedModel,
      thinking: { type: 'enabled' },
      reasoning_effort: reasoningEffort,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent },
      ],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`DeepSeek API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  return content ? content.trim() : null;
}

function parseJsonContent<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

// --------------------------------------------------------------------------
// PROMPT 0: Interactive AI Storyline Revision & Workshop
// --------------------------------------------------------------------------
export interface StorylineRevisionParams {
  currentTitle: string;
  currentMasterNarrative: string;
  userPrompt: string;
  voiceStyle?: SpeechStyle;
  complexityTier?: SimulationComplexityTier;
  readabilityLevel?: ReadabilityLevel;
  characterCount?: number;
  forceV4Pro?: boolean;
}

export interface StorylineRevisionResult {
  revisedTitle: string;
  revisedMasterNarrative: string;
  changeSummary: string;
  keyElementsAdded: string[];
}

export async function reviseStorylineWithAI(
  params: StorylineRevisionParams
): Promise<StorylineRevisionResult> {
  const {
    currentTitle,
    currentMasterNarrative,
    userPrompt,
    voiceStyle,
    complexityTier = 'STANDARD',
    readabilityLevel = 'NORMAL',
    characterCount = 4,
    forceV4Pro = false,
  } = params;

  const tierSpec =
    COMPLEXITY_TIER_CONFIG[complexityTier] ?? COMPLEXITY_TIER_CONFIG.STANDARD;
  const voiceBlock = buildVoiceInstruction(voiceStyle);
  const readabilityBlock = buildReadabilityInstruction(readabilityLevel);

  try {
    const raw = await callDeepSeekChat({
      forceV4Pro,
      systemInstruction: `You are an elite narrative designer and interactive worldbuilder for Sim Creator Studio.
Your task is to revise, regenerate, and enrich a simulation storyline (Scenario Title and Master Narrative Lore Source) according to the user's specific creative direction.

CRITICAL CRAFT REQUIREMENTS:
1. User Direction: Faithfully apply the user's requested changes, twists, themes, factions, or stakes ("${userPrompt.trim()}").
2. Rich Investigative Lore: The revised master narrative must establish an inciting crisis, setting background, competing factions/departments, and multiple points of covert leverage and hidden anomalies suitable for multi-party asymmetric investigation across ${characterCount} character roles.
3. Scale & Density: Calibrate the plot density for the "${tierSpec.label}" tier (${tierSpec.cardRange[0]}–${tierSpec.cardRange[1]} atomic clue web).
4. Literary Voice: Embody the active author/genre tone mandate.${voiceBlock}${readabilityBlock}
5. Epistemic Grounding: Frame the narrative with objective ground-truth events that can later be atomized into secret cards held by different characters.

Output strictly valid JSON:
{
  "revisedTitle": "Refined or new gripping title",
  "revisedMasterNarrative": "Expanded, evocative 2-3 paragraph master lore source establishing the world, crisis, factions, and stakes...",
  "changeSummary": "Concise summary of what was changed and why based on the user's prompt",
  "keyElementsAdded": [
    "Specific new plot point or twist 1",
    "Specific new plot point or twist 2",
    "Specific new plot point or twist 3"
  ]
}`,
      userContent: `Current Title: ${currentTitle || 'Untitled Simulation'}
Active Voice: ${formatVoiceLabel(voiceStyle)}
Readability Level: ${readabilityLevel} (${READABILITY_CONFIG[readabilityLevel]?.gradeLevel ?? '8th Grade Level'})
Target Character Count: ${characterCount}
Complexity Tier: ${tierSpec.label}
Current Storyline Lore:
${
  currentMasterNarrative ||
  'No existing lore provided; create a fresh storyline from scratch based on user prompt.'
}

User's Creative Revision Prompt:
"${userPrompt}"`,
      jsonMode: true,
      reasoningEffort: 'high',
    });

    if (raw) {
      const parsed = parseJsonContent<StorylineRevisionResult>(raw);
      if (
        parsed &&
        typeof parsed.revisedTitle === 'string' &&
        typeof parsed.revisedMasterNarrative === 'string' &&
        parsed.revisedMasterNarrative.trim().length > 0
      ) {
        return {
          revisedTitle: parsed.revisedTitle.trim(),
          revisedMasterNarrative: parsed.revisedMasterNarrative.trim(),
          changeSummary:
            parsed.changeSummary ||
            `Revised storyline to incorporate: "${userPrompt.slice(0, 80)}..."`,
          keyElementsAdded: Array.isArray(parsed.keyElementsAdded)
            ? parsed.keyElementsAdded
            : ['Incorporated custom narrative prompt into master lore'],
        };
      }
    }
  } catch (e) {
    console.warn('DeepSeek storyline revision failed, using intelligent fallback:', e);
  }

  // Deterministic fallback revision
  const baseTitle = currentTitle.trim() || 'Classified Incident';
  const revisedTitle = `${baseTitle}: ${userPrompt
    .split(' ')
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')} Resolution`.replace(/[:\s]+$/, '');
  const revisedMasterNarrative = currentMasterNarrative.trim()
    ? `${currentMasterNarrative.trim()}\n\nFurthermore, recent intelligence reveals: ${userPrompt.trim()}. Suspicions have flared across all departments as evidence links the latest anomaly to covert directives beyond the room.`
    : `In the shadow of recent developments, an unprecedented crisis has emerged: ${userPrompt.trim()}. Multiple officials with competing loyalties and classified records have gathered behind sealed doors before outside authorities intervene.`;

  return {
    revisedTitle,
    revisedMasterNarrative,
    changeSummary: `Applied creative revision: "${userPrompt.slice(0, 90)}"`,
    keyElementsAdded: [
      userPrompt.trim(),
      'Escalated multi-departmental investigative tension',
      'Added covert leverage vectors for character roles',
    ],
  };
}

// --------------------------------------------------------------------------
// PROMPT 0.5: Dynamic Storyline Character Cast Generator
// --------------------------------------------------------------------------
export interface GeneratedCharacterConcept {
  slotId: string;
  characterName: string;
  publicRole: string;
  coreTraits: string[];
  coreMotives: string[];
  hiddenStats: StatVector;
}

export interface StorylineCharacterCastParams {
  scenarioTitle: string;
  masterNarrative: string;
  voiceStyle?: SpeechStyle;
  forceV4Pro?: boolean;
  characterCount?: number;
  readabilityLevel?: ReadabilityLevel;
}

interface ArchetypeSlotDef {
  slotId: string;
  roleSummary: string;
  defaultStats: StatVector;
}

const MASTER_ARCHETYPE_SLOTS: ArchetypeSlotDef[] = [
  {
    slotId: 'vance',
    roleSummary:
      'Authority / Official Command / Law Enforcement figure with formal jurisdiction and defensive command. Moderate inquiry, high coercion/composure.',
    defaultStats: { inquiry: 0.55, coercion: 0.85, negotiation: 0.45, deception: 0.35, composure: 0.7, insight: 0.5 },
  },
  {
    slotId: 'thorne',
    roleSummary:
      'Technical / Scientific / Archival / Specialist figure who oversees restricted systems, specimens, or records. High inquiry/insight, high composure.',
    defaultStats: { inquiry: 0.88, coercion: 0.35, negotiation: 0.5, deception: 0.4, composure: 0.8, insight: 0.75 },
  },
  {
    slotId: 'kael',
    roleSummary:
      'Hands-on Operations / Engineering / Logistics / Field specialist who understands physical mechanics or transport, vulnerable under pressure. High negotiation, lower composure.',
    defaultStats: { inquiry: 0.6, coercion: 0.4, negotiation: 0.82, deception: 0.38, composure: 0.4, insight: 0.55 },
  },
  {
    slotId: 'nyx',
    roleSummary:
      'Covert / Independent / Visiting Auditor / Smuggler or Outside Operative who harbors hidden third-party affiliations. High deception/insight, versatile negotiation.',
    defaultStats: { inquiry: 0.75, coercion: 0.6, negotiation: 0.65, deception: 0.9, composure: 0.7, insight: 0.85 },
  },
  {
    slotId: 'sloan',
    roleSummary:
      'Bureaucratic Whistleblower / Compliance Counsel / Legal Envoy who controls access to logs, contracts, or ethics records. High inquiry/composure.',
    defaultStats: { inquiry: 0.82, coercion: 0.42, negotiation: 0.7, deception: 0.48, composure: 0.76, insight: 0.72 },
  },
  {
    slotId: 'mira',
    roleSummary:
      'Financial Comptroller / Intelligence Broker / Resource Syndicate Liaison with ledgers of covert funding, payouts, or bribes. High negotiation/deception.',
    defaultStats: { inquiry: 0.66, coercion: 0.48, negotiation: 0.86, deception: 0.78, composure: 0.64, insight: 0.79 },
  },
  {
    slotId: 'corvus',
    roleSummary:
      'Tactical Enforcer / Chief of Watch / Security Lieutenant possessing physical weapon access, containment locks, and surveillance footage. High coercion/insight.',
    defaultStats: { inquiry: 0.52, coercion: 0.88, negotiation: 0.38, deception: 0.55, composure: 0.78, insight: 0.64 },
  },
  {
    slotId: 'valen',
    roleSummary:
      'Medical Examiner / Biosafety Officer / Quarantine Specialist who examined victims or preserves sealed forensic evidence. High insight/inquiry.',
    defaultStats: { inquiry: 0.84, coercion: 0.3, negotiation: 0.58, deception: 0.46, composure: 0.84, insight: 0.88 },
  },
];

export async function generateStorylineCharacters(
  params: StorylineCharacterCastParams
): Promise<GeneratedCharacterConcept[]> {
  const {
    scenarioTitle,
    masterNarrative,
    voiceStyle,
    forceV4Pro = false,
    characterCount = 4,
    readabilityLevel = 'NORMAL',
  } = params;

  const targetCount = Math.max(3, Math.min(8, characterCount));
  const targetSlots = MASTER_ARCHETYPE_SLOTS.slice(0, targetCount);
  const voiceBlock = buildVoiceInstruction(voiceStyle);
  const readabilityBlock = buildReadabilityInstruction(readabilityLevel);

  const slotDescriptions = targetSlots
    .map((s, idx) => `${idx + 1}. Slot "${s.slotId}": ${s.roleSummary}`)
    .join('\n');

  try {
    const raw = await callDeepSeekChat({
      forceV4Pro,
      systemInstruction: `You are an elite character designer for Sim Creator Studio.
Given the simulation storyline (Title and Master Narrative Lore Source), generate exactly ${targetCount} distinct, asymmetrical characters tailored specifically to this world and crisis.
Map the characters to exactly these ${targetCount} slots:
${slotDescriptions}
${voiceBlock}${readabilityBlock}

Output strictly valid JSON:
{
  "characters": [
    ${targetSlots
      .map(
        (s) => `{
      "slotId": "${s.slotId}",
      "characterName": "In-World Character Name",
      "publicRole": "Official Setting Role / Title",
      "coreTraits": ["Trait 1", "Trait 2", "Trait 3"],
      "coreMotives": ["Primary motive", "Secret secondary motive"],
      "hiddenStats": {
        "inquiry": ${s.defaultStats.inquiry},
        "coercion": ${s.defaultStats.coercion},
        "negotiation": ${s.defaultStats.negotiation},
        "deception": ${s.defaultStats.deception},
        "composure": ${s.defaultStats.composure},
        "insight": ${s.defaultStats.insight}
      }
    }`
      )
      .join(',\n    ')}
  ]
}`,
      userContent: `Scenario Title: ${scenarioTitle}
Voice Style: ${formatVoiceLabel(voiceStyle)}
Readability Level: ${readabilityLevel}
Target Character Count: ${targetCount}
Master Narrative Lore:
${masterNarrative}`,
      jsonMode: true,
      reasoningEffort: 'high',
    });

    if (raw) {
      const parsed = parseJsonContent<{ characters: GeneratedCharacterConcept[] }>(raw);
      if (Array.isArray(parsed.characters) && parsed.characters.length === targetCount) {
        return parsed.characters;
      }
    }
  } catch (e) {
    console.warn('DeepSeek character generation failed, using thematic fallback:', e);
  }

  // Thematic fallback generator based on storyline keywords
  const text = `${scenarioTitle} ${masterNarrative}`.toLowerCase();
  const isNoir =
    text.includes('detective') ||
    text.includes('pier') ||
    text.includes('rain') ||
    text.includes('crime');
  const isFantasy =
    text.includes('conclave') ||
    text.includes('realm') ||
    text.includes('ward') ||
    text.includes('magic') ||
    text.includes('king');

  if (isNoir) {
    const noirList: GeneratedCharacterConcept[] = [
      {
        slotId: 'vance',
        characterName: 'Detective Jack Vance',
        publicRole: 'Precinct Homicide Lieutenant',
        coreTraits: ['Hardboiled', 'Relentless', 'Cynical'],
        coreMotives: ['Close the Case Before Squad Cars Arrive', 'Keep Old Dock Favors Buried'],
        hiddenStats: { inquiry: 0.72, coercion: 0.84, negotiation: 0.5, deception: 0.42, composure: 0.68, insight: 0.62 },
      },
      {
        slotId: 'thorne',
        characterName: 'Dr. Evelyn Thorne',
        publicRole: 'Night-Shift County Examiner',
        coreTraits: ['Clinical', 'Observant', 'Dry-Witted'],
        coreMotives: ['Reconstruct the Physical Timeline', 'Protect Confidential Medical Ledger'],
        hiddenStats: { inquiry: 0.86, coercion: 0.3, negotiation: 0.52, deception: 0.45, composure: 0.82, insight: 0.78 },
      },
      {
        slotId: 'kael',
        characterName: 'Dock Foreman Leo Kael',
        publicRole: 'Harbor Shift Master',
        coreTraits: ['Pragmatic', 'Nervous', 'Transactional'],
        coreMotives: ['Clear Dock Workers from Blame', 'Hide Off-Manifest Cargo Chits'],
        hiddenStats: { inquiry: 0.58, coercion: 0.45, negotiation: 0.82, deception: 0.36, composure: 0.45, insight: 0.52 },
      },
      {
        slotId: 'nyx',
        characterName: 'Baroness Nyx DeWitt',
        publicRole: 'Nightclub Proprietor & Broker',
        coreTraits: ['Enigmatic', 'Calculating', 'Poised'],
        coreMotives: ['Recover Diverted Bearer Bonds', 'Frame Station Command'],
        hiddenStats: { inquiry: 0.75, coercion: 0.62, negotiation: 0.68, deception: 0.88, composure: 0.74, insight: 0.84 },
      },
      {
        slotId: 'sloan',
        characterName: 'Counselor Arthur Sloan',
        publicRole: 'City Hall Integrity Envoy',
        coreTraits: ['Bureaucratic', 'Cautious', 'Observant'],
        coreMotives: ['Impound Unauthorized Contracts', 'Shield Political Benefactors'],
        hiddenStats: { inquiry: 0.8, coercion: 0.42, negotiation: 0.7, deception: 0.48, composure: 0.76, insight: 0.72 },
      },
      {
        slotId: 'mira',
        characterName: 'Mira Fontaine',
        publicRole: 'Waterfront Shadow Bookkeeper',
        coreTraits: ['Sharp', 'Opportunistic', 'Discreet'],
        coreMotives: ['Balance Payoff Ledgers', 'Protect Syndicate Escrow Deposit'],
        hiddenStats: { inquiry: 0.65, coercion: 0.48, negotiation: 0.86, deception: 0.76, composure: 0.64, insight: 0.78 },
      },
      {
        slotId: 'corvus',
        characterName: 'Officer Corvus',
        publicRole: 'Port Patrol Enforcer',
        coreTraits: ['Intimidating', 'Vigilant', 'Rough'],
        coreMotives: ['Control Pier Access Gates', 'Suppress Patrol Shift Logbook'],
        hiddenStats: { inquiry: 0.5, coercion: 0.86, negotiation: 0.4, deception: 0.52, composure: 0.76, insight: 0.62 },
      },
      {
        slotId: 'valen',
        characterName: 'Dr. Valen Cross',
        publicRole: 'County Toxicologist',
        coreTraits: ['Methodical', 'Tired', 'Incorruptible'],
        coreMotives: ['Isolate Chemical Traces in River Samples', 'Expose Contaminated Cargo'],
        hiddenStats: { inquiry: 0.84, coercion: 0.32, negotiation: 0.56, deception: 0.44, composure: 0.82, insight: 0.86 },
      },
    ];
    return noirList.slice(0, targetCount);
  }

  if (isFantasy) {
    const fantasyList: GeneratedCharacterConcept[] = [
      {
        slotId: 'vance',
        characterName: 'Lord High Steward Vance',
        publicRole: 'Steward of the Citadel',
        coreTraits: ['Authoritarian', 'Stern', 'Dignified'],
        coreMotives: ['Maintain Citadel Order', 'Conceal Broken Royal Treaty'],
        hiddenStats: { inquiry: 0.6, coercion: 0.85, negotiation: 0.45, deception: 0.35, composure: 0.7, insight: 0.5 },
      },
      {
        slotId: 'thorne',
        characterName: 'Grand Alchemist Thorne',
        publicRole: 'Keeper of the Vaults',
        coreTraits: ['Methodical', 'Secretive', 'Scholarly'],
        coreMotives: ['Protect Forbidden Arcana', 'Expose Treason in the Council'],
        hiddenStats: { inquiry: 0.88, coercion: 0.32, negotiation: 0.5, deception: 0.42, composure: 0.82, insight: 0.76 },
      },
      {
        slotId: 'kael',
        characterName: 'Forge Master Kael',
        publicRole: 'Chief Artificer of the Conclave',
        coreTraits: ['Resourceful', 'Gruff', 'Honorable'],
        coreMotives: ['Defend the Guild Apprentices', 'Exonerate the Forge Gates'],
        hiddenStats: { inquiry: 0.62, coercion: 0.42, negotiation: 0.8, deception: 0.35, composure: 0.48, insight: 0.56 },
      },
      {
        slotId: 'nyx',
        characterName: 'Shadow Weaver Nyx',
        publicRole: 'Envoy of the Ashen Sisterhood',
        coreTraits: ['Subtle', 'Perceptive', 'Cynical'],
        coreMotives: ['Extract the Conclave Phylactery', 'Exploit Council Division'],
        hiddenStats: { inquiry: 0.74, coercion: 0.58, negotiation: 0.66, deception: 0.9, composure: 0.72, insight: 0.86 },
      },
      {
        slotId: 'sloan',
        characterName: 'Chronicler Sloan',
        publicRole: 'Keeper of the High Edicts',
        coreTraits: ['Rigorous', 'Pious', 'Observant'],
        coreMotives: ['Preserve Ancient Charter Inscriptions', 'Seal Contradictory Lineage Records'],
        hiddenStats: { inquiry: 0.82, coercion: 0.4, negotiation: 0.68, deception: 0.46, composure: 0.78, insight: 0.74 },
      },
      {
        slotId: 'mira',
        characterName: 'Lady Mira of House Val',
        publicRole: 'Tribute Collector',
        coreTraits: ['Noble', 'Calculated', 'Resourceful'],
        coreMotives: ['Audit Kingdom Tribute Coffers', 'Secure Dynastic Loan Guarantees'],
        hiddenStats: { inquiry: 0.64, coercion: 0.5, negotiation: 0.85, deception: 0.75, composure: 0.66, insight: 0.78 },
      },
      {
        slotId: 'corvus',
        characterName: 'Iron Captain Corvus',
        publicRole: 'Commander of Citadel Sentinels',
        coreTraits: ['Loyal', 'Relentless', 'Stalwart'],
        coreMotives: ['Enforce Citadel Curfew', 'Contain Breach in the Lower Catacombs'],
        hiddenStats: { inquiry: 0.5, coercion: 0.88, negotiation: 0.36, deception: 0.54, composure: 0.76, insight: 0.64 },
      },
      {
        slotId: 'valen',
        characterName: 'High Apothecary Valen',
        publicRole: 'Herbalist & Healer',
        coreTraits: ['Compassionate', 'Attentive', 'Haunted'],
        coreMotives: ['Cleanse Blighted Relics', 'Conceal Origin of the Council Poison'],
        hiddenStats: { inquiry: 0.85, coercion: 0.28, negotiation: 0.6, deception: 0.44, composure: 0.82, insight: 0.88 },
      },
    ];
    return fantasyList.slice(0, targetCount);
  }

  // Default sci-fi / institutional thriller cast
  const defaultList: GeneratedCharacterConcept[] = [
    {
      slotId: 'vance',
      characterName: 'Commander Vance',
      publicRole: 'Facility Director',
      coreTraits: ['Authoritarian', 'Determined', 'Pragmatic'],
      coreMotives: ['Maintain Command Control', 'Cover Up Permitting Irregularities'],
      hiddenStats: { inquiry: 0.5, coercion: 0.85, negotiation: 0.4, deception: 0.3, composure: 0.65, insight: 0.35 },
    },
    {
      slotId: 'thorne',
      characterName: 'Dr. Aris Thorne',
      publicRole: 'Chief Science Officer',
      coreTraits: ['Analytical', 'Stoic', 'Secretive'],
      coreMotives: ['Protect Classified Research', 'Expose Operational Incompetence'],
      hiddenStats: { inquiry: 0.88, coercion: 0.3, negotiation: 0.45, deception: 0.4, composure: 0.8, insight: 0.7 },
    },
    {
      slotId: 'kael',
      characterName: 'Chief Engineer Kael',
      publicRole: 'Chief Systems Engineer',
      coreTraits: ['Resourceful', 'Nervous', 'Transactional'],
      coreMotives: ['Clear Name from System Failure', 'Protect Engineering Staff'],
      hiddenStats: { inquiry: 0.6, coercion: 0.4, negotiation: 0.82, deception: 0.35, composure: 0.3, insight: 0.5 },
    },
    {
      slotId: 'nyx',
      characterName: 'Operative Nyx',
      publicRole: 'Security Consultant',
      coreTraits: ['Deceptive', 'Perceptive', 'Calculated'],
      coreMotives: ['Extract Core Telemetry', 'Frame Facility Command'],
      hiddenStats: { inquiry: 0.75, coercion: 0.6, negotiation: 0.65, deception: 0.9, composure: 0.7, insight: 0.85 },
    },
    {
      slotId: 'sloan',
      characterName: 'Envoy Sloan',
      publicRole: 'Regulatory Compliance Director',
      coreTraits: ['Methodical', 'Pragmatic', 'Inquisitive'],
      coreMotives: ['Preserve Statutory Oversight', 'Secure Exemption for Corporate Envoy'],
      hiddenStats: { inquiry: 0.82, coercion: 0.42, negotiation: 0.7, deception: 0.48, composure: 0.76, insight: 0.72 },
    },
    {
      slotId: 'mira',
      characterName: 'Auditor Mira',
      publicRole: 'Discretionary Ledger Comptroller',
      coreTraits: ['Calculating', 'Perceptive', 'Discreet'],
      coreMotives: ['Trace Unlisted R&D Appropriations', 'Protect Black-Budget Syndicate Tranches'],
      hiddenStats: { inquiry: 0.66, coercion: 0.48, negotiation: 0.86, deception: 0.78, composure: 0.64, insight: 0.79 },
    },
    {
      slotId: 'corvus',
      characterName: 'Marshal Corvus',
      publicRole: 'Sector Security Chief',
      coreTraits: ['Vigilant', 'Intimidating', 'Unforgiving'],
      coreMotives: ['Lock Down Sector Perimeter', 'Conceal Unauthorized Armed Deployment'],
      hiddenStats: { inquiry: 0.52, coercion: 0.88, negotiation: 0.38, deception: 0.55, composure: 0.78, insight: 0.64 },
    },
    {
      slotId: 'valen',
      characterName: 'Dr. Valen',
      publicRole: 'Chief Biosafety Officer',
      coreTraits: ['Observant', 'Empathetic', 'Compromised'],
      coreMotives: ['Contain Contamination Vector', 'Hide Sub-Standard Bio-Filter Logs'],
      hiddenStats: { inquiry: 0.84, coercion: 0.3, negotiation: 0.58, deception: 0.46, composure: 0.84, insight: 0.88 },
    },
  ];
  return defaultList.slice(0, targetCount);
}

// --------------------------------------------------------------------------
// PROMPT A: Master Narrative Atomizer (Studio Compiler)
// --------------------------------------------------------------------------
export interface AtomizerCardOutput {
  id: string;
  title: string;
  canonicalFact: string;
  subjectCharacterNames: string[];
  topicTags: string[];
  secrecy: SecrecyLevel;
  assignedCharacterName: string;
}

export interface AtomizerGoalOutput {
  id: string;
  assignedCharacterName: string;
  veiledPrompt: string;
  requiredCardIds: string[];
  baseVpValue: number;
  decayMultipliers: number[];
  synthesizedCardTemplate: {
    title: string;
    canonicalFactSummary: string;
    secrecy: SecrecyLevel;
  };
}

export interface CompilerOutputSchema {
  cards: AtomizerCardOutput[];
  goals: AtomizerGoalOutput[];
}

export interface NarrativeCompilerOptions {
  complexityTier?: SimulationComplexityTier;
  readabilityLevel?: ReadabilityLevel;
  voiceStyle?: SpeechStyle;
  forceV4Pro?: boolean;
}

export async function atomizeMasterNarrative(
  masterNarrative: string,
  characterNames: string[],
  options?: NarrativeCompilerOptions
): Promise<CompilerOutputSchema> {
  const tier = options?.complexityTier ?? 'STANDARD';
  const tierSpec = COMPLEXITY_TIER_CONFIG[tier] ?? COMPLEXITY_TIER_CONFIG.STANDARD;
  const [minCards, maxCards] = tierSpec.cardRange;
  const goalsPerChar = tierSpec.goalsPerCharacter;
  const voiceBlock = buildVoiceInstruction(options?.voiceStyle);
  const readabilityBlock = buildReadabilityInstruction(options?.readabilityLevel);

  try {
    const raw = await callDeepSeekChat({
      forceV4Pro: options?.forceV4Pro,
      systemInstruction: `You are a narrative graph compiler operating at the "${tierSpec.label}" complexity tier. Deconstruct the provided Master Narrative into between ${minCards} and ${maxCards} discrete, atomic factual statements (ATOMIC InfoCards). Then construct ${goalsPerChar} Goal(s) per character where each Goal requires combining 3 to 4 InfoCards. Write a veiledPrompt for each Goal that frames an open question or mystery for the player without revealing the answer.
Ensure DAG solvability invariants:
1) Zero Self-Sufficiency: Never assign all requiredCardIds of a Goal to the Goal's assignedCharacterName.
2) Global Reachability: Every requiredCardId must match an id in cards.
3) Asymmetric Leverage: Every character holds at least 2 cards required by other characters' goals.${voiceBlock}${readabilityBlock}

Output strictly valid JSON matching this exact structure:
{
  "cards": [
    {
      "id": "card_unique_slug",
      "title": "Short title",
      "canonicalFact": "Single discrete factual statement",
      "subjectCharacterNames": ["Character Name"],
      "topicTags": ["TAG1", "TAG2"],
      "secrecy": "PUBLIC" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "assignedCharacterName": "Exact name from character list"
    }
  ],
  "goals": [
    {
      "id": "goal_unique_slug",
      "assignedCharacterName": "Exact name from character list",
      "veiledPrompt": "Open mystery prompt for the player",
      "requiredCardIds": ["card_id_1", "card_id_2", "card_id_3"],
      "baseVpValue": 1000,
      "decayMultipliers": [1.0, 0.6, 0.3],
      "synthesizedCardTemplate": {
        "title": "Conclusive Dossier: ...",
        "canonicalFactSummary": "Synthesized conclusion combining the required cards",
        "secrecy": "PUBLIC" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      }
    }
  ]
}`,
      userContent: `Complexity Tier: ${tierSpec.label} (${minCards}-${maxCards} cards, ${goalsPerChar} goal(s) per character)\nVoice Style: ${formatVoiceLabel(options?.voiceStyle)}\nDeconstruct this Master Narrative for characters [${characterNames.join(', ')}]:\n\n${masterNarrative}`,
      jsonMode: true,
    });

    if (raw) {
      return parseJsonContent<CompilerOutputSchema>(raw);
    }
  } catch (e) {
    console.warn('DeepSeek API call failed, falling back to deterministic synthesizer:', e);
  }

  // High-fidelity fallback synthesizer scaled to complexityTier
  return generateFallbackCompilation(masterNarrative, characterNames, tier);
}

// --------------------------------------------------------------------------
// PROMPT B: Local Narrative Weaver & Global RAG Reconciler
// --------------------------------------------------------------------------
function describeQualitativeStats(stats: StatVector): string {
  const traits: string[] = [];
  if (stats.inquiry > 0.7) traits.push('relentlessly inquisitive and sharp at uncovering details');
  else if (stats.inquiry < 0.4) traits.push('hesitant to press questions directly');

  if (stats.coercion > 0.7) traits.push('commanding and intimidating in tense standoffs');
  else if (stats.coercion < 0.4) traits.push('soft-spoken and averse to overt hostility');

  if (stats.negotiation > 0.7) traits.push('persuasive, pragmatic, and adept at striking deals');
  else if (stats.negotiation < 0.4) traits.push('rigid and reluctant to compromise');

  if (stats.deception > 0.7) traits.push('guarded, deceptive, and skilled at masking motives');
  else if (stats.deception < 0.4) traits.push('transparent with an easily readable tell');

  if (stats.composure > 0.7) traits.push('unflinching under pressure and hostile scrutiny');
  else if (stats.composure < 0.4) traits.push('anxious when cornered by authority');

  if (stats.insight > 0.7) traits.push('perceptive, quickly seeing through bluff and artifice');
  else if (stats.insight < 0.4) traits.push('prone to taking claims at face value');

  return traits.join(', ');
}

export async function weaveCharacterDossier(
  characterName: string,
  assignedCards: InfoCard[],
  hiddenStats: StatVector,
  options?: {
    voiceStyle?: SpeechStyle;
    forceV4Pro?: boolean;
    readabilityLevel?: ReadabilityLevel;
  }
): Promise<string> {
  const qualitativeStatSummary = describeQualitativeStats(hiddenStats);
  const assignedCardsJson = JSON.stringify(
    assignedCards.map((c) => ({ title: c.title, fact: c.canonicalFact, secrecy: c.secrecy }))
  );
  const voiceBlock = buildVoiceInstruction(options?.voiceStyle);
  const readabilityBlock = buildReadabilityInstruction(options?.readabilityLevel);

  try {
    const raw = await callDeepSeekChat({
      forceV4Pro: options?.forceV4Pro,
      systemInstruction: `Generate a second-person private character dossier (privateNarrativeBio) for ${characterName}. You may ONLY incorporate facts from the following assigned starting InfoCards: ${assignedCardsJson}. Subtlely weave qualitative descriptions of their strengths and weaknesses based on hiddenStats: ${qualitativeStatSummary} (NEVER output numbers, percentages, or stat names). Fill in minimal bridging prose.${voiceBlock}${readabilityBlock}`,
      userContent: `Character: ${characterName}\nVoice Style: ${formatVoiceLabel(options?.voiceStyle)}\nAssigned Cards: ${assignedCardsJson}\nQualitative Strengths/Weaknesses: ${qualitativeStatSummary}`,
      jsonMode: false,
    });
    if (raw) {
      return raw;
    }
  } catch (e) {
    console.warn('DeepSeek weave failed, using fallback:', e);
  }

  // Deterministic fallback weaver tailored around each genre's focal author
  const titles = assignedCards.map((c) => c.title).join(', ');
  const capTraits =
    qualitativeStatSummary.charAt(0).toUpperCase() + qualitativeStatSummary.slice(1);
  const archetype = resolveAuthorToneArchetype(options?.voiceStyle);

  switch (archetype) {
    case 'chandler':
      return `The rain never washes a slate clean in this town, ${characterName}, and tonight smells like wet wool and bad alibis. ${capTraits}. Buttoned inside your coat pocket is the only truth worth nickel-plating: ${titles}. Keep your chin tucked before somebody writes your name on a harbor ledger.`;
    case 'tolkien':
      return `Hearken to your charge beneath these shadowed halls, ${characterName}. ${capTraits}. By scroll and heirloom seal you alone keep watch over this lore: ${titles}. Guard well your counsel, for rash words wake long peril.`;
    case 'clarke':
      return `Telemetry is indifferent to rank or excuse, ${characterName}. ${capTraits}. Across the silent hum of life-support, your console holds verified data on: ${titles}. Weigh each physical parameter before committing to an irreversible course.`;
    case 'lecarre':
      return `In our grey little corner of the service, ${characterName}, survival is mostly a matter of tidy filing and knowing when not to smile. ${capTraits}. Locked inside your registry tray are three awkward realities: ${titles}. Pour the tea, stay impeccably polite, and concede nothing gratis.`;
    case 'conandoyle':
      return `Observe the particulars with clinical detachment, ${characterName}, for a singular trifle often unravels an entire conspiracy. ${capTraits}. Your notebook presently records irrefragable evidence concerning: ${titles}. Eliminate each falsehood methodically until only the truth remains.`;
    case 'hemingway':
    default:
      return `You stand at your post, ${characterName}, and you know what the papers say and what they leave out. ${capTraits}. You have the facts before you: ${titles}. Say only what must be said and watch the others closely.`;
  }
}

export async function reconcileDossiers(
  dossiers: Record<string, string>,
  canonicalCards: InfoCard[],
  options?: { voiceStyle?: SpeechStyle; forceV4Pro?: boolean }
): Promise<Record<string, string>> {
  try {
    const canonicalFacts = canonicalCards.map((c) => c.canonicalFact).join('\n- ');
    const voiceBlock = buildVoiceInstruction(options?.voiceStyle);
    const raw = await callDeepSeekChat({
      forceV4Pro: options?.forceV4Pro,
      systemInstruction:
        `Inspect all generated character dossiers against the canonical InfoCard list. Identify any bridging prose that contradicts a canonical card or creates an impossible timeline collision. Rewrite only the conflicting sentences so all dossiers are 100% mutually consistent. Output strictly valid JSON mapping each characterId key to its reconciled dossier string.${voiceBlock}`,
      userContent: `Dossiers:\n${JSON.stringify(dossiers, null, 2)}\n\nCanonical Card Facts:\n- ${canonicalFacts}`,
      jsonMode: true,
    });
    if (raw) {
      return parseJsonContent<Record<string, string>>(raw);
    }
  } catch (e) {
    console.warn('DeepSeek reconciler failed, keeping raw dossiers:', e);
  }
  return dossiers;
}

// --------------------------------------------------------------------------
// PROMPT C: Authenticity Bonus Classifier
// --------------------------------------------------------------------------
export interface AuthenticityClassification {
  authenticityScore: number;
  authenticityReasoning: string;
}

export async function classifyAuthenticity(
  playerSheet: CharacterSheet,
  knownCards: InfoCard[],
  proposedInput: string
): Promise<AuthenticityClassification> {
  try {
    const knownCardTitles = knownCards.map((c) => c.title);
    const raw = await callDeepSeekChat({
      systemInstruction: `Evaluate the player's proposed interaction input against their coreTraits, coreMotives, and currently known InfoCards. Return strictly valid JSON with exact keys:
{
  "authenticityScore": <float between -0.15 and 0.20>,
  "authenticityReasoning": "<single concise sentence explaining the score>"
}
Reward shrewdness, in-character voice, and strategic leverage of known facts. Penalize meta-gaming, out-of-character pleading, or referencing facts not in their knownCardTitles.`,
      userContent: `Character: ${playerSheet.characterName}\nCore Traits: ${playerSheet.coreTraits.join(', ')}\nCore Motives: ${playerSheet.coreMotives.join(', ')}\nKnown Cards: ${knownCardTitles.join(', ')}\nProposed Input: "${proposedInput}"`,
      jsonMode: true,
    });
    if (raw) {
      const parsed = parseJsonContent<AuthenticityClassification>(raw);
      if (typeof parsed.authenticityScore === 'number' && typeof parsed.authenticityReasoning === 'string') {
        return {
          authenticityScore: Math.max(-0.15, Math.min(0.2, parsed.authenticityScore)),
          authenticityReasoning: parsed.authenticityReasoning,
        };
      }
    }
  } catch (e) {
    console.warn('DeepSeek authenticity classifier failed, using heuristic:', e);
  }

  // Heuristic classifier
  const lower = proposedInput.toLowerCase();
  let score = 0.05;
  let reason = 'In-character conversational inquiry consistent with character motives.';

  if (lower.includes('roll') || lower.includes('stats') || lower.includes('game') || lower.includes('vp')) {
    score = -0.12;
    reason = 'Penalized for explicit meta-gaming and out-of-character terminology.';
  } else if (
    playerSheet.coreTraits.some((trait) => lower.includes(trait.toLowerCase())) ||
    knownCards.some((c) => lower.includes(c.title.toLowerCase().split(' ')[0]))
  ) {
    score = 0.15;
    reason = 'Excellent leverage of known confidential cards and authentic persona.';
  }

  return { authenticityScore: score, authenticityReasoning: reason };
}

// --------------------------------------------------------------------------
// PROMPT D: Single-Call Batched N-Sentence Dialogue Generator
// --------------------------------------------------------------------------
export async function generateBatchedDialogue(
  initiatorName: string,
  targetName: string,
  interactionType: InteractionType,
  initiatorPrompt: string,
  beats: SentenceBeat[],
  targetCard?: InfoCard,
  voiceStyle?: SpeechStyle
): Promise<string[]> {
  const n = beats.length;
  const beatsTrajectoryJson = JSON.stringify(
    beats.map((b) => ({
      index: b.sentenceIndex,
      speaker: b.sentenceIndex % 2 === 1 ? initiatorName : targetName,
      outcomeTier: b.outcomeTier,
      revealsCard: !!b.revealedCardId,
    }))
  );

  const targetCardFact = targetCard?.canonicalFact ?? 'No confidential card specified';
  const voiceBlock = buildVoiceInstruction(voiceStyle);

  try {
    const raw = await callDeepSeekChat({
      systemInstruction: `Generate an exact ${n}-sentence dialogue exchange between ${initiatorName} (Initiator, approach: ${interactionType}) and ${targetName} (Target).
You MUST follow this pre-rolled mathematical trajectory sentence-by-sentence:
${beatsTrajectoryJson}
Rules:
Output strictly valid JSON matching this exact structure:
{
  "sentences": ["sentence 1", "sentence 2", ...]
}
containing an array of exactly ${n} strings.
Odd sentences are spoken by ${initiatorName} or describe their immediate pressure; even sentences are ${targetName}'s response, EXCEPT the final sentence ${n} which must deliver the resolution of the exchange.
Only reveal the canonical fact of targetCard (${targetCardFact}) on the specific sentence index marked revealsCard: true. If no beat has revealsCard: true, ${targetName} must successfully withhold the secret while matching the tone of each outcomeTier.${voiceBlock}`,
      userContent: `Initiator: ${initiatorName}\nApproach: ${interactionType}\nInitiator Opening: "${initiatorPrompt}"\nTarget: ${targetName}\nVoice Style: ${formatVoiceLabel(voiceStyle)}\nSentence Count: ${n}\nBeats Trajectory:\n${beatsTrajectoryJson}\nTarget Card Fact: "${targetCardFact}"`,
      jsonMode: true,
    });

    if (raw) {
      const parsed = parseJsonContent<{ sentences: string[] }>(raw);
      if (Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
        return parsed.sentences;
      }
    }
  } catch (e) {
    console.warn('DeepSeek dialogue generator failed, using narrative generator:', e);
  }

  // Fallback narrative dialogue generator tailored around each genre's focal author
  const archetype = resolveAuthorToneArchetype(voiceStyle);
  const sentences: string[] = [];
  for (let i = 0; i < n; i++) {
    const beat = beats[i];
    const isOdd = beat.sentenceIndex % 2 === 1;
    const isLast = i === n - 1;

    if (isOdd && !isLast) {
      if (i === 0) {
        sentences.push(`${initiatorName}: "${initiatorPrompt}"`);
      } else {
        switch (archetype) {
          case 'chandler':
            sentences.push(
              `${initiatorName} leans into the yellow lamplight, voice flat as a pawnshop blade: "Skip the lullaby—give me the straight story before the rain stops."`
            );
            break;
          case 'tolkien':
            sentences.push(
              `${initiatorName} steps nigh beneath the vaulted stone: "By the oath of thy house, cloud not our counsel in this dark hour."`
            );
            break;
          case 'clarke':
            sentences.push(
              `${initiatorName} taps the telemetry slate with calm precision: "The instruments leave zero margin for conjecture—account for the discrepancy."`
            );
            break;
          case 'lecarre':
            sentences.push(
              `${initiatorName} adjusts a cuff with quiet Whitehall patience: "Do help me tidy the file, old friend, before upstairs starts asking awkward questions."`
            );
            break;
          case 'conandoyle':
            sentences.push(
              `${initiatorName} steeples their fingers with keen scrutiny: "Pray attend to the particulars—every trifle points toward an inescapable deduction."`
            );
            break;
          case 'hemingway':
          default:
            sentences.push(
              `${initiatorName} looks across the table and speaks plainly: "Tell it straight and leave out the rest."`
            );
            break;
        }
      }
    } else {
      if (beat.revealedCardId && targetCard) {
        switch (archetype) {
          case 'chandler':
            sentences.push(
              `${targetName} lets out a slow ribbon of smoke and spills the truth: "${targetCard.canonicalFact}"`
            );
            break;
          case 'tolkien':
            sentences.push(
              `${targetName} bows their head in grave admission: "Hearken then, though heavy be the telling—${targetCard.canonicalFact}"`
            );
            break;
          case 'clarke':
            sentences.push(
              `${targetName} checks the diagnostic readout and states with lucid finality: "${targetCard.canonicalFact}"`
            );
            break;
          case 'lecarre':
            sentences.push(
              `${targetName} sighs over a cold teacup and concedes quietly: "Strictly between these walls, my dear fellow—${targetCard.canonicalFact}"`
            );
            break;
          case 'conandoyle':
            sentences.push(
              `${targetName} inclines their head as the last evasion collapses: "Your deduction is quite unassailable—${targetCard.canonicalFact}"`
            );
            break;
          case 'hemingway':
          default:
            sentences.push(
              `${targetName} looks down at the table and says it clean: "${targetCard.canonicalFact}"`
            );
            break;
        }
      } else {
        switch (beat.outcomeTier) {
          case 'CRITICAL_REVEAL':
            sentences.push(
              archetype === 'chandler'
                ? `${targetName} glances at the venetian blinds: "Keep your voice under your hat—what I know stays between us and the floorboards."`
                : archetype === 'tolkien'
                ? `${targetName} unclasps a warded scroll: "Pledge thy silence before this hearth, and what was hidden shall be spoken."`
                : archetype === 'clarke'
                ? `${targetName} keys a private channel override: "Log this off-network; the raw telemetry cannot leave this bulkhead."`
                : archetype === 'lecarre'
                ? `${targetName} lowers their spectacles: "If we keep this out of the registry minutes, I might illuminate a small housekeeping matter."`
                : archetype === 'conandoyle'
                ? `${targetName} draws the parlor latch: "Give me your word as a discreet observer, and I shall lay the singular facts before you."`
                : `${targetName} speaks low and steady: "I will tell you what happened, and it stays here between us."`
            );
            break;
          case 'PARTIAL_CONCESSION':
            sentences.push(
              archetype === 'chandler'
                ? `${targetName} taps the rim of a chipped glass: "You’re sniffing down the right wet alley, friend, even if you missed the license plate."`
                : archetype === 'tolkien'
                ? `${targetName} inclines their head gravely: "Not wholly errant is thy guess, yet deeper shadows lie beyond thy sight."`
                : archetype === 'clarke'
                ? `${targetName} nods with clinical restraint: "Your vector is partially consistent with the sensor logs, though one variable remains."`
                : archetype === 'lecarre'
                ? `${targetName} offers a thin mandarin smile: "You are warm, broadly speaking, though the committee’s paperwork is rather more nuanced."`
                : archetype === 'conandoyle'
                ? `${targetName} raises an eyebrow: "You have observed the surface clue astutely, yet the decisive link still eludes you."`
                : `${targetName} nods once: "Part of what you say is true, and the rest you do not have yet."`
            );
            break;
          case 'NEUTRAL_EXCHANGE':
            sentences.push(
              archetype === 'chandler'
                ? `${targetName} shrugs into a damp collar: "Everybody on this pier punches a clock, pal. Read the night blotter."`
                : archetype === 'tolkien'
                ? `${targetName} folds their hands in quiet custom: "Each warden keeps their appointed watch within these walls."`
                : archetype === 'clarke'
                ? `${targetName} replies with level composure: "Every section aboard maintains standard operational protocol until proven otherwise."`
                : archetype === 'lecarre'
                ? `${targetName} murmurs evenly: "Routine departmental procedure, I assure you—tedious, grey, and entirely above board."`
                : archetype === 'conandoyle'
                ? `${targetName} replies with parlor poise: "One attends to one’s customary duties, nothing more and nothing less."`
                : `${targetName} keeps their voice even: "Each of us had a post to keep, and I kept mine."`
            );
            break;
          case 'DEFLECTION':
            sentences.push(
              archetype === 'chandler'
                ? `${targetName} lets out a dry bark of a laugh: "You’re chasing harbor foghorns, shamus. Try another dock."`
                : archetype === 'tolkien'
                ? `${targetName} turns toward the dying embers: "Thou pursuest fleeting wraiths whilst graver counsels wait."`
                : archetype === 'clarke'
                ? `${targetName} dismisses the hypothesis calmly: "You are mistaking instrument noise for a signal; re-check the baseline calibration."`
                : archetype === 'lecarre'
                ? `${targetName} waves a hand gently: "Oh, purely an administrative muddle in registry—hardly worth waking the Directorate."`
                : archetype === 'conandoyle'
                ? `${targetName} shakes their head briskly: "A tempting conjecture, yet wholly unsupported by the physical evidence at hand."`
                : `${targetName} looks past them: "You are looking in the wrong place, and it will not take you anywhere."`
            );
            break;
          case 'HOSTILE_STONEWALL':
            sentences.push(
              archetype === 'chandler'
                ? `${targetName} stares across the desk like cold iron: "Take a walk. You don’t pry a syllable out of me without brass and a warrant."`
                : archetype === 'tolkien'
                ? `${targetName} draws upright in stern refusal: "Stay thy tongue—my house yields neither word nor fealty to threats."`
                : archetype === 'clarke'
                ? `${targetName} locks the terminal screen: "This inquiry exceeds your clearance. Conversation terminated."`
                : archetype === 'lecarre'
                ? `${targetName} closes the folder with icy courtesy: "I think this little chat has quite exhausted its usefulness. Good evening."`
                : archetype === 'conandoyle'
                ? `${targetName} rises stiffly from the armchair: "Your insinuation is intolerable; I bid you good night at once."`
                : `${targetName} sets their jaw and says nothing more: "We are done talking now."`
            );
            break;
        }
      }
    }
  }

  return sentences;
}

// --------------------------------------------------------------------------
// PROMPT E: Player Current Knowledge & Investigative Briefing
// --------------------------------------------------------------------------
export interface KnowledgeBriefingOutput {
  narrative: string;
  keyQuestions: string[];
}

export async function generatePlayerKnowledgeBriefing(
  scenarioTitle: string,
  scenarioPremise: string,
  playerSheet: CharacterSheet,
  knownCards: InfoCard[],
  knownGoals: Goal[],
  allCharacterNames: string[],
  voiceStyle?: SpeechStyle,
  readabilityLevel?: ReadabilityLevel
): Promise<KnowledgeBriefingOutput> {
  const cardsPayload = knownCards.map((c) => ({
    title: c.title,
    fact: c.canonicalFact,
    isSynthesizedConclusion: c.tier === 'COMPOSITE',
  }));

  const objectivesPayload = knownGoals.map((g) => g.veiledPrompt);
  const voiceBlock = buildVoiceInstruction(voiceStyle);
  const readabilityBlock = buildReadabilityInstruction(readabilityLevel);

  try {
    const raw = await callDeepSeekChat({
      systemInstruction: `You are an in-world intelligence narrator generating a personalized "Current Knowledge" briefing in second-person ("You...") for ${playerSheet.characterName} (${playerSheet.publicRole}) inside the simulation "${scenarioTitle}".

CRITICAL RULES:
1. Weave Scenario Background + Known Cards: Begin by grounding the player in the overarching scenario background/crisis, seamlessly weaving in their personal position (${playerSheet.privateNarrativeBio}) and EVERY factual detail they currently possess from their Known Cards. Write 2 to 3 atmospheric, cohesive paragraphs separated by "\\n\\n" rather than a dry bullet list.
2. Strict Epistemic Boundary: Use Scenario Premise ONLY for the public setting and inciting crisis. NEVER reveal or invent hidden culpability outside the player's Known Cards, and NEVER mention game mechanics, stats, probabilities, card IDs, or victory points.
3. Key Questions to Investigate: Formulate 3 to 5 sharp, intriguing open questions ("keyQuestions") highlighting unresolved mysteries, missing links, or anomalies that the player should inquire further about or press on during interrogations so they have a clear place to start or continue in the simulation.
4. DO NOT SPECIFY WHO TO QUESTION: In "keyQuestions", NEVER name, hint at, or specify which person, character (${allCharacterNames.join(', ')}), or role/title (e.g. Commander, Doctor, Engineer, Consultant, Operative) the player should question or interrogate. Frame every question strictly around WHAT happened, HOW a system or event unfolded, WHY an anomaly occurred, or WHAT evidence is missing.${voiceBlock}${readabilityBlock}

Output strictly valid JSON matching this exact structure:
{
  "narrative": "Paragraph 1...\\n\\nParagraph 2...",
  "keyQuestions": [
    "Open investigative question 1 (without naming who to question)...",
    "Open investigative question 2 (without naming who to question)...",
    "Open investigative question 3 (without naming who to question)..."
  ]
}`,
      userContent: `Scenario Title: ${scenarioTitle}
Voice Style: ${formatVoiceLabel(voiceStyle)}
Scenario Premise: ${scenarioPremise}
Player Character: ${playerSheet.characterName} (${playerSheet.publicRole})
Player Dossier: ${playerSheet.privateNarrativeBio}
Active Mystery Hooks: ${JSON.stringify(objectivesPayload)}
Known Intelligence Cards: ${JSON.stringify(cardsPayload, null, 2)}`,
      jsonMode: true,
    });

    if (raw) {
      const parsed = parseJsonContent<KnowledgeBriefingOutput>(raw);
      if (
        typeof parsed.narrative === 'string' &&
        parsed.narrative.trim().length > 0 &&
        Array.isArray(parsed.keyQuestions) &&
        parsed.keyQuestions.length > 0
      ) {
        return {
          narrative: parsed.narrative.trim(),
          keyQuestions: parsed.keyQuestions,
        };
      }
    }
  } catch (e) {
    console.warn('DeepSeek knowledge briefing failed, using fallback:', e);
  }

  // Deterministic fallback narrative & non-targeted investigative questions tailored to focal author
  const cardFactsProse =
    knownCards.length > 0
      ? knownCards.map((c) => c.canonicalFact).join(' ')
      : 'You hold no corroborated records yet.';

  const archetype = resolveAuthorToneArchetype(voiceStyle);

  let voiceIntro = '';
  let fallbackQuestions: string[] = [];

  switch (archetype) {
    case 'chandler':
      voiceIntro = `Trouble hangs over ${scenarioTitle} thicker than cigarette smoke under a low ceiling, and as ${playerSheet.characterName} (${playerSheet.publicRole}), your shoes are already ankle-deep in the puddle.`;
      fallbackQuestions = [
        'What crooked piece of clockwork tripped the main crisis while the lights were down?',
        'Where did the off-ledger paper trail go before somebody wiped the ink dry?',
        'What kind of contraband or dirty bargain is sitting behind those locked doors?',
        'Whose long shadow outside this room is paying the freight on tonight’s mess?',
      ];
      break;
    case 'tolkien':
      voiceIntro = `Shadow gathers upon ${scenarioTitle}, and as ${playerSheet.characterName} (${playerSheet.publicRole}), heavy is the watch laid upon thy shoulders in this hour of doubt.`;
      fallbackQuestions = [
        'By what unseen craft or broken ward was the central calamity set in motion?',
        'How do the unrecorded passages and missing tallies bind together the hidden design?',
        'What perilous relic or unspoken compact lies warded behind sealed chambers?',
        'What distant power beyond these halls stirs the discord now unfolding?',
      ];
      break;
    case 'clarke':
      voiceIntro = `Across ${scenarioTitle}, physical reality permits no contradiction; as ${playerSheet.characterName} (${playerSheet.publicRole}), you stand at the nexus of an anomaly whose parameters demand rigorous resolution.`;
      fallbackQuestions = [
        'What exact physical sequence or manual intervention initiated the primary system anomaly?',
        'How do unlogged telemetry gaps correlate with the missing operational records?',
        'What restricted payload or experimental apparatus accounts for the secondary sensor readings?',
        'Are external transmissions coordinating events along an unmonitored frequency?',
      ];
      break;
    case 'lecarre':
      voiceIntro = `There is an unmistakable chill in the corridors of ${scenarioTitle}, and as ${playerSheet.characterName} (${playerSheet.publicRole}), you know how untidy little operational seams can quietly bring down an entire house.`;
      fallbackQuestions = [
        'Which seemingly routine procedural lapse masked the opening move of this affair?',
        'How do the missing registry minutes align with off-the-books movements behind closed doors?',
        'What sensitive arrangement is being quietly protected under departmental seal?',
        'What unspoken directive from outside the room set these competing loyalties in motion?',
      ];
      break;
    case 'conandoyle':
      voiceIntro = `A singular web of circumstance envelops ${scenarioTitle}, and as ${playerSheet.characterName} (${playerSheet.publicRole}), every small discrepancy before you invites methodical deduction.`;
      fallbackQuestions = [
        'What precise physical mechanism or altered schedule precipitated the central incident?',
        'How do the curious omissions in the ledger account for the vanished evidence?',
        'What concealed enterprise explains the precautions taken behind locked doors?',
        'What unseen hand beyond these walls stands to profit from the present confusion?',
      ];
      break;
    case 'hemingway':
    default:
      voiceIntro = `It is quiet now across ${scenarioTitle}, and as ${playerSheet.characterName} (${playerSheet.publicRole}), you know where you stand and how little room there is for mistakes.`;
      fallbackQuestions = [
        'How was the main failure triggered and what tool or switch made it happen?',
        'Where do the missing entries in the record lead when put side by side?',
        'What is being kept out of sight behind the locked doors?',
        'What orders from outside this room started the trouble tonight?',
      ];
      break;
  }

  const fallbackNarrative = `${scenarioPremise}\n\n${voiceIntro} ${playerSheet.privateNarrativeBio}\n\nHere is what stands proved in front of you: ${cardFactsProse}`;

  return {
    narrative: fallbackNarrative,
    keyQuestions: fallbackQuestions,
  };
}

// --------------------------------------------------------------------------
// PROMPT F: Suggested Player Responses for Live Incoming Engagements
// --------------------------------------------------------------------------
export function buildFallbackSuggestedResponses(
  initiatorSheet: CharacterSheet,
  targetSheet: CharacterSheet,
  interactionType: InteractionType,
  shareableCards: InfoCard[],
  voiceStyle?: SpeechStyle
): SuggestedPlayerResponse[] {
  const shareableHint =
    shareableCards[0]?.title
      ? `regarding our ${shareableCards[0].title.toLowerCase()}`
      : 'on what stands verified so far';

  const archetype = resolveAuthorToneArchetype(voiceStyle);

  switch (archetype) {
    case 'chandler':
      return [
        {
          id: 'sug_coop',
          stanceLabel: 'Streetwise Bargain',
          responseText: `Put something solid on the blotter, ${initiatorSheet.characterName}, and maybe I’ll let you read the fine print ${shareableHint}.`,
        },
        {
          id: 'sug_cautious',
          stanceLabel: 'Wry Deflection',
          responseText: `Everybody’s nursing a bruised halo tonight, friend. Check the harbor clock before you start parking blame at my desk.`,
        },
        {
          id: 'sug_firm',
          stanceLabel: 'Hardboiled Pushback',
          responseText: `Save the brass-knuckle routine, ${initiatorSheet.characterName}. Where were your shoes drying when the lights went south?`,
        },
      ];

    case 'tolkien':
      return [
        {
          id: 'sug_coop',
          stanceLabel: 'Open-Handed Counsel',
          responseText: `Speak with plain truth, ${initiatorSheet.characterName}, and I shall match thy candor ${shareableHint}.`,
        },
        {
          id: 'sug_cautious',
          stanceLabel: 'Grave Reserve',
          responseText: `My watch has been kept without stain; weigh all signs across these halls ere thou castest shadow upon mine.`,
        },
        {
          id: 'sug_firm',
          stanceLabel: 'Stern Challenge',
          responseText: `Bold words beneath this roof, ${initiatorSheet.characterName}—by what right dost thou arraign ${targetSheet.publicRole}?`,
        },
      ];

    case 'clarke':
      return [
        {
          id: 'sug_coop',
          stanceLabel: 'Empirical Exchange',
          responseText: `Give me verifiable telemetry, ${initiatorSheet.characterName}, and I will cross-check our findings ${shareableHint}.`,
        },
        {
          id: 'sug_cautious',
          stanceLabel: 'Controlled Baseline',
          responseText: `Our instruments remain within nominal bounds; isolate the upstream variables before speculating on my sector.`,
        },
        {
          id: 'sug_firm',
          stanceLabel: 'Rigorous Counter-Query',
          responseText: `Conjecture solves nothing, ${initiatorSheet.characterName}. What anomaly in your own logs prompted this inquiry?`,
        },
      ];

    case 'lecarre':
      return [
        {
          id: 'sug_coop',
          stanceLabel: 'Quiet Reciprocity',
          responseText: `If we are comparing notes sensibly, ${initiatorSheet.characterName}, I might be persuaded to clarify one small point ${shareableHint}.`,
        },
        {
          id: 'sug_cautious',
          stanceLabel: 'Mandarin Courtesy',
          responseText: `Oh, purely routine housekeeping on our side of the corridor, my dear fellow—hardly the smoking gun you are hoping to file.`,
        },
        {
          id: 'sug_firm',
          stanceLabel: 'Velvet Counter-Thrust',
          responseText: `How touchingly thorough of you to ask, ${initiatorSheet.characterName}; shall we examine your own department’s unlogged quarter-hour first?`,
        },
      ];

    case 'conandoyle':
      return [
        {
          id: 'sug_coop',
          stanceLabel: 'Candid Deduction',
          responseText: `Lay your observations plainly before me, ${initiatorSheet.characterName}, and I shall compare particulars ${shareableHint}.`,
        },
        {
          id: 'sug_cautious',
          stanceLabel: 'Measured Decorum',
          responseText: `It is a capital mistake to theorize ahead of the data; pray examine the full chronology before drawing inferences.`,
        },
        {
          id: 'sug_firm',
          stanceLabel: 'Incisive Rejoinder',
          responseText: `A most singular question, ${initiatorSheet.characterName}—what curious trifle in your own movements brings you to my door?`,
        },
      ];

    case 'hemingway':
    default:
      if (interactionType === 'NEGOTIATE') {
        return [
          {
            id: 'sug_coop',
            stanceLabel: 'Plain Deal',
            responseText: `Put what you have on the table, ${initiatorSheet.characterName}, and I will tell you what I know ${shareableHint}.`,
          },
          {
            id: 'sug_cautious',
            stanceLabel: 'Steady Hold',
            responseText: `Show me what is true on your side first, and then we will see what there is to trade.`,
          },
          {
            id: 'sug_firm',
            stanceLabel: 'Clean Refusal',
            responseText: `I do not trade good facts for talk, ${initiatorSheet.characterName}. Bring something real.`,
          },
        ];
      }
      return [
        {
          id: 'sug_coop',
          stanceLabel: 'Plain & Direct',
          responseText: `Let us keep to what happened, ${initiatorSheet.characterName}. I can tell you what stands clear ${shareableHint}.`,
        },
        {
          id: 'sug_cautious',
          stanceLabel: 'Stoic Reserve',
          responseText: `We kept to our work here. Look at the whole record before you call it something else.`,
        },
        {
          id: 'sug_firm',
          stanceLabel: 'Direct Counter',
          responseText: `You ask hard questions, ${initiatorSheet.characterName}. Tell me where you were when it started.`,
        },
      ];
  }
}

export async function generateSuggestedResponses(
  scenarioTitle: string,
  initiatorSheet: CharacterSheet,
  targetSheet: CharacterSheet,
  interactionType: InteractionType,
  initiatorPrompt: string,
  targetKnownCards: InfoCard[],
  guardedCardIds: string[],
  shareableCardIds: string[],
  voiceStyle?: SpeechStyle
): Promise<SuggestedPlayerResponse[]> {
  const guardedSet = new Set(guardedCardIds);
  const shareableCards = targetKnownCards.filter(
    (c) => shareableCardIds.includes(c.id) && !guardedSet.has(c.id)
  );
  const nonGuardedFacts = targetKnownCards
    .filter((c) => !guardedSet.has(c.id))
    .map((c) => ({
      title: c.title,
      fact: c.canonicalFact,
      isShareable: shareableCardIds.includes(c.id),
    }));

  const fallback = buildFallbackSuggestedResponses(
    initiatorSheet,
    targetSheet,
    interactionType,
    shareableCards,
    voiceStyle
  );
  const voiceBlock = buildVoiceInstruction(voiceStyle);

  try {
    const raw = await callDeepSeekChat({
      systemInstruction: `You generate 3 distinct in-character response options for ${targetSheet.characterName} (${targetSheet.publicRole}) inside the simulation "${scenarioTitle}".
${initiatorSheet.characterName} (${initiatorSheet.publicRole}) has just initiated a ${interactionType} conversation saying: "${initiatorPrompt}".

Rules:
1. Write 3 natural, first-person spoken responses (1–2 sentences each) matching ${targetSheet.characterName}'s voice and traits (${targetSheet.coreTraits.join(', ')}):
   - Option 1 ("Measured & Cooperative"): Constructive, offers partial/reciprocal headway drawing only from non-guarded Shareable records without giving away guarded secrets.
   - Option 2 ("Cautious Deflection"): Stays poised, addresses the surface question while protecting sensitive operations.
   - Option 3 ("Firm Counter-Inquiry"): Asserts authority/skepticism and turns scrutiny back on ${initiatorSheet.characterName}.
2. NEVER reveal facts from Guarded records and NEVER mention game mechanics, cards, stats, or victory points.${voiceBlock}
3. Output strictly valid JSON matching:
{
  "suggestions": [
    { "id": "sug_1", "stanceLabel": "Measured & Cooperative", "responseText": "..." },
    { "id": "sug_2", "stanceLabel": "Cautious Deflection", "responseText": "..." },
    { "id": "sug_3", "stanceLabel": "Firm Counter-Inquiry", "responseText": "..." }
  ]
}`,
      userContent: `Scenario: ${scenarioTitle}
Voice Style: ${formatVoiceLabel(voiceStyle)}
Initiator: ${initiatorSheet.characterName} (${initiatorSheet.publicRole})
Approach: ${interactionType}
Opening Question/Statement: "${initiatorPrompt}"
Responder: ${targetSheet.characterName} (${targetSheet.publicRole})
Responder Bio: ${targetSheet.privateNarrativeBio}
Non-Guarded Known Records: ${JSON.stringify(nonGuardedFacts)}`,
      jsonMode: true,
      reasoningEffort: 'low',
    });

    if (raw) {
      const parsed = parseJsonContent<{ suggestions: SuggestedPlayerResponse[] }>(raw);
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length >= 2) {
        return parsed.suggestions.slice(0, 3).map((s, idx) => ({
          id: s.id || `sug_${idx + 1}`,
          stanceLabel: s.stanceLabel || fallback[idx]?.stanceLabel || 'In-Character Reply',
          responseText: s.responseText,
        }));
      }
    }
  } catch (e) {
    console.warn('DeepSeek suggested responses failed, using fallback:', e);
  }

  return fallback;
}

// --------------------------------------------------------------------------
// PROMPT G: Simulation-Integrity Mediated Player Response Dialogue Generator
// --------------------------------------------------------------------------
function sanitizeMetaLanguageForFallback(rawText: string, speakerRole: string): string {
  const cleaned = rawText
    .replace(/\b(info\s*cards?|cards?|victory\s*points?|vp|action\s*points?|rng|stats?|thresholds?|admin|dashboard)\b/gi, 'departmental records')
    .trim();
  if (!cleaned) {
    return `As ${speakerRole}, I stand by our verified operational logs.`;
  }
  return cleaned;
}

export async function mediatePlayerResponseDialogue(
  scenarioTitle: string,
  initiatorSheet: CharacterSheet,
  targetSheet: CharacterSheet,
  interactionType: InteractionType,
  initiatorPrompt: string,
  playerResponseText: string,
  responseMode: InteractionResponseMode,
  beats: SentenceBeat[],
  targetKnownCards: InfoCard[],
  guardedCards: InfoCard[],
  revealedCardToInitiator?: InfoCard,
  reciprocalCardToTarget?: InfoCard,
  voiceStyle?: SpeechStyle
): Promise<string[]> {
  const n = beats.length;
  const beatsTrajectoryJson = JSON.stringify(
    beats.map((b) => ({
      index: b.sentenceIndex,
      speaker:
        b.sentenceIndex % 2 === 1
          ? initiatorSheet.characterName
          : targetSheet.characterName,
      outcomeTier: b.outcomeTier,
      revealsCard: !!b.revealedCardId,
    }))
  );

  const allowedTargetFacts = targetKnownCards
    .filter((c) => !guardedCards.some((g) => g.id === c.id))
    .map((c) => c.canonicalFact);
  const guardedFacts = guardedCards.map((c) => c.canonicalFact);
  const targetCardFact =
    revealedCardToInitiator?.canonicalFact ?? 'No confidential card transferred';
  const reciprocalFact =
    reciprocalCardToTarget?.canonicalFact ?? 'No reciprocal card transferred';
  const voiceBlock = buildVoiceInstruction(voiceStyle);

  try {
    const raw = await callDeepSeekChat({
      systemInstruction: `You are the narrative integrity mediator for the simulation "${scenarioTitle}".
Generate an exact ${n}-sentence dialogue exchange between ${initiatorSheet.characterName} (${initiatorSheet.publicRole}, Initiator using ${interactionType}) and ${targetSheet.characterName} (${targetSheet.publicRole}, Active Responder).

The active human player controlling ${targetSheet.characterName} submitted this ${
        responseMode === 'PLAYER_DIRECT' ? 'direct custom response' : 'selected response'
      }:
"${playerResponseText}"

CRITICAL SIMULATION INTEGRITY RULES:
1. Preserve Player Intent While Enforcing In-World Integrity: Incorporate the core intent, tone, and argument of ${targetSheet.characterName}'s submitted response, BUT modify casual phrasing, modern slang, out-of-character remarks, or meta-gaming terms (cards, points, UI, rules) into seamless, authentic in-universe dialogue fitting ${targetSheet.characterName} (${targetSheet.coreTraits.join(', ')}).
2. Epistemic & Canonical Integrity:
   - ${targetSheet.characterName} only possesses these non-guarded facts: ${JSON.stringify(allowedTargetFacts)}. If the player invented unsupported lore not in their possession, reframe those details as unverified speculation or guarded deflection so canonical truth is never corrupted.
   - NEVER reveal any fact from ${targetSheet.characterName}'s Guarded records: ${JSON.stringify(guardedFacts)}.
3. Mechanical Beat Trajectory: Follow this exact ${n}-beat sequence:
${beatsTrajectoryJson}
   - Odd sentences (except final resolution if needed) reflect ${initiatorSheet.characterName}'s opening ("${initiatorPrompt}") and follow-up pressure${
        reciprocalCardToTarget
          ? ` (including reciprocating with: "${reciprocalFact}")`
          : ''
      }.
   - Even sentences and the final resolution weave ${targetSheet.characterName}'s mediated response.
   - ONLY reveal the transferred canonical fact ("${targetCardFact}") if a beat has revealsCard: true. If no beat has revealsCard: true, ensure ${targetSheet.characterName} withholds unshared confidential secrets even if the player typed them directly!${voiceBlock}

Output strictly valid JSON:
{
  "sentences": ["sentence 1", "sentence 2", ...]
}
with an array of exactly ${n} strings.`,
      userContent: `Voice Style: ${formatVoiceLabel(voiceStyle)}
Initiator: ${initiatorSheet.characterName}
Approach: ${interactionType}
Initiator Opening: "${initiatorPrompt}"
Active Responder: ${targetSheet.characterName}
Submitted Player Response (${responseMode}): "${playerResponseText}"
Sentence Count: ${n}
Beats Trajectory: ${beatsTrajectoryJson}
Transferred Fact to Initiator: "${targetCardFact}"
Reciprocal Fact to Responder: "${reciprocalFact}"`,
      jsonMode: true,
      reasoningEffort: 'low',
    });

    if (raw) {
      const parsed = parseJsonContent<{ sentences: string[] }>(raw);
      if (Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
        return parsed.sentences;
      }
    }
  } catch (e) {
    console.warn('DeepSeek mediated player dialogue failed, using integrity fallback:', e);
  }

  // Deterministic integrity-preserving fallback weaver tailored to focal author
  const sanitizedReply = sanitizeMetaLanguageForFallback(
    playerResponseText,
    targetSheet.publicRole
  );
  const archetype = resolveAuthorToneArchetype(voiceStyle);
  const sentences: string[] = [];

  for (let i = 0; i < n; i++) {
    const beat = beats[i];
    const isOdd = beat.sentenceIndex % 2 === 1;
    const isLast = i === n - 1;

    if (isOdd && !isLast) {
      if (i === 0) {
        sentences.push(`${initiatorSheet.characterName}: "${initiatorPrompt}"`);
      } else if (reciprocalCardToTarget && i === 2) {
        sentences.push(
          archetype === 'chandler'
            ? `${initiatorSheet.characterName} slides an ace from under their cuff: "${reciprocalCardToTarget.canonicalFact}"`
            : archetype === 'tolkien'
            ? `${initiatorSheet.characterName} offers sworn truth in token of good faith: "${reciprocalCardToTarget.canonicalFact}"`
            : archetype === 'lecarre'
            ? `${initiatorSheet.characterName} murmurs across the blotter by way of quiet quid pro quo: "${reciprocalCardToTarget.canonicalFact}"`
            : `${initiatorSheet.characterName} lowers their voice and sets a fact on the table: "${reciprocalCardToTarget.canonicalFact}"`
        );
      } else {
        sentences.push(
          archetype === 'chandler'
            ? `${initiatorSheet.characterName} narrows their eyes through the haze, waiting for the rest of the tune.`
            : archetype === 'tolkien'
            ? `${initiatorSheet.characterName} weighs the spoken counsel with grave stillness.`
            : archetype === 'clarke'
            ? `${initiatorSheet.characterName} cross-checks the statement against known operational parameters.`
            : archetype === 'lecarre'
            ? `${initiatorSheet.characterName} lets a polite, expectant silence settle across the room.`
            : archetype === 'conandoyle'
            ? `${initiatorSheet.characterName} inclines their head sharply, testing the consistency of the account.`
            : `${initiatorSheet.characterName} waits across the table and presses for the rest.`
        );
      }
    } else {
      if (beat.revealedCardId && revealedCardToInitiator) {
        sentences.push(
          archetype === 'chandler'
            ? `${targetSheet.characterName} exhales slowly: "${sanitizedReply} And if you want the brass tacks—${revealedCardToInitiator.canonicalFact}"`
            : archetype === 'tolkien'
            ? `${targetSheet.characterName} answers with solemn candor: "${sanitizedReply} Hear also what stands attested—${revealedCardToInitiator.canonicalFact}"`
            : archetype === 'lecarre'
            ? `${targetSheet.characterName} folds their hands and concedes softly: "${sanitizedReply} Strictly off the minutes, ${revealedCardToInitiator.canonicalFact}"`
            : `${targetSheet.characterName} answers evenly: "${sanitizedReply} What stands confirmed is this—${revealedCardToInitiator.canonicalFact}"`
        );
      } else if (i === 1) {
        sentences.push(`${targetSheet.characterName}: "${sanitizedReply}"`);
      } else {
        sentences.push(
          archetype === 'chandler'
            ? `${targetSheet.characterName} buttons their coat and keeps the rest locked behind their teeth.`
            : archetype === 'tolkien'
            ? `${targetSheet.characterName} keeps their sworn counsel sealed, yielding naught further.`
            : archetype === 'clarke'
            ? `${targetSheet.characterName} holds strictly to ${targetSheet.publicRole} protocol, leaving restricted files sealed.`
            : archetype === 'lecarre'
            ? `${targetSheet.characterName} offers a courteous nod and says nothing more that could find its way into a report.`
            : archetype === 'conandoyle'
            ? `${targetSheet.characterName} composes their features with Victorian discretion, keeping private papers under lock.`
            : `${targetSheet.characterName} says no more and keeps the rest to themselves.`
        );
      }
    }
  }

  return sentences;
}

// --------------------------------------------------------------------------
// Fallback Compiler (Scaled to Complexity Tier)
// --------------------------------------------------------------------------
function generateFallbackCompilation(
  _masterNarrative: string,
  characterNames: string[],
  complexityTier: SimulationComplexityTier = 'STANDARD'
): CompilerOutputSchema {
  const c0 = characterNames[0] || 'Vance';
  const c1 = characterNames[1] || 'Thorne';
  const c2 = characterNames[2] || 'Kael';
  const c3 = characterNames[3] || 'Nyx';

  const cards: AtomizerCardOutput[] = [
    {
      id: 'card_docking_records',
      title: 'Unregistered Freighter Docking Log',
      canonicalFact: 'An unregistered transport docked at Bay 4 without customs clearance.',
      subjectCharacterNames: [c0],
      topicTags: ['DOCKING', 'SMUGGLING'],
      secrecy: 'MEDIUM',
      assignedCharacterName: c0,
    },
    {
      id: 'card_shadow_transmission',
      title: 'Encrypted Burst Transmission',
      canonicalFact: 'A directional burst transmission was beamed toward Syndicate coordinates.',
      subjectCharacterNames: [c0],
      topicTags: ['COMMS', 'SYNDICATE'],
      secrecy: 'HIGH',
      assignedCharacterName: c0,
    },
    {
      id: 'card_vance_log',
      title: 'Executive Audio Diary',
      canonicalFact: 'Command received covert funds to ignore off-manifest transfers.',
      subjectCharacterNames: [c0],
      topicTags: ['CORRUPTION'],
      secrecy: 'CRITICAL',
      assignedCharacterName: c0,
    },
    {
      id: 'card_bioweapon_manifest',
      title: 'Specimen X-99 Pathogen Manifest',
      canonicalFact: 'Sub-deck 9 lab houses experimental pathogen specimen X-99.',
      subjectCharacterNames: [c1],
      topicTags: ['BIOWEAPON', 'RESEARCH'],
      secrecy: 'CRITICAL',
      assignedCharacterName: c1,
    },
    {
      id: 'card_research_notes',
      title: 'Cryogenic Stability Notes',
      canonicalFact: 'Specimen X-99 requires specialized low-temp coolant to prevent aerosol release.',
      subjectCharacterNames: [c1],
      topicTags: ['COOLANT', 'LAB'],
      secrecy: 'MEDIUM',
      assignedCharacterName: c1,
    },
    {
      id: 'card_bribe_ledger',
      title: 'Discretionary Account Ledger',
      canonicalFact: 'Science sub-budgets were siphoned into covert accounts.',
      subjectCharacterNames: [c1],
      topicTags: ['FINANCE'],
      secrecy: 'HIGH',
      assignedCharacterName: c1,
    },
    {
      id: 'card_coolant_schematic',
      title: 'Coolant Flow Bypass Schematic',
      canonicalFact: 'Valve 4B was manually adjusted to starve primary reactor coolant pumps.',
      subjectCharacterNames: [c2],
      topicTags: ['REACTOR', 'COOLANT'],
      secrecy: 'LOW',
      assignedCharacterName: c2,
    },
    {
      id: 'card_reactor_override',
      title: 'Reactor Emergency Override Keycode',
      canonicalFact: 'The safety shutdown was disabled using a master engineer override.',
      subjectCharacterNames: [c2],
      topicTags: ['REACTOR', 'OVERRIDE'],
      secrecy: 'HIGH',
      assignedCharacterName: c2,
    },
    {
      id: 'card_cargo_manifest',
      title: 'Tampered Heavy Cargo Manifest',
      canonicalFact: 'Containers marked hydroponics actually contained centrifuges.',
      subjectCharacterNames: [c2],
      topicTags: ['CARGO'],
      secrecy: 'MEDIUM',
      assignedCharacterName: c2,
    },
    {
      id: 'card_covert_orders',
      title: 'Syndicate Directive #77',
      canonicalFact: 'Orders were given to sabotage coolant loop to force station evacuation.',
      subjectCharacterNames: [c3],
      topicTags: ['ORDERS', 'SYNDICATE'],
      secrecy: 'CRITICAL',
      assignedCharacterName: c3,
    },
    {
      id: 'card_cipher_key',
      title: 'Cryptographic Sub-Pad',
      canonicalFact: 'Hardware pad allows decryption of station-wide secure channels.',
      subjectCharacterNames: [c3],
      topicTags: ['SECURITY', 'CIPHER'],
      secrecy: 'HIGH',
      assignedCharacterName: c3,
    },
    {
      id: 'card_quarantine_breach',
      title: 'Sub-Deck 9 Filtration Alert',
      canonicalFact: 'Volatile biological solvent signatures detected in air filtration.',
      subjectCharacterNames: [c3],
      topicTags: ['ALERT'],
      secrecy: 'MEDIUM',
      assignedCharacterName: c3,
    },
  ];

  const goals: AtomizerGoalOutput[] = [
    {
      id: 'goal_1',
      assignedCharacterName: c3,
      veiledPrompt: 'Uncover the physical mechanics behind the reactor coolant drop.',
      requiredCardIds: ['card_coolant_schematic', 'card_docking_records', 'card_reactor_override'],
      baseVpValue: 1000,
      decayMultipliers: [1.0, 0.6, 0.3],
      synthesizedCardTemplate: {
        title: 'Conclusive Dossier: Reactor Sabotage Blueprint',
        canonicalFactSummary: 'Coolant failure was deliberate sabotage coordinated with docking smugglers.',
        secrecy: 'HIGH',
      },
    },
    {
      id: 'goal_2',
      assignedCharacterName: c0,
      veiledPrompt: 'Investigate biological containment rumors on sub-deck 9.',
      requiredCardIds: ['card_bioweapon_manifest', 'card_research_notes', 'card_quarantine_breach'],
      baseVpValue: 1000,
      decayMultipliers: [1.0, 0.6, 0.3],
      synthesizedCardTemplate: {
        title: 'Conclusive Dossier: Station Bioweapon Synthesis',
        canonicalFactSummary: 'Covert pathogen specimen X-99 was being synthesized in sub-deck 9.',
        secrecy: 'CRITICAL',
      },
    },
    {
      id: 'goal_3',
      assignedCharacterName: c1,
      veiledPrompt: 'Identify the external syndicate operative and intercept their transmission.',
      requiredCardIds: ['card_covert_orders', 'card_cipher_key', 'card_shadow_transmission'],
      baseVpValue: 1000,
      decayMultipliers: [1.0, 0.6, 0.3],
      synthesizedCardTemplate: {
        title: 'Conclusive Dossier: The Syndicate Mole',
        canonicalFactSummary: 'Operative was dispatched by Orion Syndicate to extract telemetry.',
        secrecy: 'CRITICAL',
      },
    },
    {
      id: 'goal_4',
      assignedCharacterName: c2,
      veiledPrompt: 'Find evidence of illicit kickbacks behind illegal cargo deliveries.',
      requiredCardIds: ['card_vance_log', 'card_bribe_ledger', 'card_cargo_manifest'],
      baseVpValue: 1000,
      decayMultipliers: [1.0, 0.6, 0.3],
      synthesizedCardTemplate: {
        title: 'Conclusive Dossier: Station Command Extortion Ring',
        canonicalFactSummary: 'Command accepted bribes to cover up centrifuge smuggling.',
        secrecy: 'HIGH',
      },
    },
  ];

  // Expand clue web & secondary objectives when creator pays Sims for ELEVATED or LABYRINTHINE complexity
  if (complexityTier === 'ELEVATED' || complexityTier === 'LABYRINTHINE') {
    cards.push(
      {
        id: 'card_airlock_biometrics',
        title: 'Airlock 7 Biometric Override',
        canonicalFact: 'Airlock 7 biometric history was purged using an executive clearance token.',
        subjectCharacterNames: [c0],
        topicTags: ['AIRLOCK', 'SECURITY'],
        secrecy: 'HIGH',
        assignedCharacterName: c0,
      },
      {
        id: 'card_centrifuge_serials',
        title: 'Scrubbed Centrifuge Serial Plates',
        canonicalFact: 'Serial plates removed from sub-deck centrifuges match defense contractor batch #441.',
        subjectCharacterNames: [c1],
        topicTags: ['LAB', 'CARGO'],
        secrecy: 'HIGH',
        assignedCharacterName: c1,
      },
      {
        id: 'card_subspace_relay_tap',
        title: 'Relay Junction Shunt Wire',
        canonicalFact: 'A physical copper shunt inside Relay Junction C mirrors command traffic to an external beacon.',
        subjectCharacterNames: [c2],
        topicTags: ['COMMS', 'RELAY'],
        secrecy: 'HIGH',
        assignedCharacterName: c2,
      },
      {
        id: 'card_evac_pod_reservation',
        title: 'Locked Escape Pod Pre-Flight',
        canonicalFact: 'Escape Pod B-2 was pre-fueled and locked to two unregistered transponder keys.',
        subjectCharacterNames: [c3],
        topicTags: ['EVAC', 'ESCAPE'],
        secrecy: 'HIGH',
        assignedCharacterName: c3,
      }
    );

    goals.push(
      {
        id: 'goal_5_elevated',
        assignedCharacterName: c0,
        veiledPrompt: 'Trace how external conspirators planned to exfiltrate personnel during evacuation.',
        requiredCardIds: ['card_centrifuge_serials', 'card_subspace_relay_tap', 'card_evac_pod_reservation'],
        baseVpValue: 1200,
        decayMultipliers: [1.0, 0.65, 0.35],
        synthesizedCardTemplate: {
          title: 'Conclusive Dossier: Covert Exfiltration Protocol',
          canonicalFactSummary: 'A relay tap and pre-locked escape pod were staged to extract contractor hardware.',
          secrecy: 'CRITICAL',
        },
      },
      {
        id: 'goal_6_elevated',
        assignedCharacterName: c1,
        veiledPrompt: 'Reconstruct how banned contractor hardware bypassed customs and airlock logs.',
        requiredCardIds: ['card_airlock_biometrics', 'card_cargo_manifest', 'card_evac_pod_reservation'],
        baseVpValue: 1200,
        decayMultipliers: [1.0, 0.65, 0.35],
        synthesizedCardTemplate: {
          title: 'Conclusive Dossier: Airlock Smuggling Chain',
          canonicalFactSummary: 'Purged airlock biometrics and falsified cargo manifests masked contractor deliveries.',
          secrecy: 'HIGH',
        },
      },
      {
        id: 'goal_7_elevated',
        assignedCharacterName: c2,
        veiledPrompt: 'Expose who tapped the communications array to coordinate the quarantine crisis.',
        requiredCardIds: ['card_airlock_biometrics', 'card_centrifuge_serials', 'card_cipher_key'],
        baseVpValue: 1200,
        decayMultipliers: [1.0, 0.65, 0.35],
        synthesizedCardTemplate: {
          title: 'Conclusive Dossier: Encrypted Relay Conspiracy',
          canonicalFactSummary: 'Cipher keys and purged clearances linked lab equipment to off-station handlers.',
          secrecy: 'CRITICAL',
        },
      },
      {
        id: 'goal_8_elevated',
        assignedCharacterName: c3,
        veiledPrompt: 'Prove the financial and technical trail linking reactor tampering to lab procurement.',
        requiredCardIds: ['card_vance_log', 'card_bribe_ledger', 'card_subspace_relay_tap'],
        baseVpValue: 1200,
        decayMultipliers: [1.0, 0.65, 0.35],
        synthesizedCardTemplate: {
          title: 'Conclusive Dossier: Deep-Station Payoff Network',
          canonicalFactSummary: 'Discretionary payoffs funded both executive silence and relay tampering.',
          secrecy: 'CRITICAL',
        },
      }
    );
  }

  if (complexityTier === 'LABYRINTHINE') {
    cards.push(
      {
        id: 'card_tribunal_seal',
        title: 'Sealed Colonial Warrant',
        canonicalFact: 'A dormant colonial warrant authorizes seizure of the facility if containment fails.',
        subjectCharacterNames: [c0],
        topicTags: ['WARRANT', 'COMMAND'],
        secrecy: 'CRITICAL',
        assignedCharacterName: c0,
      },
      {
        id: 'card_antidote_vial',
        title: 'Single-Dose Counteragent Inventory',
        canonicalFact: 'Only two stabilization ampoules exist for Specimen X-99 in cold storage.',
        subjectCharacterNames: [c1],
        topicTags: ['ANTIDOTE', 'BIOWEAPON'],
        secrecy: 'CRITICAL',
        assignedCharacterName: c1,
      },
      {
        id: 'card_hull_charge_timer',
        title: 'Bulkhead Micro-Charge Telemetry',
        canonicalFact: 'Diagnostic sensors show unpowered micro-charges wired along Sub-Deck 9 Junction.',
        subjectCharacterNames: [c2],
        topicTags: ['SABOTAGE', 'BULKHEAD'],
        secrecy: 'CRITICAL',
        assignedCharacterName: c2,
      },
      {
        id: 'card_double_agent_dossier',
        title: 'Burned Handler Identity File',
        canonicalFact: 'The external handler financing the operation is secretly working for Colonial Intelligence.',
        subjectCharacterNames: [c3],
        topicTags: ['INTEL', 'HANDLER'],
        secrecy: 'CRITICAL',
        assignedCharacterName: c3,
      }
    );

    // Enrich secondary goals to 4 required cards each in Labyrinthine mode
    goals[4].requiredCardIds.push('card_double_agent_dossier');
    goals[5].requiredCardIds.push('card_hull_charge_timer');
    goals[6].requiredCardIds.push('card_antidote_vial');
    goals[7].requiredCardIds.push('card_tribunal_seal');
  }

  return { cards, goals };
}
