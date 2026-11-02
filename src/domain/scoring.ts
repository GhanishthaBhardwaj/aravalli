import type { Severity } from './types';

/** Mirrors risk_assessment.risk_score = likelihood * impact. */
export const computeScore = (likelihood: number, impact: number): number => likelihood * impact;

/** Bands: Low 1–4, Medium 5–9, High 10–16, Critical 20–25. (17–19 cannot occur from 1–5 × 1–5.) */
export function bandFor(score: number): Severity {
  if (score >= 20) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 5) return 'Medium';
  return 'Low';
}

export const LIKELIHOOD_LABELS = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
export const IMPACT_LABELS = ['Minor', 'Moderate', 'Significant', 'Major', 'Severe'];

export const SEVERITY_ORDER: Record<Severity, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };
