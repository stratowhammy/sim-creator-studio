import React from 'react';
import { InfoCard } from '../../types/simulation';
import { CARD_TIER_STYLES, SECRECY_BADGE_STYLES } from '../ui/themeMaps';
import { Lock, Share2, Shield, ShieldAlert, Sparkles, Tag } from 'lucide-react';

interface InfoCardItemProps {
  card: InfoCard;
  isProtected?: boolean;
  onToggleProtect?: (cardId: string) => void;
  guardDisabled?: boolean;
  guardTooltip?: string;
  isTradeable?: boolean;
  onToggleTradeable?: (cardId: string) => void;
  shareableDisabled?: boolean;
  shareableTooltip?: string;
  onSelectForInteraction?: (cardId: string) => void;
  isSelected?: boolean;
  isAdmin?: boolean;
}

export const InfoCardItem: React.FC<InfoCardItemProps> = ({
  card,
  isProtected = false,
  onToggleProtect,
  guardDisabled = false,
  guardTooltip,
  isTradeable = false,
  onToggleTradeable,
  shareableDisabled = false,
  shareableTooltip,
  onSelectForInteraction,
  isSelected = false,
  isAdmin = false,
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
              {isAdmin ? 'COMPOSITE' : 'SYNTHESIZED DOSSIER'}
            </span>
          )}
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${secrecyClass}`}
          >
            {card.secrecy}
          </span>
          {isAdmin && (
            <span className="text-[10px] font-mono text-slate-400">#{card.id}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onToggleProtect && (
            <button
              type="button"
              disabled={guardDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!guardDisabled) {
                  onToggleProtect(card.id);
                }
              }}
              title={
                guardTooltip ??
                (isProtected
                  ? 'Guarded from being shared — click to unguard'
                  : 'Guard this card from being shared (max 1)')
              }
              className={`px-2 py-0.5 text-[10px] rounded flex items-center gap-1 transition-colors border ${
                isProtected
                  ? 'bg-rose-500/20 text-rose-200 border-rose-500/60 font-semibold hover:bg-rose-500/30'
                  : guardDisabled
                  ? 'bg-slate-900/40 text-slate-600 border-slate-800/60 cursor-not-allowed opacity-50'
                  : 'bg-slate-900/80 text-slate-400 border-slate-700/70 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {isProtected ? (
                <ShieldAlert className="w-3 h-3 text-rose-400" />
              ) : (
                <Shield className="w-3 h-3" />
              )}
              <span>{isProtected ? 'Guarded' : 'Guard'}</span>
            </button>
          )}

          {onToggleTradeable && (
            <button
              type="button"
              disabled={shareableDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!shareableDisabled) {
                  onToggleTradeable(card.id);
                }
              }}
              title={
                shareableTooltip ??
                (isTradeable
                  ? 'Marked Shareable'
                  : 'Mark as Shareable to increase exchange success')
              }
              className={`px-2 py-0.5 text-[10px] rounded flex items-center gap-1 transition-colors border ${
                isTradeable
                  ? shareableDisabled
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50 font-semibold cursor-not-allowed'
                    : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/60 font-semibold hover:bg-emerald-500/30'
                  : shareableDisabled
                  ? 'bg-slate-900/40 text-slate-600 border-slate-800/60 cursor-not-allowed opacity-50'
                  : 'bg-slate-900/80 text-slate-400 border-slate-700/70 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {isTradeable && shareableDisabled ? (
                <Lock className="w-2.5 h-2.5 text-emerald-400" />
              ) : (
                <Share2 className="w-2.5 h-2.5" />
              )}
              <span>Shareable</span>
            </button>
          )}

          {isAdmin && onSelectForInteraction && (
            <button
              type="button"
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
