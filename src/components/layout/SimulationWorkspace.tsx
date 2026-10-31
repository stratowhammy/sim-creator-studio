import React, { useState } from 'react';
import {
  CharacterSheet,
  Goal,
  InfoCard,
  InteractionRecord,
  InteractionType,
  SimulationMode,
  SimulationState,
} from '../../types/simulation';
import {
  calculateThreshold,
  consumeConnectionToken,
  evaluateGoalCompletions,
  INTERACTION_STAT_MAP,
  resolveInteraction,
} from '../../engine/resolution';
import {
  queryPartitionedRag,
  syncRagIndex,
} from '../../engine/ragPartition';
import {
  classifyAuthenticity,
  generateBatchedDialogue,
  getGeminiApiKey,
  setGeminiApiKey,
} from '../../services/llmOrchestrator';
import { InfoCardItem } from '../primitives/InfoCardItem';
import { GoalTrackerCard } from '../primitives/GoalTrackerCard';
import { SentenceBeatRow } from '../primitives/SentenceBeatRow';
import { ConnectionTokenButton } from '../primitives/ConnectionTokenButton';
import {
  INTERACTION_TYPE_STYLES,
  STANCE_BADGE_STYLES,
} from '../ui/themeMaps';
import {
  Award,
  BookOpen,
  Bot,
  Brain,
  CheckCircle,
  Clock,
  Compass,
  Cpu,
  Eye,
  KeyRound,
  Layers,
  Lock,
  MessageSquare,
  Radio,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Swords,
  User,
  Users,
  Zap,
} from 'lucide-react';

interface SimulationWorkspaceProps {
  state: SimulationState;
  onUpdateState: (newState: SimulationState) => void;
  onOpenStudio: () => void;
}

interface AdvisorMessage {
  id: string;
  sender: 'user' | 'advisor';
  text: string;
  citedCardIds?: string[];
  timestamp: string;
}

