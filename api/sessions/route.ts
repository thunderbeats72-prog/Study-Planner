import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, subjects, tasks } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { applyCompletionMastery, buildContext, dateFrom, fullState, getOrCreateUser, keyFrom, recomputeStreak } from "@/lib/state";
import { withDbGuard } from "@/lib/routeGuard";
import { shouldAutoComplete, type CompletedTaskInfo } from "@/lib/completion";
import {
  demoAddSession, demoDataEnabled, demoPatchTask, demoSessionMinutesForTask,
} from "@/lib/demoState";
import {
  dateDistanceDays, enumValue, finiteNumber, isIsoDate, positiveId,
  readJsonObject, textValue, validationPayload,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

const SESSION_MODES = ["clock", "focus", "pomodoro", "stopwatch", "custom"] as const;

export const POST = withDbGuard(postSessions);

async function postSessions(req: Request) {
  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 8_000); }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  let minutes: number;
  let requestedTaskId: number | null;
  let requestedSubjectId: number | null;
  let mode: string;
  let eventId: string | null;
  try {
    minutes = finiteNumber(body.minutes, "minutes", { min: 0, max: 720 });
    minutes = Math.round(minutes * 100) / 100;
    requestedTaskId = positiveId(body.taskId, "taskId", true);
    requestedSubjectId = positiveId(body.subjectId, "subjectId", true);
    mode = enumValue(body.mode, "mode", SESSION_MODES, "focus");
    eventId = body.eventId == null
      ? null
      : textValue(body.eventId, "eventId", { required: true, max: 100 });
  } catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const serverToday = dateFrom(req);
  // The browser's local day can differ from the UTC server by one date. Keep
  // that correction, but reject arbitrary backdating/future streak inflation.
  const requestedDayOffset = isIsoDate(body.date) ? dateDistanceDays(serverToday, body.date) : 999;
  const date = isIsoDate(body.date) && requestedDayOffset >= -30 && requestedDayOffset <= 2
    ? body.date
    : serverToday;

  const key = keyFrom(req);

  // ── Preview without a database ───────────────────────────────────────────
  // The in-memory demo layer records the session and runs the SAME
  // auto-completion rule the real database path uses, so the study-clock
  // auto-complete behaviour can be exercised end-to-end in the preview.
  if (demoDataEnabled()) {
    const stateBefore = await fullState(key);
    let taskId: number | null = null;
    let subjectId: number | null = null;
    if (requestedTaskId) {
      taskId = stateBefore.tasks.some((t) => t.id === requestedTaskId) ? requestedTaskId : null;
      if (!taskId) return NextResponse.json({ error: "Task not found.", code: "TASK_NOT_FOUND" }, { status: 404 });
      subjectId = stateBefore.tasks.find((t) => t.id === taskId)?.subjectId ?? null;
    } else if (requestedSubjectId) {
      subjectId = stateBefore.subjects.some((s) => s.id === requestedSubjectId) ? requestedSubjectId : null;
      if (!subjectId) return NextResponse.json({ error: "Subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });
    }

    let completedTask: CompletedTaskInfo | null = null;
    if (minutes > 0.01) {
      demoAddSession({ subjectId, taskId, date, minutes, mode, eventId, createdAt: new Date().toISOString() });
      if (taskId) {
        const task = stateBefore.tasks.find((t) => t.id === taskId);
        // Session minutes are the single source of truth for actualMinutes
        // (exactly like the SQL `sum(sessions.minutes)` in the real path).
        const total = Math.round(demoSessionMinutesForTask(taskId) * 100) / 100;
        demoPatchTask(taskId, { actualMinutes: Math.round(total) });
        if (task && shouldAutoComplete(total, task.plannedMinutes, task.status)) {
          demoPatchTask(taskId, { status: "done" });
          completedTask = {
            id: task.id, title: task.title,
            plannedMinutes: task.plannedMinutes, actualMinutes: Math.round(total),
          };
        }
      }
    }
    const fresh = await fullState(key);
    return NextResponse.json({ ...fresh, context: buildContext(fresh, dateFrom(req)), completedTask });
  }
  // ── End of preview branch ────────────────────────────────────────────────

  const user = await getOrCreateUser(key);
  let taskId: number | null = null;
  let subjectId: number | null = null;

  if (requestedTaskId) {
    const task = (await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, requestedTaskId), eq(tasks.userId, user.id)))
      .limit(1))[0];
    if (!task) return NextResponse.json({ error: "Task not found.", code: "TASK_NOT_FOUND" }, { status: 404 });
    taskId = task.id;
    subjectId = task.subjectId;
  } else if (requestedSubjectId) {
    const subject = (await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, requestedSubjectId), eq(subjects.userId, user.id)))
      .limit(1))[0];
    if (!subject) return NextResponse.json({ error: "Subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });
    subjectId = subject.id;
  }

  // Auto-completed by time: the task whose logged minutes met its plan.
  let completedTask: CompletedTaskInfo | null = null;
  if (minutes > 0.01) {
    await db.transaction(async (tx) => {
      await tx
        .insert(sessions)
        .values({ userId: user.id, subjectId, taskId, date, minutes, mode, eventId })
        .onConflictDoNothing({ target: [sessions.userId, sessions.eventId] });

      if (taskId) {
        const totals = await tx
          .select({ total: sql<number>`coalesce(sum(${sessions.minutes}), 0)::float` })
          .from(sessions)
          .where(and(eq(sessions.userId, user.id), eq(sessions.taskId, taskId)));
        const total = Number(totals[0]?.total || 0);
        await tx
          .update(tasks)
          .set({ actualMinutes: Math.max(0, Math.round(total)) })
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));

        // Auto-complete: once the logged minutes reach the planned time, the
        // task is done — no manual "Done" tap needed (a 15-min recall studied
        // for 28 min is complete at the 15-min mark). Only a pending task
        // flips; done/skipped are never re-marked, and if a concurrent
        // request completes it first, the conditional status update below
        // matches zero rows and the mastery bookkeeping runs exactly once.
        const fresh = (await tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
          .limit(1))[0];
        if (fresh && shouldAutoComplete(fresh.actualMinutes, fresh.plannedMinutes, fresh.status)) {
          const done = (await tx
            .update(tasks)
            .set({ status: "done" })
            .where(and(
              eq(tasks.id, taskId), eq(tasks.userId, user.id), eq(tasks.status, "pending")
            ))
            .returning())[0];
          if (done) {
            await applyCompletionMastery(tx, done, date);
            completedTask = {
              id: done.id, title: done.title,
              plannedMinutes: done.plannedMinutes, actualMinutes: done.actualMinutes,
            };
          }
        }
      }
    });
    await recomputeStreak(user.id, date > serverToday ? date : serverToday);
  }

  const state = await fullState(key);
  return NextResponse.json({ ...state, context: buildContext(state, dateFrom(req)), completedTask });
}
