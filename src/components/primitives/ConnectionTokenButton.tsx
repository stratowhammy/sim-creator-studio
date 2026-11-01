import React from 'react';
import { ConnectionToken } from '../../types/simulation';
import { Check, Eye, Zap } from 'lucide-react';

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
      className={`paper p-3 m-0 transition-all text-xs border-2 ${
        token.isConsumed
          ? 'bg-[#f7f6ec] border-[#ccc] opacity-60'
          : 'bg-[#fffcf0] border-warning'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <Zap
            className={`w-4 h-4 ${
              token.isConsumed ? 'text-[#888]' : 'text-amber-700 animate-pulse'
            }`}
          />
          <span className="font-bold text-xs">
            {token.actionType === 'PEEK_RANDOM_CARD' ? 'Peek Confidential Card' : 'Peek Mystery Goal'}
          </span>
        </div>

        {token.isConsumed ? (
          <span className="badge text-[10px]">
            <Check className="w-3 h-3 inline mr-1" />
            CONSUMED
          </span>
        ) : (
          <button
            onClick={() => onConsume(token.id)}
            disabled={disabled}
            className="paper-btn btn-small btn-warning py-0.5 px-2 text-[10px] inline-flex items-center gap-1 font-bold"
          >
            <Eye className="w-3 h-3" />
            ACTIVATE
          </button>
        )}
      </div>

      <div className="text-xs mb-1 text-[#444]">
        Target: <span className="font-bold text-primary">{targetName}</span>
      </div>

      <p className="text-[11px] text-[#666] italic bg-white p-1.5 rounded border border-dashed border-[#ccc] m-0">
        "{token.narrativeJustification}"
      </p>
    </div>
  );
};
