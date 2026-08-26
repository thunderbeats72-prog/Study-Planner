// ============================================================
//  STUDY PLANNER PRO — src/lib/planner.ts
//  Complete rewrite: fair-share time division + canonical
//  projected-finish date that is mathematically guaranteed to
//  match the last lesson in the generated schedule.
// ============================================================

export type PlanTopic = {
  id: number;
  subjectId: number;
  title: string;
  unit: string;
  estMinutes: number;
  difficulty: string;
  mastery?: number;
  practice?: string;
};

export type PlanSubject = {
  id: number;
  name: string;
  difficulty: string;
  color: string;
};

export type PlanSettings = {
  startDate: string;
  examDate: string;
  dailyHours: number;
  subjectsPerDay: number;
  studyDays: string;
  bufferDays: number;
  planMode: string;
  studyStyle: string;
  weakSubject: string;
  revisionWeeks: number;
};

export type PlanTask = {
  date: string;
  subjectId: number | null;
  topicId: number | null;
  kind: "learn" | "revise" | "practice" | "mock" | "buffer";
  title: string;
  detail: string;
  plannedMinutes: number;
  position: number;
};

// ── Date utilities ──────────────────────────────────────────

export function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parse(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

export function todayStr(): string {
  return fmt(new Date());
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

// ── Internal helpers ────────────────────────────────────────

function isStudyDay(dateStr: string, mode: string): boolean {
  const dow = parse(dateStr).getDay(); // 0 = Sun
  if (mode === "weekdays") return dow >= 1 && dow <= 5;
  if (mode === "6days") return dow !== 0;
  return true;
}

/** Inclusive number of usable study days in a date window. */
export function countStudyDays(start: string, end: string, mode: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || diffDays(start, end) < 0) return 0;
  let count = 0;
  let cursor = start;
  const span = Math.min(5000, diffDays(start, end));
  for (let day = 0; day <= span; day++) {
    if (isStudyDay(cursor, mode)) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function diffWeight(d: string): number {
  return d === "Hard" ? 1.3 : d === "Easy" ? 0.8 : 1;
}

// ── The one formula for "how many study days does the syllabus need?"
//
//   Total minutes of content
//   ─────────────────────────────────────────────── = days needed
//   Daily study hours × 60 × LEARN_CAPACITY_RATIO
//
// LEARN_CAPACITY_RATIO = 0.78 means 22% of each day is reserved for
// spaced-repetition recall tasks that are woven in automatically.
// This constant is the single source of truth used BOTH by the pre-plan
// Onboarding estimate AND the real scheduler below, so the two can never
// drift apart.

export const LEARN_CAPACITY_RATIO = 0.78;
export const MINUTES_PER_UNIT_ESTIMATE = 50; // used when topics don't exist yet

/** Minutes of net content for a set of topics (after style & mastery adjustment). */
function netMinutes(topics: PlanTopic[], styleMul: number): number {
  return topics.reduce(
    (a, t) => a + t.estMinutes * styleMul * (1 + (t.mastery ? -t.mastery / 200 : 0)),
    0
  );
}

/**
 * Walk forward from `start` counting only valid study-days until
 * `daysNeeded` of them have been counted. Returns that date.
 *
 * This is the CANONICAL projected-completion formula used everywhere
 * in the app (Onboarding estimate, Dashboard KPI, schedule generator).
 * Feed it the same inputs and you always get the same answer — the
 * two previously-desynced display figures now share this one function.
 */
export function projectCompletionDate(
  start: string,
  totalContentMinutes: number,
  dailyHours: number,
  studyDaysMode: string
): string {
  const dailyCap = Math.max(20, Math.round(dailyHours * 60));
  const usablePerDay = dailyCap * LEARN_CAPACITY_RATIO;
  const daysNeeded = Math.max(1, Math.ceil(totalContentMinutes / usablePerDay));

  let cursor = start;
  let counted = 0;
  let guard = 0;
  while (guard < 5000) {
    if (isStudyDay(cursor, studyDaysMode)) {
      counted++;
      if (counted >= daysNeeded) return cursor;
    }
    cursor = addDays(cursor, 1);
    guard++;
  }
  return cursor;
}

// ── Result type ─────────────────────────────────────────────

export type PlanResult = {
  tasks: PlanTask[];
  stats: {
    studyDays: number;
    learnDays: number;
    revisionDays: number;
    bufferDays: number;
    totalTopics: number;
    scheduledTopics: number;
    /** The canonical projected-finish date (same formula as Onboarding). */
    projectedFinish: string | null;
    /** The actual date the last "learn" task was placed on (should equal projectedFinish when feasible). */
    scheduleFinish: string | null;
    dailyMinutes: number;
    requiredMinutes: number;
    feasible: boolean;
    loadRatio: number;
  };
};

// ── Main scheduler ──────────────────────────────────────────

export type MlHooks = {
  /**
   * Per-date capacity multiplier learned from the user's weekday
   * completion history (e.g. 0.8 on days they historically under-deliver).
   */
  dayFactor?: (date: string) => number;
};

export function buildPlan(
  subjects: PlanSubject[],
  topics: PlanTopic[],
  st: PlanSettings,
  ml: MlHooks = {}
): PlanResult {
  const dayFactor = ml.dayFactor ?? (() => 1);
  // ── 1. Enumerate every valid study day in the window ──────

  const allStudyDates: string[] = [];
  {
    let cursor = st.startDate;
    let guard = 0;
    while (diffDays(cursor, st.examDate) >= 0 && guard < 3000) {
      if (isStudyDay(cursor, st.studyDays)) allStudyDates.push(cursor);
      cursor = addDays(cursor, 1);
      guard++;
    }
  }

  const emptyStats = {
    studyDays: 0, learnDays: 0, revisionDays: 0, bufferDays: 0,
    totalTopics: topics.length, scheduledTopics: 0,
    projectedFinish: null, scheduleFinish: null,
    dailyMinutes: Math.round(st.dailyHours * 60), requiredMinutes: 0,
    feasible: false, loadRatio: 0,
  };
  if (!allStudyDates.length || !subjects.length) return { tasks: [], stats: emptyStats };

  // ── 2. Partition days: learn | revision | buffer ──────────

  const dailyCap = Math.max(20, Math.round(st.dailyHours * 60));
  const bufferCount = Math.min(st.bufferDays, Math.floor(allStudyDates.length * 0.2));
  const revisionCount =
    st.planMode === "revision"
      ? 0
      : Math.min(
          st.revisionWeeks * 7,
          Math.floor((allStudyDates.length - bufferCount) * 0.3)
        );

  const learnDates = allStudyDates.slice(0, Math.max(1, allStudyDates.length - bufferCount - revisionCount));
  const revisionDates = allStudyDates.slice(learnDates.length, allStudyDates.length - bufferCount);
  const bufferDates = allStudyDates.slice(allStudyDates.length - bufferCount);

  // ── 3. Subject weights ─────────────────────────────────────

  const weakId = st.weakSubject && st.weakSubject !== "none" ? Number(st.weakSubject) : -1;
  const subjWeight = new Map<number, number>();
  for (const s of subjects) {
    subjWeight.set(s.id, diffWeight(s.difficulty) * (s.id === weakId ? 1.45 : 1));
  }

  // ── 4. Per-subject lesson queues ───────────────────────────

  const queues = new Map<number, PlanTopic[]>();
  for (const s of subjects) queues.set(s.id, []);
  for (const t of topics) {
    if (!queues.has(t.subjectId)) queues.set(t.subjectId, []);
    queues.get(t.subjectId)!.push(t);
  }

  // ── 5. Content math & canonical projected date ─────────────
  //
  // The style multiplier shrinks/grows topic minutes based on how the
  // learner wants to study (theory-heavy vs practice-heavy).

  const styleMul = st.studyStyle === "theory" ? 1.1 : st.studyStyle === "practice" ? 0.9 : 1;
  const requiredMinutes = netMinutes(topics, styleMul);

  // Canonical projected finish — same formula as Onboarding.tsx.
  const projectedFinish =
    topics.length > 0
      ? projectCompletionDate(st.startDate, requiredMinutes, st.dailyHours, st.studyDays)
      : null;

  // How many of our learnDates fall on/before the projected finish?
  // We pace lessons to fill exactly this many days so the schedule
  // converges on the projected date rather than drifting past it.
  const targetLearnDayCount = projectedFinish
    ? Math.max(
        1,
        learnDates.filter((d) => diffDays(d, projectedFinish) >= 0).length || learnDates.length
      )
    : learnDates.length;

  // Average ML day-factor across the learn window, so reduced-capacity
  // days (weekday propensity model) are priced into the load math and
  // lessons compress accordingly instead of falling off the schedule.
  const avgDayFactor =
    learnDates.length > 0
      ? learnDates.reduce((a, dt) => a + dayFactor(dt), 0) / learnDates.length
      : 1;

  const availableMinutes = targetLearnDayCount * dailyCap * LEARN_CAPACITY_RATIO * avgDayFactor;
  const loadRatio = availableMinutes > 0 ? requiredMinutes / availableMinutes : 99;

  // If we are overloaded, compress every lesson proportionally so all
  // lessons still appear — none get silently dropped.
  const compress = loadRatio > 1 ? Math.max(0.4, 1 / loadRatio) : 1;

  // ── 6. Daily learn budget ──────────────────────────────────
  //
  // Cap per-day new-lesson time so the syllabus spreads evenly across
  // the full target window rather than front-loading.  The "pacing"
  // value is the average content needed each day to finish on time.

  const pacingPerDay = targetLearnDayCount > 0
    ? Math.ceil(requiredMinutes / targetLearnDayCount)
    : dailyCap;

  const dailyLearnBudget = Math.max(
    25,
    Math.min(
      Math.round(dailyCap * LEARN_CAPACITY_RATIO),
      pacingPerDay + 10
    )
  );

  // ── 7. Spaced-repetition queue ─────────────────────────────

  const tasks: PlanTask[] = [];
  const reviewQueue = new Map<number, { topic: PlanTopic; pass: number }[]>();

  const pushReview = (dayIdx: number, topic: PlanTopic, pass: number) => {
    if (dayIdx >= learnDates.length) return;
    const arr = reviewQueue.get(dayIdx) || [];
    arr.push({ topic, pass });
    reviewQueue.set(dayIdx, arr);
  };

  const subjById = new Map(subjects.map((s) => [s.id, s]));
  let scheduledCount = 0;
  let lastLearnDate: string | null = null;
  /** Learn-day index each subject last appeared on (for staleness scoring). */
  const lastTouchedDay = new Map<number, number>();

  // ── 8. Learn-phase loop ────────────────────────────────────

  if (st.planMode !== "revision") {
    for (let d = 0; d < learnDates.length; d++) {
      const date = learnDates[d];
      // ML: shrink/grow the day's capacity based on the user's historical
      // completion propensity for this weekday (1.0 until enough history).
      let remaining = Math.round(dailyCap * dayFactor(date));
      let pos = 0;

      // ── 8a. Spaced-repetition recalls due today (up to 3) ──

      const queuedReviews = reviewQueue.get(d) || [];
      const due = queuedReviews.slice(0, 3);
      const deferred = queuedReviews.slice(3);
      for (let reviewIndex = 0; reviewIndex < due.length; reviewIndex++) {
        const review = due[reviewIndex];
        const mins = review.pass === 1 ? 15 : 20;
        if (remaining < mins + 20) {
          deferred.unshift(...due.slice(reviewIndex));
          break;
        }
        remaining -= mins;
        tasks.push({
          date, subjectId: review.topic.subjectId, topicId: review.topic.id, kind: "revise",
          title: `Recall: ${review.topic.title}`,
          detail:
            review.pass === 1
              ? "24–48h spaced recall. Close the book, write everything you remember, then check gaps."
              : "1-week spaced recall. Do 5 mixed questions from this lesson without notes.",
          plannedMinutes: mins, position: pos++,
        });
      }
      // Never silently discard the fourth review (or a review that did not
      // fit today). Carry it to the next learn day within the plan window.
      if (deferred.length && d + 1 < learnDates.length) {
        reviewQueue.set(d + 1, [...(reviewQueue.get(d + 1) || []), ...deferred]);
      }

      // ── 8b. Weekly checkpoint test ──────────────────────────

      const isTestDay = d > 3 && d % 7 === 6;
      if (isTestDay && remaining > 45) {
        const mins = st.planMode === "mock" ? 60 : 40;
        remaining -= mins;
        tasks.push({
          date, subjectId: null, topicId: null, kind: "mock",
          title: `Weekly Checkpoint Test #${Math.floor(d / 7)}`,
          detail:
            "Mixed test on everything covered in the last 7 study days. Time it strictly, then log every mistake in your error notebook.",
          plannedMinutes: mins, position: pos++,
        });
      }

      // ── 8c. NEW LESSONS — fair-share time division ─────────
      //
      // This is the fix for Bug A.
      //
      // Previous code: gave each subject a "slot" = its share of
      // the day's budget, but lessons could spill past the slot and
      // eat time meant for later subjects — so with 4 subjects on a
      // 2-hour day the first subject got most of the time and the last
      // ones got nothing.
      //
      // New code: each subject gets a slot = its PROPORTIONAL SHARE of
      // the day's learn budget, computed from its weight.  A lesson is
      // only placed if it FITS WITHIN BOTH the subject's remaining slot
      // AND the day's total remaining time.  This guarantees every
      // active subject gets its fair share regardless of how many
      // subjects share the day.

      const live = subjects.filter((s) => (queues.get(s.id) || []).length > 0);
      const pool = live.length ? live : [];
      if (!pool.length) continue;

      // ── DIFFICULTY-AWARE SUBJECT SELECTION (spaced frequency) ──
      //
      // Instead of a blind round-robin rotation, each subject is scored
      // every day and the top `subjectsPerDay` win the day's slots:
      //
      //   score = difficultyWeight            (Hard 1.3 > Medium 1 > Easy 0.8)
      //         × staleness                   (days since last studied — nothing
      //                                        is allowed to go cold)
      //         × backlogRatio                (subjects with more unfinished
      //                                        lessons get pulled forward)
      //
      // Effect: HARD subjects (e.g. Quantitative Methods, Financial
      // Accounting) resurface on a visibly tighter cycle — roughly every
      // 1–2 study days — while easier ones cycle every 2–3 days, yet the
      // staleness term guarantees no subject is ever starved. The chosen
      // subjects are then ordered hardest-first so the toughest material
      // lands at the start of the session, when focus is highest.

      const totalBySub = new Map<number, number>();
      for (const t of topics) totalBySub.set(t.subjectId, (totalBySub.get(t.subjectId) || 0) + 1);

      const scored = pool
        .map((s) => {
          const daysSince = d - (lastTouchedDay.get(s.id) ?? -1);
          const total = totalBySub.get(s.id) || 1;
          const remainingLessons = (queues.get(s.id) || []).length;
          const backlogRatio = 0.6 + 0.8 * (remainingLessons / total);
          // Staleness grows unbounded past day 5 (quadratically), so even a
          // low-weight subject eventually outranks everything and can never
          // be starved for weeks.
          const base = Math.max(1, daysSince);
          const staleness = base <= 5 ? base : 5 + (base - 5) * (base - 5) * 0.5;
          return { s, score: (subjWeight.get(s.id) || 1) * staleness * backlogRatio };
        })
        .sort((a, b) => b.score - a.score);

      const chosen = scored
        .slice(0, Math.max(1, Math.min(st.subjectsPerDay, scored.length)))
        .map((x) => x.s)
        // Hardest first within the day: peak focus → toughest material
        .sort((a, b) => (subjWeight.get(b.id) || 1) - (subjWeight.get(a.id) || 1));
      // NOTE: lastTouchedDay is updated only when a lesson is actually
      // placed (inside the loop below) — merely being "chosen" on a day
      // too full to fit a lesson must not reset a subject's staleness.

      const learnBudget = Math.max(15, remaining);
      const wsum = chosen.reduce((a, s) => a + (subjWeight.get(s.id) || 1), 0);

      const todaysTopics: PlanTopic[] = [];

      for (const s of chosen) {
        // This subject's proportional slice of today's learn budget
        const rawSlot = (learnBudget * (subjWeight.get(s.id) || 1)) / wsum;
        let slot = Math.max(15, Math.round(rawSlot / 5) * 5);

        const q = queues.get(s.id)!;
        let placedForSubject = 0;

        while (q.length && remaining >= 15 && (placedForSubject === 0 || slot >= 15)) {
          const t = q[0];
          // Compressed, rounded to 5-min boundary, floored at 15 min
          const rawMins = t.estMinutes * styleMul * compress;
          const baseMins = Math.max(15, Math.round(rawMins / 5) * 5);

          // Allocate minutes matching the subject's slot so the full daily study target is met
          let mins = baseMins;
          if (placedForSubject === 0) {
            if (slot >= baseMins + 15 && q.length > 1) {
              mins = baseMins;
            } else {
              mins = Math.min(remaining, Math.max(baseMins, slot));
              mins = Math.max(15, Math.round(mins / 5) * 5);
            }
          } else {
            mins = Math.min(remaining, Math.min(baseMins, slot));
            mins = Math.max(15, Math.round(mins / 5) * 5);
          }

          if (mins > remaining) {
            mins = Math.max(15, Math.floor(remaining / 5) * 5);
          }
          if (mins < 15 || mins > remaining) break;

          q.shift();
          slot -= mins;
          remaining -= mins;
          placedForSubject++;
          lastTouchedDay.set(s.id, d);
          scheduledCount++;
          lastLearnDate = date;
          todaysTopics.push(t);

          tasks.push({
            date, subjectId: s.id, topicId: t.id, kind: "learn",
            title: `${s.name}: ${t.title}`,
            detail: `${t.unit} • ${t.difficulty}. Learn the concept, then attempt practice questions before marking done.`,
            plannedMinutes: mins, position: pos++,
          });

          pushReview(d + 2, t, 1);
          // A second dedicated card is reserved for genuinely high-risk
          // material. Other topics are covered by weekly checkpoints and the
          // final revision block instead of generating redundant busywork.
          if (t.difficulty === "Hard" || t.subjectId === weakId) pushReview(d + 7, t, 2);
        }
      }

      // If remaining study time still exists (>= 20 min), place additional lessons if queues have work
      if (remaining >= 20) {
        const withPending = chosen.filter((s) => (queues.get(s.id) || []).length > 0);
        for (const s of withPending) {
          if (remaining < 20) break;
          const q = queues.get(s.id)!;
          if (!q.length) continue;
          const t = q[0];
          const rawMins = t.estMinutes * styleMul * compress;
          const baseMins = Math.max(15, Math.round(rawMins / 5) * 5);
          const mins = Math.min(remaining, baseMins);
          if (mins < 15 || mins > remaining) continue;
          q.shift();
          remaining -= mins;
          lastTouchedDay.set(s.id, d);
          scheduledCount++;
          lastLearnDate = date;
          todaysTopics.push(t);
          tasks.push({
            date, subjectId: s.id, topicId: t.id, kind: "learn",
            title: `${s.name}: ${t.title}`,
            detail: `${t.unit} • ${t.difficulty}. Learn the concept, then attempt practice questions before marking done.`,
            plannedMinutes: mins, position: pos++,
          });
          pushReview(d + 2, t, 1);
          if (t.difficulty === "Hard" || t.subjectId === weakId) pushReview(d + 7, t, 2);
        }
      }

      // ── 8d. Deliberate practice / application tasks to meet the daily study commitment ──
      if (remaining >= 15 && todaysTopics.length > 0) {
        const share = Math.max(15, Math.floor(remaining / Math.min(todaysTopics.length, 2) / 5) * 5);
        for (const topic of todaysTopics) {
          if (remaining < 15) break;
          const minutes = Math.min(remaining, share);
          remaining -= minutes;
          const subjectName = subjById.get(topic.subjectId)?.name || "Study";
          tasks.push({
            date,
            subjectId: topic.subjectId,
            topicId: topic.id,
            kind: "practice",
            title: `Apply — ${subjectName}: ${topic.title}`,
            detail: topic.practice || "Immediate transfer practice: 6–10 graded questions, followed by a short error-log entry for every hesitation.",
            plannedMinutes: minutes,
            position: pos++,
          });
        }
      }

      // Distribute any small remaining balance (5-10m) due to 5-min rounding across today's study tasks
      if (remaining > 0) {
        const dayTasks = tasks.filter((t) => t.date === date && (t.kind === "learn" || t.kind === "practice"));
        if (dayTasks.length > 0) {
          let r = remaining;
          let idx = 0;
          while (r >= 5) {
            dayTasks[idx % dayTasks.length].plannedMinutes += 5;
            r -= 5;
            idx++;
          }
          if (r > 0) dayTasks[0].plannedMinutes += r;
          remaining = 0;
        }
      }
    }

    // ── 8e. GUARANTEED SWEEP — no lesson is ever silently dropped ──
    //
    // Slot mechanics, spaced-review overhead and ML day-factors can leave
    // a handful of lessons unplaced at the end of the main loop. Rather
    // than dropping them (the old failure mode), spread each leftover
    // onto the currently least-loaded learn day. A mildly fuller day is
    // always better than a hole in the syllabus.

    const leftovers: { s: PlanSubject; t: PlanTopic }[] = [];
    for (const s of subjects) {
      const q = queues.get(s.id) || [];
      while (q.length) leftovers.push({ s, t: q.shift()! });
    }
    if (leftovers.length) {
      const usedByDate = new Map<string, number>();
      const posByDate = new Map<string, number>();
      for (const dt of learnDates) usedByDate.set(dt, 0);
      for (const tk of tasks) {
        if (usedByDate.has(tk.date)) {
          usedByDate.set(tk.date, (usedByDate.get(tk.date) || 0) + tk.plannedMinutes);
          posByDate.set(tk.date, Math.max(posByDate.get(tk.date) || 0, tk.position + 1));
        }
      }
      for (const { s, t } of leftovers) {
        let bestDate = learnDates[learnDates.length - 1];
        let bestUsed = Infinity;
        for (const dt of learnDates) {
          const u = usedByDate.get(dt) || 0;
          if (u < bestUsed) { bestUsed = u; bestDate = dt; }
        }
        const rawMins = t.estMinutes * styleMul * compress;
        const mins = Math.max(15, Math.round(rawMins / 5) * 5);
        const p = posByDate.get(bestDate) || 0;
        tasks.push({
          date: bestDate, subjectId: s.id, topicId: t.id, kind: "learn",
          title: `${s.name}: ${t.title}`,
          detail: `${t.unit} • ${t.difficulty}. Learn the concept, then attempt practice questions before marking done.`,
          plannedMinutes: mins, position: p,
        });
        posByDate.set(bestDate, p + 1);
        usedByDate.set(bestDate, bestUsed + mins);
        scheduledCount++;
        if (!lastLearnDate || bestDate > lastLearnDate) lastLearnDate = bestDate;
      }
    }
  }

  // ── 9. Revision block ──────────────────────────────────────

  const revisionPool = [...topics].sort((a, b) => {
    const w = diffWeight(b.difficulty) - diffWeight(a.difficulty);
    return w !== 0 ? w : (a.mastery || 0) - (b.mastery || 0);
  });
  const revDates =
    st.planMode === "revision"
      ? allStudyDates.slice(0, allStudyDates.length - bufferCount)
      : revisionDates;

  if (revDates.length && revisionPool.length) {
    const perDay = Math.max(1, Math.ceil(revisionPool.length / revDates.length));
    let idx = 0;
    for (let d = 0; d < revDates.length; d++) {
      const date = revDates[d];
      let remaining = dailyCap;
      let pos = 0;
      const isMockDay = st.planMode === "mock" ? d % 2 === 0 : d % 3 === 2;
      if (isMockDay) {
        const mins = Math.min(90, Math.round(dailyCap * 0.5));
        remaining -= mins;
        tasks.push({
          date, subjectId: null, topicId: null, kind: "mock",
          title: `Full-Length Mock Test #${Math.floor(d / 3) + 1}`,
          detail: "Exam-condition mock. Afterwards spend 20 minutes analysing every wrong answer.",
          plannedMinutes: mins, position: pos++,
        });
      }
      for (let k = 0; k < perDay && remaining > 15; k++) {
        const t = revisionPool[idx % revisionPool.length];
        idx++;
        const s = subjById.get(t.subjectId);
        const mins = Math.max(15, Math.min(remaining, Math.round((t.estMinutes * 0.45) / 5) * 5));
        remaining -= mins;
        tasks.push({
          date, subjectId: t.subjectId, topicId: t.id, kind: "revise",
          title: `Revise — ${s ? s.name + ": " : ""}${t.title}`,
          detail: "Active recall + previous-year questions. Aim for speed and accuracy, not re-reading.",
          plannedMinutes: mins, position: pos++,
        });
      }
      if (remaining > 0) {
        const dayRevTasks = tasks.filter((t) => t.date === date && t.kind === "revise");
        if (dayRevTasks.length > 0) {
          let r = remaining;
          let i = 0;
          while (r >= 5) {
            dayRevTasks[i % dayRevTasks.length].plannedMinutes += 5;
            r -= 5;
            i++;
          }
          if (r > 0) dayRevTasks[0].plannedMinutes += r;
        }
      }
    }
  }

  // ── 10. Buffer / taper days ────────────────────────────────

  bufferDates.forEach((date, i) => {
    const last = i === bufferDates.length - 1;
    tasks.push({
      date, subjectId: null, topicId: null, kind: "buffer",
      title: last ? "Light review & rest before exam" : `Buffer day ${i + 1} — catch-up & weak areas`,
      detail: last
        ? "No new material. Skim your recall sheets, sleep early, prepare documents."
        : "Use this slack to finish anything you skipped, or drill your weakest topic list.",
      plannedMinutes: Math.round(dailyCap * (last ? 0.4 : 0.7)),
      position: 0,
    });
  });

  // ── 11. Return result ──────────────────────────────────────

  return {
    tasks,
    stats: {
      studyDays: allStudyDates.length,
      learnDays: learnDates.length,
      revisionDays: revDates.length,
      bufferDays: bufferDates.length,
      totalTopics: topics.length,
      scheduledTopics: scheduledCount,
      projectedFinish,          // canonical formula (matches Onboarding)
      scheduleFinish: lastLearnDate, // where the last "learn" task landed
      dailyMinutes: dailyCap,
      requiredMinutes: Math.round(requiredMinutes),
      feasible: loadRatio <= 1.15,
      loadRatio: Math.round(loadRatio * 100) / 100,
    },
  };
}
