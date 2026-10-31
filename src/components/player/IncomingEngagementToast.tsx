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
    <div className="fixed bottom-5 right-5 z-50 w-96 max-w-[calc(100vw-2.5rem)] rounded-2xl bg-slate-900/95 backdrop-blur-md border-2 border-sky-500/80 shadow-2xl shadow-sky-950/80 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* 30-Second Countdown Progress Bar */}
      <div className="h-1.5 w-full bg-slate-800">
        <div
          className={`h-full transition-all duration-200 ${
            isUrgent ? 'bg-rose-500' : 'bg-sky-400'
          }`}
          style={{ width: `${pctRemaining}%` }}
        />
      </div>

      <div className="p-4 space-y-3">
        {/* Top Row: Alert Badge + Live 30s Countdown */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center">
              <BellRing className="w-4 h-4 text-sky-300 animate-bounce" />
            </span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                Incoming Conversation
              </div>
              <div className="text-xs font-bold text-white">
                {initiator?.characterName ?? engagement.initiatorPlayerId}
              </div>
            </div>
          </div>

          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono text-xs font-bold ${
              isUrgent
                ? 'bg-rose-950/70 border-rose-500/60 text-rose-200 animate-pulse'
                : 'bg-slate-950 border-slate-700 text-amber-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{secondsRemaining}s</span>
          </div>
        </div>

        {/* Initiator Role & Opening Statement Preview */}
        <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-400">
              {initiator?.publicRole ?? 'Participant'}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-semibold">
              {APPROACH_LABELS[engagement.interactionType]}
            </span>
          </div>
          <p className="text-xs text-slate-200 italic line-clamp-2 leading-relaxed">
            "{engagement.initiatorPrompt}"
          </p>
        </div>

        {additionalQueuedCount > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded-lg px-2.5 py-1.5">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>
              +{additionalQueuedCount} other{' '}
              {additionalQueuedCount === 1 ? 'person is' : 'people are'} also waiting to speak with you
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <span className="text-[10px] text-slate-400 leading-tight">
            Ignore for {secondsRemaining}s to let AI respond automatically
          </span>

          <button
            type="button"
            onClick={() => onFocusConversation(engagement.id)}
            className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Focus & Respond
          </button>
        </div>
      </div>
    </div>
  );
};
