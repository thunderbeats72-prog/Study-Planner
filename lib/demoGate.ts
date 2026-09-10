/**
 * THE ONE ANSWER to "is this a database-less preview?"
 * ───────────────────────────────────────────────────
 * `demoDataEnabled()` used to live in demoState.ts and read
 * `SPP_DEMO_DATA === "1"` — and every route that needed it either imported it
 * or re-inlined the same comparison (onboard did). The problem was not the
 * duplication, it was the default: with the flag unset the app served a
 * *static* fallback plan for reads while every write route fell through to the
 * database and returned 503. So in a sandbox with no PostgreSQL the planner
 * looked alive and did nothing — the study clock could not log a session, a
 * task could not be marked done, settings could not be saved, analytics could
 * not load. The UI was not broken; the write half of it was unreachable.
 *
 * This module has no imports on purpose so both `state.ts` and `demoState.ts`
 * can depend on it without creating a cycle.
 */

export function demoDataEnabled(): boolean {
  const flag = process.env.SPP_DEMO_DATA;
  if (flag === "1") return true;
  // An explicit "0" wins over the inference below: a real deployment that
  // happens to be booting without DATABASE_URL must never serve sample data
  // to real learners.
  if (flag === "0") return false;
  // No database and not a production build: this is a preview or a dev
  // machine, and a visitor should be able to exercise the real flows instead
  // of meeting a wall of 503s. Production still needs either a database or an
  // explicit SPP_DEMO_DATA=1.
  return !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";
}
