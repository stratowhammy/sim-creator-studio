import React, { useState } from 'react';
import { SimulationState } from '../../types/simulation';
import { validateInitialDistribution, ValidationResult } from '../../engine/compiler';
import { atomizeMasterNarrative, weaveCharacterDossier } from '../../services/llmOrchestrator';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Database,
  FileText,
  Layers,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { createStationHeliosScenario } from '../../alpha/scenarioData';
import { buildRagIndexFromState } from '../../engine/ragPartition';

interface AuthoringStudioProps {
  simulationState: SimulationState;
  onUpdateState: (newState: SimulationState) => void;
  onLaunchSimulation: () => void;
}

export const AuthoringStudio: React.FC<AuthoringStudioProps> = ({
  simulationState,
  onUpdateState,
  onLaunchSimulation,
}) => {
  const [masterText, setMasterText] = useState(simulationState.masterNarrative);
  const [isCompiling, setIsCompiling] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>(() =>
    validateInitialDistribution(simulationState)
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('vance');

  const handleValidate = (state: SimulationState) => {
    const res = validateInitialDistribution(state);
    setValidation(res);
  };

  const handleRecompile = async () => {
    setIsCompiling(true);
    try {
      const charNames = Object.values(simulationState.characters).map((c) => c.characterName);
      const compiled = await atomizeMasterNarrative(masterText, charNames);

      const newState: SimulationState = {
        ...simulationState,
        masterNarrative: masterText,
        currentTurnOrTick: 0,
      };

      // Map compiled cards
      for (const cardOut of compiled.cards) {
        // Find which character name matches
        const matchedChar = Object.values(newState.characters).find(
          (c) => c.characterName.toLowerCase() === cardOut.assignedCharacterName.toLowerCase()
        ) || Object.values(newState.characters)[0];

        newState.cards[cardOut.id] = {
          id: cardOut.id,
          simulationId: newState.id,
          tier: 'ATOMIC',
          title: cardOut.title,
          canonicalFact: cardOut.canonicalFact,
          subjectCharacterIds: [matchedChar.playerId],
          topicTags: cardOut.topicTags,
          secrecy: cardOut.secrecy,
          parentCardIds: [],
          knownByPlayerIds: [matchedChar.playerId],
          createdAtTick: 0,
        };
      }

      // Map compiled goals
      for (const goalOut of compiled.goals) {
        const matchedChar = Object.values(newState.characters).find(
          (c) => c.characterName.toLowerCase() === goalOut.assignedCharacterName.toLowerCase()
        ) || Object.values(newState.characters)[0];

        newState.goals[goalOut.id] = {
          id: goalOut.id,
          simulationId: newState.id,
          assignedPlayerId: matchedChar.playerId,
          veiledPrompt: goalOut.veiledPrompt,
          requiredCardIds: goalOut.requiredCardIds,
          baseVpValue: goalOut.baseVpValue,
          decayMultipliers: goalOut.decayMultipliers,
          completedByPlayerIds: [],
          synthesizedCardTemplate: goalOut.synthesizedCardTemplate,
        };
      }

      newState.ragIndex = buildRagIndexFromState(newState);
      onUpdateState(newState);
      handleValidate(newState);
    } catch (e) {
      console.error('Compilation failed:', e);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleResetToHeliosPreset = () => {
    const helios = createStationHeliosScenario();
    helios.ragIndex = buildRagIndexFromState(helios);
    setMasterText(helios.masterNarrative);
    onUpdateState(helios);
    handleValidate(helios);
  };

  const selectedChar = simulationState.characters[selectedCharacterId];
  const charCards = Object.values(simulationState.cards).filter((c) =>
    c.knownByPlayerIds.includes(selectedCharacterId)
  );
  const charGoals = Object.values(simulationState.goals).filter(
    (g) => g.assignedPlayerId === selectedCharacterId
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto p-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-slate-800 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6 text-sky-400" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Simulation Authoring Studio
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-mono">
              DAG Compiler & Graph Validator
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deconstruct master narratives into discrete ATOMIC InfoCards, enforce epistemic partitioning, and verify DAG solvability invariants.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleResetToHeliosPreset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Load Station Helios Preset
          </button>
          <button
            onClick={onLaunchSimulation}
            disabled={!validation.isValid}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 fill-current" />
            Launch Live Simulation
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Narrative Input & Invariants Status (Cols 1-7) */}
        <div className="col-span-7 space-y-6">
          {/* Master Narrative Editor */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-slate-200">
                  Master Narrative Lore Source
                </h2>
              </div>
              <button
                onClick={handleRecompile}
                disabled={isCompiling}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isCompiling ? 'Compiling Graph...' : 'Atomize & Compile Graph'}
              </button>
            </div>
            <textarea
              value={masterText}
              onChange={(e) => setMasterText(e.target.value)}
              rows={5}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 leading-relaxed focus:outline-none focus:border-sky-500 resize-none"
              placeholder="Paste global narrative overview here..."
            />
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
                {validation.isValid ? 'ALL INVARIANTS SATISFIED' : 'DAG VIOLATIONS DETECTED'}
              </span>
            </div>

            <div className="space-y-3">
              {/* Invariant 1: Zero Self-Sufficiency */}
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

              {/* Invariant 2: 100% Global Reachability */}
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
                    Missing from all hands: {validation.details.uncoveredRequiredCardIds.join(', ')}
                  </div>
                )}
              </div>

              {/* Invariant 3: Asymmetric Dependency Seeding */}
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
                <div className="flex gap-2 mt-2 font-mono text-[10px]">
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

        {/* Right Column: Character Dossier & Hand Inspector (Cols 8-12) */}
        <div className="col-span-5 space-y-4">
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
                  <div className="font-bold text-slate-100">{char.characterName}</div>
                  <div className="text-[11px] text-slate-400">{char.publicRole}</div>
                </button>
              ))}
            </div>

            {/* Selected Character Deep-Dive */}
            {selectedChar && (
              <div className="space-y-3 text-xs">
                {/* Hidden Stats Vector (Server-side inspection) */}
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

                {/* Private Narrative Dossier */}
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
                    Private Narrative Bio (Weaver Output)
                  </span>
                  <p className="text-slate-300 italic leading-relaxed text-xs">
                    "{selectedChar.privateNarrativeBio}"
                  </p>
                </div>

                {/* Starting Cards Hand */}
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
                    Starting InfoCards ({charCards.length})
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {charCards.map((c) => (
                      <div
                        key={c.id}
                        className="p-1.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex justify-between"
                      >
                        <span className="font-semibold text-slate-200">{c.title}</span>
                        <span className="font-mono text-slate-500">[{c.secrecy}]</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
