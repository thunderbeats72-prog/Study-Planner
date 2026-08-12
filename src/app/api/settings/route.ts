import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildContext, fullState, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import { regeneratePlan } from "@/lib/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NUM = new Set(["dailyHours", "subjectsPerDay", "bufferDays", "revisionWeeks", "pomodoro", "shortBreak", "longBreak"]);
const ALLOWED = new Set([
  "startDate", "examDate", "dailyHours", "subjectsPerDay", "studyDays", "bufferDays",
  "planMode", "studyStyle", "weakSubject", "revisionWeeks", "theme", "pomodoro",
  "shortBreak", "longBreak", "confetti", "sounds",
]);

export async function PATCH(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const body = (await req.json()) as Record<string, unknown> & { _replan?: boolean; name?: string };

  if (typeof body.name === "string" && body.name.trim()) {
    await db.update(users).set({ name: body.name.trim() }).where(eq(users.id, user.id));
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue;
    patch[k] = NUM.has(k) ? Number(v) : v;
  }
  if (Object.keys(patch).length) {
    await db.update(settings).set(patch).where(eq(settings.userId, user.id));
  }

  let stats = null;
  if (body._replan) {
    const st = await getSettings(user.id);
    stats = await regeneratePlan(user.id, st, { fromToday: true });
  }
  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s), stats });
}
