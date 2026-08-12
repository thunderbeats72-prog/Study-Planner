import { NextResponse } from "next/server";
import { db } from "@/db";
import { tasks, topics } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { buildContext, fullState, getOrCreateUser, keyFrom } from "@/lib/state";
import { todayStr } from "@/lib/planner";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const b = (await req.json()) as {
    id?: number;
    status?: string;
    actualMinutes?: number;
    date?: string;
    title?: string;
    detail?: string;
    plannedMinutes?: number;
    subjectId?: number | null;
    skipSubjectId?: number;
    skipDate?: string;
  };

  // Bulk skip: skip all pending tasks from one subject on one day.
  if (b.skipSubjectId) {
    await db
      .update(tasks)
      .set({ status: "skipped" })
      .where(
        and(
          eq(tasks.userId, user.id),
          eq(tasks.subjectId, b.skipSubjectId),
          eq(tasks.date, b.skipDate || todayStr()),
          eq(tasks.status, "pending")
        )
      );
    const s = await fullState(key);
    return NextResponse.json({ ...s, context: buildContext(s) });
  }

  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (b.status) patch.status = b.status;
  if (typeof b.actualMinutes === "number") patch.actualMinutes = Math.max(0, Math.round(b.actualMinutes));
  if (b.date) patch.date = b.date;
  if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim();
  if (typeof b.detail === "string") patch.detail = b.detail.trim();
  if (typeof b.plannedMinutes === "number") patch.plannedMinutes = Math.max(1, Math.round(b.plannedMinutes));
  if (Object.prototype.hasOwnProperty.call(b, "subjectId")) {
    patch.subjectId = b.subjectId ?? null;
    patch.topicId = null;
  }
  if (typeof b.title === "string" || typeof b.detail === "string") patch.topicId = null;

  if (Object.keys(patch).length) {
    await db.update(tasks).set(patch).where(and(eq(tasks.id, b.id), eq(tasks.userId, user.id)));
  }

  // reflect mastery on the linked lesson
  const row = (await db.select().from(tasks).where(eq(tasks.id, b.id)).limit(1))[0];
  if (row?.topicId) {
    if (b.status === "done") {
      const t = (await db.select().from(topics).where(eq(topics.id, row.topicId)).limit(1))[0];
      if (t) {
        const gain = row.kind === "learn" ? 55 : 20;
        await db
          .update(topics)
          .set({
            mastery: Math.min(100, t.mastery + gain),
            status: row.kind === "learn" ? "done" : t.status,
          })
          .where(eq(topics.id, row.topicId));
      }
    } else if (b.status === "pending" && row.kind === "learn") {
      await db.update(topics).set({ status: "pending" }).where(eq(topics.id, row.topicId));
    }
  }

  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s) });
}

export async function POST(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const b = (await req.json()) as {
    title: string;
    date?: string;
    subjectId?: number | null;
    plannedMinutes?: number;
    kind?: string;
    detail?: string;
  };
  await db.insert(tasks).values({
    userId: user.id,
    date: b.date || todayStr(),
    title: b.title,
    detail: b.detail || "Added manually.",
    subjectId: b.subjectId ?? null,
    topicId: null,
    kind: b.kind || "practice",
    plannedMinutes: b.plannedMinutes ?? 30,
    position: 99,
  });
  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s) });
}

export async function DELETE(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (id) await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, user.id)));
  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s) });
}
