import React, { useEffect, useMemo, useState } from 'react';
import {
  READABILITY_CONFIG,
  ReadabilityLevel,
  SimulationComplexityTier,
  SimulationState,
  SpeechStyle,
} from '../../types/simulation';
import { UserAccount } from '../../types/user';
import { reconcileCardDistribution } from '../../engine/compiler';
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
  Bot,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import { createStationHeliosScenario } from '../../alpha/scenarioData';
import { buildRagIndexFromState } from '../../engine/ragPartition';
import { UserSeatInviteModal } from '../modals/UserSeatInviteModal';
import { getPendingInvitationForSeat } from '../../services/seatInviteService';

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
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('vance');
  const [inviteModalCharId, setInviteModalCharId] = useState<string | null>(null);

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
      characters: {},
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

      // 3. Construct initial character models for the generated cast
      const initialCharacters: SimulationState['characters'] = {};
      for (const cConcept of generatedCast) {
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

        initialCharacters[cConcept.slotId] = {
          playerId: cConcept.slotId,
          simulationId: simulationState.id,
          characterName: cConcept.characterName,
          publicRole: cConcept.publicRole,
          privateNarrativeBio: '',
          coreTraits: cConcept.coreTraits,
          coreMotives: cConcept.coreMotives,
          hiddenStats: cConcept.hiddenStats,
          defensivePolicy: {
            protectedCardIds: [],
            tradeableCardIds: [],
            stanceByPlayerId: defaultStances,
          },
          actionPoints: 3,
          victoryPoints: 0,
        };
      }

      // 4. Automatically reconcile and balance epistemic DAG dependencies across the cast
      // Enforces Zero Self-Sufficiency, Global Reachability, and Asymmetric Leverage >= 2 per player
      const preReconciledState: SimulationState = {
        ...simulationState,
        title: effectiveTitle,
        masterNarrative: effectiveLore,
        characters: initialCharacters,
        cards: newCards,
        goals: newGoals,
        characterCount: generatedCast.length,
      };

      const reconciledState = reconcileCardDistribution(preReconciledState);

      // 5. Weave private character narrative dossiers using the reconciled starting cards
      const updatedCharacters: SimulationState['characters'] = {};

      await Promise.all(
        generatedCast.map(async (cConcept) => {
          const assignedCards = Object.values(reconciledState.cards).filter((c) =>
            c.knownByPlayerIds.includes(cConcept.slotId)
          );

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

          const baseChar =
            reconciledState.characters[cConcept.slotId] ||
            initialCharacters[cConcept.slotId];

          updatedCharacters[cConcept.slotId] = {
            ...baseChar,
            privateNarrativeBio: wovenBio,
          };
        })
      );

      const newState: SimulationState = {
        ...simulationState,
        title: effectiveTitle,
        masterNarrative: effectiveLore,
        currentTurnOrTick: 0,
        characters: updatedCharacters,
        cards: reconciledState.cards,
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
      setPaidCurrentDraft(true);
      setScenarioTitle(effectiveTitle);
      setMasterText(effectiveLore);
      setStudioNotice(
        `Spent ${totalCreationCostSims} Sims: Storyline successfully diced into ${
          Object.keys(reconciledState.cards).length
        } clues across ${generatedCast.length} character dossiers with auto-balanced asymmetric dependencies [${
          COMPLEXITY_TIER_CONFIG[complexityTier].label
        }, Voice: ${voiceResult.voice.name}${
          useV4ProForCreation ? ', DeepSeek V4 Pro' : ', DeepSeek Flash'
        }]. Ready to launch!`
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
  };

  const selectedChar = simulationState.characters[selectedCharacterId];
  const charCards = Object.values(simulationState.cards).filter((c) =>
    c.knownByPlayerIds.includes(selectedCharacterId)
  );

  return (
    <div className="flex flex-col h-full bg-base-100 text-base-content overflow-y-auto p-4 sm:p-6 font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-base-300 mb-6">
        <div className="flex items-center gap-3">
          {onExitStudio && (
            <button
              type="button"
              onClick={onExitStudio}
              className="btn btn-ghost btn-sm gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {exitLabel}
            </button>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Layers className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold tracking-tight">
                Story Studio
              </h1>
              {simulations && onSelectSimulation && (
                <select
                  value={simulationState.id}
                  onChange={(e) => onSelectSimulation(e.target.value)}
                  className="select select-bordered select-xs font-semibold"
                >
                  {Object.values(simulations).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs text-base-content/70 mt-0.5">
              Write your story, pick characters, and let AI build secret clues.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {currentUser && (
            <div className="badge badge-warning badge-outline font-mono gap-1 text-xs py-2 px-3">
              <Coins className="w-3.5 h-3.5" />
              <span>{currentUser.simsBalance ?? 0} Sims</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleCreateNewSimulation}
            className="btn btn-primary btn-sm gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Game</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLibraryModal(true)}
            className="btn btn-outline btn-sm gap-1"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Library</span>
          </button>

          <button
            type="button"
            onClick={() => handleMakeCopy()}
            className="btn btn-outline btn-sm gap-1"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </button>

          <button
            onClick={handleResetToHeliosPreset}
            className="btn btn-ghost btn-sm gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo</span>
          </button>

          {onCreateSimulation && (
            <button
              onClick={handlePublishToCollection}
              disabled={!hasStoryBeenGenerated}
              className="btn btn-secondary btn-sm gap-1"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Publish</span>
            </button>
          )}

          <button
            onClick={onLaunchSimulation}
            disabled={!hasStoryBeenGenerated}
            className="btn btn-primary btn-sm gap-1"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play Game</span>
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
        {/* Left Column: Story Settings & Narrative Input */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          {/* 1. Game Complexity & AI Model */}
          <div className="card bg-base-200 border border-base-300 p-4 shadow space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-warning" />
                <h2 className="text-sm font-bold">
                  1. Game Complexity &amp; AI Model
                </h2>
              </div>
              <span className="badge badge-sm badge-warning badge-outline font-mono">
                +{nominalCollectionPlayCostSims} Sims / Unlock
              </span>
            </div>

            {/* Complexity Tier Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                      className={`btn btn-sm h-auto py-2.5 flex-col items-start normal-case text-left ${
                        active ? 'btn-primary' : 'btn-outline border-base-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-xs">{cfg.shortLabel}</span>
                        <span className="badge badge-xs font-mono">{cfg.costSims} Sims</span>
                      </div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {cfg.cardRange[0]}–{cfg.cardRange[1]} Clues
                      </div>
                    </button>
                  );
                }
              )}
            </div>

            {/* V4 Pro Paid Toggle */}
            <div className="flex items-center justify-between gap-4 p-2.5 rounded-lg bg-base-100 border border-base-300">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-secondary" />
                  <span className="text-xs font-bold">Use AI Pro Model</span>
                  <span className="badge badge-xs badge-secondary">+{V4_PRO_CREATION_COST_SIMS} Sims</span>
                </div>
                <p className="text-[11px] text-base-content/70">
                  Makes story writing smarter and more detailed.
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
                className={`btn btn-xs ${useV4ProForCreation ? 'btn-secondary' : 'btn-ghost border-base-300'}`}
              >
                {useV4ProForCreation ? 'Pro: ON' : 'Pro: OFF'}
              </button>
            </div>
          </div>

          {/* 2. Reading Level */}
          <div className="card bg-base-200 border border-base-300 p-4 shadow space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold">
                  2. Reading Level
                </h2>
              </div>
              <span className="badge badge-xs badge-ghost">Required</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                      className={`btn btn-sm h-auto py-2.5 flex-col items-start normal-case text-left ${
                        active ? 'btn-primary' : 'btn-outline border-base-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-xs">{cfg.label}</span>
                        <span className="badge badge-xs">{cfg.gradeLevel}</span>
                      </div>
                      <p className="text-[10px] opacity-70 mt-0.5 line-clamp-1">
                        {cfg.description}
                      </p>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* 3. Number of Characters */}
          <div className="card bg-base-200 border border-base-300 p-4 shadow space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-secondary" />
                <h2 className="text-sm font-bold">
                  3. Number of Characters
                </h2>
              </div>
              <span className="badge badge-xs badge-ghost font-mono">
                4 default • +10 Sims each extra
              </span>
            </div>

            <div className="grid grid-cols-6 gap-2">
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
                    className={`btn btn-sm h-auto py-2 flex-col items-center ${
                      active ? 'btn-primary' : 'btn-outline border-base-300'
                    }`}
                  >
                    <span className="text-sm font-bold">{count}</span>
                    <span className="text-[10px] opacity-70">
                      {extraCost > 0 ? `+${extraCost} Sims` : 'Free'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. AI Voice & Style */}
          <div className="card bg-base-200 border border-base-300 p-4 shadow space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-secondary" />
                <h2 className="text-sm font-bold">
                  4. Story Voice &amp; Style
                </h2>
              </div>

              <div className="join">
                <button
                  type="button"
                  onClick={() => {
                    setVoiceMode('COLLECTION');
                    setPaidCurrentDraft(false);
                  }}
                  className={`join-item btn btn-xs ${
                    voiceMode === 'COLLECTION' ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  Standard Voices (Free)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceMode('CUSTOM');
                    setPaidCurrentDraft(false);
                  }}
                  className={`join-item btn btn-xs ${
                    voiceMode === 'CUSTOM' ? 'btn-secondary' : 'btn-ghost'
                  }`}
                >
                  <Wand2 className="w-3 h-3" />
                  Custom Voice (+{CUSTOM_VOICE_CREATION_COST_SIMS} Sims)
                </button>
              </div>
            </div>

            {voiceMode === 'COLLECTION' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
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
                        className={`card bg-base-100 border p-3 text-left transition-all hover:border-primary/50 ${
                          isSelected
                            ? 'border-primary ring-1 ring-primary'
                            : 'border-base-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-bold">{voice.name}</span>
                          {voice.authorInspiration && (
                            <span className="badge badge-xs badge-ghost">
                              {voice.authorInspiration}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-base-content/80 mb-1">
                          {voice.tagline}
                        </p>
                        <p className="text-[10px] italic text-base-content/60 line-clamp-1">
                          {voice.sampleLine}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {activeCollectionVoice && (
                  <div className="flex items-center justify-between gap-3 pt-1 text-xs text-base-content/70">
                    <span>
                      Selected Voice:{' '}
                      <strong className="text-primary">
                        {activeCollectionVoice.name}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyCollectionVoicePreview}
                      className="btn btn-xs btn-outline"
                    >
                      Use in Current Game
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="card bg-base-100 border border-secondary/30 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-secondary">
                    Custom Author Style (+{CUSTOM_VOICE_CREATION_COST_SIMS} Sims)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customVoiceName}
                    onChange={(e) => setCustomVoiceName(e.target.value)}
                    placeholder="Style Name (e.g. Cyberpunk Noir)"
                    className="input input-bordered input-sm bg-base-200"
                  />
                  <input
                    type="text"
                    value={customVoiceGenre}
                    onChange={(e) => setCustomVoiceGenre(e.target.value)}
                    placeholder="Genre (e.g. Sci-Fi)"
                    className="input input-bordered input-sm bg-base-200"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customVoiceAuthor}
                    onChange={(e) => setCustomVoiceAuthor(e.target.value)}
                    placeholder="Author (e.g. William Gibson)"
                    className="input input-bordered input-sm bg-base-200"
                  />
                  <input
                    type="text"
                    value={customVoiceTagline}
                    onChange={(e) => setCustomVoiceTagline(e.target.value)}
                    placeholder="Short description"
                    className="input input-bordered input-sm bg-base-200"
                  />
                </div>
                <textarea
                  value={customVoiceDirective}
                  onChange={(e) => setCustomVoiceDirective(e.target.value)}
                  rows={2}
                  placeholder="Instructions for how the AI should write dialogue and story..."
                  className="textarea textarea-bordered bg-base-200 text-xs resize-none"
                />
                <input
                  type="text"
                  value={customVoiceSample}
                  onChange={(e) => setCustomVoiceSample(e.target.value)}
                  placeholder="Sample sentence spoken by a character..."
                  className="input input-bordered input-sm bg-base-200"
                />
              </div>
            )}
          </div>

          {/* 5. Story Title & Lore */}
          <div className="card bg-base-200 border border-base-300 p-4 shadow space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold">
                  5. Story Title &amp; Lore
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleOpenRevisionModal('ALL')}
                  className="btn btn-outline btn-sm gap-1"
                >
                  <Wand2 className="w-3.5 h-3.5 text-secondary" />
                  <span>Ask AI to Revise</span>
                </button>
                <button
                  onClick={handleRecompile}
                  disabled={isCompiling}
                  className="btn btn-primary btn-sm gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isCompiling
                    ? 'Creating...'
                    : `Create Story (${totalCreationCostSims} Sims)`}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/70 p-2 rounded-lg bg-base-100 border border-base-300">
              <span>
                Cost: <span className="font-semibold text-base-content">{buildCostBreakdownLabel()}</span>
              </span>
              <span className="badge badge-sm badge-success badge-outline">
                Earn {nominalCollectionPlayCostSims} Sims per play
              </span>
            </div>

            {/* Storyline Title Field */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold">
                  Story Title
                </label>
                <button
                  type="button"
                  onClick={() => handleOpenRevisionModal('TITLE')}
                  className="btn btn-ghost btn-xs text-secondary gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Revise Title
                </button>
              </div>
              <input
                type="text"
                value={scenarioTitle}
                onChange={(e) => setScenarioTitle(e.target.value)}
                placeholder="Story title (e.g. Mystery on Mars)..."
                className="input input-bordered input-sm w-full bg-base-100 font-semibold"
              />
            </div>

            {/* Master Narrative Lore Field */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold">
                  Story Lore &amp; Background
                </label>
                <button
                  type="button"
                  onClick={() => handleOpenRevisionModal('LORE')}
                  className="btn btn-ghost btn-xs text-secondary gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Revise Lore
                </button>
              </div>
              <textarea
                value={masterText}
                onChange={(e) => setMasterText(e.target.value)}
                rows={5}
                className="textarea textarea-bordered w-full bg-base-100 text-xs leading-relaxed resize-none"
                placeholder="Write your story setup here, or click 'Ask AI to Revise' to generate one..."
              />
            </div>
          </div>
        </div>

        {/* Right Column: Character Dossier & Inspector */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {!hasStoryBeenGenerated ? (
            <div className="card bg-base-200 border border-base-300 p-6 text-center shadow space-y-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto text-primary">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold">
                  Character List Locked
                </h3>
                <p className="text-xs text-base-content/70 max-w-sm mx-auto">
                  Click "Create Story" above to build your characters, goals, and secret clues.
                </p>
              </div>

              <div className="card bg-base-100 border border-base-300 p-3 max-w-sm mx-auto text-left space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-base-content/70">
                  <span>Reading Level:</span>
                  <span className="font-semibold text-primary">
                    {READABILITY_CONFIG[readabilityLevel]?.label} ({READABILITY_CONFIG[readabilityLevel]?.gradeLevel})
                  </span>
                </div>
                <div className="flex items-center justify-between text-base-content/70">
                  <span>Characters:</span>
                  <span className="font-semibold text-secondary">
                    {characterCount} Characters
                  </span>
                </div>
                <div className="flex items-center justify-between text-base-content/70">
                  <span>Story Lore:</span>
                  <span className="font-semibold">
                    {masterText.trim() ? 'Ready' : 'Not entered yet'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="card bg-base-200 border border-base-300 p-4 shadow space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold">
                    Characters ({Object.keys(simulationState.characters).length})
                  </h2>
                </div>
              </div>

              {/* Character Selector Pills */}
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(simulationState.characters).map((char) => {
                  const seatInvite = getPendingInvitationForSeat(
                    simulationState.id,
                    char.playerId
                  );
                  const isSelected = selectedCharacterId === char.playerId;

                  return (
                    <button
                      key={char.playerId}
                      onClick={() => setSelectedCharacterId(char.playerId)}
                      className={`btn btn-sm h-auto py-2 flex-col items-start normal-case text-left ${
                        isSelected
                          ? 'btn-primary'
                          : 'btn-outline border-base-300 bg-base-100'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center justify-between w-full">
                        <span className="truncate">{char.characterName}</span>
                        {char.assignedUsername ? (
                          <span className="badge badge-xs badge-success">
                            @{char.assignedUsername}
                          </span>
                        ) : seatInvite ? (
                          <span className="badge badge-xs badge-warning">
                            Invited
                          </span>
                        ) : char.isAiControlled ? (
                          <span className="badge badge-xs badge-secondary">
                            AI
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[10px] opacity-70 truncate w-full">
                        {char.publicRole}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedChar && (
                <div className="space-y-3 text-xs">
                  {/* Seat Assignment Card */}
                  <div className="card bg-base-100 border border-base-300 p-3 flex flex-row items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-base-content/60 font-medium">
                        Player Seat
                      </div>
                      <div className="font-bold flex items-center gap-1.5 mt-0.5">
                        {selectedChar.assignedUserId ? (
                          <span className="text-success flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" />
                            @{selectedChar.assignedUsername}
                          </span>
                        ) : selectedChar.isAiControlled ? (
                          <span className="text-secondary flex items-center gap-1">
                            <Bot className="w-3.5 h-3.5" />
                            AI Controlled
                          </span>
                        ) : (
                          <span className="text-base-content/60 flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            Open Seat
                          </span>
                        )}
                        {getPendingInvitationForSeat(simulationState.id, selectedChar.playerId) && (
                          <span className="badge badge-xs badge-warning">
                            Invite pending
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInviteModalCharId(selectedChar.playerId)}
                      className="btn btn-xs btn-primary gap-1"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>{selectedChar.assignedUserId ? 'Reassign' : 'Invite Player'}</span>
                    </button>
                  </div>

                  {/* Character Skills */}
                  <div className="card bg-base-100 border border-base-300 p-3 space-y-1.5">
                    <div className="text-[11px] font-semibold text-base-content/70">
                      Skills
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                      <div className="p-1 rounded bg-base-200 flex justify-between">
                        <span className="opacity-70">Inquiry:</span>
                        <span className="font-bold">{selectedChar.hiddenStats.inquiry.toFixed(1)}</span>
                      </div>
                      <div className="p-1 rounded bg-base-200 flex justify-between">
                        <span className="opacity-70">Pressure:</span>
                        <span className="font-bold">{selectedChar.hiddenStats.coercion.toFixed(1)}</span>
                      </div>
                      <div className="p-1 rounded bg-base-200 flex justify-between">
                        <span className="opacity-70">Bargain:</span>
                        <span className="font-bold">{selectedChar.hiddenStats.negotiation.toFixed(1)}</span>
                      </div>
                      <div className="p-1 rounded bg-base-200 flex justify-between">
                        <span className="opacity-70">Trick:</span>
                        <span className="font-bold">{selectedChar.hiddenStats.deception.toFixed(1)}</span>
                      </div>
                      <div className="p-1 rounded bg-base-200 flex justify-between">
                        <span className="opacity-70">Calm:</span>
                        <span className="font-bold">{selectedChar.hiddenStats.composure.toFixed(1)}</span>
                      </div>
                      <div className="p-1 rounded bg-base-200 flex justify-between">
                        <span className="opacity-70">Insight:</span>
                        <span className="font-bold">{selectedChar.hiddenStats.insight.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Character Secret Bio */}
                  <div className="card bg-base-100 border border-base-300 p-3 space-y-1">
                    <span className="text-[11px] font-semibold text-base-content/70">
                      Secret Bio
                    </span>
                    <p className="text-base-content/80 italic text-xs leading-relaxed">
                      "{selectedChar.privateNarrativeBio}"
                    </p>
                  </div>

                  {/* Starting Clues */}
                  <div className="card bg-base-100 border border-base-300 p-3 space-y-1.5">
                    <span className="text-[11px] font-semibold text-base-content/70">
                      Starting Clues ({charCards.length})
                    </span>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {charCards.map((c) => (
                        <div
                          key={c.id}
                          className="p-1.5 rounded bg-base-200 text-xs flex justify-between items-center"
                        >
                          <span className="font-medium truncate">{c.title}</span>
                          <span className="badge badge-xs badge-ghost shrink-0">
                            {c.secrecy}
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

      {/* STORY LIBRARY MODAL */}
      {showLibraryModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-4xl bg-base-200 border border-base-300 p-0 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-base-300 flex items-center justify-between gap-4 bg-base-300/40">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-base font-bold">
                    Story Library
                  </h2>
                  <p className="text-xs text-base-content/70">
                    Pick a story to edit or copy.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateNewSimulation}
                  className="btn btn-primary btn-sm gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Story</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLibraryModal(false)}
                  className="btn btn-ghost btn-sm btn-square"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="p-3 border-b border-base-300 bg-base-100 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-base-content/50 absolute left-3 top-2" />
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder="Search stories..."
                  className="input input-bordered input-sm pl-9 w-full bg-base-200"
                />
              </div>

              <div className="join">
                <button
                  type="button"
                  onClick={() => setLibraryFilter('ALL')}
                  className={`join-item btn btn-xs ${
                    libraryFilter === 'ALL' ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  All ({allSimulationsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryFilter('MY_STORIES')}
                  className={`join-item btn btn-xs ${
                    libraryFilter === 'MY_STORIES' ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  My Stories
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryFilter('DEFAULT')}
                  className={`join-item btn btn-xs ${
                    libraryFilter === 'DEFAULT' ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  Starter Stories
                </button>
              </div>
            </div>

            {/* Story Cards Grid */}
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2">
              {filteredLibrarySimulations.length === 0 ? (
                <div className="p-8 text-center text-base-content/50 text-xs">
                  No stories found.
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
                      className={`card bg-base-100 border p-3 transition-all ${
                        isCurrent
                          ? 'border-primary ring-1 ring-primary'
                          : 'border-base-300'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold">
                              {sim.title}
                            </span>
                            {isCurrent && (
                              <span className="badge badge-xs badge-primary">
                                Current
                              </span>
                            )}
                            {isBuiltIn && (
                              <span className="badge badge-xs badge-ghost">
                                Starter
                              </span>
                            )}
                            {sim.voiceStyle && (
                              <span className="badge badge-xs badge-secondary">
                                {sim.voiceStyle.name}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-base-content/70 line-clamp-1">
                            {sim.masterNarrative || 'No story details yet.'}
                          </p>

                          <div className="flex items-center gap-2 text-[11px] text-base-content/50">
                            <span>{Object.keys(sim.cards).length} Clues</span>
                            <span>•</span>
                            <span>{Object.keys(sim.characters).length} Characters</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMakeCopy(sim)}
                            className="btn btn-outline btn-xs gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenStorylineFromLibrary(sim)}
                            disabled={isCurrent}
                            className={`btn btn-xs ${
                              isCurrent ? 'btn-disabled' : 'btn-primary'
                            }`}
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{isCurrent ? 'Open' : 'Edit'}</span>
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

      {/* AI STORY REVISION MODAL */}
      {showRevisionModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl bg-base-200 border border-base-300 p-0 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-base-300 flex items-center justify-between gap-4 bg-base-300/40">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-secondary" />
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <span>Ask AI to Revise Story</span>
                  </h2>
                  <p className="text-xs text-base-content/70">
                    Tell the AI what changes you want in your story.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowRevisionModal(false);
                  setRevisionResult(null);
                }}
                className="btn btn-ghost btn-sm btn-square"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[70vh] space-y-3">
              {!revisionResult ? (
                /* PHASE 1: PROMPT INPUT */
                <div className="space-y-3">
                  <div className="card bg-base-100 border border-base-300 p-3 space-y-1 text-xs">
                    <span className="font-semibold text-base-content/60">
                      Current Story
                    </span>
                    <div className="font-bold text-sm">
                      {scenarioTitle || 'Untitled Story'}
                    </div>
                    <p className="text-base-content/70 italic text-xs line-clamp-2">
                      "{masterText || 'No story details yet.'}"
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold">
                      What changes would you like?
                    </label>
                    <textarea
                      value={revisionUserPrompt}
                      onChange={(e) => setRevisionUserPrompt(e.target.value)}
                      rows={3}
                      placeholder="e.g. Add a secret traitor, make the setting a snowy mountain lodge, and add more suspense..."
                      className="textarea textarea-bordered w-full bg-base-100 text-xs resize-none"
                    />
                  </div>

                  {/* Quick Ideas */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-base-content/60">
                      Quick ideas:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {[
                        'Add a secret traitor',
                        'Add a ticking time bomb or countdown',
                        'Make the mystery harder to solve',
                        'Add a surprise family secret',
                        'Change the setting to deep space',
                      ].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() =>
                            setRevisionUserPrompt((prev) =>
                              prev ? `${prev}. ${chip}` : chip
                            )
                          }
                          className="btn btn-xs btn-outline font-normal"
                        >
                          + {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action Row */}
                  <div className="pt-2 border-t border-base-300 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleExecuteStorylineRevision}
                      disabled={isRevisingStoryline || !revisionUserPrompt.trim()}
                      className="btn btn-primary btn-sm gap-1"
                    >
                      {isRevisingStoryline ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Rewriting...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Rewrite Story</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* PHASE 2: REVIEW & APPROVE */
                <div className="space-y-3">
                  <div className="card bg-base-100 border border-success/40 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-success text-xs font-bold">
                      <CheckCircle className="w-4 h-4" />
                      <span>Changes Ready for Review</span>
                    </div>
                    <p className="text-xs text-base-content/80">
                      {revisionResult.changeSummary}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-xs font-bold">
                        New Title
                      </label>
                      <input
                        type="text"
                        value={editableRevisedTitle}
                        onChange={(e) =>
                          setEditableRevisedTitle(e.target.value)
                        }
                        className="input input-bordered input-sm w-full bg-base-100 font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold">
                          New Story Lore
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setShowOriginalComparison((prev) => !prev)
                          }
                          className="btn btn-ghost btn-xs text-secondary"
                        >
                          {showOriginalComparison ? 'Hide Old' : 'Compare Old'}
                        </button>
                      </div>
                      <textarea
                        value={editableRevisedLore}
                        onChange={(e) =>
                          setEditableRevisedLore(e.target.value)
                        }
                        rows={5}
                        className="textarea textarea-bordered w-full bg-base-100 text-xs resize-none"
                      />
                    </div>

                    {showOriginalComparison && (
                      <div className="card bg-base-100 border border-base-300 p-2 text-xs">
                        <span className="text-[10px] text-base-content/50 uppercase">
                          Old Story
                        </span>
                        <p className="text-base-content/70 italic text-xs">
                          "{masterText || 'None'}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="pt-2 border-t border-base-300 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setRevisionResult(null)}
                      className="btn btn-ghost btn-xs gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Change Prompt</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleApproveStorylineToStudio}
                        className="btn btn-outline btn-sm gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept Story</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleApproveAndDiceIntoCards}
                        disabled={isCompiling}
                        className="btn btn-primary btn-sm gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Accept &amp; Create Characters</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Seat Invite Modal */}
      {inviteModalCharId && currentUser && (
        <UserSeatInviteModal
          isOpen={Boolean(inviteModalCharId)}
          onClose={() => setInviteModalCharId(null)}
          simulation={simulationState}
          characterId={inviteModalCharId}
          currentUser={currentUser}
          inviteType="CREATOR_INVITE"
          onInviteSent={(updatedSim) => {
            onUpdateState(updatedSim);
            setStudioNotice('Seat invitation sent successfully!');
          }}
        />
      )}
    </div>
  );
};
