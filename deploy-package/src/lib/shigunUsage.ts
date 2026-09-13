import { db } from "@/db";
import { shigunUsage } from "@/db/schema";
import { eq } from "drizzle-orm";
import { demoDataEnabled } from "./demoGate";
import { todayStr } from "./planner";

/** One "credit" is one tutor question answered. A learner on the free or
 *  BYOK path gets this many per day before the cloud layer politely steps
 *  aside and the on-device engine answers instead. Generous on purpose —
 *  it exists to surface a visible meter + reset, not to ration tutoring. */
export const SHIGUN_DAILY_LIMIT = 100;

export type ShigunUsageState = {
  used: number;
  limit: number;
  /** Date (YYYY-MM-DD) the current period started. */
  periodStart: string;
  remaining: number;
  exhausted: boolean;
  /** Fraction 0..1 of the allowance consumed, for a progress bar. */
  fraction: number;
};

/* ── Preview without a database ──────────────────────────────────────────
   Same fallback discipline as lib/state.ts: with SPP_DEMO_DATA (or a dev
   machine with no DATABASE_URL) the counter lives in memory keyed by userId,
   so the Settings card and reset button stay fully exercisable. */
const demoBuckets = new Map<number, { periodStart: string; used: number }>();

function shape(row: { periodStart: string; used: number; limit?: number | null }): ShigunUsageState {
  const limit = row.limit ?? SHIGUN_DAILY_LIMIT;
  const used = Math.max(0, row.used);
  return {
    used,
    limit,
    periodStart: row.periodStart,
    remaining: Math.max(0, limit - used),
    exhausted: used >= limit,
    fraction: limit > 0 ? Math.min(1, used / limit) : 1,
  };
}

export async function getShigunUsage(userId: number): Promise<ShigunUsageState> {
  const today = todayStr();
  try {
    let row = (await db.select().from(shigunUsage).where(eq(shigunUsage.userId, userId)).limit(1))[0];
    if (!row) {
      const inserted = await db
        .insert(shigunUsage)
        .values({ userId, periodStart: today })
        .onConflictDoNothing({ target: shigunUsage.userId })
        .returning();
      row = inserted[0] || (await db.select().from(shigunUsage).where(eq(shigunUsage.userId, userId)).limit(1))[0];
      if (!row) throw new Error("Could not initialise Shigun usage.");
    }
    // Daily rollover: a stale period means a fresh day starts at zero.
    if (row.periodStart !== today) {
      const updated = await db
        .update(shigunUsage)
        .set({ periodStart: today, used: 0 })
        .where(eq(shigunUsage.userId, userId))
        .returning();
      row = updated[0] || row;
    }
    return shape(row);
  } catch (error) {
    if (demoDataEnabled()) {
      const rec = demoBuckets.get(userId) || { periodStart: today, used: 0 };
      if (rec.periodStart !== today) {
        rec.periodStart = today;
        rec.used = 0;
      }
      demoBuckets.set(userId, rec);
      return shape(rec);
    }
    throw error;
  }
}

export async function recordShigunUse(userId: number): Promise<ShigunUsageState> {
  const today = todayStr();
  try {
    const current = await getShigunUsage(userId);
    const used = current.used + 1;
    const updated = await db
      .update(shigunUsage)
      .set({ used, updatedAt: new Date() })
      .where(eq(shigunUsage.userId, userId))
      .returning();
    return shape(updated[0] || { periodStart: today, used, limit: current.limit });
  } catch (error) {
    if (demoDataEnabled()) {
      const rec = demoBuckets.get(userId) || { periodStart: today, used: 0 };
      if (rec.periodStart !== today) {
        rec.periodStart = today;
        rec.used = 0;
      }
      rec.used += 1;
      demoBuckets.set(userId, rec);
      return shape(rec);
    }
    throw error;
  }
}

/** Refill the day's allowance: start a fresh period at zero. */
export async function resetShigunUsage(userId: number): Promise<ShigunUsageState> {
  const today = todayStr();
  try {
    await db
      .update(shigunUsage)
      .set({ periodStart: today, used: 0, updatedAt: new Date() })
      .where(eq(shigunUsage.userId, userId));
    return getShigunUsage(userId);
  } catch (error) {
    if (demoDataEnabled()) {
      demoBuckets.set(userId, { periodStart: today, used: 0 });
      return shape(demoBuckets.get(userId)!);
    }
    throw error;
  }
}
