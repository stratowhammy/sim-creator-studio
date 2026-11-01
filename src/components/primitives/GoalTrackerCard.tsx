import React from 'react';
import { Goal, InfoCard } from '../../types/simulation';
import { Award, CheckCircle2, Circle, Clock, Compass, KeyRound } from 'lucide-react';

interface GoalTrackerCardProps {
  goal: Goal;
  ownedCardIds: string[];
  currentPlayerId?: string;
  isAdmin?: boolean;
  cardsById?: Record<string, InfoCard>;
  characterNamesById?: Record<string, string>;
}

export const GoalTrackerCard: React.FC<GoalTrackerCardProps> = ({
  goal,
  ownedCardIds,
  currentPlayerId,
  isAdmin = false,
  cardsById = {},
  characterNamesById = {},
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

  if (!isAdmin) {
    const isPersonalGoal = !currentPlayerId || goal.assignedPlayerId === currentPlayerId;
    return (
      <div
        className={`paper p-4 m-0 transition-all text-xs bg-white border-2 ${
          isCompletedByCurrent
            ? 'border-emerald-600 bg-emerald-50/40'
            : 'border-[#41403e]'
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-secondary" />
            <span className="font-bold text-xs">
              {isPersonalGoal ? 'Personal Mystery Objective' : 'Uncovered Objective'}
            </span>
          </div>

          {isCompletedByCurrent ? (
            <span className="badge success gap-1 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
              RESOLVED
            </span>
          ) : (
            <span className="badge secondary">
              Active Investigation
            </span>
          )}
        </div>

        <p className="leading-relaxed mb-3.5 italic text-[#444] text-xs">
          "{goal.veiledPrompt}"
        </p>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-[11px] text-[#666] mb-1">
            <span>Corroborating Leads Uncovered</span>
            <span className={ownedCount === totalRequired ? 'text-emerald-700 font-bold' : 'font-bold'}>
              {ownedCount} of {totalRequired}
            </span>
          </div>
          <div className="progress w-full h-3 bg-[#e8e6d1] border border-[#41403e] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isCompletedByCurrent ? 'bg-emerald-600' : 'bg-secondary'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Player-Safe Leads List */}
        <div className="space-y-1.5 bg-[#fdfbf2] p-2.5 rounded border border-[#ddd]">
          <span className="text-[10px] uppercase font-bold text-[#777] block mb-1">
            Evidence Trail:
          </span>
          {goal.requiredCardIds.map((reqId, index) => {
            const isOwned = ownedCardIds.includes(reqId);
            const cardTitle = isOwned ? cardsById[reqId]?.title ?? 'Verified Intelligence' : `Undiscovered Lead #${index + 1}`;
            return (
              <div
                key={index}
                className={`flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded border ${
                  isOwned
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                    : 'bg-white border-[#e5e5e5] text-[#888]'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {isOwned ? (
                    <KeyRound className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="w-3 h-3 text-[#aaa] shrink-0" />
                  )}
                  <span className="truncate">{cardTitle}</span>
                </div>
                <span className="text-[10px] uppercase font-bold shrink-0">
                  {isOwned ? 'Confirmed' : 'Pending'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Admin View
  return (
    <div
      className={`paper p-3.5 m-0 transition-all text-xs bg-white border-2 ${
        isCompletedByCurrent
          ? 'border-emerald-600 bg-emerald-50/40'
          : 'border-[#41403e]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="badge secondary font-bold">
            Assigned: {characterNamesById[goal.assignedPlayerId] ?? goal.assignedPlayerId}
          </span>
          <span className="text-[10px] text-[#777]">#{goal.id}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="badge warning font-bold">
            <Award className="w-3 h-3 inline mr-1 text-amber-700" />
            {currentAvailableVp} VP
          </span>
        </div>
      </div>

      <p className="leading-relaxed mb-2 italic text-[#444] text-xs">
        "{goal.veiledPrompt}"
      </p>

      {/* Progress */}
      <div className="mb-2">
        <div className="flex justify-between text-[11px] text-[#666] mb-1">
          <span>Required Clues Collected</span>
          <span className="font-bold">
            {ownedCount} / {totalRequired} ({progressPercent}%)
          </span>
        </div>
        <div className="progress w-full h-2.5 bg-[#e8e6d1] border border-[#41403e] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isCompletedByCurrent ? 'bg-emerald-600' : 'bg-secondary'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Clues Table */}
      <div className="space-y-1 bg-[#fdfbf2] p-2 rounded border border-[#ddd]">
        {goal.requiredCardIds.map((reqId) => {
          const isOwned = ownedCardIds.includes(reqId);
          const card = cardsById[reqId];
          return (
            <div
              key={reqId}
              className={`flex items-center justify-between text-[11px] px-2 py-1 rounded border ${
                isOwned
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                  : 'bg-white border-[#e5e5e5] text-[#777]'
              }`}
            >
              <span className="truncate">
                #{reqId} — {card?.title ?? 'Card'}
              </span>
              <span className="text-[10px] font-bold">
                {isOwned ? 'HELD' : 'MISSING'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
