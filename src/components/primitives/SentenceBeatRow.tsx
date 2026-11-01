import React from 'react';
import { SentenceBeat } from '../../types/simulation';
import { BEAT_OUTCOME_STYLES } from '../ui/themeMaps';
import { KeyRound } from 'lucide-react';

interface SentenceBeatRowProps {
  beat: SentenceBeat;
  speakerName: string;
  isInitiator?: boolean;
  showServerStats?: boolean;
  revealedCardTitle?: string;
}

export const SentenceBeatRow: React.FC<SentenceBeatRowProps> = ({
  beat,
  speakerName,
  isInitiator = false,
  showServerStats = false,
  revealedCardTitle,
}) => {
  if (!showServerStats) {
    return (
      <div
        className={`p-3 rounded border-2 transition-all text-xs mb-2 ${
          isInitiator
            ? 'bg-[#f0f8ff] border-secondary'
            : 'bg-white border-[#41403e]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span
            className={`font-bold text-xs ${
              isInitiator ? 'text-secondary' : 'text-[#333]'
            }`}
          >
            {speakerName}
          </span>

          {revealedCardTitle && (
            <span className="badge success text-[10px] py-0 px-2">
              <KeyRound className="w-3 h-3 inline mr-1" />
              Intel Uncovered: {revealedCardTitle}
            </span>
          )}
        </div>

        <p className="leading-relaxed text-sm m-0 text-[#333]">
          {beat.generatedSentence || 'Dialogue exchange in progress...'}
        </p>
      </div>
    );
  }

  const styleClass = BEAT_OUTCOME_STYLES[beat.outcomeTier];

  return (
    <div className={`p-3 rounded border transition-all text-xs mb-2 ${styleClass}`}>
      <div className="flex items-center justify-between gap-2 mb-1 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#555]">
            Beat {beat.sentenceIndex}
          </span>
          <span className="text-[#999]">•</span>
          <span
            className={`font-bold ${
              isInitiator ? 'text-secondary' : 'text-[#333]'
            }`}
          >
            {speakerName}
          </span>
          {isInitiator && (
            <span className="badge text-[9px] py-0 px-1">
              Initiator
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="badge text-[10px]">
            {beat.outcomeTier.replace('_', ' ')}
          </span>
          <span className="text-[#666] text-[10px] font-bold">
            Δ:{' '}
            <span className={beat.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
              {beat.delta >= 0 ? `+${beat.delta.toFixed(3)}` : beat.delta.toFixed(3)}
            </span>
          </span>
        </div>
      </div>

      <p className="leading-relaxed text-sm my-1 text-[#222]">
        {beat.generatedSentence || `[Beat ${beat.sentenceIndex}] Dialogue sentence pending generation...`}
      </p>

      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-dashed border-[#ccc] text-[10px] text-[#666]">
        <span>
          Threshold: <strong className="text-[#333]">{beat.successThreshold.toFixed(3)}</strong> | Roll:{' '}
          <strong className="text-[#333]">{beat.rngRoll.toFixed(3)}</strong>
        </span>
      </div>
    </div>
  );
};
