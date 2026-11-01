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

  // Group filtered interactions by Round / Turn
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-text">
      <div className="paper max-w-5xl w-full h-[85vh] bg-[#fffef0] border-2 border-[#41403e] shadow-2xl p-0 flex flex-col overflow-hidden m-0">
        {/* Header */}
        <div className="h-14 px-5 border-b-2 border-dashed border-[#ccc] bg-[#f8f7ea] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-secondary" />
            <div>
              <h3 className="text-base font-bold m-0">
                Character Interaction Archive
              </h3>
              <p className="text-xs text-[#666] m-0">
                Review exchanges with each character across simulation rounds
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="paper-btn btn-small py-0.5 px-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Character Selector */}
          <aside className="col-span-4 border-r border-[#ccc] bg-white p-3.5 overflow-y-auto space-y-2">
            <button
              type="button"
              onClick={() => setSelectedCharacterId('ALL')}
              className={`w-full text-left p-2.5 rounded border transition-all text-xs flex items-center justify-between ${
                selectedCharacterId === 'ALL'
                  ? 'border-2 border-primary bg-[#fffbf0]'
                  : 'border-[#ddd] hover:bg-[#faf9ee]'
              }`}
            >
              <div>
                <div className="font-bold">All Characters</div>
                <div className="text-[10px] text-[#777] mt-0.5">
                  Combined timeline
                </div>
              </div>
              <span className="badge text-[10px]">
                {playerInteractions.length}
              </span>
            </button>

            <div className="pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#777] px-1">
              Filter by Character
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
                  className={`w-full text-left p-2.5 rounded border transition-all text-xs space-y-1.5 ${
                    isSelected
                      ? 'border-2 border-primary bg-[#fffbf0]'
                      : 'border-[#ddd] hover:bg-[#faf9ee]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-[#222] truncate">
                        {other.characterName}
                      </div>
                      <div className="text-[11px] text-[#666] truncate">
                        {other.publicRole}
                      </div>
                    </div>

                    <span
                      className={`badge text-[10px] shrink-0 ${
                        count > 0 ? 'secondary' : ''
                      }`}
                    >
                      {count} {count === 1 ? 'exchange' : 'exchanges'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#777]">Your Stance:</span>
                    <span className={STANCE_BADGE_STYLES[stance]}>
                      {stance}
                    </span>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Right Chronological Multi-Round Transcript */}
          <div className="col-span-8 flex flex-col min-h-0 bg-[#fffef0]">
            {/* Search & Summary Bar */}
            <div className="p-3 border-b border-[#ccc] bg-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <User className="w-4 h-4 text-secondary shrink-0" />
                <div className="truncate text-xs">
                  {selectedCharacter ? (
                    <>
                      <span className="font-bold text-[#222]">
                        {selectedCharacter.characterName}
                      </span>
                      <span className="text-[#aaa] mx-1.5">•</span>
                      <span className="text-secondary font-bold">
                        {selectedCharacter.publicRole}
                      </span>
                    </>
                  ) : (
                    <span className="font-bold text-[#222]">
                      All Recorded Conversations
                    </span>
                  )}
                </div>
              </div>

              <div className="relative w-64 shrink-0">
                <Search className="w-3.5 h-3.5 text-[#777] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search dialogue across rounds..."
                  className="w-full pl-8 pr-3 py-1 text-xs"
                />
              </div>
            </div>

            {/* Scrollable Multi-Round Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {interactionsByRound.length > 0 ? (
                interactionsByRound.map(([roundNum, roundInteractions]) => (
                  <div key={roundNum} className="space-y-3">
                    {/* Round Divider */}
                    <div className="flex items-center gap-3">
                      <span className="badge warning font-bold">
                        <Clock className="w-3 h-3 inline mr-1" />
                        Round / Turn {roundNum}
                      </span>
                      <div className="flex-1 h-px bg-[#ccc]" />
                      <span className="text-[11px] text-[#777]">
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
                          className="paper bg-white p-3 space-y-2 m-0 border"
                        >
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-[#ccc] text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <ArrowLeftRight className="w-3.5 h-3.5 text-secondary" />
                              <span className="font-bold">
                                {youInitiated
                                  ? `You approached ${otherChar?.characterName ?? otherId}`
                                  : `${otherChar?.characterName ?? otherId} approached You`}
                              </span>
                              <span className="badge secondary text-[10px]">
                                {APPROACH_LABELS[ix.interactionType]}
                              </span>
                              {ix.responseMode && ix.responseMode !== 'AI_AUTOMATED' && (
                                <span className="badge success text-[10px]">
                                  Live Player Response
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#777]">
                              Round {roundNum} • #{idx + 1}
                            </span>
                          </div>

                          {gainedTitles.length > 0 && (
                            <div className="alert alert-success p-2 text-xs flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                              <span className="font-bold">
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
                <div className="h-64 flex flex-col items-center justify-center text-center text-[#777] space-y-2">
                  <MessageSquare className="w-8 h-8 text-[#ccc]" />
                  <div className="text-xs font-bold text-[#444]">
                    {selectedCharacter
                      ? `No interactions recorded with ${selectedCharacter.characterName} yet.`
                      : 'No interactions recorded yet.'}
                  </div>
                  <p className="text-[11px] text-[#777] max-w-sm m-0">
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
