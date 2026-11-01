import {
  BeatOutcomeTier,
  CardTier,
  InteractionType,
  SecrecyLevel,
} from '../../types/simulation';

export const SECRECY_BADGE_STYLES: Record<SecrecyLevel, string> = {
  PUBLIC: 'badge',
  LOW: 'badge success',
  MEDIUM: 'badge warning',
  HIGH: 'badge secondary',
  CRITICAL: 'badge danger font-bold',
};

export const BEAT_OUTCOME_STYLES: Record<BeatOutcomeTier, string> = {
  CRITICAL_REVEAL: 'border-l-4 border-emerald-600 bg-emerald-50 text-emerald-900',
  PARTIAL_CONCESSION: 'border-l-4 border-teal-600 bg-teal-50 text-teal-900',
  NEUTRAL_EXCHANGE: 'border-l-4 border-slate-600 bg-slate-50 text-slate-900',
  DEFLECTION: 'border-l-4 border-amber-600 bg-amber-50 text-amber-900',
  HOSTILE_STONEWALL: 'border-l-4 border-rose-600 bg-rose-50 text-rose-900',
};

export const INTERACTION_TYPE_STYLES: Record<InteractionType, {
  badge: string;
  button: string;
  iconColor: string;
  description: string;
}> = {
  ASK: {
    badge: 'badge secondary',
    button: 'paper-btn btn-secondary btn-small',
    iconColor: 'text-sky-600',
    description: 'Ask (Inquiry)',
  },
  INTERROGATE: {
    badge: 'badge danger',
    button: 'paper-btn btn-danger btn-small',
    iconColor: 'text-rose-600',
    description: 'Interrogate (Pressure)',
  },
  NEGOTIATE: {
    badge: 'badge success',
    button: 'paper-btn btn-success btn-small',
    iconColor: 'text-emerald-600',
    description: 'Negotiate (Deal)',
  },
  DECEIVE: {
    badge: 'badge warning',
    button: 'paper-btn btn-warning btn-small',
    iconColor: 'text-amber-600',
    description: 'Deceive (Bluff)',
  },
};

export const STANCE_BADGE_STYLES: Record<
  'COOPERATIVE' | 'NEUTRAL' | 'SUSPICIOUS' | 'HOSTILE',
  string
> = {
  COOPERATIVE: 'badge success',
  NEUTRAL: 'badge',
  SUSPICIOUS: 'badge warning',
  HOSTILE: 'badge danger',
};

export const CARD_TIER_STYLES: Record<CardTier, string> = {
  ATOMIC: 'border border-2 border-primary bg-white text-primary',
  COMPOSITE: 'border border-2 border-secondary bg-sky-50 text-secondary',
};
