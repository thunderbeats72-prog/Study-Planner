// ============================================================
//  STUDY PLANNER PRO — src/lib/ml.ts  (ML v2)
//  Lightweight on-device machine learning. No external services:
//  all inference is deterministic TypeScript, trained continuously
//  on the user's own logged history.
//
//  Models:
//   1. PACE (subject)  — per-subject EWMA pace multiplier.
//   2. PACE (cluster)  — per-topic-cluster pace: "Testing of
//      Hypothesis" units can be slow for you even when the rest
//      of Quantitative Methods is fast.
//   3. WEEKDAY         — per-weekday completion propensity that
//      shapes daily load.
//   4. FSRS-LITE       — spaced-repetition memory model. Each
//      review rating (Again/Hard/Good/Easy) updates a per-topic
//      stability; the next review lands when recall ≈ 90%.
//   5. DECAY           — Ebbinghaus mastery decay for topics with
//      no FSRS history yet.
//   6. SKIP RISK       — logistic estimate that a day's plan fails.
//   7. TIME OF DAY     — the user's historically best focus hours.
// ============================================================

export type TaskHistoryRow = {
  subjectId: number | null;
  topicId?: number | null;
  date: string;              // YYYY-MM-DD
  kind: string;
  status: string;            // done | skipped | pending
  plannedMinutes: number;
  actualMinutes: number;
};

// ── 1. Subject-level pace ────────────────────────────────────

export type PaceModel = {
  bySubject: Map<number, number>;
  global: number;
  samples: number;
};

const PACE_MIN = 0.6;
const PACE_MAX = 2.0;
const EWMA_ALPHA = 0.15;
const CONFIDENCE_N = 5;

/**
 * Per-subject pace multiplier (actual ÷ planned minutes), EWMA over
 * completed tasks in date order, outlier-filtered, shrunk toward the
 * global mean until a subject has ≥ CONFIDENCE_N observations.
 * pace > 1 → user needs more time than planned; < 1 → less.
 */
export function learnPace(history: TaskHistoryRow[]): PaceModel {
  const done = usablePaceRows(history);

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

  const bySubject = new Map<number, number>();
  for (const [sid, val] of ewma) {
    const n = counts.get(sid) || 0;
    const trust = Math.min(1, n / CONFIDENCE_N);
    bySubject.set(sid, clamp(round2(trust * val + (1 - trust) * globalEwma), PACE_MIN, PACE_MAX));
  }
  return { bySubject, global: clamp(round2(globalEwma), PACE_MIN, PACE_MAX), samples };
}

export function paceFor(model: PaceModel, subjectId: number): number {
  return model.bySubject.get(subjectId) ?? model.global;
}

// ── 2. Topic-cluster pace ────────────────────────────────────
//
// Clusters topics by their significant title tokens so evidence from
// "Testing of Hypothesis - Proportion" transfers to "Testing of
// Hypothesis using ANOVA". A cluster's multiplier only overrides the
// subject-level pace once it has ≥2 observations, and is blended in
// proportion to its sample count (shrinkage, same idea as subjects).

export type ClusterPaceModel = {
  byCluster: Map<string, { pace: number; n: number }>;
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "into", "from", "using", "unit", "part",
  "introduction", "overview", "basics", "basic", "advanced", "analysis",
  "single", "more", "than", "one", "two", "i", "ii", "iii",
]);

/**
 * Cluster key: the FIRST 2 significant title tokens (in order of
 * appearance), sorted for stability. Related units share their leading
 * stem — "Testing of Hypothesis - Proportion" and "Testing of
 * Hypothesis using ANOVA" both key to "hypothesis+testing" — while
 * the trailing qualifiers that differ between units are ignored.
 */
export function clusterKey(title: string): string {
  const tokens = title
    .toLowerCase()
    .replace(/^(recall|revise|apply|mastery cycle \d+)\s*[—:-]\s*/i, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));
  if (!tokens.length) return "";
  const unique = [...new Set(tokens)];
  return unique.slice(0, 2).sort().join("+");
}

export function learnClusterPace(
  history: TaskHistoryRow[],
  topicTitles: Map<number, string>
): ClusterPaceModel {
  const byCluster = new Map<string, { pace: number; n: number }>();
  for (const t of usablePaceRows(history)) {
    if (!t.topicId) continue;
    const title = topicTitles.get(t.topicId);
    if (!title) continue;
    const key = clusterKey(title);
    if (!key) continue;
    const ratio = clamp(t.actualMinutes / t.plannedMinutes, 0.33, 3);
    const cur = byCluster.get(key) || { pace: 1, n: 0 };
    // EWMA within the cluster, slightly faster alpha (clusters are small)
    cur.pace = cur.pace + 0.25 * (ratio - cur.pace);
    cur.n++;
    byCluster.set(key, cur);
  }
  for (const v of byCluster.values()) v.pace = clamp(round2(v.pace), PACE_MIN, PACE_MAX);
  return { byCluster };
}

