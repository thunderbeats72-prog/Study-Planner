import type { SessionRow } from "./client";

/**
 * The study-time read model used by every view.
 *
 * `tasks.actualMinutes` is a convenient denormalized field for the server,
 * but completed sessions are the authoritative ledger. Keeping these helpers
 * in one place prevents the dashboard, planner and analytics pages from
 * rounding or subtracting time differently.
 */
export function loggedMinutesForTask(
  sessions: Pick<SessionRow, "taskId" | "minutes">[],
  taskId: number,
): number {
  return Math.max(
    0,
    sessions
      .filter((session) => session.taskId === taskId)
      .reduce((total, session) => total + Math.max(0, Number(session.minutes) || 0), 0),
  );
}

export function loggedMinutesForDate(
  sessions: Pick<SessionRow, "date" | "minutes">[],
  date: string,
): number {
  return Math.max(
    0,
    sessions
      .filter((session) => session.date === date)
      .reduce((total, session) => total + Math.max(0, Number(session.minutes) || 0), 0),
  );
}

/** Remaining time can never be negative, even when a learner studies past plan. */
export function remainingMinutes(plannedMinutes: number, actualMinutes: number): number {
  return Math.max(0, (Number(plannedMinutes) || 0) - Math.max(0, Number(actualMinutes) || 0));
}

export function roundMinutes(minutes: number, decimals = 1): number {
  const scale = 10 ** Math.max(0, decimals);
  return Math.round(Math.max(0, minutes) * scale) / scale;
}

export function formatMinutes(minutes: number): string {
  const rounded = roundMinutes(minutes, 1);
  return Number.isInteger(rounded) ? `${rounded}m` : `${rounded.toFixed(1)}m`;
}

/** A compact but unambiguous hours/minutes readout, e.g. `1h 05m`. */
export function formatHoursMinutes(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function minutesToSeconds(minutes: number): number {
  return Math.max(0, Math.round((Number(minutes) || 0) * 60));
}
