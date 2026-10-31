import { GoogleGenAI, Type } from '@google/genai';
import {
  CharacterSheet,
  Goal,
  InfoCard,
  InteractionType,
  SecrecyLevel,
  SentenceBeat,
  StatVector,
} from '../types/simulation';

let customApiKey: string | null = null;

export function setGeminiApiKey(key: string): void {
  customApiKey = key;
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('SIM_CREATOR_GEMINI_KEY', key);
  }
}

export function getGeminiApiKey(): string | null {
  if (customApiKey) return customApiKey;
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem('SIM_CREATOR_GEMINI_KEY');
    if (saved) return saved;
  }
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  return null;
}

function getGenAI(): GoogleGenAI | null {
  const key = getGeminiApiKey();
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
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

export async function atomizeMasterNarrative(
  masterNarrative: string,
  characterNames: string[]
): Promise<CompilerOutputSchema> {
  const ai = getGenAI();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Deconstruct this Master Narrative for characters [${characterNames.join(', ')}]:\n\n${masterNarrative}`,
        config: {
          systemInstruction:
            'You are a narrative graph compiler. Deconstruct the provided Master Narrative into between 12 and 24 discrete, atomic factual statements (ATOMIC InfoCards). Then construct 1 to 2 Goals per character where each Goal requires combining 3 to 4 InfoCards. Write a veiledPrompt for each Goal that frames an open question or mystery for the player without revealing the answer. Output strictly valid JSON matching CompilerOutputSchema.',
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: Type.OBJECT,
            properties: {
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    canonicalFact: { type: Type.STRING },
                    subjectCharacterNames: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    topicTags: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    secrecy: {
                      type: Type.STRING,
                      enum: ['PUBLIC', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
                    },
                    assignedCharacterName: { type: Type.STRING },
                  },
                  required: [
                    'id',
                    'title',
                    'canonicalFact',
                    'subjectCharacterNames',
                    'topicTags',
                    'secrecy',
                    'assignedCharacterName',
                  ],
                },
              },
              goals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    assignedCharacterName: { type: Type.STRING },
                    veiledPrompt: { type: Type.STRING },
                    requiredCardIds: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    baseVpValue: { type: Type.NUMBER },
                    decayMultipliers: {
                      type: Type.ARRAY,
                      items: { type: Type.NUMBER },
                    },
                    synthesizedCardTemplate: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        canonicalFactSummary: { type: Type.STRING },
                        secrecy: {
                          type: Type.STRING,
                          enum: ['PUBLIC', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
                        },
                      },
                      required: ['title', 'canonicalFactSummary', 'secrecy'],
                    },
                  },
                  required: [
                    'id',
                    'assignedCharacterName',
                    'veiledPrompt',
                    'requiredCardIds',
                    'baseVpValue',
                    'decayMultipliers',
                    'synthesizedCardTemplate',
                  ],
                },
              },
            },
            required: ['cards', 'goals'],
          },
        },
      });

      if (response.text) {
        return JSON.parse(response.text) as CompilerOutputSchema;
      }
    } catch (e) {
      console.warn('Gemini API call failed, falling back to deterministic synthesizer:', e);
    }
  }

  // High-fidelity fallback synthesizer
  return generateFallbackCompilation(masterNarrative, characterNames);
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
  hiddenStats: StatVector
): Promise<string> {
  const qualitativeStatSummary = describeQualitativeStats(hiddenStats);
  const assignedCardsJson = JSON.stringify(
    assignedCards.map((c) => ({ title: c.title, fact: c.canonicalFact, secrecy: c.secrecy }))
  );

  const ai = getGenAI();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Character: ${characterName}\nAssigned Cards: ${assignedCardsJson}\nQualitative Strengths/Weaknesses: ${qualitativeStatSummary}`,
        config: {
          systemInstruction: `Generate a second-person private character dossier (privateNarrativeBio) for ${characterName}. You may ONLY incorporate facts from the following assigned starting InfoCards: ${assignedCardsJson}. Subtlely weave qualitative descriptions of their strengths and weaknesses based on hiddenStats: ${qualitativeStatSummary} (NEVER output numbers, percentages, or stat names). Fill in minimal bridging prose.`,
        },
      });
      if (response.text) {
        return response.text.trim();
      }
    } catch (e) {
      console.warn('Gemini weave failed, using fallback:', e);
    }
  }

  // Deterministic fallback weaver
  return `You are ${characterName}. ${qualitativeStatSummary.charAt(0).toUpperCase() + qualitativeStatSummary.slice(1)}. You hold knowledge of: ${assignedCards.map((c) => c.title).join(', ')}. Keep your agenda close and verify every claim before offering concessions.`;
}

