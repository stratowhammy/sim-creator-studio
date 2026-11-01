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
      className={`paper p-3.5 m-0 transition-all text-xs bg-white border-2 ${tierClass} ${
        isSelected ? 'border-secondary ring-2 ring-secondary' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {card.tier === 'COMPOSITE' && (
            <span className="badge secondary gap-1 text-[10px]">
              <Sparkles className="w-3 h-3 inline mr-1" />
              {isAdmin ? 'COMPOSITE' : 'SYNTHESIZED DOSSIER'}
            </span>
          )}
          <span className={`badge ${secrecyClass} text-[10px]`}>
            {card.secrecy}
          </span>
          {isAdmin && (
            <span className="text-[10px] text-[#777]">#{card.id}</span>
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
              className={`paper-btn btn-small py-0.5 px-2 text-[10px] inline-flex items-center gap-1 ${
                isProtected
                  ? 'btn-danger'
                  : guardDisabled
                  ? 'disabled'
                  : ''
              }`}
            >
              {isProtected ? (
                <ShieldAlert className="w-3 h-3" />
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
              className={`paper-btn btn-small py-0.5 px-2 text-[10px] inline-flex items-center gap-1 ${
                isTradeable
                  ? 'btn-success'
                  : shareableDisabled
                  ? 'disabled'
                  : ''
              }`}
            >
              {isTradeable && shareableDisabled ? (
                <Lock className="w-2.5 h-2.5" />
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
              className={`paper-btn btn-small py-0.5 px-2 text-[10px] ${
                isSelected ? 'btn-primary' : ''
              }`}
            >
              {isSelected ? 'Targeted' : 'Target'}
            </button>
          )}
        </div>
      </div>

      <h4 className="font-bold text-sm mb-1">{card.title}</h4>
      <p className="leading-relaxed mb-2 text-xs text-[#555]">
        {card.canonicalFact}
      </p>

      {card.topicTags && card.topicTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-dashed border-[#ccc]">
          <Tag className="w-3 h-3 text-[#777]" />
          {card.topicTags.map((tag) => (
            <span
              key={tag}
              className="badge text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
