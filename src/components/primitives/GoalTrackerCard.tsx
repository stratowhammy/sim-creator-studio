import React from 'react';
import { Goal } from '../../types/simulation';
import { Award, CheckCircle2, Circle, Clock, KeyRound, Sparkles } from 'lucide-react';

interface GoalTrackerCardProps {
  goal: Goal;
  ownedCardIds: string[];
  currentPlayerId?: string;
}

export const GoalTrackerCard: React.FC<GoalTrackerCardProps> = ({
  goal,
  ownedCardIds,
  currentPlayerId,
}) => {
  const isCompletedByCurrent = currentPlayerId
    ? goal.completedByPlayerIds.includes(currentPlayerId)
    : false;

  const totalRequired = goal.requiredCardIds.length;
  const ownedCount = goal.requiredCardIds.filter((id) => ownedCardIds.includes(id)).length;
  const progressPercent = Math.min(100, Math.round((ownedCount / totalRequired) * 100));

  const currentMultiplierIndex = goal.completedByPlayerIds.length;
  const nextMultiplier =
    goal.decayMultipliers[currentMultiplierIndex] ??
    goal.decayMultipliers[goal.decayMultipliers.length - 1] ??
    1.0;
  const currentAvailableVp = Math.round(goal.baseVpValue * nextMultiplier);

  return (
    <div
      className={`rounded-lg border p-3.5 transition-all text-xs ${
        isCompletedByCurrent
          ? 'bg-emerald-950/20 border-emerald-700/60'
          : progressPercent === 100
          ? 'bg-amber-950/20 border-amber-500/60'
          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <KeyRound className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-slate-200 text-xs">Mystery Goal</span>
          <span className="text-[10px] font-mono text-slate-500">#{goal.id}</span>
        </div>

        <div className="flex items-center gap-2">
          {isCompletedByCurrent ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              SOLVED
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
              <Award className="w-3.5 h-3.5" />
              {currentAvailableVp} VP
            </span>
          )}
        </div>
      </div>

      <p className="text-slate-300 font-sans leading-relaxed mb-3 italic">
        "{goal.veiledPrompt}"
      </p>

      {/* Progress Bar */}
      <div className="mb-2.5">
        <div className="flex justify-between text-[11px] text-slate-400 mb-1 font-mono">
          <span>Clue Cards Gathered</span>
          <span className={ownedCount === totalRequired ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
            {ownedCount} / {totalRequired} ({progressPercent}%)
          </span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isCompletedByCurrent
                ? 'bg-emerald-500'
                : progressPercent === 100
                ? 'bg-amber-400 animate-pulse'
                : 'bg-sky-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Requirements Matrix */}
      <div className="space-y-1 mb-2.5 bg-slate-950/40 p-2 rounded border border-slate-800/80">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1">
          Required Cards:
        </span>
        <div className="grid grid-cols-1 gap-1">
          {goal.requiredCardIds.map((reqId) => {
            const isOwned = ownedCardIds.includes(reqId);
            return (
              <div
                key={reqId}
                className={`flex items-center justify-between text-[11px] px-2 py-1 rounded font-mono ${
                  isOwned
                    ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-800/40'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {isOwned ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Circle className="w-3 h-3 text-slate-600" />
                  )}
                  {reqId}
                </span>
                <span className="text-[10px] text-slate-400 font-sans">
                  {isOwned ? 'In Hand' : 'Missing'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Exclusivity Decay Tiers */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-500" />
          Decay Tiers:
        </span>
        <div className="flex items-center gap-1.5">
          {goal.decayMultipliers.map((mult, idx) => {
            const isCurrent = idx === currentMultiplierIndex;
            const isPast = idx < currentMultiplierIndex;
            return (
              <span
                key={idx}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  isCurrent
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                    : isPast
                    ? 'text-slate-400 line-through'
                    : 'text-slate-400 bg-slate-900'
                }`}
              >
                #{idx + 1}: {Math.round(goal.baseVpValue * mult)} VP
              </span>
            );
          })}
        </div>
      </div>

      {goal.completedByPlayerIds.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400">
          Solved by: <span className="text-slate-300 font-mono">{goal.completedByPlayerIds.join(', ')}</span>
        </div>
      )}
    </div>
  );
};
