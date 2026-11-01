import React, { useEffect, useState } from 'react';
import { CharacterSheet, InteractionType, PendingEngagement } from '../../types/simulation';
import { NOTIFICATION_TIMEOUT_MS } from '../../engine/engagementManager';
import { BellRing, Clock, MessageSquare, Users } from 'lucide-react';

interface IncomingEngagementToastProps {
  engagement: PendingEngagement;
  initiator?: CharacterSheet;
  additionalQueuedCount: number;
  onFocusConversation: (engagementId: string) => void;
}

const APPROACH_LABELS: Record<InteractionType, string> = {
  ASK: 'Direct Inquiry',
  INTERROGATE: 'Press / Interrogate',
  NEGOTIATE: 'Propose Trade',
  DECEIVE: 'Statement / Claim',
};

export const IncomingEngagementToast: React.FC<IncomingEngagementToastProps> = ({
  engagement,
  initiator,
  additionalQueuedCount,
  onFocusConversation,
}) => {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 200);
    return () => window.clearInterval(interval);
  }, []);

  const expiresAt =
    engagement.expiresAt ??
    (engagement.notificationStartedAt ?? engagement.createdAt) +
      NOTIFICATION_TIMEOUT_MS;

  const msRemaining = Math.max(0, expiresAt - now);
  const secondsRemaining = Math.ceil(msRemaining / 1000);
  const pctRemaining = Math.max(
    0,
    Math.min(100, (msRemaining / NOTIFICATION_TIMEOUT_MS) * 100)
  );
  const isUrgent = secondsRemaining <= 10;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-96 max-w-[calc(100vw-2.5rem)] paper bg-[#fffef0] border-2 border-[#41403e] shadow-2xl p-0 overflow-hidden m-0">
      {/* 30-Second Countdown Progress Bar */}
      <div className="h-2 w-full bg-[#e8e6d1] border-b border-[#41403e]">
        <div
          className={`h-full transition-all duration-200 ${
            isUrgent ? 'bg-rose-600' : 'bg-secondary'
          }`}
          style={{ width: `${pctRemaining}%` }}
        />
      </div>

      <div className="p-4 space-y-3">
        {/* Top Row: Alert Badge + Live 30s Countdown */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded border border-[#41403e] flex items-center justify-center bg-[#fdfbf2]">
              <BellRing className="w-4 h-4 text-secondary animate-bounce" />
            </span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-secondary">
                Incoming Conversation
              </div>
              <div className="text-xs font-bold text-[#222]">
                {initiator?.characterName ?? engagement.initiatorPlayerId}
              </div>
            </div>
          </div>

          <div
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded border font-mono text-xs font-bold ${
              isUrgent
                ? 'badge danger'
                : 'badge warning'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{secondsRemaining}s</span>
          </div>
        </div>

        {/* Initiator Role & Opening Statement Preview */}
        <div className="rounded bg-white border border-[#ccc] p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[#666]">
              {initiator?.publicRole ?? 'Participant'}
            </span>
            <span className="badge secondary text-[10px]">
              {APPROACH_LABELS[engagement.interactionType]}
            </span>
          </div>
          <p className="text-xs text-[#333] italic line-clamp-2 leading-relaxed m-0">
            "{engagement.initiatorPrompt}"
          </p>
        </div>

        {additionalQueuedCount > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-300 rounded p-2">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>
              +{additionalQueuedCount} other{' '}
              {additionalQueuedCount === 1 ? 'person is' : 'people are'} also waiting to speak with you
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <span className="text-[10px] text-[#777] leading-tight">
            Ignore for {secondsRemaining}s to let AI respond
          </span>

          <button
            type="button"
            onClick={() => onFocusConversation(engagement.id)}
            className="paper-btn btn-small btn-primary py-1 px-3 text-xs inline-flex items-center gap-1 shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Respond
          </button>
        </div>
      </div>
    </div>
  );
};