/**
 * Final minutes multiplier for one topic: subject pace refined by its
 * cluster's evidence when available. Cluster trust ramps 0→1 across
 * its first 4 observations.
 */
export function topicPace(
  subjectPace: number,
  clusters: ClusterPaceModel,
  title: string
): number {
  const c = clusters.byCluster.get(clusterKey(title));
  if (!c || c.n < 2) return subjectPace;
  const trust = Math.min(1, c.n / 4);
  return clamp(round2(trust * c.pace + (1 - trust) * subjectPace), PACE_MIN, PACE_MAX);
}

// ── 3. Weekday completion propensity ─────────────────────────

export type WeekdayModel = { rates: number[]; samples: number };

/** Laplace-smoothed per-weekday completion rate (2/3 virtual prior). */
export function learnWeekdays(history: TaskHistoryRow[]): WeekdayModel {
  const doneCt = new Array(7).fill(2);
  const totalCt = new Array(7).fill(3);
  let samples = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const t of history) {
    if (t.date >= today) continue;
    if (t.kind === "buffer") continue;
    const dow = new Date(t.date + "T00:00:00").getDay();
    totalCt[dow]++;
    if (t.status === "done") doneCt[dow]++;
    samples++;
  }
  return { rates: doneCt.map((d, i) => round2(d / totalCt[i])), samples };
}

/** Daily capacity multiplier: weak days −25%, strong days +10%. */
export function weekdayLoadFactor(model: WeekdayModel, dateStr: string): number {
  if (model.samples < 14) return 1;
  const dow = new Date(dateStr + "T00:00:00").getDay();
  const mean = model.rates.reduce((a, b) => a + b, 0) / 7;
  const rel = model.rates[dow] / Math.max(0.05, mean);
  return clamp(0.75 + 0.35 * rel, 0.75, 1.1);
}

// ── 4. FSRS-LITE spaced repetition ───────────────────────────
//
// Stability S = days until recall probability decays to 90%.
// Review rating updates S; the next review is due after ⌈S⌉ days.
// Simplified from the FSRS family: one state variable per topic,
// difficulty proxied from the topic's Easy/Medium/Hard label.

export type ReviewRating = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy

const S_MIN = 0.5;
const S_MAX = 365;

function difficultyScore(difficulty: string): number {
  return difficulty === "Hard" ? 7 : difficulty === "Easy" ? 3 : 5;
}

/** Recall probability after `elapsedDays` given stability S. */
export function retrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return Math.exp((Math.log(0.9) * Math.max(0, elapsedDays)) / stability);
}

/** Initial stability after the FIRST rating of a topic. */
export function fsrsInit(rating: ReviewRating, difficulty: string): number {
  const base = rating === 1 ? 1 : rating === 2 ? 2 : rating === 3 ? 4 : 8;
  const d = difficultyScore(difficulty); // 3..7
  return clamp(round2(base * (1.25 - d / 20)), S_MIN, 16);
}

/**
 * Update stability after a review.
 * - Again → lapse: stability collapses to 35%.
 * - Otherwise stability grows; growth is larger when the review
 *   happened near the edge of forgetting (desirable difficulty),
 *   smaller for Hard, larger for Easy, damped for hard topics.
 */
export function fsrsReview(
  stability: number,
  difficulty: string,
  elapsedDays: number,
  rating: ReviewRating
): { stability: number; intervalDays: number } {
  const S = Math.max(S_MIN, stability || S_MIN);
  const d = difficultyScore(difficulty);
  let next: number;

  if (rating === 1) {
    next = Math.max(S_MIN, S * 0.35);
  } else {
    const R = retrievability(S, elapsedDays);
    const hardPenalty = rating === 2 ? 0.65 : 1;
    const easyBonus = rating === 4 ? 1.35 : 1;
    const gain = 1 + (2.2 - 0.12 * d) * (1.15 - R) * hardPenalty * easyBonus;
    next = S * Math.max(1.05, gain);
  }
  next = clamp(round2(next), S_MIN, S_MAX);
  return { stability: next, intervalDays: Math.max(1, Math.round(next)) };
}

/** Mastery adjustment for a rating (applied on top of task-done gain). */
export function masteryDelta(rating: ReviewRating): number {
  return rating === 1 ? -15 : rating === 2 ? 5 : rating === 3 ? 15 : 25;
}

export type FsrsTopicState = {
  topicId: number;
  stability: number;
  lastReview: string; // YYYY-MM-DD, "" = never reviewed
};

