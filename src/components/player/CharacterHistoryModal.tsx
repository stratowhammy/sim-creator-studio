import React, { useMemo, useState } from 'react';
import {
  CharacterSheet,
  InfoCard,
  InteractionRecord,
  InteractionType,
} from '../../types/simulation';
import { SentenceBeatRow } from '../primitives/SentenceBeatRow';
import { STANCE_BADGE_STYLES } from '../ui/themeMaps';
import {
  ArrowLeftRight,
  CheckCircle,
  Clock,
  History,
  MessageSquare,
  Search,
  User,
  X,
} from 'lucide-react';

interface CharacterHistoryModalProps {
  currentPlayerId: string;
  characters: Record<string, CharacterSheet>;
  cards: Record<string, InfoCard>;
  playerInteractions: InteractionRecord[];
  ownedCardIds: string[];
  initialSelectedCharacterId?: string;
  onClose: () => void;
}

const APPROACH_LABELS: Record<InteractionType, string> = {
  ASK: 'Direct Inquiry',
  INTERROGATE: 'Interrogate',
  NEGOTIATE: 'Propose Trade',
  DECEIVE: 'Mislead / Bluff',
};

export const CharacterHistoryModal: React.FC<CharacterHistoryModalProps> = ({
  currentPlayerId,
  characters,
  cards,
  playerInteractions,
  ownedCardIds,
  initialSelectedCharacterId,
  onClose,
}) => {
  const otherCharacters = useMemo(
    () =>
      Object.values(characters).filter((c) => c.playerId !== currentPlayerId),
    [characters, currentPlayerId]
  );

  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(
    () => initialSelectedCharacterId || otherCharacters[0]?.playerId || 'ALL'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activePlayerChar = characters[currentPlayerId];

  const exchangeCountByChar = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const other of otherCharacters) {
      counts[other.playerId] = playerInteractions.filter(
        (ix) =>
          ix.initiatorPlayerId === other.playerId ||
          ix.targetPlayerId === other.playerId
      ).length;
    }
    return counts;
  }, [otherCharacters, playerInteractions]);

  const filteredInteractions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return playerInteractions.filter((ix) => {
      if (selectedCharacterId !== 'ALL') {
        const matchesChar =
          ix.initiatorPlayerId === selectedCharacterId ||
          ix.targetPlayerId === selectedCharacterId;
        if (!matchesChar) return false;
      }

      if (!q) return true;
      const inPrompt = ix.initiatorPrompt.toLowerCase().includes(q);
      const inBeats = ix.beats.some((b) =>
        (b.generatedSentence ?? '').toLowerCase().includes(q)
      );
      return inPrompt || inBeats;
    });
  }, [playerInteractions, selectedCharacterId, searchQuery]);

  // Group filtered interactions by Round / Turn for crystal-clear multi-round review
  const interactionsByRound = useMemo(() => {
    const grouped = new Map<number, InteractionRecord[]>();
    for (const ix of filteredInteractions) {
      const list = grouped.get(ix.tickOrTurn) ?? [];
      list.push(ix);
      grouped.set(ix.tickOrTurn, list);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [filteredInteractions]);

  const selectedCharacter =
    selectedCharacterId !== 'ALL' ? characters[selectedCharacterId] : undefined;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-text">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="h-14 px-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-sky-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                Character Interaction Archive (All Rounds)
              </h3>
              <p className="text-[11px] text-slate-400">
                Review every exchange with a specific character chronologically across all simulation rounds
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Left Character Roster + Right Multi-Round Thread */}
        <div className="flex-1 grid grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Character Selector */}
          <aside className="col-span-4 border-r border-slate-800 bg-slate-950/50 p-3.5 overflow-y-auto space-y-2">
            <button
              type="button"
              onClick={() => setSelectedCharacterId('ALL')}
              className={`w-full text-left p-3 rounded-xl border transition-all text-xs flex items-center justify-between ${
                selectedCharacterId === 'ALL'
                  ? 'bg-sky-950/50 border-sky-500 text-white'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div>
                <div className="font-bold">All Characters</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Combined timeline across every participant
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 font-mono text-[11px]">
                {playerInteractions.length}
              </span>
            </button>

            <div className="pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">
              Filter by Specific Character
            </div>

            {otherCharacters.map((other) => {
              const count = exchangeCountByChar[other.playerId] ?? 0;
              const isSelected = selectedCharacterId === other.playerId;
              const stance =
                activePlayerChar?.defensivePolicy.stanceByPlayerId[
                  other.playerId
                ] ?? 'NEUTRAL';

              return (
                <button
                  key={other.playerId}
                  type="button"
                  onClick={() => setSelectedCharacterId(other.playerId)}
                  className={`w-full text-left p-3 rounded-xl border transition-all text-xs space-y-2 ${
                    isSelected
                      ? 'bg-sky-950/50 border-sky-500 text-white ring-1 ring-sky-500/30'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-100 truncate">
                        {other.characterName}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {other.publicRole}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full font-mono text-[11px] shrink-0 ${
                        count > 0
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {count} {count === 1 ? 'exchange' : 'exchanges'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">Your Stance:</span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono ${STANCE_BADGE_STYLES[stance]}`}
                    >
                      {stance}
                    </span>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Right Chronological Multi-Round Transcript */}
          <div className="col-span-8 flex flex-col min-h-0 bg-slate-950/30">
            {/* Search & Summary Bar */}
            <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <User className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="truncate text-xs">
                  {selectedCharacter ? (
                    <>
                      <span className="font-bold text-white">
                        {selectedCharacter.characterName}
                      </span>
                      <span className="text-slate-500 mx-1.5">•</span>
                      <span className="text-sky-300">
                        {selectedCharacter.publicRole}
                      </span>
                    </>
                  ) : (
                    <span className="font-bold text-white">
                      All Recorded Conversations
                    </span>
                  )}
                </div>
              </div>

              <div className="relative w-64 shrink-0">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search dialogue across rounds..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Scrollable Multi-Round Thread */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 min-h-0">
              {interactionsByRound.length > 0 ? (
                interactionsByRound.map(([roundNum, roundInteractions]) => (
                  <div key={roundNum} className="space-y-4">
                    {/* Round Divider */}
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-bold font-mono">
                        <Clock className="w-3 h-3" />
                        Round / Turn {roundNum}
                      </span>
                      <div className="flex-1 h-px bg-slate-800" />
                      <span className="text-[11px] text-slate-500">
                        {roundInteractions.length}{' '}
                        {roundInteractions.length === 1 ? 'exchange' : 'exchanges'}
                      </span>
                    </div>

                    {roundInteractions.map((ix, idx) => {
                      const youInitiated = ix.initiatorPlayerId === currentPlayerId;
                      const otherId = youInitiated
                        ? ix.targetPlayerId
                        : ix.initiatorPlayerId;
                      const otherChar = characters[otherId];

                      const gainedTitles = (
                        youInitiated
                          ? ix.cardsTransferredToInitiator
                          : ix.cardsTransferredToTarget
                      )
                        .map((cid) => cards[cid]?.title)
                        .filter((t): t is string => Boolean(t));

                      return (
                        <div
                          key={ix.id}
                          className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" />
                              <span className="font-bold text-slate-100">
                                {youInitiated
                                  ? `You approached ${otherChar?.characterName ?? otherId}`
                                  : `${otherChar?.characterName ?? otherId} approached You`}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 text-[10px] font-semibold">
                                {APPROACH_LABELS[ix.interactionType]}
                              </span>
                              {ix.responseMode && ix.responseMode !== 'AI_AUTOMATED' && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                                  Live Player Response
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">
                              Round {roundNum} • #{idx + 1}
                            </span>
                          </div>

                          {gainedTitles.length > 0 && (
                            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/50 flex items-center gap-2 text-xs">
                              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="font-semibold text-emerald-200">
                                Intelligence Acquired: {gainedTitles.join(', ')}
                              </span>
                            </div>
                          )}

                          <div className="space-y-1">
                            {ix.beats.map((beat) => {
                              const speaker = characters[beat.speakerId];
                              const playerGainedRevealed =
                                beat.revealedCardId &&
                                ownedCardIds.includes(beat.revealedCardId) &&
                                ((ix.initiatorPlayerId === currentPlayerId &&
                                  ix.cardsTransferredToInitiator.includes(
                                    beat.revealedCardId
                                  )) ||
                                  (ix.targetPlayerId === currentPlayerId &&
                                    ix.cardsTransferredToTarget.includes(
                                      beat.revealedCardId
                                    )));

                              return (
                                <SentenceBeatRow
                                  key={beat.sentenceIndex}
                                  beat={beat}
                                  speakerName={speaker?.characterName ?? 'Speaker'}
                                  isInitiator={
                                    beat.speakerId === ix.initiatorPlayerId
                                  }
                                  showServerStats={false}
                                  revealedCardTitle={
                                    playerGainedRevealed && beat.revealedCardId
                                      ? cards[beat.revealedCardId]?.title
                                      : undefined
                                  }
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-700" />
                  <div className="text-xs font-medium text-slate-300">
                    {selectedCharacter
                      ? `No interactions recorded with ${selectedCharacter.characterName} yet.`
                      : 'No interactions recorded yet.'}
                  </div>
                  <p className="text-[11px] text-slate-500 max-w-sm">
                    Once you engage {selectedCharacter?.characterName ?? 'characters'} across simulation rounds, every exchange will appear chronologically here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
