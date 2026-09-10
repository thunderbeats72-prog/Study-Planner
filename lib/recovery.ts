// ============================================================
//  STUDY PLANNER PRO — src/lib/recovery.ts
//  Backlog maths: how much is unfinished, whether it fits today,
//  and how to redistribute it across coming days WITHOUT cramming
//  an unrealistic amount into one day.
//
//  Pure functions only — testable with plain task rows, reusable
//  by the Dashboard recovery panel and the AI tutor.
// ============================================================

import type { SettingsRow, TaskRow } from "./client";
// Pure planner helpers — this module runs server-side too (bulk moves),
// where the "use client" exports of client.ts cannot be called.
import { addDays, diffDays } from "./planner";

/** A gentle ceiling for extra minutes pushed on top of a full plan. */
export const GENTLE_EXTRA_PER_DAY = 30;

/** How far ahead the "spread across the week" recovery looks. */
export const RECOVERY_HORIZON_DAYS = 7;

export type BacklogItem = { task: TaskRow; daysLate: number };
export type BacklogSummary = { items: BacklogItem[]; minutes: number; count: number };

/** All still-pending tasks dated before `today`. Done/skipped work is
 *  never framed as "unfinished". */
export function backlogFor(tasks: readonly TaskRow[], today: string): BacklogSummary {
  const items = tasks
    .filter((task) => task.status === "pending" && task.date < today)
    .map((task) => ({ task, daysLate: Math.max(1, diffDays(task.date, today)) }))
    .sort((a, b) => a.task.date.localeCompare(b.task.date) || a.task.position - b.task.position || a.task.id - b.task.id);
  return {
    items,
    minutes: items.reduce((sum, item) => sum + item.task.plannedMinutes, 0),
    count: items.length,
  };
}

export type DaySummary = { minutes: number; count: number };

/** Planned minutes still pending on a given day (only pending work counts
 *  toward "what remains"). */
export function pendingOnDate(tasks: readonly TaskRow[], date: string): DaySummary {
  const list = tasks.filter((task) => task.date === date && task.status === "pending");
  return { minutes: list.reduce((sum, task) => sum + task.plannedMinutes, 0), count: list.length };
}

/** The learner's real daily capacity, from their settings. */
export function dailyCapacityMinutes(settings: Pick<SettingsRow, "dailyHours">): number {
  return Math.max(30, Math.round(settings.dailyHours * 60));
}

/** Minutes by which "everything due through today" exceeds daily capacity.
 *  0 means today's plan + backlog fits the learner's daily target. */
export function todayOverload(
  tasks: readonly TaskRow[],
  today: string,
  capacityMinutes: number
): number {
  const todayPlan = pendingOnDate(tasks, today).minutes;
  const backlog = backlogFor(tasks, today).minutes;
  return Math.max(0, todayPlan + backlog - capacityMinutes);
}

export function canFitToday(tasks: readonly TaskRow[], today: string, capacityMinutes: number): boolean {
  return todayOverload(tasks, today, capacityMinutes) === 0;
}

export type RecoveryPace = { minutesPerDay: number; days: number };

/**
 * Sustainable catch-up pace for an overload: never more than
 * GENTLE_EXTRA_PER_DAY extra minutes per day, spread across as many days
 * as needed (bounded by how many days remain). Returns null when there
 * is nothing to recover.
 */
export function suggestedRecovery(overloadMinutes: number, daysAvailable: number): RecoveryPace | null {
  if (overloadMinutes <= 0 || daysAvailable < 1) return null;
  const days = Math.max(1, Math.min(Math.max(1, Math.floor(daysAvailable)), Math.ceil(overloadMinutes / GENTLE_EXTRA_PER_DAY)));
  return { minutesPerDay: Math.min(GENTLE_EXTRA_PER_DAY, overloadMinutes), days };
}

export type MoveAssignment = { id: number; date: string };
export type SpreadResult = {
  assignments: MoveAssignment[];
  daysUsed: number;
  /** The heaviest projected day after the spread (minutes). */
  heaviestDayMinutes: number;
};

/**
 * Distributes overdue tasks across the coming days so that no day exceeds
 * the daily capacity wherever possible. Deterministic: the oldest task is
 * placed first, each task goes to the earliest day that can hold it; if no
 * day can, it lands on the lightest day (a task is never silently dropped).
 */
export function spreadAcrossDays(
  tasks: readonly TaskRow[],
  today: string,
  capacityMinutes: number,
  options: { horizonDays?: number; lastDate?: string } = {}
): SpreadResult {
  const backlog = backlogFor(tasks, today);
  if (!backlog.items.length) return { assignments: [], daysUsed: 0, heaviestDayMinutes: 0 };

  const horizon = Math.max(1, Math.floor(options.horizonDays ?? RECOVERY_HORIZON_DAYS));
  const horizonDates: string[] = [];
  for (let i = 1; i <= horizon; i++) {
    const date = addDays(today, i);
    if (options.lastDate && date > options.lastDate) break;
    horizonDates.push(date);
  }
  if (!horizonDates.length) horizonDates.push(addDays(today, 1));

  // Existing pending load per horizon day counts against capacity, so a
  // heavy tomorrow doesn't silently become an overloaded tomorrow.
  const load = new Map<string, number>();
  for (const date of horizonDates) load.set(date, pendingOnDate(tasks, date).minutes);

  const assignments: MoveAssignment[] = [];
  for (const item of backlog.items) {
    let target = "";
    for (const date of horizonDates) {
      if ((load.get(date) || 0) + item.task.plannedMinutes <= capacityMinutes) {
        target = date;
        break;
      }
    }
    if (!target) {
      // Everything is full: put it on the lightest day rather than losing it.
      let lightest = horizonDates[0];
      for (const date of horizonDates) {
        if ((load.get(date) || 0) < (load.get(lightest) || 0)) lightest = date;
      }
      target = lightest;
    }
    load.set(target, (load.get(target) || 0) + item.task.plannedMinutes);
    assignments.push({ id: item.task.id, date: target });
  }

  const daysUsed = new Set(assignments.map((assignment) => assignment.date)).size;
  const heaviestDayMinutes = Math.max(...[...load.values()]);
  return { assignments, daysUsed, heaviestDayMinutes };
}

/** Move-assignments that place every backlog item on one given date. */
export function backlogToDate(tasks: readonly TaskRow[], today: string, date: string): MoveAssignment[] {
  return backlogFor(tasks, today).items.map((item) => ({ id: item.task.id, date }));
}