/**
 * Topics whose FSRS review is due within the horizon, most-overdue
 * first. `todayStr` is compared lexicographically (ISO dates).
 */
export function dueReviews(
  states: FsrsTopicState[],
  todayStr: string,
  horizonDays = 3
): { topicId: number; dueDate: string; overdueDays: number }[] {
  const out: { topicId: number; dueDate: string; overdueDays: number }[] = [];
  for (const s of states) {
    if (!s.lastReview || s.stability <= 0) continue;
    const due = addDaysIso(s.lastReview, Math.max(1, Math.round(s.stability)));
    const overdue = diffDaysIso(due, todayStr);
    if (overdue >= -horizonDays) {
      out.push({ topicId: s.topicId, dueDate: due, overdueDays: overdue });
    }
  }
  out.sort((a, b) => b.overdueDays - a.overdueDays);
  return out;
}

// ── 5. Mastery decay (fallback when no FSRS history) ─────────

export function decayedMastery(mastery: number, daysSinceTouch: number): number {
  if (mastery <= 0) return 0;
  if (daysSinceTouch <= 0) return mastery;
  const halfLifeDays = 7 + mastery / 8;
  return Math.round(mastery * Math.exp((-Math.LN2 * daysSinceTouch) / halfLifeDays));
}

// ── 6. Skip-risk (logistic, hand-tuned coefficients) ─────────

export type DayPlanFeatures = {
  dow: number;            // 0..6
  taskCount: number;
  totalMinutes: number;
  dailyBudgetMinutes: number;
  streak: number;
  recentCompletionRate: number; // 0..1 over last 14 days
};

/**
 * P(user fails to complete this day's plan). Logistic over intuitive,
 * bounded features; coefficients hand-tuned to behave sensibly at the
 * data volumes a single user produces. Replace with fitted weights
 * once ~200 labelled days exist.
 */
export function skipRisk(f: DayPlanFeatures): number {
  const overload = clamp(f.totalMinutes / Math.max(20, f.dailyBudgetMinutes), 0, 2.5);
  const z =
    -1.1 +
    1.6 * Math.max(0, overload - 1) +      // overbooked day
    0.25 * Math.max(0, f.taskCount - 4) +  // fragmentation
    (f.dow === 0 || f.dow === 6 ? 0.3 : 0) - // weekends riskier by default
    0.9 * f.recentCompletionRate -          // momentum protects
    0.05 * Math.min(14, f.streak);          // streak protects
  return round2(1 / (1 + Math.exp(-z)));
}

// ── 7. Time-of-day focus profile ─────────────────────────────

export type FocusProfile = {
  /** 24 buckets of logged focus minutes (recency-weighted). */
  byHour: number[];
  /** Best contiguous 2-hour window start (hour 0-23), or null. */
  peakHour: number | null;
  samples: number;
};

/** Half-life (days) for how quickly old study-hour habits stop counting. */
const FOCUS_RECENCY_HALF_LIFE = 30;

export function learnTimeOfDay(
  sessions: { createdAt: Date | string; minutes: number; mode: string }[],
  todayStrForAge?: string
): FocusProfile {
  const byHour = new Array(24).fill(0);
  let samples = 0;
  const now = todayStrForAge ? new Date(todayStrForAge + "T00:00:00").getTime() : Date.now();
  for (const s of sessions) {
    if (s.mode === "break" || s.minutes <= 0) continue;
    const dt = typeof s.createdAt === "string" ? new Date(s.createdAt) : s.createdAt;
    if (isNaN(dt.getTime())) continue;
    // Recent sessions shape the profile; last month's routine slowly fades
    // so the "peak focus" suggestion follows the learner's CURRENT habits.
    const ageDays = Math.max(0, (now - dt.getTime()) / 86400000);
    const weight = Math.pow(0.5, ageDays / FOCUS_RECENCY_HALF_LIFE);
    byHour[dt.getHours()] += s.minutes * weight;
    samples++;
  }
  let peakHour: number | null = null;
  if (samples >= 8) {
    let best = -1;
    for (let h = 0; h < 23; h++) {
      const w = byHour[h] + byHour[h + 1];
      if (w > best) { best = w; peakHour = h; }
    }
    if (best <= 0) peakHour = null;
  }
  return { byHour, peakHour, samples };
}

// ── shared helpers ───────────────────────────────────────────

