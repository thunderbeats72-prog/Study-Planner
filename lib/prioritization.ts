// ============================================================
//  STUDY PLANNER PRO — src/lib/prioritization.ts
//  One deterministic "what should I do now?" decision, shared by
//  the Dashboard hero, the AI tutor's live plan context, the
//  command palette, and future notification surfaces.
//
//  The learner never sees a score — only a label:
//      "Start here" · "Continue with this" · "Best next step"
//
//  Ordering is fully deterministic: score (desc), then date (asc),
//  then schedule position (asc), then task id (asc). The same
//  input always produces the same order, which keeps re-renders
//  stable and makes the ranking testable.
// ============================================================

import type { TaskRow } from "./client";
// Date helpers come from the pure planner module, NOT client.ts: this file
// runs inside server routes too (state.buildContext), where the "use client"
// module's runtime exports are off-limits.
import { addDays, diffDays } from "./planner";


export type PriorityReason =
  | "overdue"
  | "revision"
  | "due-today"
  | "due-soon"
  | "weak-subject"
  | "upcoming"
  | "later";

export type PrioritizedTask = TaskRow & {
  /** Internal ranking weight — never shown to the learner. */
  score: number;
  /** The dominant factor behind the rank. */
  reason: PriorityReason;
  /** Friendly label shown on the Dashboard hero ("Start here"). */
  priorityLabel: string;
  /** 0-based position in the ranked list. */
  rank: number;
};

export type PrioritizeOptions = {
  /** Subjects with the lowest syllabus completion; their tasks get a boost. */
  weakSubjectIds?: number[];
  /** Optional per-subject importance (the scheduler's subject weight). */
  subjectWeights?: Record<number, number>;
  /** Planned minutes still free today; tasks that fit get a small boost. */
  remainingTodayMinutes?: number | null;
};

/** Short human phrase for each reason — used by the Dashboard and the AI. */
export function reasonLabel(reason: PriorityReason): string {
  switch (reason) {
    case "overdue": return "Overdue — catch up";
    case "revision": return "Revision due";
    case "due-today": return "Due today";
    case "due-soon": return "Due soon";
    case "weak-subject": return "Weak subject focus";
    case "upcoming": return "Upcoming";
    case "later": return "Planned";
  }
}

const KIND_BOOST: Record<string, number> = {
  revise: 110,   // Revision due → high (spaced recall is time-sensitive)
  learn: 60,     // New lesson in the plan
  practice: 45,
  mock: 40,
  buffer: 0,     // Catch-up slots never outrank real work
};

/** Scores one pending task. Done/skipped tasks must be filtered by callers
 *  (this function is exported so tests can pin the maths). */
export function scoreTask(
  task: TaskRow,
  today: string,
  options: Pick<PrioritizeOptions, "weakSubjectIds" | "subjectWeights" | "remainingTodayMinutes"> = {}
): { score: number; reason: PriorityReason } {
  const daysAhead = diffDays(today, task.date); // negative = overdue
  let score: number;
  let reason: PriorityReason;

  if (daysAhead < 0) {
    // Older overdue work edges out fresher overdue work, gently.
    score = 1000 + Math.min(-daysAhead * 10, 90);
    reason = "overdue";
  } else if (daysAhead === 0) {
    score = 800;
    reason = "due-today";
  } else if (daysAhead === 1) {
    score = 550;
    reason = "due-soon";
  } else if (daysAhead <= 3) {
    score = 400;
    reason = "due-soon";
  } else if (daysAhead <= 7) {
    score = 300;
    reason = "upcoming";
  } else {
    // Long-term tasks sink as the date recedes, but stay above zero.
    score = Math.max(50, 260 - daysAhead);
    reason = "later";
  }

  // Revision/review work is time-sensitive; let it say so.
  if (task.kind === "revise" && reason !== "overdue") {
    score += KIND_BOOST.revise;
    reason = "revision";
  } else {
    score += KIND_BOOST[task.kind] ?? 0;
  }

  const weak = options.weakSubjectIds?.includes(task.subjectId as number) ?? false;
  if (weak && reason !== "overdue" && reason !== "due-today") {
    score += 80;
    // Only surface the label when the date itself is not the story.
    if (reason === "upcoming" || reason === "later") reason = "weak-subject";
  }

  const weight = task.subjectId != null ? options.subjectWeights?.[task.subjectId] ?? 1 : 1;
  score += Math.min(24, Math.max(0, weight - 1) * 6);

  // Earlier slots in the day's plan carry a small preference.
  score += Math.max(0, 24 - task.position);

  // Tasks that fit the time still available today are easier to start;
  // shorter tasks are slightly preferred among near-equals (quick win).
  if (typeof options.remainingTodayMinutes === "number" && options.remainingTodayMinutes >= 0) {
    score += task.plannedMinutes <= options.remainingTodayMinutes ? 10 : 0;
  }
  score += Math.max(0, 10 - task.plannedMinutes / 15);

  // A task already underway should feel like "continue", not "start".
  if (task.actualMinutes > 0) score += 6;

  return { score, reason };
}

/**
 * Ranks every PENDING task into a deterministic priority order.
 * Completed and skipped tasks are excluded — the plan only asks about
 * work that still needs doing.
 */
export function prioritizeTasks(
  tasks: readonly TaskRow[],
  today: string,
  options: PrioritizeOptions = {}
): PrioritizedTask[] {
  const pending = tasks.filter((task) => task.status === "pending");
  const ranked = pending
    .map((task) => {
      const { score, reason } = scoreTask(task, today, options);
      return { task, score, reason };
    })
    .sort((a, b) =>
      b.score - a.score
      || a.task.date.localeCompare(b.task.date)
      || a.task.position - b.task.position
      || a.task.id - b.task.id
    );

  return ranked.map(({ task, score, reason }, rank) => ({
    ...task,
    score,
    reason,
    rank,
    priorityLabel:
      rank === 0
        ? task.actualMinutes > 0 ? "Continue with this" : "Start here"
        : rank === 1
          ? "Best next step"
          : "Then",
  }));
}

export type NextAction = {
  /** The task to do right now. */
  now: PrioritizedTask | null;
  /** What comes after it. */
  next: PrioritizedTask | null;
  /** Everything else, in order. */
  remaining: PrioritizedTask[];
};

/** The single "NOW / NEXT" pair the Dashboard hero and AI both need. */
export function nextAction(
  tasks: readonly TaskRow[],
  today: string,
  options: PrioritizeOptions = {}
): NextAction {
  const ranked = prioritizeTasks(tasks, today, options);
  return { now: ranked[0] || null, next: ranked[1] || null, remaining: ranked.slice(2) };
}

/**
 * Subjects tied at the lowest syllabus completion (done/total). The learner's
 * weakest subjects — used to boost their tasks in the ranking.
 */
export function weakestSubjectIds(
  subjects: readonly { id: number; done: number; total: number }[]
): number[] {
  const withTopics = subjects.filter((subject) => subject.total > 0);
  if (!withTopics.length) return [];
  const worst = Math.min(...withTopics.map((subject) => subject.done / subject.total));
  return withTopics
    .filter((subject) => subject.done / subject.total === worst)
    .map((subject) => subject.id);
}

/** Next N days after `today` (inclusive of tomorrow, exclusive of nothing). */
export function daysFrom(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i + 1));
}
