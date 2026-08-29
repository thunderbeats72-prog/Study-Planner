/**
 * Study-time presentation helpers — the ONE source of truth for how a
 * task's accumulated study minutes are aggregated and worded.
 *
 * The number is always derived from real saved session rows (never from
 * local estimates), so it survives navigation and refreshes: whatever the
 * server has persisted is exactly what the label shows. Planner and
 * Dashboard render the same ` taskStudiedSuffix` so the design stays
 * consistent across views.
 */

type SessionLike = { taskId: number | null; minutes: number };

/** Minutes actually studied for one task, summed across every saved session.
 *  Rounded to hundredths to keep float noise (0.1 + 0.2) out of the UI. */
export function taskSessionMinutes(sessions: readonly SessionLike[], taskId: number): number {
  const sum = sessions.reduce(
    (total, session) => (session.taskId === taskId ? total + (session.minutes || 0) : total),
    0,
  );
  return Math.round(sum * 100) / 100;
}

/** 13.5 → "13.5m", 14 → "14m" — never rounded to a different number. */
export function formatMinutesShort(minutes: number): string {
  const r = Math.round(minutes * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}m`;
}

/** Learner-facing wording: "13.5m studied". Empty string when nothing yet. */
export function formatStudied(minutes: number): string {
  if (!minutes || minutes <= 0) return "";
  return `${formatMinutesShort(minutes)} studied`;
}

/**
 * The metadata-line suffix for a task row:
 *   "60 min · Unit 1 · Medium · 13.5m studied"
 * Falls back to the task's persisted `actualMinutes` (server-derived from
 * session totals) so a legacy row still shows its recorded effort even if
 * the 400-row session window has rotated it out.
 */
export function taskStudiedSuffix(
  sessions: readonly SessionLike[],
  task: { id: number; actualMinutes?: number },
): string {
  const label = formatStudied(taskSessionMinutes(sessions, task.id));
  if (label) return label;
  const legacy = task.actualMinutes || 0;
  return legacy > 0 ? formatStudied(legacy) : "";
}