function usablePaceRows(history: TaskHistoryRow[]): TaskHistoryRow[] {
  return history
    .filter(
      (t) =>
        t.status === "done" &&
        t.subjectId != null &&
        t.plannedMinutes >= 10 &&
        t.actualMinutes >= 5 &&
        t.actualMinutes <= t.plannedMinutes * 4
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function addDaysIso(s: string, n: number): string {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + n);
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const dd = `${dt.getDate()}`.padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}
function diffDaysIso(a: string, b: string): number {
  const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
  return Math.round(
    (new Date(pb[0], pb[1] - 1, pb[2]).getTime() - new Date(pa[0], pa[1] - 1, pa[2]).getTime()) / 86400000
  );
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}


// ── 8. Exam-readiness projection with uncertainty ─────────────
//
// Instead of a single "finishes Oct 5", project a P10/P50/P90 band
// from the user's OWN pace variance. Honest uncertainty builds trust:
// "Oct 1 - Oct 12, most likely Oct 5".

export type ReadinessProjection = {
  onTrack: boolean;
  /** 0-100: share of remaining days actually needed (100 = exactly on time). */
  loadPct: number;
  optimisticDays: number;   // P10
  likelyDays: number;       // P50
  pessimisticDays: number;  // P90
  samples: number;
  /** Minutes/day the projection is actually built on (learned, not assumed). */
  effectiveDailyMinutes: number;
};

/**
 * The daily minutes this learner ACTUALLY studies (not their stated daily
 * goal). Mean minutes per ACTIVE study day over the recent window — days
 * they never opened the app don't dilute the estimate, because scheduling
 * only ever gains capacity from days that happen at all.
 */
export function learnEffectiveDailyMinutes(
  sessions: { date: string; minutes: number; mode: string }[],
  todayStr: string,
  windowDays = 28
): { minutes: number; activeDays: number; samples: number } {
  const perDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.mode === "break" || s.minutes <= 0) continue;
    perDay.set(s.date, (perDay.get(s.date) || 0) + s.minutes);
  }
  const cutoff = addDaysIso(todayStr, -windowDays);
  const active: number[] = [];
  for (const [date, minutes] of perDay) {
    if (date < cutoff || date > todayStr) continue;
    if (minutes >= 5) active.push(minutes);
  }
  if (!active.length) return { minutes: 0, activeDays: 0, samples: sessions.length };
  active.sort((a, b) => a - b);
  // Trim the wildest 10% (both ends) so one 9-hour binge or a 5-minute
  // drive-by session can't swing the capacity estimate.
  const trim = Math.floor(active.length * 0.1);
  const core = active.slice(trim, active.length - trim || undefined);
  const mean = core.reduce((a, b) => a + b, 0) / (core.length || 1);
  return {
    minutes: Math.round(mean * 10) / 10,
    activeDays: active.length,
    samples: sessions.length,
  };
}

export function projectReadiness(
  history: TaskHistoryRow[],
  remainingPlannedMinutes: number,
  dailyBudgetMinutes: number,
  daysLeft: number,
  observed?: { minutes: number; activeDays: number }
): ReadinessProjection {
  const done = history.filter(
    (t) => t.status === "done" && t.plannedMinutes >= 10 && t.actualMinutes >= 5 &&
      t.actualMinutes <= t.plannedMinutes * 4
  );
  const ratios = done.map((t) => Math.min(3, Math.max(0.33, t.actualMinutes / t.plannedMinutes)));
  const n = ratios.length;
  const mean = n ? ratios.reduce((a, b) => a + b, 0) / n : 1;
  const sd = n > 3
    ? Math.sqrt(ratios.reduce((a, r) => a + (r - mean) * (r - mean), 0) / (n - 1))
    : 0.25; // prior spread until evidence exists
  // Capacity starts from the assumption (78% of the stated budget is real
  // study time) and shifts toward the learner's OBSERVED minutes as active
  // study days accumulate — a 2h/day planner who really manages 47 minutes
  // gets an honest projection built on 47, not on 120. Full trust after
  // ~10 active days of evidence.
  const assumed = Math.max(20, dailyBudgetMinutes) * 0.78;
  const trust = observed && observed.minutes > 0
    ? clamp(observed.activeDays / 10, 0.35, 1)
    : 0;
  const capacity = observed && observed.minutes > 0
    ? Math.max(20, trust * observed.minutes + (1 - trust) * assumed)
    : assumed;
  const days = (mul: number) =>
    Math.max(0, Math.ceil((remainingPlannedMinutes * mul) / capacity));
  const p10 = days(Math.max(0.5, mean - 1.282 * sd));
  const p50 = days(mean);
  const p90 = days(mean + 1.282 * sd);
  return {
    onTrack: p50 <= daysLeft,
    loadPct: daysLeft > 0 ? Math.round((p50 / daysLeft) * 100) : 999,
    optimisticDays: p10,
    likelyDays: p50,
    pessimisticDays: p90,
    samples: n,
    effectiveDailyMinutes: Math.round(capacity),
  };
}
