import React from 'react';
import { ConnectionToken } from '../../types/simulation';
import { Check, Eye, KeyRound, Sparkles, Zap } from 'lucide-react';

interface ConnectionTokenButtonProps {
  token: ConnectionToken;
  targetName: string;
  onConsume: (tokenId: string) => void;
  disabled?: boolean;
}

export const ConnectionTokenButton: React.FC<ConnectionTokenButtonProps> = ({
  token,
  targetName,
  onConsume,
  disabled = false,
}) => {
  return (
    <div
      className={`rounded-lg border p-3 transition-all text-xs ${
        token.isConsumed
          ? 'bg-slate-950/40 border-slate-900 opacity-60'
          : 'bg-amber-950/20 border-amber-500/40 hover:border-amber-400 shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <Zap
            className={`w-4 h-4 ${
              token.isConsumed ? 'text-slate-500' : 'text-amber-400 animate-pulse'
            }`}
          />
          <span className="font-semibold text-slate-200">
            {token.actionType === 'PEEK_RANDOM_CARD' ? 'Peek Confidential Card' : 'Peek Mystery Goal'}
          </span>
        </div>

        {token.isConsumed ? (
          <span className="flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded">
            <Check className="w-3 h-3" />
            CONSUMED
          </span>
        ) : (
          <button
            onClick={() => onConsume(token.id)}
            disabled={disabled}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm disabled:opacity-50"
          >
            <Eye className="w-3 h-3" />
            ACTIVATE
          </button>
        )}
      </div>

      <div className="text-slate-300 font-sans text-xs mb-1">
        Target: <span className="font-semibold text-slate-100">{targetName}</span>
      </div>

      <p className="text-[11px] text-slate-400 italic font-mono bg-slate-950/50 p-1.5 rounded border border-slate-800/80">
        "{token.narrativeJustification}"
      </p>
    </div>
  );
};
