import {
  BeatOutcomeTier,
  CardTier,
  InteractionType,
  SecrecyLevel,
} from '../../types/simulation';

export const SECRECY_BADGE_STYLES: Record<SecrecyLevel, string> = {
  PUBLIC: 'bg-slate-800 text-slate-200 border-slate-600',
  LOW: 'bg-emerald-950 text-emerald-300 border-emerald-700',
  MEDIUM: 'bg-amber-950 text-amber-300 border-amber-700',
  HIGH: 'bg-orange-950 text-orange-300 border-orange-700',
  CRITICAL: 'bg-rose-950 text-rose-300 border-rose-700 font-semibold',
};

export const BEAT_OUTCOME_STYLES: Record<BeatOutcomeTier, string> = {
  CRITICAL_REVEAL: 'border-l-4 border-emerald-500 bg-emerald-950/30 text-emerald-100',
  PARTIAL_CONCESSION: 'border-l-4 border-teal-500 bg-teal-950/20 text-teal-100',
  NEUTRAL_EXCHANGE: 'border-l-4 border-slate-500 bg-slate-900/40 text-slate-200',
  DEFLECTION: 'border-l-4 border-amber-500 bg-amber-950/20 text-amber-100',
  HOSTILE_STONEWALL: 'border-l-4 border-rose-600 bg-rose-950/30 text-rose-100',
};

export const INTERACTION_TYPE_STYLES: Record<InteractionType, {
  badge: string;
  button: string;
  iconColor: string;
  description: string;
}> = {
  ASK: {
    badge: 'bg-sky-950 text-sky-300 border-sky-700',
    button: 'border-sky-500 bg-sky-950/60 text-sky-200 hover:bg-sky-900/80',
    iconColor: 'text-sky-400',
    description: 'Inquiry vs. Composure (Base: 0.50)',
  },
  INTERROGATE: {
    badge: 'bg-rose-950 text-rose-300 border-rose-700',
    button: 'border-rose-500 bg-rose-950/60 text-rose-200 hover:bg-rose-900/80',
    iconColor: 'text-rose-400',
    description: 'Coercion vs. Composure (Base: 0.45)',
  },
  NEGOTIATE: {
    badge: 'bg-emerald-950 text-emerald-300 border-emerald-700',
    button: 'border-emerald-500 bg-emerald-950/60 text-emerald-200 hover:bg-emerald-900/80',
    iconColor: 'text-emerald-400',
    description: 'Negotiation vs. Insight (Base: 0.55)',
  },
  DECEIVE: {
    badge: 'bg-purple-950 text-purple-300 border-purple-700',
    button: 'border-purple-500 bg-purple-950/60 text-purple-200 hover:bg-purple-900/80',
    iconColor: 'text-purple-400',
    description: 'Deception vs. Insight (Base: 0.45)',
  },
};

export const STANCE_BADGE_STYLES: Record<
  'COOPERATIVE' | 'NEUTRAL' | 'SUSPICIOUS' | 'HOSTILE',
  string
> = {
  COOPERATIVE: 'bg-emerald-950 text-emerald-300 border-emerald-700',
  NEUTRAL: 'bg-slate-800 text-slate-300 border-slate-700',
  SUSPICIOUS: 'bg-amber-950 text-amber-300 border-amber-700',
  HOSTILE: 'bg-rose-950 text-rose-300 border-rose-700',
};

export const CARD_TIER_STYLES: Record<CardTier, string> = {
  ATOMIC: 'border-slate-700 bg-slate-900/70 text-slate-300',
  COMPOSITE: 'border-purple-500/80 bg-purple-950/30 text-purple-200 shadow-purple-950/40 shadow-sm',
};