export async function reconcileDossiers(
  dossiers: Record<string, string>,
  canonicalCards: InfoCard[]
): Promise<Record<string, string>> {
  const ai = getGenAI();
  if (ai) {
    try {
      const canonicalFacts = canonicalCards.map((c) => c.canonicalFact).join('\n- ');
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Dossiers:\n${JSON.stringify(dossiers, null, 2)}\n\nCanonical Card Facts:\n- ${canonicalFacts}`,
        config: {
          systemInstruction:
            'Inspect all generated character dossiers against the canonical InfoCard list. Identify any bridging prose that contradicts a canonical card or creates an impossible timeline collision. Rewrite only the conflicting sentences so all dossiers are 100% mutually consistent. Output strictly JSON mapping characterId to reconciled dossier string.',
          responseMimeType: 'application/json',
        },
      });
      if (response.text) {
        return JSON.parse(response.text);
      }
    } catch (e) {
      console.warn('Gemini reconciler failed, keeping raw dossiers:', e);
    }
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
  const ai = getGenAI();
  if (ai) {
    try {
      const knownCardTitles = knownCards.map((c) => c.title);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Character: ${playerSheet.characterName}\nCore Traits: ${playerSheet.coreTraits.join(', ')}\nCore Motives: ${playerSheet.coreMotives.join(', ')}\nKnown Cards: ${knownCardTitles.join(', ')}\nProposed Input: "${proposedInput}"`,
        config: {
          systemInstruction:
            'Evaluate the player\'s proposed interaction input against their coreTraits, coreMotives, and currently known InfoCards. Return a JSON object with authenticityScore (float between -0.15 and +0.20) and a 1-sentence authenticityReasoning. Reward shrewdness, in-character voice, and strategic leverage of known facts. Penalize meta-gaming, out-of-character pleading, or referencing facts not in their knownCardTitles.',
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: Type.OBJECT,
            properties: {
              authenticityScore: {
                type: Type.NUMBER,
                description: 'Float between -0.15 and +0.20',
              },
              authenticityReasoning: {
                type: Type.STRING,
                description: 'Single concise sentence explaining the score.',
              },
            },
            required: ['authenticityScore', 'authenticityReasoning'],
          },
        },
      });
      if (response.text) {
        const parsed = JSON.parse(response.text) as AuthenticityClassification;
        return {
          authenticityScore: Math.max(-0.15, Math.min(0.2, parsed.authenticityScore)),
          authenticityReasoning: parsed.authenticityReasoning,
        };
      }
    } catch (e) {
      console.warn('Gemini authenticity classifier failed, using heuristic:', e);
    }
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
  targetCard?: InfoCard
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

  const ai = getGenAI();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Initiator: ${initiatorName}\nApproach: ${interactionType}\nInitiator Opening: "${initiatorPrompt}"\nTarget: ${targetName}\nSentence Count: ${n}\nBeats Trajectory:\n${beatsTrajectoryJson}\nTarget Card Fact: "${targetCardFact}"`,
        config: {
          systemInstruction: `Generate an exact ${n}-sentence dialogue exchange between ${initiatorName} (Initiator, approach: ${interactionType}) and ${targetName} (Target).
