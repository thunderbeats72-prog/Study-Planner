// ============================================================
//  STUDY PLANNER PRO — src/lib/ml.ts
//  Lightweight on-device machine learning. No external services:
//  all inference is deterministic TypeScript running at replan
//  time, trained continuously on the user's own logged history.
//
//  Models:
//   1. PACE — per-subject exponentially-weighted pace multiplier
//      (actual vs planned minutes). Bayesian-style: starts at the
//      neutral prior 1.0 and shifts only as evidence accumulates.
//   2. COMPLETION — per-weekday completion propensity, used to
//      shape daily load (schedule lighter on historically weak days).
//   3. MASTERY DECAY — recency-weighted mastery estimate that decays
//      toward 0 the longer a topic goes untouched (Ebbinghaus-style),
//      feeding the revision prioritiser.
// ============================================================

export type TaskHistoryRow = {
  subjectId: number | null;
  date: string;              // YYYY-MM-DD
  kind: string;
  status: string;            // done | skipped | pending
  plannedMinutes: number;
  actualMinutes: number;
};

export type PaceModel = {
  /** Per-subject learned multiplier, clamped to [0.6, 2.0]. */
  bySubject: Map<number, number>;
  /** Global multiplier across all subjects (fallback for cold subjects). */
  global: number;
  /** Number of observations the model has seen (confidence proxy). */
  samples: number;
};

const PACE_MIN = 0.6;
const PACE_MAX = 2.0;
/** EWMA decay: each newer observation carries ~15% of the weight. */
const EWMA_ALPHA = 0.15;
/** Observations needed before a subject's own pace fully overrides the global. */
const CONFIDENCE_N = 5;

/**
 * Learn per-subject pace multipliers from completed task history.
 *
 * pace > 1  → user takes longer than planned (schedule MORE minutes)
 * pace < 1  → user is faster than planned  (schedule FEWER minutes)
 *
 * Uses an exponentially-weighted moving average over completed tasks in
 * chronological order, so recent behaviour dominates but a single outlier
 * session cannot swing the estimate. Each subject's multiplier is blended
 * with the global multiplier in proportion to its own sample count
 * (shrinkage toward the pooled mean — small-sample subjects trust the
 * global signal, well-observed subjects trust their own).
 */
export function learnPace(history: TaskHistoryRow[]): PaceModel {
  const done = history
    .filter(
      (t) =>
        t.status === "done" &&
        t.subjectId != null &&
        t.plannedMinutes >= 10 &&
        t.actualMinutes >= 5 &&
        // Ignore absurd ratios (left the clock running / logged nothing)
        t.actualMinutes <= t.plannedMinutes * 4
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const ewma = new Map<number, number>();
  const counts = new Map<number, number>();
  let globalEwma = 1;
  let samples = 0;

  for (const t of done) {
    const ratio = clamp(t.actualMinutes / t.plannedMinutes, 0.33, 3);
    const sid = t.subjectId as number;
    const prev = ewma.get(sid) ?? 1;
    ewma.set(sid, prev + EWMA_ALPHA * (ratio - prev));
    counts.set(sid, (counts.get(sid) || 0) + 1);
    globalEwma = globalEwma + EWMA_ALPHA * 0.6 * (ratio - globalEwma);
    samples++;
  }

  // Shrink each subject toward the global mean by confidence
  const bySubject = new Map<number, number>();
  for (const [sid, val] of ewma) {
    const n = counts.get(sid) || 0;
    const trust = Math.min(1, n / CONFIDENCE_N);
    const blended = trust * val + (1 - trust) * globalEwma;
    bySubject.set(sid, clamp(round2(blended), PACE_MIN, PACE_MAX));
  }

  return { bySubject, global: clamp(round2(globalEwma), PACE_MIN, PACE_MAX), samples };
}

/** Pace multiplier for a subject, falling back to the global estimate. */
export function paceFor(model: PaceModel, subjectId: number): number {
  return model.bySubject.get(subjectId) ?? model.global;
}

// ── 2. Weekday completion propensity ─────────────────────────

export type WeekdayModel = {
  /** Index 0 (Sun) … 6 (Sat) → completion rate in [0,1]. */
  rates: number[];
  samples: number;
};

/**
 * Per-weekday completion rate with Laplace smoothing (each weekday
 * starts with 2 virtual completions out of 3 virtual tasks, so early
 * data can't produce extreme 0%/100% rates).
 */
export function learnWeekdays(history: TaskHistoryRow[]): WeekdayModel {
  const doneCt = new Array(7).fill(2);
  const totalCt = new Array(7).fill(3);
  let samples = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const t of history) {
    if (t.date >= today) continue;             // future/today: not evidence yet
    if (t.kind === "buffer") continue;
    const dow = new Date(t.date + "T00:00:00").getDay();
    totalCt[dow]++;
    if (t.status === "done") doneCt[dow]++;
    samples++;
  }
  return { rates: doneCt.map((d, i) => round2(d / totalCt[i])), samples };
}

/**
 * Daily load multiplier from weekday propensity: historically weak days
 * get up to −25% load, strong days up to +10%. Returns 1.0 until there
 * is enough history to be meaningful.
 */
export function weekdayLoadFactor(model: WeekdayModel, dateStr: string): number {
  if (model.samples < 14) return 1;
  const dow = new Date(dateStr + "T00:00:00").getDay();
  const mean = model.rates.reduce((a, b) => a + b, 0) / 7;
  const rel = model.rates[dow] / Math.max(0.05, mean);
  return clamp(0.75 + 0.35 * rel, 0.75, 1.1);
}

// ── 3. Mastery decay (forgetting curve) ──────────────────────

/**
 * Ebbinghaus-style exponential decay of a topic's mastery score.
 * Half-life scales with mastery itself: well-learned topics decay
 * slower (stability grows with repetition).
 *
 * effective = mastery × exp(−days / halfLife),  halfLife = 7 + mastery/8 days
 */
export function decayedMastery(mastery: number, daysSinceTouch: number): number {
  if (mastery <= 0) return 0;
  if (daysSinceTouch <= 0) return mastery;
  const halfLifeDays = 7 + mastery / 8;
  return Math.round(mastery * Math.exp((-Math.LN2 * daysSinceTouch) / halfLifeDays));
}

// ── helpers ──────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
