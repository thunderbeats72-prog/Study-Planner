import { db, pool } from "@/db";
import { shigunUsage } from "@/db/schema";
import { eq } from "drizzle-orm";
import { todayStr } from "./planner";

/** One "credit" is one tutor question answered by the cloud AI layer.
 *
 *  THE METER IS INFORMATIONAL ONLY. It exists so the learner can SEE their
 *  AI usage ("x% of today's credits used"); it never blocks, throttles or
 *  degrades tutoring. Cloud answers keep flowing past the limit — the bar
 *  simply fills up and rolls over at zero the next day. Plan, syllabus and
 *  timer answers never touch it. */
export const SHIGUN_DAILY_LIMIT = 100;

export type ShigunUsageState = {
  used: number;
  limit: number;
  /** Date (YYYY-MM-DD) the current period started. */
  periodStart: string;
  remaining: number;
  /** Kept for API compatibility; never used to gate cloud answers. */
  exhausted: boolean;
  /** Fraction 0..1 of the allowance consumed, for a progress bar. */
  fraction: number;
};

/* ── Graceful degradation ──────────────────────────────────────────────
   The credit meter must NEVER take the tutor down with it. A missing or
   stale `shigun_usage` table in the deployed database used to throw on
   every single /api/chat request, which sent every question straight to
   the on-device engine and looked exactly like "the AI stopped working".
   Now the lib self-heals the table once when it can, and otherwise keeps
   the counter in memory — a meter hiccup can never interrupt tutoring. */

const demoBuckets = new Map<number, { periodStart: string; used: number }>();

type HealState = "pending" | "ok" | "failed";
const healGlobal = globalThis as typeof globalThis & { __shigunTableHeal?: HealState };

/** One-time self-heal: create the table (and any later columns) when the
 *  deployed database predates the meter. Safe to run repeatedly — every
 *  statement is IF NOT EXISTS — and cached per server instance. */
async function ensureShigunTable(): Promise<boolean> {
  if (!pool) return false;
  if (healGlobal.__shigunTableHeal === "ok") return true;
  if (healGlobal.__shigunTableHeal === "failed") return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shigun_usage (
        id serial PRIMARY KEY,
        user_id integer NOT NULL,
        period_start text NOT NULL,
        used integer NOT NULL DEFAULT 0,
        "limit" integer NOT NULL DEFAULT 100,
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS shigun_usage_user_id_unique
        ON shigun_usage (user_id);
      ALTER TABLE shigun_usage ADD COLUMN IF NOT EXISTS "limit" integer NOT NULL DEFAULT 100;
      ALTER TABLE shigun_usage ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();
    `);
    healGlobal.__shigunTableHeal = "ok";
    return true;
  } catch (error) {
    // No DDL permission, or the database itself is unreachable — the
    // in-memory fallback keeps the meter (and the tutor) alive.
    console.warn("Shigun usage table self-heal skipped:", error instanceof Error ? error.message : error);
    healGlobal.__shigunTableHeal = "failed";
    return false;
  }
}

function memoryBucket(userId: number): { periodStart: string; used: number } {
  const today = todayStr();
  const rec = demoBuckets.get(userId) || { periodStart: today, used: 0 };
  if (rec.periodStart !== today) {
    rec.periodStart = today;
    rec.used = 0;
  }
  demoBuckets.set(userId, rec);
  return rec;
}

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

/** Read (and if needed initialise/roll over) today's counter.
 *  NEVER throws: a database problem degrades to the in-memory bucket. */
export async function getShigunUsage(userId: number): Promise<ShigunUsageState> {
  const today = todayStr();
  const read = async (): Promise<ShigunUsageState> => {
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
  };

  try {
    return await read();
  } catch (firstError) {
    // Most common cause: the table (or its newer columns) does not exist in
    // the deployed database yet. Heal once, then retry.
    if (await ensureShigunTable()) {
      try {
        return await read();
      } catch (retryError) {
        console.warn("Shigun usage read fell back to memory:", retryError instanceof Error ? retryError.message : retryError);
      }
    } else {
      console.warn("Shigun usage read fell back to memory:", firstError instanceof Error ? firstError.message : firstError);
    }
    return shape(memoryBucket(userId));
  }
}

/** Count one cloud-answered tutor question. NEVER throws. */
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
  } catch {
    const rec = memoryBucket(userId);
    rec.used += 1;
    return shape(rec);
  }
}

/** Refill the day's allowance: start a fresh period at zero. NEVER throws. */
export async function resetShigunUsage(userId: number): Promise<ShigunUsageState> {
  const today = todayStr();
  try {
    await db
      .update(shigunUsage)
      .set({ periodStart: today, used: 0, updatedAt: new Date() })
      .where(eq(shigunUsage.userId, userId));
    return getShigunUsage(userId);
  } catch {
    demoBuckets.set(userId, { periodStart: today, used: 0 });
    return shape(demoBuckets.get(userId)!);
  }
}
