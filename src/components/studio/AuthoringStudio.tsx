import React, { useEffect, useMemo, useState } from 'react';
import {
  READABILITY_CONFIG,
  ReadabilityLevel,
  SimulationComplexityTier,
  SimulationState,
  SpeechStyle,
} from '../../types/simulation';
import { UserAccount } from '../../types/user';
import { validateInitialDistribution, ValidationResult } from '../../engine/compiler';
import { normalizeAllCharacterPolicies } from '../../engine/resolution';
import {
  atomizeMasterNarrative,
  generateStorylineCharacters,
  reviseStorylineWithAI,
  StorylineRevisionResult,
  weaveCharacterDossier,
} from '../../services/llmOrchestrator';
import {
  ADDITIONAL_CHARACTER_COST_SIMS,
  calculateCollectionUsageCostSims,
  calculateCreationCostSims,
  chargeSimsForCreation,
  COMPLEXITY_TIER_CONFIG,
  CUSTOM_VOICE_CREATION_COST_SIMS,
  DEFAULT_CHARACTER_COUNT,
  loadSpeechStyleCollection,
  V4_PRO_CREATION_COST_SIMS,
} from '../../services/simsEconomyService';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle,
  Clock,
  Coins,
  Copy,
  Cpu,
  Edit3,
  FileEdit,
  FileText,
  FolderOpen,
  Globe,
  History,
  Layers,
  Lock,
  Mic,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Users,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import { createStationHeliosScenario } from '../../alpha/scenarioData';
import { buildRagIndexFromState } from '../../engine/ragPartition';

interface AuthoringStudioProps {
  simulationState: SimulationState;
  simulations?: Record<string, SimulationState>;
  currentUser?: UserAccount;
  voiceCollection?: SpeechStyle[];
  onUserUpdated?: (updatedUser: UserAccount) => void;
  onSelectSimulation?: (simulationId: string) => void;
  onUpdateState: (newState: SimulationState) => void;
  onCreateSimulation?: (newState: SimulationState) => void;
  onLaunchSimulation: () => void;
  onExitStudio?: () => void;
  exitLabel?: string;
}