export const SimulationWorkspace: React.FC<SimulationWorkspaceProps> = ({
  state,
  onUpdateState,
  onOpenStudio,
}) => {
  // Current active persona
  const [activePlayerId, setActivePlayerId] = useState<string>('vance');

  // Center Pane Staging State
  const [targetPlayerId, setTargetPlayerId] = useState<string>('kael');
  const [interactionType, setInteractionType] = useState<InteractionType>('INTERROGATE');
  const [targetedCardId, setTargetedCardId] = useState<string>('');
  const [initiatorPrompt, setInitiatorPrompt] = useState<string>(
    'Explain the anomalous pressure surge in coolant loop 4 immediately.'
  );
  const [authenticityScore, setAuthenticityScore] = useState<number>(0.15);
  const [authenticityReason, setAuthenticityReason] = useState<string>(
    'Leverages command rank and direct factual pressure.'
  );
  const [isEvaluatingAuth, setIsEvaluatingAuth] = useState<boolean>(false);
  const [isResolving, setIsResolving] = useState<boolean>(false);

  // Right Pane Tabs
  const [rightTab, setRightTab] = useState<'GOALS' | 'CARDS' | 'TOKENS' | 'POLICY'>('GOALS');
  const [cardTierFilter, setCardTierFilter] = useState<'ALL' | 'ATOMIC' | 'COMPOSITE'>('ALL');

  // Left Pane: Private Advisor Chat Stream
  const [advisorQuery, setAdvisorQuery] = useState<string>('');
  const [advisorMessages, setAdvisorMessages] = useState<Record<string, AdvisorMessage[]>>({
    vance: [
      {
        id: 'msg_vance_0',
        sender: 'advisor',
        text: 'Commander Vance, I have verified our internal logs. Sub-deck 9 quarantine and reactor coolant loop 4 remain contentious. Chief Engineer Kael holds technical schematics, while Dr. Thorne has locked the biology labs under executive seal. What are your orders?',
        citedCardIds: ['card_docking_records'],
        timestamp: '03:15',
      },
    ],
    thorne: [
      {
        id: 'msg_thorne_0',
        sender: 'advisor',
        text: 'Dr. Thorne, military pathogen X-99 is chemically stable but vulnerable to thermal variation. Chief Engineer Kael has been snooping around the refrigeration loops. Maintain your composure; they have no direct evidence unless someone leaks the sub-deck 9 telemetry.',
        citedCardIds: ['card_bioweapon_manifest'],
        timestamp: '03:15',
      },
    ],
    kael: [
      {
        id: 'msg_kael_0',
        sender: 'advisor',
        text: 'Chief, the reactor emergency SCRAM override will keep them off our backs for now, but Commander Vance is breathing down our necks. We can leverage our negotiation skills, but watch out: Vance’s coercive interrogation will break our composure if we stumble.',
        citedCardIds: ['card_coolant_schematic'],
        timestamp: '03:15',
      },
    ],
    nyx: [
      {
        id: 'msg_nyx_0',
        sender: 'advisor',
        text: 'Operative Nyx, Orion Syndicate Directive #77 remains active. Our cryptographic cipher is primed. Station command suspects nothing of our true allegiances. Seek out Vance or Thorne to acquire their missing data shards.',
        citedCardIds: ['card_covert_orders'],
        timestamp: '03:15',
      },
    ],
  });

  // API Key Modal State
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(getGeminiApiKey() || '');

  const activeChar = state.characters[activePlayerId];
  const targetChar = state.characters[targetPlayerId] || Object.values(state.characters).find((c) => c.playerId !== activePlayerId);

  // Filter owned cards for active persona
  const ownedCards = Object.values(state.cards).filter((c) =>
    c.knownByPlayerIds.includes(activePlayerId)
  );

  const filteredOwnedCards = ownedCards.filter((c) => {
    if (cardTierFilter === 'ALL') return true;
    return c.tier === cardTierFilter;
  });

  // Calculate live threshold preview
  const liveThreshold = activeChar && targetChar
    ? calculateThreshold(
        activeChar,
        targetChar,
        interactionType,
        targetedCardId ? state.cards[targetedCardId] : undefined,
        authenticityScore
      )
    : 0.5;

  // Handle switching active persona
  const handleSwitchPersona = (newPlayerId: string) => {
    setActivePlayerId(newPlayerId);
    // Auto-select a valid target
    const other = Object.keys(state.characters).find((id) => id !== newPlayerId) || '';
    setTargetPlayerId(other);
  };

  // Turn management
  const handleAdvanceTurn = () => {
    const newState = { ...state };
    newState.currentTurnOrTick += 1;
    for (const char of Object.values(newState.characters)) {
      char.actionPoints = 3;
    }
    onUpdateState(newState);
  };

  // Handle Authenticity Evaluation
  const handleEvaluateAuthenticity = async () => {
    if (!activeChar) return;
    setIsEvaluatingAuth(true);
    try {
      const result = await classifyAuthenticity(activeChar, ownedCards, initiatorPrompt);
      setAuthenticityScore(result.authenticityScore);
      setAuthenticityReason(result.authenticityReasoning);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEvaluatingAuth(false);
    }
  };

  // Handle Interaction Execution
  const handleExecuteInteraction = async () => {
    if (!activeChar || !targetChar || isResolving) return;
    setIsResolving(true);

    try {
      const newState: SimulationState = {
        ...state,
        characters: { ...state.characters },
        cards: { ...state.cards },
        goals: { ...state.goals },
        interactions: [...state.interactions],
      };

      const targetCard = targetedCardId ? newState.cards[targetedCardId] : undefined;

      const resolution = resolveInteraction(newState, {
        initiatorPlayerId: activePlayerId,
        targetPlayerId: targetPlayerId,
        interactionType,
        initiatorPrompt,
        targetedTopicOrCardId: targetedCardId || undefined,
        authenticityScore,
        authenticityReasoning: authenticityReason,
      });

      // Call LLM or narrative generator for batched N sentences
      const generatedSentences = await generateBatchedDialogue(
        activeChar.characterName,
        targetChar.characterName,
        interactionType,
        initiatorPrompt,
        resolution.record.beats,
        targetCard
      );

      // Map generated sentences into beats
      for (let i = 0; i < resolution.record.beats.length; i++) {
        if (generatedSentences[i]) {
          resolution.record.beats[i].generatedSentence = generatedSentences[i];
        }
      }

      syncRagIndex(newState);
      onUpdateState(newState);
    } catch (e) {
      console.error('Interaction execution error:', e);
    } finally {
      setIsResolving(false);
    }
  };

  // Handle Connection Token Activation
  const handleConsumeToken = (tokenId: string) => {
    const newState: SimulationState = {
      ...state,
      cards: { ...state.cards },
      goals: { ...state.goals },
      characters: { ...state.characters },
      tokens: state.tokens.map((t) => ({ ...t })),
    };

    consumeConnectionToken(newState, tokenId);
    syncRagIndex(newState);
    onUpdateState(newState);
  };

  // Handle Toggle Card Protection
  const handleToggleProtect = (cardId: string) => {
    if (!activeChar) return;
    const newState = { ...state };
    const policy = { ...activeChar.defensivePolicy };
    const protectedIds = new Set(policy.protectedCardIds);

    if (protectedIds.has(cardId)) {
      protectedIds.delete(cardId);
    } else {
      protectedIds.add(cardId);
    }

    policy.protectedCardIds = Array.from(protectedIds);
    newState.characters[activePlayerId].defensivePolicy = policy;
    onUpdateState(newState);
  };

  // Handle Toggle Card Tradeable
  const handleToggleTradeable = (cardId: string) => {
    if (!activeChar) return;
    const newState = { ...state };
    const policy = { ...activeChar.defensivePolicy };
    const tradeableIds = new Set(policy.tradeableCardIds);

    if (tradeableIds.has(cardId)) {
      tradeableIds.delete(cardId);
    } else {
      tradeableIds.add(cardId);
    }

    policy.tradeableCardIds = Array.from(tradeableIds);
    newState.characters[activePlayerId].defensivePolicy = policy;
    onUpdateState(newState);
  };

  // Handle Change Stance towards a player
  const handleChangeStance = (
    otherPlayerId: string,
    stance: 'COOPERATIVE' | 'NEUTRAL' | 'SUSPICIOUS' | 'HOSTILE'
  ) => {
    if (!activeChar) return;
    const newState = { ...state };
    newState.characters[activePlayerId].defensivePolicy.stanceByPlayerId[otherPlayerId] = stance;
    onUpdateState(newState);
  };

  // Handle Private Advisor Query
  const handleSendAdvisorQuery = (queryText: string) => {
    if (!queryText.trim() || !activeChar) return;

    const userMsg: AdvisorMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Perform RLS-partitioned query
    const ragResults = queryPartitionedRag(state.ragIndex, activePlayerId, queryText, 3);

    let reply = '';
    const citedCardIds: string[] = [];

    if (ragResults.length === 0) {
      reply = `I searched your confidential files and memories for "${queryText}", but you have no verified intelligence matching that topic. You will need to extract information from the others to confirm.`;
    } else {
      const facts = ragResults.map((r) => {
        if (r.chunk.sourceType === 'INFO_CARD') {
          citedCardIds.push(r.chunk.sourceRefId);
        }
        return `• ${r.chunk.content}`;
      });
      reply = `According to your private intelligence:\n${facts.join('\n')}`;
    }

    const advisorMsg: AdvisorMessage = {
      id: `adv_${Date.now()}`,
      sender: 'advisor',
      text: reply,
      citedCardIds,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setAdvisorMessages((prev) => ({
      ...prev,
      [activePlayerId]: [...(prev[activePlayerId] || []), userMsg, advisorMsg],
    }));
    setAdvisorQuery('');
  };

  // Latest interaction for the center transcript
  const latestInteraction = state.interactions[state.interactions.length - 1];

  // Active player's tokens
  const activePlayerTokens = state.tokens.filter((t) => t.ownerPlayerId === activePlayerId);

  // Leaderboard
  const sortedCharacters = Object.values(state.characters).sort(
    (a, b) => b.victoryPoints - a.victoryPoints
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* ==================================================================== */}
      {/* TOP STATUS & NAVIGATION BAR                                          */}
      {/* ==================================================================== */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-sky-400 animate-pulse" />
            <span className="font-bold text-sm tracking-wide text-white">
              SIM CREATOR STUDIO
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-300 font-mono flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-sky-400" />
            {state.title}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 font-mono">
            {state.mode}
          </span>
        </div>

        {/* Persona Switcher Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <span className="text-[11px] font-mono text-slate-500 px-2 flex items-center gap-1">
            <User className="w-3 h-3 text-slate-400" />
            Persona:
          </span>
          {Object.values(state.characters).map((char) => (
            <button
              key={char.playerId}
              onClick={() => handleSwitchPersona(char.playerId)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-all flex items-center gap-1.5 ${
                activePlayerId === char.playerId
                  ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>{char.characterName}</span>
              <span
                className={`text-[10px] px-1 rounded font-mono ${
                  activePlayerId === char.playerId ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {char.victoryPoints} VP
              </span>
            </button>
          ))}
        </div>

        {/* Turn Counter & Action Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Turn:</span>
            <span className="font-bold text-amber-300">{state.currentTurnOrTick}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">AP:</span>
            <span className="font-bold text-emerald-400">{activeChar?.actionPoints ?? 3}</span>
          </div>

          <button
            onClick={handleAdvanceTurn}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            Advance Turn
          </button>

          <button
            onClick={() => setShowApiKeyModal(true)}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Configure Gemini API Key"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenStudio}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-800 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            Authoring Studio
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 4-PANE MAIN WORKSPACE (CSS GRID 12 COLS)                              */}
      {/* ==================================================================== */}
      <main className="flex-1 overflow-hidden grid grid-cols-12 min-h-0">
        {/* ------------------------------------------------------------------ */}
        {/* LEFT PANE (COLS 1-3): Player Private Advisor Channel                */}
        {/* ------------------------------------------------------------------ */}
        <aside className="col-span-3 border-r border-slate-800 bg-slate-900/40 flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-800 bg-slate-900/70 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-xs text-slate-200">Private Advisor</h3>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                RLS: STRICT
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
              Advisor to <strong className="text-slate-200">{activeChar?.characterName}</strong>. Epistemically partitioned query channel.
            </p>
          </div>

          {/* Quick Query Chips */}
          <div className="p-2 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap gap-1 shrink-0">
            <button
              onClick={() => handleSendAdvisorQuery('What are my starting confidential cards?')}
              className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              My Cards
            </button>
            <button
              onClick={() => handleSendAdvisorQuery('What do I know about the reactor coolant?')}
              className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Coolant Intel
            </button>
            <button
              onClick={() => handleSendAdvisorQuery('What is my goal on this station?')}
              className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              My Goal
            </button>
          </div>

          {/* Chat Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {(advisorMessages[activePlayerId] || []).map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col text-xs ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono mb-1">
                  <span>{msg.sender === 'user' ? activeChar?.characterName : 'Private Advisor'}</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>
                <div
                  className={`p-3 rounded-lg max-w-[95%] leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-sky-600 text-white rounded-br-none'
                      : 'bg-slate-800/90 border border-slate-700 text-slate-200 rounded-bl-none font-sans'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>
                  {msg.citedCardIds && msg.citedCardIds.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-mono">Citations:</span>
                      {msg.citedCardIds.map((cid) => (
                        <span
                          key={cid}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800 font-mono"
                        >
                          #{cid}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-2.5 border-t border-slate-800 bg-slate-900/60 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAdvisorQuery(advisorQuery);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={advisorQuery}
                onChange={(e) => setAdvisorQuery(e.target.value)}
                placeholder="Ask your private advisor..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-sans"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </aside>

        {/* ------------------------------------------------------------------ */}
        {/* CENTER PANE (COLS 4-8): Interaction Staging & Live Transcript       */}
        {/* ------------------------------------------------------------------ */}
        <section className="col-span-5 border-r border-slate-800 flex flex-col min-h-0 bg-slate-950/70">
          {/* Upper Staging Control Box */}
          <div className="p-4 border-b border-slate-800 bg-slate-900/50 shrink-0 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Swords className="w-4 h-4 text-rose-400" />
                <h3 className="font-bold text-xs text-slate-200">Interaction Staging Vector</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">
                  Calculated Threshold P_k:
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-bold font-mono">
                  {liveThreshold.toFixed(3)}
                </span>
              </div>
            </div>

            {/* Target Character Selector */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1.5">
                Target Character:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(state.characters)
                  .filter((c) => c.playerId !== activePlayerId)
                  .map((target) => {
                    const stance = target.defensivePolicy.stanceByPlayerId[activePlayerId] ?? 'NEUTRAL';
                    const stanceClass = STANCE_BADGE_STYLES[stance];
                    const isSelected = targetPlayerId === target.playerId;

                    return (
                      <button
                        key={target.playerId}
                        onClick={() => setTargetPlayerId(target.playerId)}
                        className={`p-2 rounded-lg text-left transition-all border text-xs ${
                          isSelected
                            ? 'bg-rose-950/40 border-rose-500 text-rose-100 ring-1 ring-rose-500/50'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-400'
                        }`}
                      >
                        <div className="font-bold text-slate-200">{target.characterName}</div>
                        <div className="text-[10px] text-slate-400">{target.publicRole}</div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded border font-mono ${stanceClass}`}>
                            {stance}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            AP:{target.actionPoints}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Approach Vector Tabs */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1.5">
                Approach Vector:
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['ASK', 'INTERROGATE', 'NEGOTIATE', 'DECEIVE'] as InteractionType[]).map((type) => {
                  const info = INTERACTION_TYPE_STYLES[type];
                  const isSelected = interactionType === type;
                  const statPair = INTERACTION_STAT_MAP[type];

                  return (
                    <button
                      key={type}
                      onClick={() => setInteractionType(type)}
                      className={`p-2 rounded-lg text-left transition-all border text-xs flex flex-col justify-between ${
                        isSelected
                          ? `${info.button} ring-1`
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      <div className="font-bold text-xs">{type}</div>
                      <div className="text-[9px] font-mono text-slate-400 mt-1">
                        {statPair.offenseKey} vs {statPair.defenseKey}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Card / Topic Inquiry */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1">
                  Target Specific Card (Optional):
                </label>
                <select
                  value={targetedCardId}
                  onChange={(e) => setTargetedCardId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                >
                  <option value="">-- General In-Character Inquiry --</option>
                  {Object.values(state.cards).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} [{c.secrecy}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Authenticity Evaluator Preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
                    Authenticity Bonus:
                  </label>
                  <button
                    onClick={handleEvaluateAuthenticity}
                    disabled={isEvaluatingAuth}
                    className="text-[10px] text-sky-400 hover:text-sky-300 font-mono underline"
                  >
                    {isEvaluatingAuth ? 'Evaluating...' : 'Re-Evaluate'}
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded border border-slate-800">
                  <span
                    className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                      authenticityScore >= 0
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {authenticityScore >= 0 ? `+${authenticityScore.toFixed(2)}` : authenticityScore.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate" title={authenticityReason}>
                    {authenticityReason}
                  </span>
                </div>
              </div>
            </div>

            {/* Prompt Input & Execute Button */}
            <div>
              <div className="flex items-center gap-2">
                <textarea
                  value={initiatorPrompt}
                  onChange={(e) => setInitiatorPrompt(e.target.value)}
                  rows={2}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 resize-none font-sans"
                  placeholder="Enter your in-character dialogue or coercive inquiry..."
                />
                <button
                  onClick={handleExecuteInteraction}
                  disabled={isResolving || (activeChar?.actionPoints ?? 0) <= 0}
                  className="h-full px-5 py-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Swords className="w-4 h-4" />
                  <span>{isResolving ? 'Resolving...' : 'Engage'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Lower Dialogue Transcript */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                <h4 className="font-bold text-slate-200">Live Dialogue Transcript</h4>
              </div>
              {latestInteraction && (
                <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                  <span>Turn {latestInteraction.tickOrTurn}</span>
                  <span>•</span>
                  <span>{latestInteraction.interactionType}</span>
                  <span>•</span>
                  <span>N={latestInteraction.sentenceCountN} beats</span>
                </div>
              )}
            </div>

            {latestInteraction ? (
              <div>
                {/* Result Notification Banner */}
                {latestInteraction.cardsTransferredToInitiator.length > 0 && (
                  <div className="p-3 mb-3 rounded-lg bg-emerald-950/40 border border-emerald-500/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-emerald-200">
                        Breakthrough! Card Duplicated to Hand: #{latestInteraction.cardsTransferredToInitiator.join(', #')}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-300">
                      Non-Depleting Transfer
                    </span>
                  </div>
                )}

                {/* Rendered N-Sentence Beats */}
                <div className="space-y-1">
                  {latestInteraction.beats.map((beat) => {
                    const speakerChar = state.characters[beat.speakerId];
                    return (
                      <SentenceBeatRow
                        key={beat.sentenceIndex}
                        beat={beat}
                        speakerName={speakerChar?.characterName ?? beat.speakerId}
                        isInitiator={beat.speakerId === latestInteraction.initiatorPlayerId}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-slate-500 text-xs">
                <Swords className="w-8 h-8 text-slate-600 mb-2" />
                <p>No interactions recorded yet. Stage an approach above to initiate dialogue.</p>
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* RIGHT PANE (COLS 9-12): VP, Goal & Inventory Dashboard             */}
        {/* ------------------------------------------------------------------ */}
        <aside className="col-span-4 bg-slate-900/40 flex flex-col min-h-0">
          {/* Tab Navigation */}
          <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-900/80 text-xs shrink-0">
            <button
              onClick={() => setRightTab('GOALS')}
              className={`py-3 px-2 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
                rightTab === 'GOALS'
                  ? 'border-sky-500 text-sky-400 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              Goals
            </button>

            <button
              onClick={() => setRightTab('CARDS')}
              className={`py-3 px-2 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
                rightTab === 'CARDS'
                  ? 'border-sky-500 text-sky-400 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Hand ({ownedCards.length})
            </button>

            <button
              onClick={() => setRightTab('TOKENS')}
              className={`py-3 px-2 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
                rightTab === 'TOKENS'
                  ? 'border-sky-500 text-sky-400 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Tokens
            </button>

            <button
              onClick={() => setRightTab('POLICY')}
              className={`py-3 px-2 font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
                rightTab === 'POLICY'
                  ? 'border-sky-500 text-sky-400 bg-slate-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Policy
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-4">
            {/* TAB 1: GOALS & VP LEADERBOARD */}
            {rightTab === 'GOALS' && (
              <div className="space-y-4">
                {/* VP Leaderboard */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2.5 flex justify-between">
                    <span>Victory Points Standings</span>
                    <span className="text-amber-400">Match Victory Goal: 1500 VP</span>
                  </div>
                  <div className="space-y-1.5">
                    {sortedCharacters.map((char, index) => (
                      <div
                        key={char.playerId}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono ${
                          char.playerId === activePlayerId
                            ? 'bg-sky-950/60 border border-sky-600/50 text-sky-200 font-bold'
                            : 'bg-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4 text-center font-bold text-slate-500">
                            #{index + 1}
                          </span>
                          <span>{char.characterName}</span>
                          {char.playerId === activePlayerId && (
                            <span className="text-[9px] px-1 rounded bg-sky-500 text-slate-950">
                              YOU
                            </span>
                          )}
                        </div>
                        <span className="text-amber-400 font-bold">{char.victoryPoints} VP</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Goals List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">Active Mystery Goals</span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {Object.keys(state.goals).length} Available
                    </span>
                  </div>

                  {Object.values(state.goals).map((goal) => (
                    <GoalTrackerCard
                      key={goal.id}
                      goal={goal}
                      ownedCardIds={ownedCards.map((c) => c.id)}
                      currentPlayerId={activePlayerId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: CARDS IN HAND */}
            {rightTab === 'CARDS' && (
              <div className="space-y-3">
                {/* Card Tier Filters */}
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setCardTierFilter('ALL')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      cardTierFilter === 'ALL'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({ownedCards.length})
                  </button>
                  <button
                    onClick={() => setCardTierFilter('ATOMIC')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      cardTierFilter === 'ATOMIC'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Atomic ({ownedCards.filter((c) => c.tier === 'ATOMIC').length})
                  </button>
                  <button
                    onClick={() => setCardTierFilter('COMPOSITE')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      cardTierFilter === 'COMPOSITE'
                        ? 'bg-purple-900/60 text-purple-200 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Composite ({ownedCards.filter((c) => c.tier === 'COMPOSITE').length})
                  </button>
                </div>

                <div className="space-y-2.5">
                  {filteredOwnedCards.map((card) => {
                    const isProtected = activeChar?.defensivePolicy.protectedCardIds.includes(card.id);
                    const isTradeable = activeChar?.defensivePolicy.tradeableCardIds.includes(card.id);
                    const isSelected = targetedCardId === card.id;

                    return (
                      <InfoCardItem
                        key={card.id}
                        card={card}
                        isProtected={isProtected}
                        onToggleProtect={handleToggleProtect}
                        isTradeable={isTradeable}
                        onToggleTradeable={handleToggleTradeable}
                        isSelected={isSelected}
                        onSelectForInteraction={(id) => setTargetedCardId(id === targetedCardId ? '' : id)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: CONNECTION TOKENS */}
            {rightTab === 'TOKENS' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Connection Tokens (Bypass RNG)</span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {activePlayerTokens.filter((t) => !t.isConsumed).length} Available
                  </span>
                </div>

                {activePlayerTokens.length > 0 ? (
                  activePlayerTokens.map((token) => {
                    const target = state.characters[token.targetPlayerId];
                    return (
                      <ConnectionTokenButton
                        key={token.id}
                        token={token}
                        targetName={target?.characterName ?? token.targetPlayerId}
                        onConsume={handleConsumeToken}
                      />
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-lg border border-slate-800">
                    <Zap className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    No active connection tokens available for {activeChar?.characterName}.
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: DEFENSIVE POLICY DRAWER */}
            {rightTab === 'POLICY' && activeChar && (
              <div className="space-y-4 text-xs">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <h4 className="font-bold text-slate-200">Defensive Policy & Stances</h4>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Configure your stance towards other characters. Stances apply immediate positive or negative modifiers to opponents who attempt to query or interrogate you.
                  </p>

                  <div className="space-y-2.5 pt-2 border-t border-slate-800">
                    {Object.values(state.characters)
                      .filter((c) => c.playerId !== activePlayerId)
                      .map((other) => {
                        const currentStance = activeChar.defensivePolicy.stanceByPlayerId[other.playerId] ?? 'NEUTRAL';
                        return (
                          <div
                            key={other.playerId}
                            className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-semibold text-slate-200">{other.characterName}</div>
                              <div className="text-[10px] text-slate-500">{other.publicRole}</div>
                            </div>

                            <div className="flex items-center gap-1">
                              {(['COOPERATIVE', 'NEUTRAL', 'SUSPICIOUS', 'HOSTILE'] as const).map(
                                (stance) => (
                                  <button
                                    key={stance}
                                    onClick={() => handleChangeStance(other.playerId, stance)}
                                    className={`px-1.5 py-0.5 text-[9px] rounded font-mono transition-colors ${
                                      currentStance === stance
                                        ? STANCE_BADGE_STYLES[stance] + ' font-bold ring-1'
                                        : 'bg-slate-950 text-slate-500 hover:text-slate-300'
                                    }`}
                                  >
                                    {stance.slice(0, 4)}
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Protected & Tradeable Summaries */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300">Protected Cards</span>
                    <span className="text-[10px] text-rose-400 font-mono">+0.20 Defense Bonus</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {activeChar.defensivePolicy.protectedCardIds.length > 0
                      ? activeChar.defensivePolicy.protectedCardIds.join(', ')
                      : 'No cards currently protected.'}
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300">Tradeable Cards</span>
                    <span className="text-[10px] text-emerald-400 font-mono">NEGOTIATE Pool</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {activeChar.defensivePolicy.tradeableCardIds.length > 0
                      ? activeChar.defensivePolicy.tradeableCardIds.join(', ')
                      : 'All non-protected cards allowed for trade.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* ==================================================================== */}
      {/* GEMINI API KEY MODAL                                                 */}
      {/* ==================================================================== */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-sm text-slate-100">
                  Gemini API Configuration
                </h3>
              </div>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Enter your Google Gemini API key to enable live prompt orchestration (narrative atomization, dossier weaving, and batched dialogue generation). If no key is set, the studio operates using the deterministic offline Alpha logic harness.
            </p>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1">
                Gemini API Key:
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setGeminiApiKey('');
                  setApiKeyInput('');
                  setShowApiKeyModal(false);
                }}
                className="px-3 py-1.5 text-xs rounded text-slate-400 hover:text-slate-200"
              >
                Clear Key
              </button>
              <button
                onClick={() => {
                  setGeminiApiKey(apiKeyInput);
                  setShowApiKeyModal(false);
                }}
                className="px-4 py-1.5 text-xs font-bold rounded bg-sky-500 hover:bg-sky-400 text-slate-950"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
