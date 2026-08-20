import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildContext, fullState, getOrCreateUser, keyFrom, recomputeStreak } from "@/lib/state";
import { todayStr } from "@/lib/planner";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const b = (await req.json()) as {
    minutes: number;
    subjectId?: number | null;
    taskId?: number | null;
    mode?: string;
    date?: string; // the CLIENT's local date — server timezone must not move sessions across days
  };
  const minutes = Math.max(0, Math.round((Number(b.minutes) || 0) * 100) / 100);
  // Trust the client's date only when it is a sane, valid calendar date;
  // otherwise fall back to the server's date.
  const date = b.date && DATE_RE.test(b.date) && !Number.isNaN(Date.parse(`${b.date}T00:00:00Z`))
    ? b.date
    : todayStr();
  if (minutes > 0.05) {
    await db.insert(sessions).values({
      userId: user.id,
      subjectId: b.subjectId ?? null,
      taskId: b.taskId ?? null,
      date,
      minutes,
      mode: b.mode || "focus",
    });
    if (b.taskId) {
      // Recompute the task's logged minutes from ALL its sessions so no partial
      // minute is ever lost to rounding. Store the rounded total for display.
      const allForTask = await db.select().from(sessions).where(eq(sessions.taskId, b.taskId));
      const total = allForTask.reduce((a, x) => a + x.minutes, 0);
      await db
        .update(tasks)
        .set({ actualMinutes: Math.max(1, Math.round(total)) })
        .where(eq(tasks.id, b.taskId));
    }
    // streak recompute uses the session's real (client-local) date
    await recomputeStreak(user.id, date);
  }
  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s) });
}
