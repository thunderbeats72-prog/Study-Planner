import { NextResponse } from "next/server";
import { db } from "@/db";
import { subjects, tasks, topics } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { buildContext, dateFrom, fullState, getOrCreateUser, keyFrom } from "@/lib/state";
import { fsrsInit, fsrsReview, masteryDelta, type ReviewRating } from "@/lib/ml";
import {
  enumValue, finiteNumber, isoDate, positiveId, readJsonObject,
  textValue, validationPayload,
} from "@/lib/validation";
import { withDbGuard } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";

const TASK_STATUSES = ["pending", "done", "skipped"] as const;
const TASK_KINDS = ["learn", "revise", "practice", "mock", "buffer"] as const;

async function responseState(key: string, localDate: string) {
  const state = await fullState(key);
  return NextResponse.json({ ...state, context: buildContext(state, localDate) });
}

export const PATCH = withDbGuard(patchTasks);

async function patchTasks(req: Request) {
  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 16_000); }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const key = keyFrom(req);
  const user = await getOrCreateUser(key);

  // Bulk skip: skip all pending tasks from one owned subject on one day.
  if (body.skipSubjectId != null) {
    let subjectId: number;
    let date: string;
    try {
      subjectId = positiveId(body.skipSubjectId, "skipSubjectId") as number;
      date = body.skipDate == null ? dateFrom(req) : isoDate(body.skipDate, "skipDate");
    } catch (error) {
      const payload = validationPayload(error);
      return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
    }
    const owned = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, user.id)))
      .limit(1);
    if (!owned.length) return NextResponse.json({ error: "Subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });
    await db
      .update(tasks)
      .set({ status: "skipped" })
      .where(and(
        eq(tasks.userId, user.id), eq(tasks.subjectId, subjectId),
        eq(tasks.date, date), eq(tasks.status, "pending")
      ));
    return responseState(key, dateFrom(req));
  }

  let id: number;
  try { id = positiveId(body.id, "id") as number; }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const previous = (await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    .limit(1))[0];
  if (!previous) return NextResponse.json({ error: "Task not found.", code: "TASK_NOT_FOUND" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  let nextStatus: typeof TASK_STATUSES[number] | undefined;
  let rating: ReviewRating | 0 = 0;
  try {
    if (body.status != null) {
      nextStatus = enumValue(body.status, "status", TASK_STATUSES);
      patch.status = nextStatus;
    }
    if (body.actualMinutes != null) {
      patch.actualMinutes = finiteNumber(body.actualMinutes, "actualMinutes", { min: 0, max: 100_000, integer: true });
    }
    if (body.date != null) patch.date = isoDate(body.date, "date");
    if (body.title != null) patch.title = textValue(body.title, "title", { required: true, max: 300 });
    if (body.detail != null) patch.detail = textValue(body.detail, "detail", { max: 4_000 });
    if (body.plannedMinutes != null) {
      patch.plannedMinutes = finiteNumber(body.plannedMinutes, "plannedMinutes", { min: 1, max: 720, integer: true });
    }
    if (body.rating != null) {
      rating = finiteNumber(body.rating, "rating", { min: 1, max: 4, integer: true }) as ReviewRating;
    }
  } catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  if (Object.prototype.hasOwnProperty.call(body, "subjectId")) {
    let subjectId: number | null;
    try { subjectId = positiveId(body.subjectId, "subjectId", true); }
    catch (error) {
      const payload = validationPayload(error);
      return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
    }
    if (subjectId) {
      const owned = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(and(eq(subjects.id, subjectId), eq(subjects.userId, user.id)))
        .limit(1);
      if (!owned.length) return NextResponse.json({ error: "Subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });
    }
    patch.subjectId = subjectId;
    patch.topicId = null;
  }
  if (body.title != null || body.detail != null) patch.topicId = null;
  if (!Object.keys(patch).length && !rating) {
    return NextResponse.json({ error: "No supported task changes were supplied.", code: "EMPTY_PATCH" }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    const updated = Object.keys(patch).length
      ? (await tx
          .update(tasks)
          .set(patch)
          .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
          .returning())[0]
      : previous;

    const topicId = updated?.topicId;
    if (!topicId) return;
    const topic = (await tx
      .select()
      .from(topics)
      .where(and(eq(topics.id, topicId), eq(topics.userId, user.id)))
      .limit(1))[0];
    if (!topic) return;

    // Apply mastery once per pending/skipped -> done transition. Network
    // retries or repeated Done taps can no longer inflate mastery repeatedly.
    const becameDone = nextStatus === "done" && previous.status !== "done";
    if (becameDone) {
      const gain = updated.kind === "learn" ? 55 : 20;
      const topicPatch: Record<string, unknown> = {
        mastery: Math.min(100, topic.mastery + gain),
        status: updated.kind === "learn" ? "done" : topic.status,
      };
      if (rating) {
        const today = dateFrom(req);
        const elapsed = topic.lastReview
          ? Math.max(0, Math.round((Date.parse(today) - Date.parse(topic.lastReview)) / 86_400_000))
          : 0;
        const next = topic.stability > 0
          ? fsrsReview(topic.stability, topic.difficulty, elapsed, rating)
          : { stability: fsrsInit(rating, topic.difficulty), intervalDays: 0 };
        topicPatch.stability = next.stability;
        topicPatch.lastReview = today;
        topicPatch.mastery = rating === 1
          ? Math.max(0, topic.mastery + masteryDelta(rating))
          : Math.min(100, topic.mastery + gain + masteryDelta(rating));
      }
      await tx
        .update(topics)
        .set(topicPatch)
        .where(and(eq(topics.id, topicId), eq(topics.userId, user.id)));
    } else if (nextStatus === "pending" && previous.status !== "pending" && updated.kind === "learn") {
      await tx
        .update(topics)
        .set({ status: "pending" })
        .where(and(eq(topics.id, topicId), eq(topics.userId, user.id)));
    }
  });

  return responseState(key, dateFrom(req));
}

export const POST = withDbGuard(postTasks);

async function postTasks(req: Request) {
  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 16_000); }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);

  let title: string;
  let date: string;
  let subjectId: number | null;
  let plannedMinutes: number;
  let kind: typeof TASK_KINDS[number];
  let detail: string;
  try {
    title = textValue(body.title, "title", { required: true, max: 300 });
    date = body.date == null ? dateFrom(req) : isoDate(body.date, "date");
    subjectId = positiveId(body.subjectId, "subjectId", true);
    plannedMinutes = finiteNumber(body.plannedMinutes ?? 30, "plannedMinutes", { min: 1, max: 720, integer: true });
    kind = enumValue(body.kind, "kind", TASK_KINDS, "practice");
    detail = textValue(body.detail, "detail", { max: 4_000, fallback: "Added manually." }) || "Added manually.";
  } catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  if (subjectId) {
    const owned = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, user.id)))
      .limit(1);
    if (!owned.length) return NextResponse.json({ error: "Subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });
  }

  await db.insert(tasks).values({
    userId: user.id, date, title, detail, subjectId, topicId: null,
    kind, plannedMinutes, position: 99,
  });
  return responseState(key, dateFrom(req));
}

export const DELETE = withDbGuard(deleteTasks);

async function deleteTasks(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  let id: number;
  try { id = positiveId(new URL(req.url).searchParams.get("id"), "id") as number; }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }
  const deleted = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    .returning({ id: tasks.id });
  if (!deleted.length) return NextResponse.json({ error: "Task not found.", code: "TASK_NOT_FOUND" }, { status: 404 });
  return responseState(key, dateFrom(req));
}
