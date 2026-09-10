// ============================================================
//  STUDY PLANNER PRO — src/lib/completion.ts
//  Auto-completion rule for the study clock.
//
//  When the minutes actually logged for a task reach its planned
//  minutes, the task is COMPLETE — no manual "Done" tap required.
//  Example: a 15-minute recall studied for 28 minutes is done the
//  moment the 15th logged minute lands, the learner is notified,
//  and the clock rolls forward to the next pending task.
// ============================================================

export type CompletedTaskInfo = {
  id: number;
  title: string;
  plannedMinutes: number;
  actualMinutes: number;
};

/**
 * True when a task's logged minutes have met its planned time while it
 * is still pending. Done/skipped tasks are never re-marked, and a task
 * below its planned time is never auto-completed.
 */
export function shouldAutoComplete(actualMinutes: number, plannedMinutes: number, status: string): boolean {
  return status === "pending" && actualMinutes >= plannedMinutes;
}

export type PendingTaskLike = {
  id: number;
  date: string;
  status: string;
};

/**
 * The next pending task on `date`, in schedule order (the caller passes
 * tasks sorted by date + position, as the state loader returns them), or
 * null when nothing remains. `excludeId` skips the just-completed task so
 * the learner is offered what comes after it.
 */
export function nextPendingTask<T extends PendingTaskLike>(
  tasks: readonly T[],
  date: string,
  excludeId: number | null = null
): T | null {
  for (const task of tasks) {
    if (task.date === date && task.status === "pending" && task.id !== excludeId) return task;
  }
  return null;
}