You MUST follow this pre-rolled mathematical trajectory sentence-by-sentence:
${beatsTrajectoryJson}
Rules:
Output exactly ${n} sentences in a JSON array sentences: string[].
Odd sentences are spoken by ${initiatorName} or describe their immediate pressure; even sentences are ${targetName}'s response, EXCEPT the final sentence ${n} which must deliver the resolution of the exchange.
Only reveal the canonical fact of targetCard (${targetCardFact}) on the specific sentence index marked revealedCardId != null. If no beat has revealedCardId, ${targetName} must successfully withhold the secret while matching the tone of each outcomeTier.`,
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: Type.OBJECT,
            properties: {
              sentences: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['sentences'],
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text) as { sentences: string[] };
        if (parsed.sentences && parsed.sentences.length > 0) {
          return parsed.sentences;
        }
      }
    } catch (e) {
      console.warn('Gemini dialogue generator failed, using narrative generator:', e);
    }
  }

  // Fallback narrative dialogue generator
  const sentences: string[] = [];
  for (let i = 0; i < n; i++) {
    const beat = beats[i];
    const isOdd = beat.sentenceIndex % 2 === 1;
    const isLast = i === n - 1;

    if (isOdd && !isLast) {
      if (i === 0) {
        sentences.push(`${initiatorName}: "${initiatorPrompt}"`);
      } else {
        sentences.push(
          `${initiatorName} presses further, narrowing their eyes as they demand accountability.`
        );
      }
    } else {
      if (beat.revealedCardId && targetCard) {
        sentences.push(
          `${targetName} hesitates under the relentless pressure and admits: "${targetCard.canonicalFact}"`
        );
      } else {
        switch (beat.outcomeTier) {
          case 'CRITICAL_REVEAL':
            sentences.push(
              `${targetName} breaks their silence: "I will tell you what you need to know, but this never leaves this room."`
            );
            break;
          case 'PARTIAL_CONCESSION':
            sentences.push(
              `${targetName} offers a measured concession: "There are details you do not yet grasp, but your suspicion is not unfounded."`
            );
            break;
          case 'NEUTRAL_EXCHANGE':
            sentences.push(
              `${targetName} responds with steady caution: "Everyone on this deck has their designated duties."`
            );
            break;
          case 'DEFLECTION':
            sentences.push(
              `${targetName} glances away dismissively: "You are chasing ghosts; check the station registry if you want answers."`
            );
            break;
          case 'HOSTILE_STONEWALL':
            sentences.push(
              `${targetName} locks eyes in cold refusal: "I have nothing to say to you. Dismissed."`
            );
            break;
        }
      }
    }
  }

  return sentences;
}

// --------------------------------------------------------------------------
// Fallback Compiler
// --------------------------------------------------------------------------
function generateFallbackCompilation(
  masterNarrative: string,
  characterNames: string[]
): CompilerOutputSchema {
  const cards: AtomizerCardOutput[] = [
    {
      id: 'card_docking_records',
      title: 'Unregistered Freighter Docking Log',
      canonicalFact: 'An unregistered transport docked at Bay 4 without customs clearance.',
      subjectCharacterNames: [characterNames[0] || 'Vance'],
      topicTags: ['DOCKING', 'SMUGGLING'],
      secrecy: 'MEDIUM',
      assignedCharacterName: characterNames[0] || 'Vance',
    },
    {
      id: 'card_shadow_transmission',
      title: 'Encrypted Burst Transmission',
      canonicalFact: 'A directional burst transmission was beamed toward Syndicate coordinates.',
      subjectCharacterNames: [characterNames[0] || 'Vance'],
      topicTags: ['COMMS', 'SYNDICATE'],
      secrecy: 'HIGH',
      assignedCharacterName: characterNames[0] || 'Vance',
    },
    {
      id: 'card_vance_log',
      title: 'Executive Audio Diary',
      canonicalFact: 'Command received covert funds to ignore off-manifest transfers.',
      subjectCharacterNames: [characterNames[0] || 'Vance'],
      topicTags: ['CORRUPTION'],
      secrecy: 'CRITICAL',
      assignedCharacterName: characterNames[0] || 'Vance',
    },
    {
      id: 'card_bioweapon_manifest',
      title: 'Specimen X-99 Pathogen Manifest',
      canonicalFact: 'Sub-deck 9 lab houses experimental pathogen specimen X-99.',
      subjectCharacterNames: [characterNames[1] || 'Thorne'],
      topicTags: ['BIOWEAPON', 'RESEARCH'],
      secrecy: 'CRITICAL',
      assignedCharacterName: characterNames[1] || 'Thorne',
    },
    {
      id: 'card_research_notes',
      title: 'Cryogenic Stability Notes',
      canonicalFact: 'Specimen X-99 requires specialized low-temp coolant to prevent aerosol release.',
      subjectCharacterNames: [characterNames[1] || 'Thorne'],
      topicTags: ['COOLANT', 'LAB'],
      secrecy: 'MEDIUM',
      assignedCharacterName: characterNames[1] || 'Thorne',
    },
    {
      id: 'card_bribe_ledger',
      title: 'Discretionary Account Ledger',
      canonicalFact: 'Science sub-budgets were siphoned into covert accounts.',
      subjectCharacterNames: [characterNames[1] || 'Thorne'],
      topicTags: ['FINANCE'],
      secrecy: 'HIGH',
      assignedCharacterName: characterNames[1] || 'Thorne',
    },
    {
      id: 'card_coolant_schematic',
      title: 'Coolant Flow Bypass Schematic',
      canonicalFact: 'Valve 4B was manually adjusted to starve primary reactor coolant pumps.',
      subjectCharacterNames: [characterNames[2] || 'Kael'],
      topicTags: ['REACTOR', 'COOLANT'],
      secrecy: 'LOW',
      assignedCharacterName: characterNames[2] || 'Kael',
    },
    {
      id: 'card_reactor_override',
      title: 'Reactor Emergency Override Keycode',
      canonicalFact: 'The safety shutdown was disabled using a master engineer override.',
      subjectCharacterNames: [characterNames[2] || 'Kael'],
      topicTags: ['REACTOR', 'OVERRIDE'],
      secrecy: 'HIGH',
      assignedCharacterName: characterNames[2] || 'Kael',
    },
    {
      id: 'card_cargo_manifest',
      title: 'Tampered Heavy Cargo Manifest',
      canonicalFact: 'Containers marked hydroponics actually contained centrifuges.',
      subjectCharacterNames: [characterNames[2] || 'Kael'],
      topicTags: ['CARGO'],
      secrecy: 'MEDIUM',
      assignedCharacterName: characterNames[2] || 'Kael',
    },
    {
      id: 'card_covert_orders',
      title: 'Syndicate Directive #77',
      canonicalFact: 'Orders were given to sabotage coolant loop to force station evacuation.',
      subjectCharacterNames: [characterNames[3] || 'Nyx'],
      topicTags: ['ORDERS', 'SYNDICATE'],
      secrecy: 'CRITICAL',
      assignedCharacterName: characterNames[3] || 'Nyx',
    },
    {
      id: 'card_cipher_key',
      title: 'Cryptographic Sub-Pad',
      canonicalFact: 'Hardware pad allows decryption of station-wide secure channels.',
      subjectCharacterNames: [characterNames[3] || 'Nyx'],
      topicTags: ['SECURITY', 'CIPHER'],
      secrecy: 'HIGH',
      assignedCharacterName: characterNames[3] || 'Nyx',
    },
    {
      id: 'card_quarantine_breach',
      title: 'Sub-Deck 9 Filtration Alert',
      canonicalFact: 'Volatile biological solvent signatures detected in air filtration.',
      subjectCharacterNames: [characterNames[3] || 'Nyx'],
      topicTags: ['ALERT'],
      secrecy: 'MEDIUM',
      assignedCharacterName: characterNames[3] || 'Nyx',
    },
  ];

  const goals: AtomizerGoalOutput[] = [
    {
      id: 'goal_1',
      assignedCharacterName: characterNames[3] || 'Nyx',
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
      assignedCharacterName: characterNames[0] || 'Vance',
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
      assignedCharacterName: characterNames[1] || 'Thorne',
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
      assignedCharacterName: characterNames[2] || 'Kael',
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

  return { cards, goals };
}
