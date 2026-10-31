import React from 'react';
import { InfoCard } from '../../types/simulation';
import { CARD_TIER_STYLES, SECRECY_BADGE_STYLES } from '../ui/themeMaps';
import { Shield, ShieldAlert, Sparkles, Tag } from 'lucide-react';

interface InfoCardItemProps {
  card: InfoCard;
  isProtected?: boolean;
  onToggleProtect?: (cardId: string) => void;
  isTradeable?: boolean;
  onToggleTradeable?: (cardId: string) => void;
  onSelectForInteraction?: (cardId: string) => void;
  isSelected?: boolean;
}

export const InfoCardItem: React.FC<InfoCardItemProps> = ({
  card,
  isProtected = false,
  onToggleProtect,
  isTradeable = false,
  onToggleTradeable,
  onSelectForInteraction,
  isSelected = false,
}) => {
  const secrecyClass = SECRECY_BADGE_STYLES[card.secrecy];
  const tierClass = CARD_TIER_STYLES[card.tier];

  return (
    <div
      className={`rounded-lg border p-3.5 transition-all text-xs ${tierClass} ${
        isSelected ? 'ring-2 ring-sky-500 bg-sky-950/30' : 'hover:border-slate-500'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {card.tier === 'COMPOSITE' && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
              <Sparkles className="w-3 h-3 text-purple-400" />
              COMPOSITE
            </span>
          )}
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${secrecyClass}`}
          >
            {card.secrecy}
          </span>
          <span className="text-[10px] font-mono text-slate-400">#{card.id}</span>
        </div>

        <div className="flex items-center gap-1">
          {onToggleProtect && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleProtect(card.id);
              }}
              title={isProtected ? 'Protected from disclosure (+0.20 defense)' : 'Mark as protected'}
              className={`p-1 rounded transition-colors ${
                isProtected
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 hover:bg-rose-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isProtected ? <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> : <Shield className="w-3.5 h-3.5" />}
            </button>
          )}

          {onToggleTradeable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleTradeable(card.id);
              }}
              title={isTradeable ? 'Authorized for NEGOTIATE trades' : 'Authorize for trade'}
              className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition-colors ${
                isTradeable
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}
            >
              TRADE
            </button>
          )}

          {onSelectForInteraction && (
            <button
              onClick={() => onSelectForInteraction(card.id)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                isSelected
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isSelected ? 'Targeted' : 'Target'}
            </button>
          )}
        </div>
      </div>

      <h4 className="font-semibold text-slate-200 text-sm mb-1.5">{card.title}</h4>
      <p className="text-slate-300/90 leading-relaxed font-sans mb-2.5 text-xs">
        {card.canonicalFact}
      </p>

      {card.topicTags && card.topicTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-800/80">
          <Tag className="w-3 h-3 text-slate-500" />
          {card.topicTags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 font-mono"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
