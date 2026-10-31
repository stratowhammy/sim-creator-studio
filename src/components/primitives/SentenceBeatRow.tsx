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
        className={`p-3.5 rounded-lg border transition-all text-xs mb-2.5 ${
          isInitiator
            ? 'bg-sky-950/20 border-sky-900/50 text-slate-100'
            : 'bg-slate-900/60 border-slate-800 text-slate-100'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span
            className={`font-semibold text-xs ${
              isInitiator ? 'text-sky-300' : 'text-amber-300'
            }`}
          >
            {speakerName}
          </span>

          {revealedCardTitle && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded-full border border-emerald-600/50 font-medium">
              <KeyRound className="w-3 h-3 text-emerald-400" />
              Intel Uncovered: {revealedCardTitle}
            </span>
          )}
        </div>

        <p className="text-slate-100 font-sans leading-relaxed text-sm">
          {beat.generatedSentence || 'Dialogue exchange in progress...'}
        </p>
      </div>
    );
  }

  const styleClass = BEAT_OUTCOME_STYLES[beat.outcomeTier];

  return (
    <div className={`p-3 rounded-r-lg transition-all text-xs mb-2 ${styleClass}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-300">
            Beat {beat.sentenceIndex}
          </span>
          <span className="text-slate-500">•</span>
          <span
            className={`font-semibold ${
              isInitiator ? 'text-sky-300' : 'text-amber-300'
            }`}
          >
            {speakerName}
          </span>
          {isInitiator && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800">
              Initiator
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900/80 font-semibold border border-slate-700/60">
            {beat.outcomeTier.replace('_', ' ')}
          </span>
          <span className="text-slate-400 text-[10px]">
            Δ:{' '}
            <span className={beat.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {beat.delta >= 0 ? `+${beat.delta.toFixed(3)}` : beat.delta.toFixed(3)}
            </span>
          </span>
        </div>
      </div>

      <p className="text-slate-100 font-sans leading-relaxed text-sm my-1">
        {beat.generatedSentence || `[Beat ${beat.sentenceIndex}] Dialogue sentence pending generation...`}
      </p>

      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-700/30 text-[10px] font-mono text-slate-400">
        <span>
          Threshold: <span className="text-slate-300">{beat.successThreshold.toFixed(3)}</span> | Roll:{' '}
          <span className="text-slate-300">{beat.rngRoll.toFixed(3)}</span>
        </span>

        {beat.revealedCardId && (
          <span className="flex items-center gap-1 text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/50 font-bold">
            <KeyRound className="w-3 h-3 text-emerald-400" />
            REVEALED: #{beat.revealedCardId}
          </span>
        )}
      </div>
    </div>
  );
};
