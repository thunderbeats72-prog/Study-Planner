import { NextResponse } from "next/server";
import { db } from "@/db";
import { subjects, tasks, topics } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { applyCompletionMastery, buildContext, dateFrom, fullState, getOrCreateUser, keyFrom } from "@/lib/state";
import type { ReviewRating } from "@/lib/ml";
import {
  demoAddTask, demoDataEnabled, demoDeleteTask, demoPatchManyTasks, demoPatchTask,
} from "@/lib/demoState";
import {
  enumValue, finiteNumber, isoDate, positiveId, readJsonObject,
  textValue, ValidationError, validationPayload,
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

  // Shared demo response builder — the in-memory preview round-trips the
  // same { ...state, context } shape every mutation path returns.
  const demoResponse = async () => {
    const fresh = await fullState(key);
    return NextResponse.json({ ...fresh, context: buildContext(fresh, dateFrom(req)) });
  };

  // ── Bulk date moves (backlog recovery) ──────────────────────────────────
  // `moves: [{id, date}]` re-dates many pending tasks in ONE call, so
  // "move to tomorrow" / "spread across the week" don't hammer the API.
  // Tasks that no longer exist are skipped; nothing is silently created.
  if (body.moves != null) {
    let moves: { id: number; date: string }[];
    try {
      const raw = body.moves;
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) {
        throw new ValidationError("moves must be an array of 1–60 {id, date} entries.", "INVALID_MOVES");
      }
      moves = raw.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          throw new ValidationError(`moves[${index}] must be an object.`, "INVALID_MOVES");
        }
        const record = entry as Record<string, unknown>;
        return {
          id: positiveId(record.id, `moves[${index}].id`) as number,
          date: isoDate(record.date, `moves[${index}].date`),
        };
      });
    } catch (error) {
      const payload = validationPayload(error);
      return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
    }

    if (demoDataEnabled()) {
      for (const move of moves) demoPatchTask(move.id, { date: move.date });
      return demoResponse();
    }

    await db.transaction(async (tx) => {
      for (const move of moves) {
        await tx
          .update(tasks)
          .set({ date: move.date })
          .where(and(eq(tasks.id, move.id), eq(tasks.userId, user.id)));
      }
    });
    return responseState(key, dateFrom(req));
  }

  // ── Preview without a database ───────────────────────────────────────────
  // The in-memory demo layer applies the same patches so Done / Undo / Skip /
  // Edit / Skip-subject all behave in the preview exactly as they look in a
  // real deployment (state round-trips through the same response shape).
  if (demoDataEnabled()) {
    const demo = await fullState(key);

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
      const ids = demo.tasks
        .filter((t) => t.subjectId === subjectId && t.date === date && t.status === "pending")
        .map((t) => t.id);
      if (!ids.length && !demo.subjects.some((s) => s.id === subjectId)) {
        return NextResponse.json({ error: "Subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });
      }
      demoPatchManyTasks(ids, { status: "skipped" });
      return demoResponse();
    }

    let id: number;
    try { id = positiveId(body.id, "id") as number; }
    catch (error) {
      const payload = validationPayload(error);
      return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
    }

    const previous = demo.tasks.find((t) => t.id === id);
    if (!previous) return NextResponse.json({ error: "Task not found.", code: "TASK_NOT_FOUND" }, { status: 404 });

    let patch: Partial<typeof previous>;
    try {
      patch = {};
      if (body.status != null) patch.status = enumValue(body.status, "status", TASK_STATUSES);
      if (body.actualMinutes != null) {
        patch.actualMinutes = finiteNumber(body.actualMinutes, "actualMinutes", { min: 0, max: 100_000, integer: true });
      }
      if (body.date != null) patch.date = isoDate(body.date, "date");
      if (body.title != null) patch.title = textValue(body.title, "title", { required: true, max: 300 });
      if (body.detail != null) patch.detail = textValue(body.detail, "detail", { max: 4_000 });
      if (body.plannedMinutes != null) {
        patch.plannedMinutes = finiteNumber(body.plannedMinutes, "plannedMinutes", { min: 1, max: 720, integer: true });
      }
      if (Object.prototype.hasOwnProperty.call(body, "subjectId")) {
        patch.subjectId = positiveId(body.subjectId, "subjectId", true);
        patch.topicId = null;
      }
    } catch (error) {
      const payload = validationPayload(error);
      return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No supported task changes were supplied.", code: "EMPTY_PATCH" }, { status: 400 });
    }
    demoPatchTask(id, patch);
    return demoResponse();
  }
  // ── End of preview branch ────────────────────────────────────────────────

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

    // Apply mastery once per pending/skipped -> done transition. Network
    // retries or repeated Done taps can no longer inflate mastery repeatedly.
    // The same bookkeeping powers the study clock's time-based auto-complete
    // (POST /api/sessions), so both paths share one implementation.
    const becameDone = nextStatus === "done" && previous.status !== "done";
    if (becameDone) {
      await applyCompletionMastery(tx, updated, dateFrom(req), rating);
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

  // ── Preview without a database: add the task to the in-memory demo layer. ──
  if (demoDataEnabled()) {
    const demo = await fullState(key);
    if (subjectId && !demo.subjects.some((s) => s.id === subjectId)) {
      return NextResponse.json({ error: "Subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });
    }
    demoAddTask({
      date, title, detail, subjectId, topicId: null,
      kind, plannedMinutes, actualMinutes: 0, status: "pending", position: 99,
    });
    const fresh = await fullState(key);
    return NextResponse.json({ ...fresh, context: buildContext(fresh, dateFrom(req)) });
  }
  // ── End of preview branch ────────────────────────────────────────────────

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

  // ── Preview without a database: remove from the in-memory demo layer. ────
  if (demoDataEnabled()) {
    const demo = await fullState(key);
    if (!demo.tasks.some((t) => t.id === id)) {
      return NextResponse.json({ error: "Task not found.", code: "TASK_NOT_FOUND" }, { status: 404 });
    }
    demoDeleteTask(id);
    const fresh = await fullState(key);
    return NextResponse.json({ ...fresh, context: buildContext(fresh, dateFrom(req)) });
  }
  // ── End of preview branch ────────────────────────────────────────────────

  const deleted = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    .returning({ id: tasks.id });
  if (!deleted.length) return NextResponse.json({ error: "Task not found.", code: "TASK_NOT_FOUND" }, { status: 404 });
  return responseState(key, dateFrom(req));
}
