import { NextResponse } from "next/server";
import { db } from "@/db";
import { subjects, tasks, topics } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { buildContext, fullState, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import { regeneratePlan, synthesiseTopicsForSubject } from "@/lib/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const b = (await req.json()) as { name: string; units: number; difficulty: string; color: string };
  const count = (await db.select().from(subjects).where(eq(subjects.userId, user.id))).length;
  const units = Math.max(1, Math.min(40, Number(b.units) || 6));
  const ins = await db
    .insert(subjects)
    .values({
      userId: user.id,
      name: b.name,
      units,
      difficulty: b.difficulty || "Medium",
      color: b.color || "#6366f1",
      position: count,
    })
    .returning();
  await synthesiseTopicsForSubject(
    user.id, ins[0].id, b.name, units, b.difficulty || "Medium", user.level, user.courseName
  );
  const st = await getSettings(user.id);
  const stats = await regeneratePlan(user.id, st, { fromToday: true });
  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s), stats });
}

export async function PATCH(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const b = (await req.json()) as {
    id: number; name: string; units: number; difficulty: string; color: string;
  };
  const prev = (
    await db.select().from(subjects).where(and(eq(subjects.id, b.id), eq(subjects.userId, user.id))).limit(1)
  )[0];
  if (!prev) return NextResponse.json({ error: "not found" }, { status: 404 });
  const units = Math.max(1, Math.min(40, Number(b.units) || prev.units));
  await db
    .update(subjects)
    .set({ name: b.name || prev.name, units, difficulty: b.difficulty || prev.difficulty, color: b.color || prev.color })
    .where(eq(subjects.id, b.id));

  if (units !== prev.units || (b.name && b.name !== prev.name)) {
    await db.delete(topics).where(and(eq(topics.userId, user.id), eq(topics.subjectId, b.id)));
    await synthesiseTopicsForSubject(
      user.id, b.id, b.name || prev.name, units, b.difficulty || prev.difficulty, user.level, user.courseName
    );
  }
  const st = await getSettings(user.id);
  const stats = await regeneratePlan(user.id, st, { fromToday: true });
  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s), stats });
}

export async function DELETE(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (id) {
    await db.delete(topics).where(and(eq(topics.userId, user.id), eq(topics.subjectId, id)));
    await db.delete(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.subjectId, id)));
    await db.delete(subjects).where(and(eq(subjects.userId, user.id), eq(subjects.id, id)));
  }
  const st = await getSettings(user.id);
  const stats = await regeneratePlan(user.id, st, { fromToday: true });
  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s), stats });
}