export const AuthoringStudio: React.FC<AuthoringStudioProps> = ({
  simulationState,
  simulations,
  currentUser,
  voiceCollection,
  onUserUpdated,
  onSelectSimulation,
  onUpdateState,
  onCreateSimulation,
  onLaunchSimulation,
  onExitStudio,
  exitLabel = 'Exit Studio',
}) => {
  const availableVoices = useMemo(
    () =>
      voiceCollection && voiceCollection.length > 0
        ? voiceCollection
        : loadSpeechStyleCollection(),
    [voiceCollection]
  );

  const [scenarioTitle, setScenarioTitle] = useState(simulationState.title);
  const [masterText, setMasterText] = useState(simulationState.masterNarrative);
  const [complexityTier, setComplexityTier] =
    useState<SimulationComplexityTier>(
      simulationState.complexityTier ?? 'STANDARD'
    );
  const [useV4ProForCreation, setUseV4ProForCreation] = useState<boolean>(
    Boolean(simulationState.createdWithV4Pro)
  );

  const [voiceMode, setVoiceMode] = useState<'COLLECTION' | 'CUSTOM'>(() =>
    simulationState.voiceStyle?.source === 'USER_CUSTOM' ? 'CUSTOM' : 'COLLECTION'
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    () =>
      simulationState.voiceStyle?.source !== 'USER_CUSTOM' &&
      simulationState.voiceStyle?.id
        ? simulationState.voiceStyle.id
        : availableVoices[0]?.id ?? 'voice_direct'
  );

  const [customVoiceName, setCustomVoiceName] = useState<string>(() =>
    simulationState.voiceStyle?.source === 'USER_CUSTOM'
      ? simulationState.voiceStyle.name
      : ''
  );
  const [customVoiceGenre, setCustomVoiceGenre] = useState<string>(() =>
    simulationState.voiceStyle?.source === 'USER_CUSTOM'
      ? simulationState.voiceStyle.genre ?? ''
      : ''
  );
  const [customVoiceAuthor, setCustomVoiceAuthor] = useState<string>(() =>
    simulationState.voiceStyle?.source === 'USER_CUSTOM'
      ? simulationState.voiceStyle.authorInspiration ?? ''
      : ''
  );
  const [customVoiceTagline, setCustomVoiceTagline] = useState<string>(() =>
    simulationState.voiceStyle?.source === 'USER_CUSTOM'
      ? simulationState.voiceStyle.tagline
      : ''
  );
  const [customVoiceDirective, setCustomVoiceDirective] = useState<string>(() =>
    simulationState.voiceStyle?.source === 'USER_CUSTOM'
      ? simulationState.voiceStyle.styleDirective
      : ''
  );
  const [customVoiceSample, setCustomVoiceSample] = useState<string>(() =>
    simulationState.voiceStyle?.source === 'USER_CUSTOM'
      ? simulationState.voiceStyle.sampleLine
      : ''
  );

  const [readabilityLevel, setReadabilityLevel] = useState<ReadabilityLevel>(
    () => simulationState.readabilityLevel ?? 'NORMAL'
  );
  const [characterCount, setCharacterCount] = useState<number>(() =>
    simulationState.characterCount ??
    (Object.keys(simulationState.characters).length || DEFAULT_CHARACTER_COUNT)
  );

  const [isCompiling, setIsCompiling] = useState(false);
  const [studioNotice, setStudioNotice] = useState<string | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [paidCurrentDraft, setPaidCurrentDraft] = useState<boolean>(false);
  const [validation, setValidation] = useState<ValidationResult>(() =>
    validateInitialDistribution(simulationState)
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('vance');

  // Storyline Library Modal State
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<
    'ALL' | 'MY_STORIES' | 'DEFAULT'
  >('ALL');

  // AI Storyline Revision & Workshop Modal State
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionFieldFocus, setRevisionFieldFocus] = useState<
    'ALL' | 'TITLE' | 'LORE'
  >('ALL');
  const [revisionUserPrompt, setRevisionUserPrompt] = useState('');
  const [isRevisingStoryline, setIsRevisingStoryline] = useState(false);
  const [revisionResult, setRevisionResult] =
    useState<StorylineRevisionResult | null>(null);
  const [editableRevisedTitle, setEditableRevisedTitle] = useState('');
  const [editableRevisedLore, setEditableRevisedLore] = useState('');
  const [showOriginalComparison, setShowOriginalComparison] = useState(false);

  useEffect(() => {
    setScenarioTitle(simulationState.title);
    setMasterText(simulationState.masterNarrative);
    setComplexityTier(simulationState.complexityTier ?? 'STANDARD');
    setReadabilityLevel(simulationState.readabilityLevel ?? 'NORMAL');
    setCharacterCount(
      simulationState.characterCount ??
        (Object.keys(simulationState.characters).length || DEFAULT_CHARACTER_COUNT)
    );
    setUseV4ProForCreation(Boolean(simulationState.createdWithV4Pro));
    if (simulationState.voiceStyle?.source === 'USER_CUSTOM') {
      setVoiceMode('CUSTOM');
      setCustomVoiceName(simulationState.voiceStyle.name);
      setCustomVoiceGenre(simulationState.voiceStyle.genre ?? '');
      setCustomVoiceAuthor(simulationState.voiceStyle.authorInspiration ?? '');
      setCustomVoiceTagline(simulationState.voiceStyle.tagline);
      setCustomVoiceDirective(simulationState.voiceStyle.styleDirective);
      setCustomVoiceSample(simulationState.voiceStyle.sampleLine);
    } else {
      setVoiceMode('COLLECTION');
      setSelectedVoiceId(
        simulationState.voiceStyle?.id ?? availableVoices[0]?.id ?? 'voice_direct'
      );
    }
    setPaidCurrentDraft(false);
    setValidation(validateInitialDistribution(simulationState));
    const firstCharKey = Object.keys(simulationState.characters)[0] ?? 'vance';
    if (!simulationState.characters[selectedCharacterId]) {
      setSelectedCharacterId(firstCharKey);
    }
  }, [simulationState.id, availableVoices]);

  const activeCollectionVoice = useMemo(
    () =>
      availableVoices.find((v) => v.id === selectedVoiceId) ?? availableVoices[0],
    [availableVoices, selectedVoiceId]
  );

  const additionalCharacterCostSims = useMemo(
    () =>
      Math.max(0, characterCount - DEFAULT_CHARACTER_COUNT) *
      ADDITIONAL_CHARACTER_COST_SIMS,
    [characterCount]
  );

  const totalCreationCostSims = useMemo(
    () =>
      calculateCreationCostSims({
        complexityTier,
        useV4Pro: useV4ProForCreation,
        useCustomVoice: voiceMode === 'CUSTOM',
        characterCount,
      }),
    [complexityTier, useV4ProForCreation, voiceMode, characterCount]
  );

  const nominalCollectionPlayCostSims = useMemo(
    () => calculateCollectionUsageCostSims(totalCreationCostSims),
    [totalCreationCostSims]
  );

  const hasStoryBeenGenerated = useMemo(() => {
    const hasCards = Object.keys(simulationState.cards).length > 0;
    const hasMasterLore = Boolean(simulationState.masterNarrative?.trim());
    const hasCompiledCharacters = Object.values(simulationState.characters).some(
      (c) =>
        c.privateNarrativeBio &&
        !c.privateNarrativeBio.includes('Pending storyline compilation')
    );
    return hasCards && hasMasterLore && hasCompiledCharacters;
  }, [
    simulationState.cards,
    simulationState.masterNarrative,
    simulationState.characters,
  ]);

  const buildResolvedVoiceStyle = ():
    | { ok: true; voice: SpeechStyle }
    | { ok: false; error: string } => {
    if (voiceMode === 'CUSTOM') {
      if (!customVoiceName.trim() || !customVoiceDirective.trim()) {
        return {
          ok: false,
          error:
            'Custom Speech Style requires both a Style Name and an AI Speech Directive.',
        };
      }
      const trimmedGenre = customVoiceGenre.trim() || undefined;
      const trimmedAuthor = customVoiceAuthor.trim() || undefined;
      const rawDirective = customVoiceDirective.trim();
      const resolvedDirective =
        trimmedAuthor &&
        !rawDirective.toLowerCase().includes(trimmedAuthor.toLowerCase())
          ? `Tailor all prose and dialogue strictly after the literary writing style of ${trimmedAuthor}${
              trimmedGenre ? ` (${trimmedGenre})` : ''
            }. ${rawDirective}`
          : rawDirective;

      return {
        ok: true,
        voice: {
          id: `voice_user_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: customVoiceName.trim(),
          genre: trimmedGenre,
          authorInspiration: trimmedAuthor,
          tagline:
            customVoiceTagline.trim() ||
            (trimmedAuthor
              ? `${trimmedGenre ? `${trimmedGenre} · ` : ''}Tailored after ${trimmedAuthor}`
              : `Creator-defined speech style by @${currentUser?.username ?? 'creator'}`),
          styleDirective: resolvedDirective,
          sampleLine:
            customVoiceSample.trim() ||
            `"Every word in this room carries weight—choose yours carefully."`,
          source: 'USER_CUSTOM',
          createdByUsername: currentUser?.username,
        },
      };
    }

    return {
      ok: true,
      voice: activeCollectionVoice,
    };
  };

  const buildCostBreakdownLabel = (): string => {
    const parts = [
      `${COMPLEXITY_TIER_CONFIG[complexityTier].shortLabel} (${COMPLEXITY_TIER_CONFIG[complexityTier].costSims} Sims)`,
    ];
    if (characterCount > DEFAULT_CHARACTER_COUNT) {
      parts.push(
        `+${characterCount - DEFAULT_CHARACTER_COUNT} Seats (+${
          (characterCount - DEFAULT_CHARACTER_COUNT) *
          ADDITIONAL_CHARACTER_COST_SIMS
        } Sims)`
      );
    }
    if (useV4ProForCreation) {
      parts.push(`V4 Pro (+${V4_PRO_CREATION_COST_SIMS} Sims)`);
    }
    if (voiceMode === 'CUSTOM') {
      parts.push(`Custom Voice (+${CUSTOM_VOICE_CREATION_COST_SIMS} Sims)`);
    }
    return parts.join(' + ');
  };

  const handleValidate = (state: SimulationState) => {
    const res = validateInitialDistribution(state);
    setValidation(res);
  };

  const handleApplyCollectionVoicePreview = () => {
    if (voiceMode !== 'COLLECTION' || !activeCollectionVoice) return;
    const updated: SimulationState = {
      ...simulationState,
      voiceStyle: activeCollectionVoice,
      knowledgeBriefings: {},
    };
    onUpdateState(updated);
    setStudioError(null);
    setStudioNotice(
      `Active speech style updated to "${activeCollectionVoice.name}" for "${updated.title}".`
    );
  };

  const allSimulationsList = useMemo(
    () => (simulations ? Object.values(simulations) : [simulationState]),
    [simulations, simulationState]
  );

  const filteredLibrarySimulations = useMemo(() => {
    return allSimulationsList.filter((s) => {
      if (libraryFilter === 'MY_STORIES') {
        const isMine =
          (currentUser?.id && s.creatorUserId === currentUser.id) ||
          (currentUser?.username && s.creatorUsername === currentUser.username);
        if (!isMine) return false;
      } else if (libraryFilter === 'DEFAULT') {
        const isDefault =
          s.id.startsWith('sim_helios') ||
          s.id.startsWith('sim_geneva') ||
          s.id.startsWith('sim_meridian') ||
          s.id.startsWith('sim_noir') ||
          s.id.startsWith('sim_fantasy');
        if (!isDefault) return false;
      }

      if (librarySearchQuery.trim()) {
        const q = librarySearchQuery.toLowerCase();
        const matchesTitle = s.title.toLowerCase().includes(q);
        const matchesLore = s.masterNarrative.toLowerCase().includes(q);
        const matchesId = s.id.toLowerCase().includes(q);
        const matchesVoice = s.voiceStyle?.name.toLowerCase().includes(q);
        if (!matchesTitle && !matchesLore && !matchesId && !matchesVoice) {
          return false;
        }
      }

      return true;
    });
  }, [allSimulationsList, libraryFilter, librarySearchQuery, currentUser]);

  const handleCreateNewSimulation = () => {
    const newSimId = `sim_user_${Date.now()}`;
    const freshSim: SimulationState = {
      id: newSimId,
      title: 'Untitled Storyline',
      mode: 'TURN_BASED',
      status: 'ACTIVE',
      currentTurnOrTick: 0,
      masterNarrative: '',
      characters: {
        vance: {
          playerId: 'vance',
          simulationId: newSimId,
          characterName: 'Director Vance',
          publicRole: 'Command Lead',
          privateNarrativeBio: 'Pending storyline compilation...',
          coreTraits: ['Pragmatic', 'Commanding'],
          coreMotives: ['Maintain Operational Control'],
          hiddenStats: {
            inquiry: 0.5,
            coercion: 0.85,
            negotiation: 0.45,
            deception: 0.35,
            composure: 0.7,
            insight: 0.5,
          },
          defensivePolicy: {
            protectedCardIds: [],
            tradeableCardIds: [],
            stanceByPlayerId: {},
          },
          actionPoints: 3,
          victoryPoints: 0,
        },
        thorne: {
          playerId: 'thorne',
          simulationId: newSimId,
          characterName: 'Dr. Thorne',
          publicRole: 'Chief Specialist',
          privateNarrativeBio: 'Pending storyline compilation...',
          coreTraits: ['Analytical', 'Stoic'],
          coreMotives: ['Protect Confidential Archives'],
          hiddenStats: {
            inquiry: 0.88,
            coercion: 0.35,
            negotiation: 0.5,
            deception: 0.4,
            composure: 0.8,
            insight: 0.75,
          },
          defensivePolicy: {
            protectedCardIds: [],
            tradeableCardIds: [],
            stanceByPlayerId: {},
          },
          actionPoints: 3,
          victoryPoints: 0,
        },
        kael: {
          playerId: 'kael',
          simulationId: newSimId,
          characterName: 'Engineer Kael',
          publicRole: 'Operations Chief',
          privateNarrativeBio: 'Pending storyline compilation...',
          coreTraits: ['Resourceful', 'Pragmatic'],
          coreMotives: ['Exonerate Systems Crew'],
          hiddenStats: {
            inquiry: 0.6,
            coercion: 0.4,
            negotiation: 0.82,
            deception: 0.38,
            composure: 0.4,
            insight: 0.55,
          },
          defensivePolicy: {
            protectedCardIds: [],
            tradeableCardIds: [],
            stanceByPlayerId: {},
          },
          actionPoints: 3,
          victoryPoints: 0,
        },
        nyx: {
          playerId: 'nyx',
          simulationId: newSimId,
          characterName: 'Operative Nyx',
          publicRole: 'Security Envoy',
          privateNarrativeBio: 'Pending storyline compilation...',
          coreTraits: ['Deceptive', 'Perceptive'],
          coreMotives: ['Advance Covert Syndicate Objectives'],
          hiddenStats: {
            inquiry: 0.75,
            coercion: 0.6,
            negotiation: 0.65,
            deception: 0.9,
            composure: 0.7,
            insight: 0.85,
          },
          defensivePolicy: {
            protectedCardIds: [],
            tradeableCardIds: [],
            stanceByPlayerId: {},
          },
          actionPoints: 3,
          victoryPoints: 0,
        },
      },
      cards: {},
      goals: {},
      tokens: [],
      interactions: [],
      pendingEngagements: [],
      knowledgeBriefings: {},
      ragIndex: [],
      complexityTier: 'STANDARD',
      readabilityLevel: 'NORMAL',
      characterCount: 4,
      voiceStyle: availableVoices[0],
      creatorUserId: currentUser?.id,
      creatorUsername: currentUser?.username,
      creatorDisplayName: currentUser?.displayName,
      creationCostSims: 20,
      usageCostSims: 2,
      publishedToCollection: false,
    };

    onCreateSimulation?.(freshSim);
    onSelectSimulation?.(newSimId);
    setScenarioTitle('');
    setMasterText('');
    setComplexityTier('STANDARD');
    setReadabilityLevel('NORMAL');
    setCharacterCount(4);
    setUseV4ProForCreation(false);
    setPaidCurrentDraft(false);
    setStudioError(null);
    setStudioNotice(
      'New simulation initialized! Enter your storyline title and master lore source below, or use the AI Storyline Workshop to generate ideas.'
    );
    setShowLibraryModal(false);
  };

  const handleMakeCopy = (source?: SimulationState) => {
    const base = source ?? simulationState;
    const copyId = `sim_copy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const copiedSim: SimulationState = {
      ...base,
      id: copyId,
      title: `Copy of ${base.title}`,
      status: 'ACTIVE',
      currentTurnOrTick: 0,
      creatorUserId: currentUser?.id,
      creatorUsername: currentUser?.username,
      creatorDisplayName: currentUser?.displayName,
      publishedToCollection: false,
      unlockedByUserIds: currentUser ? [currentUser.id] : [],
      totalRoyaltiesEarnedSims: 0,
      interactions: [],
      pendingEngagements: [],
      knowledgeBriefings: {},
      characters: Object.fromEntries(
        Object.entries(base.characters).map(([pId, char]) => [
          pId,
          {
            ...char,
            simulationId: copyId,
            actionPoints: 3,
            victoryPoints: 0,
            defensivePolicy: {
              ...char.defensivePolicy,
              stanceByPlayerId: { ...char.defensivePolicy.stanceByPlayerId },
            },
          },
        ])
      ),
      cards: Object.fromEntries(
        Object.entries(base.cards).map(([cId, card]) => [
          cId,
          {
            ...card,
            simulationId: copyId,
            knownByPlayerIds: [...card.knownByPlayerIds],
          },
        ])
      ),
      goals: Object.fromEntries(
        Object.entries(base.goals).map(([gId, goal]) => [
          gId,
          {
            ...goal,
            simulationId: copyId,
            completedByPlayerIds: [],
          },
        ])
      ),
    };

    normalizeAllCharacterPolicies(copiedSim);
    copiedSim.ragIndex = buildRagIndexFromState(copiedSim);
    onCreateSimulation?.(copiedSim);
    onSelectSimulation?.(copyId);
    setScenarioTitle(copiedSim.title);
    setMasterText(copiedSim.masterNarrative);
    setComplexityTier(copiedSim.complexityTier ?? 'STANDARD');
    setUseV4ProForCreation(Boolean(copiedSim.createdWithV4Pro));
    setPaidCurrentDraft(true);
    handleValidate(copiedSim);
    setStudioError(null);
    setStudioNotice(
      `Created editable copy "${copiedSim.title}"! You can now edit its lore, prompt AI revisions, and recompile.`
    );
    setShowLibraryModal(false);
  };

  const handleOpenStorylineFromLibrary = (sim: SimulationState) => {
    onSelectSimulation?.(sim.id);
    setScenarioTitle(sim.title);
    setMasterText(sim.masterNarrative);
    setComplexityTier(sim.complexityTier ?? 'STANDARD');
    setUseV4ProForCreation(Boolean(sim.createdWithV4Pro));
    if (sim.voiceStyle?.source === 'USER_CUSTOM') {
      setVoiceMode('CUSTOM');
      setCustomVoiceName(sim.voiceStyle.name);
      setCustomVoiceGenre(sim.voiceStyle.genre ?? '');
      setCustomVoiceAuthor(sim.voiceStyle.authorInspiration ?? '');
      setCustomVoiceTagline(sim.voiceStyle.tagline);
      setCustomVoiceDirective(sim.voiceStyle.styleDirective);
      setCustomVoiceSample(sim.voiceStyle.sampleLine);
    } else {
      setVoiceMode('COLLECTION');
      setSelectedVoiceId(
        sim.voiceStyle?.id ?? availableVoices[0]?.id ?? 'voice_direct'
      );
    }
    setPaidCurrentDraft(false);
    handleValidate(sim);
    setShowLibraryModal(false);
    setStudioNotice(`Loaded storyline "${sim.title}" into studio editor.`);
  };

  const handleOpenRevisionModal = (
    focus: 'ALL' | 'TITLE' | 'LORE' = 'ALL'
  ) => {
    setRevisionFieldFocus(focus);
    setRevisionResult(null);
    setEditableRevisedTitle(scenarioTitle);
    setEditableRevisedLore(masterText);
    setShowOriginalComparison(false);
    setShowRevisionModal(true);
  };

  const handleExecuteStorylineRevision = async () => {
    if (!revisionUserPrompt.trim()) return;
    setIsRevisingStoryline(true);
    setStudioError(null);
    try {
      const voiceResult = buildResolvedVoiceStyle();
      const result = await reviseStorylineWithAI({
        currentTitle: scenarioTitle,
        currentMasterNarrative: masterText,
        userPrompt: revisionUserPrompt.trim(),
        voiceStyle: voiceResult.ok ? voiceResult.voice : undefined,
        complexityTier,
        readabilityLevel,
        characterCount,
        forceV4Pro: useV4ProForCreation,
      });
      setRevisionResult(result);
      setEditableRevisedTitle(result.revisedTitle);
      setEditableRevisedLore(result.revisedMasterNarrative);
    } catch (err) {
      console.error('Storyline revision failed:', err);
      setStudioError('Failed to revise storyline with AI. Please check inputs/key.');
    } finally {
      setIsRevisingStoryline(false);
    }
  };

  const handleApproveStorylineToStudio = () => {
    if (!revisionResult) return;
    const finalTitle = editableRevisedTitle.trim();
    const finalLore = editableRevisedLore.trim();
    setScenarioTitle(finalTitle);
    setMasterText(finalLore);
    setShowRevisionModal(false);
    setRevisionResult(null);
    setRevisionUserPrompt('');
    setStudioNotice(
      `Approved revised storyline! Updated Title to "${finalTitle}". Review below and click "Spend Sims & Compile Graph" when ready to dice into cards and characters.`
    );
  };

  const executeCompilationPipeline = async (
    targetTitle?: string,
    targetLore?: string
  ) => {
    setStudioError(null);
    setStudioNotice(null);

    const effectiveTitle =
      (targetTitle ?? scenarioTitle).trim() || 'Untitled Simulation';
    const effectiveLore = (targetLore ?? masterText).trim();

    if (!effectiveLore) {
      setStudioError(
        'Master Narrative Lore Source cannot be empty. Please enter your storyline lore or prompt the AI to generate one.'
      );
      return;
    }

    const voiceResult = buildResolvedVoiceStyle();
    if (!voiceResult.ok) {
      setStudioError(voiceResult.error);
      return;
    }

    // Charge 'Sims' credits for Complexity Tier + optional V4 Pro + optional Custom Voice
    if (currentUser) {
      const chargeRes = chargeSimsForCreation(
        currentUser.id,
        totalCreationCostSims,
        effectiveTitle,
        buildCostBreakdownLabel()
      );
      if (!chargeRes.ok) {
        setStudioError(chargeRes.error);
        return;
      }
      onUserUpdated?.(chargeRes.updatedCreator);
    }

    setIsCompiling(true);
    try {
      // 1. Generate or synthesize characters tailored to this storyline with motives and stats
      const generatedCast = await generateStorylineCharacters({
        scenarioTitle: effectiveTitle,
        masterNarrative: effectiveLore,
        voiceStyle: voiceResult.voice,
        forceV4Pro: useV4ProForCreation,
        characterCount,
        readabilityLevel,
      });

      const charNames = generatedCast.map((c) => c.characterName);

      // 2. Dice master storyline into atomic clue cards & asymmetric goals based on complexity tier
      const compiled = await atomizeMasterNarrative(effectiveLore, charNames, {
        complexityTier,
        voiceStyle: voiceResult.voice,
        forceV4Pro: useV4ProForCreation,
        readabilityLevel,
      });

      const newCards: SimulationState['cards'] = {};
      const newGoals: SimulationState['goals'] = {};

      for (const cardOut of compiled.cards) {
        const matchedChar =
          generatedCast.find(
            (c) =>
              c.characterName.toLowerCase() ===
              cardOut.assignedCharacterName.toLowerCase()
          ) || generatedCast[0];

        newCards[cardOut.id] = {
          id: cardOut.id,
          simulationId: simulationState.id,
          tier: 'ATOMIC',
          title: cardOut.title,
          canonicalFact: cardOut.canonicalFact,
          subjectCharacterIds: [matchedChar.slotId],
          topicTags: cardOut.topicTags,
          secrecy: cardOut.secrecy,
          parentCardIds: [],
          knownByPlayerIds: [matchedChar.slotId],
          createdAtTick: 0,
        };
      }

      for (const goalOut of compiled.goals) {
        const matchedChar =
          generatedCast.find(
            (c) =>
              c.characterName.toLowerCase() ===
              goalOut.assignedCharacterName.toLowerCase()
          ) || generatedCast[0];

        newGoals[goalOut.id] = {
          id: goalOut.id,
          simulationId: simulationState.id,
          assignedPlayerId: matchedChar.slotId,
          veiledPrompt: goalOut.veiledPrompt,
          requiredCardIds: goalOut.requiredCardIds,
          baseVpValue: goalOut.baseVpValue,
          decayMultipliers: goalOut.decayMultipliers,
          completedByPlayerIds: [],
          synthesizedCardTemplate: goalOut.synthesizedCardTemplate,
        };
      }

      // 3. Weave private character narrative dossiers in the chosen SpeechStyle (and V4 Pro if paid)
      // and establish defensive policy (1 protected secret card, 1 tradeable card)
      const updatedCharacters: SimulationState['characters'] = {};

      const secrecyRank: Record<string, number> = {
        CRITICAL: 5,
        HIGH: 4,
        MEDIUM: 3,
        LOW: 2,
        PUBLIC: 1,
      };

      await Promise.all(
        generatedCast.map(async (cConcept) => {
          const assignedCards = Object.values(newCards).filter((c) =>
            c.knownByPlayerIds.includes(cConcept.slotId)
          );

          // Sort cards by secrecy: highest secrecy is guarded, lowest is tradeable
          const sortedCards = [...assignedCards].sort(
            (a, b) =>
              (secrecyRank[b.secrecy] ?? 0) - (secrecyRank[a.secrecy] ?? 0)
          );
          const protectedCardIds =
            sortedCards.length > 0 ? [sortedCards[0].id] : [];
          const tradeableCardIds =
            sortedCards.length > 1
              ? [sortedCards[sortedCards.length - 1].id]
              : sortedCards.length === 1
              ? [sortedCards[0].id]
              : [];

          const otherSlots = generatedCast
            .filter((o) => o.slotId !== cConcept.slotId)
            .map((o) => o.slotId);

          const defaultStances: Record<
            string,
            'COOPERATIVE' | 'NEUTRAL' | 'SUSPICIOUS' | 'HOSTILE'
          > = {};
          otherSlots.forEach((sid, idx) => {
            defaultStances[sid] =
              idx === 0 ? 'COOPERATIVE' : idx === 1 ? 'SUSPICIOUS' : 'NEUTRAL';
          });

          const wovenBio = await weaveCharacterDossier(
            cConcept.characterName,
            assignedCards,
            cConcept.hiddenStats,
            {
              voiceStyle: voiceResult.voice,
              forceV4Pro: useV4ProForCreation,
              readabilityLevel,
            }
          );

          updatedCharacters[cConcept.slotId] = {
            playerId: cConcept.slotId,
            simulationId: simulationState.id,
            characterName: cConcept.characterName,
            publicRole: cConcept.publicRole,
            privateNarrativeBio: wovenBio,
            coreTraits: cConcept.coreTraits,
            coreMotives: cConcept.coreMotives,
            hiddenStats: cConcept.hiddenStats,
            defensivePolicy: {
              protectedCardIds,
              tradeableCardIds,
              stanceByPlayerId: defaultStances,
            },
            actionPoints: 3,
            victoryPoints: 0,
          };
        })
      );

      const newState: SimulationState = {
        ...simulationState,
        title: effectiveTitle,
        masterNarrative: effectiveLore,
        currentTurnOrTick: 0,
        characters: updatedCharacters,
        cards: newCards,
        goals: newGoals,
        interactions: [],
        pendingEngagements: [],
        knowledgeBriefings: {},
        complexityTier,
        readabilityLevel,
        characterCount: generatedCast.length,
        voiceStyle: voiceResult.voice,
        createdWithV4Pro: useV4ProForCreation,
        creatorUserId: currentUser?.id ?? simulationState.creatorUserId,
        creatorUsername:
          currentUser?.username ?? simulationState.creatorUsername,
        creatorDisplayName:
          currentUser?.displayName ?? simulationState.creatorDisplayName,
        creationCostSims: totalCreationCostSims,
        usageCostSims: nominalCollectionPlayCostSims,
      };

      normalizeAllCharacterPolicies(newState);
      newState.ragIndex = buildRagIndexFromState(newState);
      onUpdateState(newState);
      handleValidate(newState);
      setPaidCurrentDraft(true);
      setScenarioTitle(effectiveTitle);
      setMasterText(effectiveLore);
      setStudioNotice(
        `Spent ${totalCreationCostSims} Sims: Storyline successfully diced into ${
          Object.keys(newCards).length
        } clues and 4 character dossiers generated [${
          COMPLEXITY_TIER_CONFIG[complexityTier].label
        }, Voice: ${voiceResult.voice.name}${
          useV4ProForCreation ? ', DeepSeek V4 Pro' : ', DeepSeek Flash'
        }]. Ready to launch or publish to Collection!`
      );
    } catch (e) {
      console.error('Compilation failed:', e);
      setStudioError('Failed to compile storyline graph. Please inspect inputs.');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleApproveAndDiceIntoCards = async () => {
    if (!revisionResult) return;
    const finalTitle = editableRevisedTitle.trim();
    const finalLore = editableRevisedLore.trim();
    setScenarioTitle(finalTitle);
    setMasterText(finalLore);
    setShowRevisionModal(false);
    setRevisionResult(null);
    setRevisionUserPrompt('');
    await executeCompilationPipeline(finalTitle, finalLore);
  };

  const handleRecompile = async () => {
    await executeCompilationPipeline(scenarioTitle, masterText);
  };

  const handlePublishToCollection = () => {
    if (!onCreateSimulation) return;
    setStudioError(null);
    setStudioNotice(null);

    const voiceResult = buildResolvedVoiceStyle();
    if (!voiceResult.ok) {
      setStudioError(voiceResult.error);
      return;
    }

    const targetTitle =
      scenarioTitle.trim() && scenarioTitle.trim() !== simulationState.title
        ? scenarioTitle.trim()
        : paidCurrentDraft
        ? scenarioTitle.trim() || simulationState.title
        : `${simulationState.title} (Community Edition)`;

    // If the creator has not already paid Sims compiling this draft, charge the configured Sims cost now
    if (currentUser && !paidCurrentDraft) {
      const chargeRes = chargeSimsForCreation(
        currentUser.id,
        totalCreationCostSims,
        targetTitle,
        buildCostBreakdownLabel()
      );
      if (!chargeRes.ok) {
        setStudioError(chargeRes.error);
        return;
      }
      onUserUpdated?.(chargeRes.updatedCreator);
    }

    const newSimId = `sim_pub_${Date.now().toString().slice(-6)}`;
    const clonedCards = Object.fromEntries(
      Object.entries(simulationState.cards).map(([id, card]) => [
        id,
        {
          ...card,
          simulationId: newSimId,
          knownByPlayerIds: [...card.knownByPlayerIds],
        },
      ])
    );
    const clonedGoals = Object.fromEntries(
      Object.entries(simulationState.goals).map(([id, goal]) => [
        id,
        {
          ...goal,
          simulationId: newSimId,
          completedByPlayerIds: [],
        },
      ])
    );
    const clonedCharacters = Object.fromEntries(
      Object.entries(simulationState.characters).map(([id, char]) => [
        id,
        {
          ...char,
          simulationId: newSimId,
          actionPoints: 3,
          victoryPoints: 0,
        },
      ])
    );

    const effectiveCreatorCost = paidCurrentDraft
      ? simulationState.creationCostSims ?? totalCreationCostSims
      : totalCreationCostSims;
    const effectiveUsageCost =
      calculateCollectionUsageCostSims(effectiveCreatorCost);

    const created: SimulationState = {
      ...simulationState,
      id: newSimId,
      title: targetTitle,
      status: 'ACTIVE',
      currentTurnOrTick: 0,
      masterNarrative: masterText,
      characters: clonedCharacters,
      cards: clonedCards,
      goals: clonedGoals,
      interactions: [],
      pendingEngagements: [],
      knowledgeBriefings: {},
      ragIndex: [],
      complexityTier,
      voiceStyle: voiceResult.voice,
      createdWithV4Pro: useV4ProForCreation,
      creatorUserId: currentUser?.id ?? 'usr_architect',
      creatorUsername: currentUser?.username ?? 'architect',
      creatorDisplayName: currentUser?.displayName ?? 'Studio Creator',
      creationCostSims: effectiveCreatorCost,
      usageCostSims: effectiveUsageCost,
      publishedToCollection: true,
      publishedAt: new Date().toISOString(),
      unlockedByUserIds: currentUser ? [currentUser.id] : [],
      totalRoyaltiesEarnedSims: 0,
    };

    normalizeAllCharacterPolicies(created);
    created.ragIndex = buildRagIndexFromState(created);
    onCreateSimulation(created);
    setPaidCurrentDraft(false);
    setStudioNotice(
      `Published "${created.title}" to the Available Simulations Collection! Other users can unlock it for ${effectiveUsageCost} Sims (10% of ${effectiveCreatorCost} Sims), paid directly to you.`
    );
  };

  const handleResetToHeliosPreset = () => {
    const helios = createStationHeliosScenario();
    helios.ragIndex = buildRagIndexFromState(helios);
    setScenarioTitle(helios.title);
    setMasterText(helios.masterNarrative);
    setComplexityTier(helios.complexityTier ?? 'ELEVATED');
    setUseV4ProForCreation(false);
    setVoiceMode('COLLECTION');
    setSelectedVoiceId(helios.voiceStyle?.id ?? 'voice_scifi');
    setPaidCurrentDraft(false);
    onUpdateState(helios);
    handleValidate(helios);
  };

  const selectedChar = simulationState.characters[selectedCharacterId];
  const charCards = Object.values(simulationState.cards).filter((c) =>
    c.knownByPlayerIds.includes(selectedCharacterId)
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto p-6 font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800 mb-6">
        <div className="flex items-start gap-3">
          {onExitStudio && (
            <button
              type="button"
              onClick={onExitStudio}
              className="mt-0.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-sky-400" />
              {exitLabel}
            </button>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Layers className="w-6 h-6 text-purple-400" />
              <h1 className="text-xl font-bold tracking-tight text-white">
                Simulation Authoring Studio
              </h1>
              <span className="text-xs px-2 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-800 font-mono">
                Sims Compiler & Voice Engine
              </span>
              {simulations && onSelectSimulation && (
                <select
                  value={simulationState.id}
                  onChange={(e) => onSelectSimulation(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  {Object.values(simulations).map((s) => (
                    <option key={s.id} value={s.id}>
                      Editing: {s.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Scale clue complexity, toggle V4 Pro narrative synthesis, configure AI speech styles, and publish to the Available Simulations Collection to earn Sims royalties.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {currentUser && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300">Wallet:</span>
              <span className="font-bold font-mono text-amber-300">
                {currentUser.simsBalance ?? 0} Sims
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleCreateNewSimulation}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow"
            title="Start a fresh simulation and author a new storyline from scratch"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Simulation</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLibraryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-purple-300 border border-purple-500/40 transition-colors"
            title="Open library of storylines to edit or copy"
          >
            <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
            <span>Storyline Library ({allSimulationsList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => handleMakeCopy()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 transition-colors"
            title="Make an editable copy of this storyline"
          >
            <Copy className="w-3.5 h-3.5 text-amber-400" />
            <span>Make a Copy</span>
          </button>

          <button
            onClick={handleResetToHeliosPreset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Load Station Helios Preset
          </button>

          {onCreateSimulation && (
            <button
              onClick={handlePublishToCollection}
              disabled={!validation.isValid}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors shadow disabled:opacity-40 disabled:cursor-not-allowed"
              title="Publish simulation to Available Simulations Collection so other users can unlock it for 10% Sims (paid to you)"
            >
              <Globe className="w-3.5 h-3.5" />
              Publish to Collection (Earn +{nominalCollectionPlayCostSims} Sims/Play)
            </button>
          )}

          <button
            onClick={onLaunchSimulation}
            disabled={!validation.isValid}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 fill-current" />
            Launch Simulation
          </button>
        </div>
      </div>

      {studioError && (
        <div className="mb-5 p-3 rounded-xl bg-rose-950/50 border border-rose-500/50 text-xs text-rose-200 flex items-center justify-between">
          <span>{studioError}</span>
          <button
            type="button"
            onClick={() => setStudioError(null)}
            className="text-rose-300 hover:text-white ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {studioNotice && (
        <div className="mb-5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between">
          <span>{studioNotice}</span>
          <button
            type="button"
            onClick={() => setStudioNotice(null)}
            className="text-slate-400 hover:text-white ml-4"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Sims Upgrades, Voices, Narrative Input & Invariants (Cols 1-7) */}
        <div className="col-span-12 lg:col-span-7 space-y-6">
          {/* 1. Sims Complexity & V4 Pro Narrative Engine Panel */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  1. Simulation Complexity &amp; V4 Pro Narrative Engine ('Sims' Credits)
                </h2>
              </div>
              <span className="text-[11px] font-mono text-amber-300 bg-amber-950/40 px-2.5 py-0.5 rounded border border-amber-500/30">
                Collection Royalty = 10% of Build Cost (+{nominalCollectionPlayCostSims} Sims / Unlock)
              </span>
            </div>

            {/* Complexity Tier Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {(Object.keys(COMPLEXITY_TIER_CONFIG) as SimulationComplexityTier[]).map(
                (tierKey) => {
                  const cfg = COMPLEXITY_TIER_CONFIG[tierKey];
                  const active = complexityTier === tierKey;
                  return (
                    <button
                      key={tierKey}
                      type="button"
                      onClick={() => {
                        setComplexityTier(tierKey);
                        setPaidCurrentDraft(false);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        active
                          ? 'bg-purple-950/50 border-purple-400 shadow-sm'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-bold text-white">
                          {cfg.shortLabel}
                        </span>
                        <span
                          className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                            active
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                              : 'bg-slate-900 text-slate-300'
                          }`}
                        >
                          {cfg.costSims} Sims
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-purple-300 mb-1">
                        {cfg.cardRange[0]}–{cfg.cardRange[1]} Clues • {cfg.goalsPerCharacter} Goal(s)/Role
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {cfg.description}
                      </p>
                    </button>
                  );
                }
              )}
            </div>

            {/* V4 Pro Paid Toggle for Narrative Creation */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                useV4ProForCreation
                  ? 'bg-fuchsia-950/35 border-fuchsia-500/60'
                  : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-fuchsia-400" />
                  <span className="text-xs font-bold text-white">
                    Toggle DeepSeek V4 Pro for Narrative Creation
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/40">
                    +{V4_PRO_CREATION_COST_SIMS} Sims
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Upgrades the Studio Atomizer &amp; Dossier Weaver from{' '}
                  <code className="text-sky-300">deepseek-flash</code> to{' '}
                  <code className="text-fuchsia-300">deepseek-v4-pro</code> when compiling your narrative.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={useV4ProForCreation}
                onClick={() => {
                  setUseV4ProForCreation((prev) => !prev);
                  setPaidCurrentDraft(false);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${
                  useV4ProForCreation
                    ? 'bg-fuchsia-600 text-white border-fuchsia-400 shadow'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                {useV4ProForCreation ? 'V4 Pro: ON' : 'Use Flash (Default)'}
              </button>
            </div>
          </div>

          {/* 2. Target Story Readability Level (Required Selection) */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  2. Target Story Readability Level
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Required Selection
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Calibrates vocabulary, sentence complexity, and syntax
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {(Object.keys(READABILITY_CONFIG) as ReadabilityLevel[]).map(
                (levelKey) => {
                  const cfg = READABILITY_CONFIG[levelKey];
                  const active = readabilityLevel === levelKey;
                  return (
                    <button
                      key={levelKey}
                      type="button"
                      onClick={() => {
                        setReadabilityLevel(levelKey);
                        setPaidCurrentDraft(false);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        active
                          ? 'bg-sky-950/60 border-sky-400 shadow-sm ring-1 ring-sky-500/30'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          {cfg.label}
                          {active && <Check className="w-3.5 h-3.5 text-sky-400" />}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${cfg.badgeClass}`}
                        >
                          {cfg.gradeLevel}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-sky-300 mb-1">
                        Target: {cfg.targetLexile}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {cfg.description}
                      </p>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* 3. Simulation Character Seats & Credits (Default: 4, +10 Sims/extra) */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  3. Simulation Character Seats &amp; Credits
                </h2>
              </div>
              <span className="text-[11px] font-mono text-purple-300 bg-purple-950/40 px-2.5 py-0.5 rounded border border-purple-500/30">
                Default: 4 Characters • +10 Sims per Additional Seat
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Choose how many distinct character roles to generate for this scenario. Every character receives an asymmetric motive, hidden stats, guarded/shareable cards, and starting knowledge.
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[3, 4, 5, 6, 7, 8].map((count) => {
                const active = characterCount === count;
                const extraCost = Math.max(0, count - 4) * 10;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      setCharacterCount(count);
                      setPaidCurrentDraft(false);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      active
                        ? 'bg-purple-950/60 border-purple-400 shadow ring-1 ring-purple-500/30'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-base font-bold text-white mb-0.5">
                      {count}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {count === 4 ? 'Default' : `${count} Seats`}
                    </div>
                    <div
                      className={`text-[10px] font-mono mt-1 ${
                        extraCost > 0
                          ? 'text-amber-300 font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {extraCost > 0 ? `+${extraCost} Sims` : 'Included'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. AI Speech Styles / Voices Selector & Paid Custom Voice Builder */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  4. Simulation AI Voice &amp; Speech Style
                </h2>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setVoiceMode('COLLECTION');
                    setPaidCurrentDraft(false);
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    voiceMode === 'COLLECTION'
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Speech Collection (+0 Sims)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceMode('CUSTOM');
                    setPaidCurrentDraft(false);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    voiceMode === 'CUSTOM'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-amber-300 hover:text-amber-200'
                  }`}
                >
                  <Wand2 className="w-3 h-3" />
                  Define Custom Style (+{CUSTOM_VOICE_CREATION_COST_SIMS} Sims)
                </button>
              </div>
            </div>

            {voiceMode === 'COLLECTION' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {availableVoices.map((voice) => {
                    const isSelected = voice.id === activeCollectionVoice?.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => {
                          setSelectedVoiceId(voice.id);
                          setPaidCurrentDraft(false);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-violet-950/50 border-violet-400'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-bold text-white">
                            {voice.name}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-violet-300 border border-slate-800 shrink-0">
                            {voice.source === 'ADMIN_ADDED' ? 'ADMIN CURATED' : 'COLLECTION'}
                          </span>
                        </div>
                        {(voice.genre || voice.authorInspiration) && (
                          <div className="flex flex-wrap items-center gap-1 mb-1.5">
                            {voice.genre && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 border border-slate-800">
                                {voice.genre}
                              </span>
                            )}
                            {voice.authorInspiration && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-200 border border-amber-500/30">
                                {voice.authorInspiration}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-[11px] text-slate-300 mb-1.5">
                          {voice.tagline}
                        </p>
                        <p className="text-[10px] italic text-slate-400 line-clamp-2">
                          {voice.sampleLine}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {activeCollectionVoice && (
                  <div className="flex items-center justify-between gap-3 pt-1 text-[11px] text-slate-400">
                    <span>
                      Selected Voice:{' '}
                      <strong className="text-violet-300">
                        {activeCollectionVoice.name}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyCollectionVoicePreview}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-violet-200 font-semibold transition-colors"
                    >
                      Apply Collection Voice to Current Sim (0 Sims)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-300">
                    Bespoke Creator Speech Style (+{CUSTOM_VOICE_CREATION_COST_SIMS} Sims Extra)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Used across all AI dialogues, briefings &amp; dossiers
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={customVoiceName}
                    onChange={(e) => setCustomVoiceName(e.target.value)}
                    placeholder="Style Name (e.g., Gibson Sprawl Chrome)"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="text"
                    value={customVoiceGenre}
                    onChange={(e) => setCustomVoiceGenre(e.target.value)}
                    placeholder="Genre (e.g., Cyberpunk)"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={customVoiceAuthor}
                    onChange={(e) => setCustomVoiceAuthor(e.target.value)}
                    placeholder="Focal Author (e.g., William Gibson)"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="text"
                    value={customVoiceTagline}
                    onChange={(e) => setCustomVoiceTagline(e.target.value)}
                    placeholder="Short Tagline (e.g., Compressed neon sensory grit & street tech)"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <textarea
                  value={customVoiceDirective}
                  onChange={(e) => setCustomVoiceDirective(e.target.value)}
                  rows={2}
                  placeholder="Describe how the AI should tailor its tone around this author's prose rhythm, vocabulary, metaphors, and dialogue..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400 resize-none"
                />
                <input
                  type="text"
                  value={customVoiceSample}
                  onChange={(e) => setCustomVoiceSample(e.target.value)}
                  placeholder='Optional sample dialogue line (e.g., "Check the neural splice before you flatline my cred, choom.")'
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-400"
                />
              </div>
            )}
          </div>

          {/* 5. Master Narrative Editor & Compile Action */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-slate-200">
                  5. Scenario Title &amp; Master Narrative Lore Source
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleOpenRevisionModal('ALL')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600/25 hover:bg-violet-600/40 text-violet-200 border border-violet-500/40 transition-colors shadow-sm"
                  title="Prompt AI to revise, twist, or rewrite the storyline"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Prompt AI to Revise Storyline</span>
                </button>
                <button
                  onClick={handleRecompile}
                  disabled={isCompiling}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors disabled:opacity-50 shadow"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isCompiling
                    ? 'Dicing & Compiling Graph...'
                    : `Spend ${totalCreationCostSims} Sims & Compile Graph`}
                </button>
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-slate-950/90 border border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-400">
                Breakdown: <span className="text-slate-200">{buildCostBreakdownLabel()}</span>
              </span>
              <span className="font-mono text-emerald-300">
                Published Play Cost (10%): {nominalCollectionPlayCostSims} Sims → Paid to You
              </span>
            </div>

            {/* Storyline Title Field with Revision Action */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  Scenario Storyline Title
                </label>
                <button
                  type="button"
                  onClick={() => handleOpenRevisionModal('TITLE')}
                  className="flex items-center gap-1 text-[11px] text-violet-300 hover:text-white px-2 py-0.5 rounded bg-violet-950/50 hover:bg-violet-900/60 border border-violet-500/30 transition-colors"
                  title="Prompt AI to revise or brainstorm the title"
                >
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  <span>Prompt AI to Revise Title</span>
                </button>
              </div>
              <input
                type="text"
                value={scenarioTitle}
                onChange={(e) => setScenarioTitle(e.target.value)}
                placeholder="Enter storyline title (e.g., Sabotage at Station Helios)..."
                className="w-full bg-slate-950/90 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Master Narrative Lore Field with Revision Action */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  Master Narrative Lore Source (Setting Background, Inciting Crisis &amp; Factions)
                </label>
                <button
                  type="button"
                  onClick={() => handleOpenRevisionModal('LORE')}
                  className="flex items-center gap-1 text-[11px] text-violet-300 hover:text-white px-2 py-0.5 rounded bg-violet-950/50 hover:bg-violet-900/60 border border-violet-500/30 transition-colors"
                  title="Prompt AI to rewrite or deepen this lore"
                >
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  <span>Prompt AI to Revise Lore</span>
                </button>
              </div>
              <textarea
                value={masterText}
                onChange={(e) => setMasterText(e.target.value)}
                rows={5}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 leading-relaxed focus:outline-none focus:border-sky-500 resize-none"
                placeholder="Enter or paste your storyline lore here, or click 'Prompt AI to Revise Storyline' to brainstorm from a premise..."
              />
            </div>
          </div>

          {/* DAG Solvability Invariants Panel */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-200">
                  Pre-Game Solvability Invariants
                </h2>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                  validation.isValid
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-rose-950 text-rose-300 border-rose-700'
                }`}
              >
                {validation.isValid
                  ? 'ALL INVARIANTS SATISFIED'
                  : 'DAG VIOLATIONS DETECTED'}
              </span>
            </div>

            <div className="space-y-3">
              <div
                className={`p-3 rounded-lg border text-xs ${
                  validation.zeroSelfSufficiency
                    ? 'bg-slate-950/40 border-slate-800 text-slate-300'
                    : 'bg-rose-950/20 border-rose-800/60 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {validation.zeroSelfSufficiency ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span className="font-semibold text-slate-200">
                      Zero Self-Sufficiency Invariant
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    |H_0(P_i) ∩ G_j| &lt; |G_j|
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  No player can complete any assigned Goal on Turn 0 without trade or interrogation.
                </p>
              </div>

              <div
                className={`p-3 rounded-lg border text-xs ${
                  validation.globalReachability
                    ? 'bg-slate-950/40 border-slate-800 text-slate-300'
                    : 'bg-rose-950/20 border-rose-800/60 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {validation.globalReachability ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span className="font-semibold text-slate-200">
                      Global Reachability Invariant (100% Coverage)
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    ∪ H_0(P_i) ⊇ ∪ G_j.requiredCardIds
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  The union of all starting hands contains 100% of all required clues across all goals.
                </p>
                {validation.details.uncoveredRequiredCardIds.length > 0 && (
                  <div className="mt-2 text-rose-400 font-mono text-[10px]">
                    Missing from all hands:{' '}
                    {validation.details.uncoveredRequiredCardIds.join(', ')}
                  </div>
                )}
              </div>

              <div
                className={`p-3 rounded-lg border text-xs ${
                  validation.asymmetricLeverage
                    ? 'bg-slate-950/40 border-slate-800 text-slate-300'
                    : 'bg-rose-950/20 border-rose-800/60 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {validation.asymmetricLeverage ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span className="font-semibold text-slate-200">
                      Asymmetric Dependency Seeding
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    Leverage Cards &ge; 2 per Player
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Every player starts holding at least 2 cards required by other players' goals to guarantee bargaining leverage.
                </p>
                <div className="flex flex-wrap gap-2 mt-2 font-mono text-[10px]">
                  {Object.entries(validation.details.playerLeverageCounts).map(
                    ([pId, count]) => (
                      <span
                        key={pId}
                        className={`px-2 py-0.5 rounded ${
                          count >= 2
                            ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {pId}: {count} leverage cards
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Character Dossier, Active Metadata & Hand Inspector (Cols 8-12) */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {/* Active Simulation Spec Summary */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">
                Compiled Simulation Metadata
              </span>
              {simulationState.publishedToCollection ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                  Published in Collection
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-semibold">
                  Draft / Private
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">Active Voice</div>
                <div className="font-semibold text-violet-300 truncate">
                  {simulationState.voiceStyle?.name ?? 'Direct Conversational'}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">Readability Level</div>
                <div className="font-semibold text-sky-300">
                  {READABILITY_CONFIG[simulationState.readabilityLevel ?? 'NORMAL']?.gradeLevel}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">Complexity / Clues</div>
                <div className="font-semibold text-purple-300">
                  {simulationState.complexityTier ?? 'STANDARD'} (
                  {Object.keys(simulationState.cards).length} cards /{' '}
                  {Object.keys(simulationState.goals).length} goals)
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">Character Seats</div>
                <div className="font-semibold text-amber-300">
                  {simulationState.characterCount ?? Object.keys(simulationState.characters).length} Roles
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">Creator Sims Paid</div>
                <div className="font-mono font-bold text-amber-300">
                  {simulationState.creationCostSims ?? 20} Sims
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">10% Play Fee / Royalty</div>
                <div className="font-mono font-bold text-emerald-300">
                  {simulationState.usageCostSims ??
                    calculateCollectionUsageCostSims(
                      simulationState.creationCostSims ?? 20
                    )}{' '}
                  Sims
                </div>
              </div>
            </div>
          </div>

          {/* Character Editor: Hidden/Locked Until Story Has Been Generated */}
          {!hasStoryBeenGenerated ? (
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-100">
                  Character Sheet Inspector Locked
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  When designing a new simulation, the character editor and private dossiers remain locked until the story has been generated and approved.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 max-w-sm mx-auto text-left space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Selected Readability:</span>
                  <span className="font-semibold text-sky-400">
                    {READABILITY_CONFIG[readabilityLevel]?.label} ({READABILITY_CONFIG[readabilityLevel]?.gradeLevel})
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Character Seats:</span>
                  <span className="font-semibold text-purple-400">
                    {characterCount} Characters
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Storyline Lore:</span>
                  <span className="font-mono text-amber-300">
                    {masterText.trim()
                      ? `${masterText.trim().length} chars (Ready to compile)`
                      : 'Pending lore entry'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Click <span className="text-amber-400 font-semibold">"Spend Sims &amp; Compile Graph"</span> or approve a revision prompt to cast your {characterCount} characters and generate their starting clues.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-semibold text-slate-200">
                    Character Sheet Inspector
                  </h2>
                </div>
              </div>

              {/* Character Selector Pills */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.values(simulationState.characters).map((char) => (
                  <button
                    key={char.playerId}
                    onClick={() => setSelectedCharacterId(char.playerId)}
                    className={`p-2 rounded-lg text-left transition-all border text-xs ${
                      selectedCharacterId === char.playerId
                        ? 'bg-sky-950/60 border-sky-500 text-sky-200'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-slate-100 flex items-center justify-between">
                      <span className="truncate">{char.characterName}</span>
                      {char.isAiControlled && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          AI
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {char.publicRole}
                    </div>
                  </button>
                ))}
              </div>

              {selectedChar && (
                <div className="space-y-3 text-xs">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                      <span>Hidden Stat Vector</span>
                      <span className="text-amber-400">Server-Side Normalized</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                      <div className="bg-slate-900 p-1.5 rounded">
                        <span className="text-slate-400">Inquiry:</span>{' '}
                        <span className="font-bold text-sky-400">
                          {selectedChar.hiddenStats.inquiry.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-slate-900 p-1.5 rounded">
                        <span className="text-slate-400">Coercion:</span>{' '}
                        <span className="font-bold text-rose-400">
                          {selectedChar.hiddenStats.coercion.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-slate-900 p-1.5 rounded">
                        <span className="text-slate-400">Negotiation:</span>{' '}
                        <span className="font-bold text-emerald-400">
                          {selectedChar.hiddenStats.negotiation.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-slate-900 p-1.5 rounded">
                        <span className="text-slate-400">Deception:</span>{' '}
                        <span className="font-bold text-purple-400">
                          {selectedChar.hiddenStats.deception.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-slate-900 p-1.5 rounded">
                        <span className="text-slate-400">Composure:</span>{' '}
                        <span className="font-bold text-amber-400">
                          {selectedChar.hiddenStats.composure.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-slate-900 p-1.5 rounded">
                        <span className="text-slate-400">Insight:</span>{' '}
                        <span className="font-bold text-teal-400">
                          {selectedChar.hiddenStats.insight.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
                      Private Narrative Bio (Voice-Woven Output)
                    </span>
                    <p className="text-slate-300 italic leading-relaxed text-xs">
                      "{selectedChar.privateNarrativeBio}"
                    </p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
                      Starting InfoCards ({charCards.length})
                    </span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {charCards.map((c) => (
                        <div
                          key={c.id}
                          className="p-1.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex justify-between gap-2"
                        >
                          <span className="font-semibold text-slate-200">
                            {c.title}
                          </span>
                          <span className="font-mono text-slate-500 shrink-0">
                            [{c.secrecy}]
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* STORYLINE & SIMULATION LIBRARY MODAL                               */}
      {/* ================================================================== */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/70">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    Storyline &amp; Simulation Library
                  </h2>
                  <p className="text-xs text-slate-400">
                    Browse, open to edit, or make a copy of any simulation storyline.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateNewSimulation}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create New Simulation</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLibraryModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder="Search storylines by title or lore..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setLibraryFilter('ALL')}
                  className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                    libraryFilter === 'ALL'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Storylines ({allSimulationsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryFilter('MY_STORIES')}
                  className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                    libraryFilter === 'MY_STORIES'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  My Creations (
                  {
                    allSimulationsList.filter(
                      (s) =>
                        (currentUser?.id && s.creatorUserId === currentUser.id) ||
                        (currentUser?.username &&
                          s.creatorUsername === currentUser.username)
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryFilter('DEFAULT')}
                  className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                    libraryFilter === 'DEFAULT'
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Default Scenarios (
                  {
                    allSimulationsList.filter(
                      (s) =>
                        s.id.startsWith('sim_helios') ||
                        s.id.startsWith('sim_geneva') ||
                        s.id.startsWith('sim_meridian') ||
                        s.id.startsWith('sim_noir') ||
                        s.id.startsWith('sim_fantasy')
                    ).length
                  }
                  )
                </button>
              </div>
            </div>

            {/* Storyline Cards Grid */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {filteredLibrarySimulations.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No storylines found matching your search.
                </div>
              ) : (
                filteredLibrarySimulations.map((sim) => {
                  const isCurrent = sim.id === simulationState.id;
                  const isBuiltIn =
                    sim.id.startsWith('sim_helios') ||
                    sim.id.startsWith('sim_geneva') ||
                    sim.id.startsWith('sim_meridian') ||
                    sim.id.startsWith('sim_noir') ||
                    sim.id.startsWith('sim_fantasy');

                  return (
                    <div
                      key={sim.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isCurrent
                          ? 'bg-purple-950/25 border-purple-500/50 shadow-md'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white">
                              {sim.title}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                Active in Studio
                              </span>
                            )}
                            {isBuiltIn && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                                Default Preset
                              </span>
                            )}
                            {sim.creatorUsername && !isBuiltIn && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-500/30">
                                Creator: @{sim.creatorUsername}
                              </span>
                            )}
                            {sim.voiceStyle && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-violet-950/50 text-violet-300 border border-violet-700/40 font-semibold">
                                {sim.voiceStyle.name}
                              </span>
                            )}
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-sky-300 border border-slate-800">
                              {sim.complexityTier ?? 'STANDARD'}
                            </span>
                          </div>

                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {sim.masterNarrative ||
                              'No master narrative drafted yet.'}
                          </p>

                          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                            <span>{Object.keys(sim.cards).length} Clue Cards</span>
                            <span>•</span>
                            <span>{Object.keys(sim.goals).length} Goals</span>
                            <span>•</span>
                            <span>
                              {Object.keys(sim.characters).length} Roles
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMakeCopy(sim)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors"
                            title="Make an editable copy of this storyline"
                          >
                            <Copy className="w-3.5 h-3.5 text-amber-400" />
                            <span>Make a Copy</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenStorylineFromLibrary(sim)}
                            disabled={isCurrent}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              isCurrent
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-500 text-white shadow'
                            }`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>
                              {isCurrent ? 'Currently Open' : 'Open & Edit'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* AI STORYLINE WORKSHOP & REVISION POPUP                             */}
      {/* ================================================================== */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-3xl max-h-[92vh] bg-slate-900 border border-violet-500/40 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/35 flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>AI Storyline Workshop &amp; Revision</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-500/30">
                      DeepSeek {useV4ProForCreation ? 'V4 Pro' : 'Flash'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Prompt the AI to modify, twist, deepen, or redirect your
                    storyline in the active literary voice.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowRevisionModal(false);
                  setRevisionResult(null);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {!revisionResult ? (
                /* PHASE 1: PROMPT INPUT */
                <div className="space-y-4">
                  {/* Current Storyline Context Card */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span className="font-semibold uppercase tracking-wider font-mono">
                        Current Storyline Under Revision
                      </span>
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-sky-300 font-medium">
                          {READABILITY_CONFIG[readabilityLevel]?.gradeLevel}
                        </span>
                        <span>•</span>
                        <span className="text-purple-300 font-medium">
                          {characterCount} Seats
                        </span>
                        <span>•</span>
                        <span className="text-violet-300 font-medium">
                          Voice: {activeCollectionVoice?.name ?? 'Direct Conversational'}
                        </span>
                      </div>
                    </div>
                    <div className="font-bold text-white text-sm">
                      {scenarioTitle || 'Untitled Simulation'}
                    </div>
                    <p className="text-slate-300 text-xs italic line-clamp-3 leading-relaxed">
                      "
                      {masterText ||
                        'No master narrative entered yet. Describe your premise below to generate from scratch!'}
                      "
                    </p>
                  </div>

                  {/* Prompt Instruction Area */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-200">
                      How should the AI revise your storyline?
                    </label>
                    <textarea
                      value={revisionUserPrompt}
                      onChange={(e) => setRevisionUserPrompt(e.target.value)}
                      rows={3}
                      placeholder="e.g., Introduce a corporate espionage twist involving stolen cryogenic cores. Make the science officer secretly indebted to an outside syndicate, and elevate the urgency with a looming station lockdown..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-violet-500 resize-none"
                    />
                  </div>

                  {/* Prompt Inspiration Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono text-slate-400">
                      Quick Idea Presets (Click to Add):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'Add a corporate espionage twist involving stolen classified assets',
                        'Heighten tension with a looming countdown and severe consequences',
                        'Introduce a syndicate double agent operating under deep cover',
                        'Make the conflict more morally ambiguous with conflicting loyalties',
                        'Weave in an unexpected technical sabotage disguised as an accident',
                        'Add a political blackmail conspiracy between rival leadership factions',
                      ].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() =>
                            setRevisionUserPrompt((prev) =>
                              prev ? `${prev}. ${chip}` : chip
                            )
                          }
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-violet-500/40 transition-colors text-left"
                        >
                          + {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action Row */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <div className="text-[11px] text-slate-400">
                      Voice Tone:{' '}
                      <strong className="text-violet-300">
                        {activeCollectionVoice?.name}
                      </strong>{' '}
                      (
                      {activeCollectionVoice?.authorInspiration ??
                        'Iconic Author'}
                      )
                    </div>
                    <button
                      type="button"
                      onClick={handleExecuteStorylineRevision}
                      disabled={isRevisingStoryline || !revisionUserPrompt.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors shadow disabled:opacity-40"
                    >
                      {isRevisingStoryline ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Regenerating Storyline with AI...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Submit Revision Prompt</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* PHASE 2: USER REVIEW & APPROVAL */
                <div className="space-y-4">
                  {/* AI Change Summary */}
                  <div className="p-3.5 rounded-xl bg-violet-950/30 border border-violet-500/40 space-y-2">
                    <div className="flex items-center gap-2 text-violet-300 text-xs font-bold">
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>AI Revision Proposal Ready for Your Review</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {revisionResult.changeSummary}
                    </p>
                    {revisionResult.keyElementsAdded.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {revisionResult.keyElementsAdded.map((elem, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-emerald-300 border border-emerald-500/30"
                          >
                            ✓ {elem}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Editable Revised Fields */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-200">
                        Revised Storyline Title (Review &amp; Edit)
                      </label>
                      <input
                        type="text"
                        value={editableRevisedTitle}
                        onChange={(e) =>
                          setEditableRevisedTitle(e.target.value)
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-violet-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-200">
                          Revised Master Narrative Lore (Review &amp; Edit)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setShowOriginalComparison((prev) => !prev)
                          }
                          className="text-[11px] text-sky-400 hover:text-sky-300 underline"
                        >
                          {showOriginalComparison
                            ? 'Hide Original Comparison'
                            : 'Compare with Original'}
                        </button>
                      </div>
                      <textarea
                        value={editableRevisedLore}
                        onChange={(e) =>
                          setEditableRevisedLore(e.target.value)
                        }
                        rows={6}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-100 leading-relaxed focus:outline-none focus:border-violet-500 resize-none"
                      />
                    </div>

                    {showOriginalComparison && (
                      <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1 text-xs">
                        <span className="font-mono text-[10px] uppercase text-slate-500">
                          Original Master Narrative
                        </span>
                        <p className="text-slate-400 text-xs italic leading-relaxed">
                          "{masterText || 'None'}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Approval Action Buttons */}
                  <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => setRevisionResult(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Tweak Prompt / Revise Again</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleApproveStorylineToStudio}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold transition-colors border border-slate-700"
                        title="Apply title and lore to studio fields without compiling immediately"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Approve &amp; Apply to Studio</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleApproveAndDiceIntoCards}
                        disabled={isCompiling}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors shadow-lg disabled:opacity-40"
                        title="Approve this storyline and immediately dice into clue cards and generate character dossiers"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Approve &amp; Dice into Cards &amp; Characters</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
