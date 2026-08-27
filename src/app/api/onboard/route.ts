import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, settings, subjects, topics, tasks, sessions, messages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { buildContext, dateFrom, fullState, getOrCreateUser, keyFrom } from "@/lib/state";
import { demoResetMutations } from "@/lib/demoState";
import { aiGenerateTopics, type GeneratedTopic } from "@/lib/ai";
import { buildPlan, type PlanSettings } from "@/lib/planner";
import { learnWeekdays, weekdayLoadFactor } from "@/lib/ml";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  assertDateWindow, enumValue, finiteNumber, isoDate, readJsonObject,
  textValue, validationPayload,
} from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LEVELS = ["nursery", "school", "ug", "pg", "phd", "competitive", "professional"] as const;
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const STUDY_DAYS = ["all", "6days", "weekdays"] as const;
const PLAN_MODES = ["syllabus", "revision", "mock"] as const;
const STUDY_STYLES = ["balanced", "theory", "practice"] as const;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

type CleanSubject = { name: string; units: number; difficulty: "Easy" | "Medium" | "Hard"; color: string };
type GeneratedSubject = CleanSubject & { lessons: GeneratedTopic[] };

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, worker: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  }));
  return results;
}

export async function POST(req: Request) {
  const limit = checkRateLimit(req, "onboard", 5, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many plan builds. Please wait before trying again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 100_000); }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  let name: string;
  let level: typeof LEVELS[number];
  let course: string;
  let courseName: string;
  let year: string;
  let cleanSubjects: CleanSubject[];
  let planSettings: PlanSettings;
  let weakIndex: number;

  try {
    name = textValue(body.name, "name", { required: true, max: 100 });
    level = enumValue(body.level, "level", LEVELS, "ug");
    course = textValue(body.course, "course", { max: 100, fallback: "custom" }) || "custom";
    courseName = textValue(body.courseName, "courseName", { required: true, max: 300 });
    year = textValue(body.year, "year", { max: 20, fallback: "1" }) || "1";

    if (!Array.isArray(body.subjects) || body.subjects.length < 1 || body.subjects.length > 12) {
      throw new Error("SUBJECT_COUNT");
    }
    cleanSubjects = body.subjects.map((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_SUBJECT");
      const subject = raw as Record<string, unknown>;
      const subjectName = textValue(subject.name, `Subject ${index + 1} name`, { required: true, max: 160 });
      const units = finiteNumber(subject.units, `Units for ${subjectName}`, { min: 1, max: 40, integer: true });
      const difficulty = enumValue(subject.difficulty, `Difficulty for ${subjectName}`, DIFFICULTIES, "Medium");
      const color = typeof subject.color === "string" && COLOR_RE.test(subject.color) ? subject.color : "#6366f1";
      return { name: subjectName, units, difficulty, color };
    });
    const uniqueNames = new Set(cleanSubjects.map((subject) => subject.name.toLocaleLowerCase()));
    if (uniqueNames.size !== cleanSubjects.length) throw new Error("DUPLICATE_SUBJECT");

    const startDate = isoDate(body.startDate, "startDate");
    const examDate = isoDate(body.examDate, "examDate");
    assertDateWindow(startDate, examDate);
    planSettings = {
      startDate,
      examDate,
      dailyHours: finiteNumber(body.dailyHours, "dailyHours", { min: 0.25, max: 16, fallback: 2 }),
      subjectsPerDay: finiteNumber(body.subjectsPerDay, "subjectsPerDay", { min: 1, max: 10, integer: true, fallback: 2 }),
      studyDays: enumValue(body.studyDays, "studyDays", STUDY_DAYS, "all"),
      bufferDays: finiteNumber(body.bufferDays, "bufferDays", { min: 0, max: 90, integer: true, fallback: 5 }),
      planMode: enumValue(body.planMode, "planMode", PLAN_MODES, "syllabus"),
      studyStyle: enumValue(body.studyStyle, "studyStyle", STUDY_STYLES, "balanced"),
      weakSubject: "none",
      revisionWeeks: finiteNumber(body.revisionWeeks, "revisionWeeks", { min: 0, max: 52, integer: true, fallback: 1 }),
    };
    weakIndex = finiteNumber(body.weakSubject ?? -1, "weakSubject", { min: -1, max: cleanSubjects.length - 1, integer: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "SUBJECT_COUNT") {
        return NextResponse.json({ error: "Add between 1 and 12 subjects.", code: "INVALID_SUBJECTS" }, { status: 400 });
      }
      if (error.message === "INVALID_SUBJECT") {
        return NextResponse.json({ error: "Every subject must be a valid object.", code: "INVALID_SUBJECT" }, { status: 400 });
      }
      if (error.message === "DUPLICATE_SUBJECT") {
        return NextResponse.json({ error: "Each subject name must be unique.", code: "DUPLICATE_SUBJECT" }, { status: 400 });
      }
    }
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const key = keyFrom(req);

  // ── Preview without a database: completing the wizard simply resets the
  // in-memory demo plan (the "hard reset" the real route performs). ─────────
  if (process.env.SPP_DEMO_DATA === "1") {
    demoResetMutations();
    const state = await fullState(key);
    return NextResponse.json({ ...state, context: buildContext(state, dateFrom(req)) });
  }
  // ── End of preview branch ────────────────────────────────────────────────

  // Generate every curriculum BEFORE touching the existing plan. Limiting
  // concurrency avoids provider rate-limit bursts for 8–12 subject courses.
  let generated: GeneratedSubject[];
  try {
    generated = await mapWithConcurrency(cleanSubjects, 3, async (subject) => ({
      ...subject,
      lessons: await aiGenerateTopics(subject.name, subject.units, subject.difficulty, level, courseName),
    }));
  } catch {
    return NextResponse.json(
      { error: "Could not generate the replacement curriculum. Your existing plan was not changed.", code: "CURRICULUM_FAILED" },
      { status: 503 }
    );
  }

  const user = await getOrCreateUser(key);
  let stats: ReturnType<typeof buildPlan>["stats"];

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7320, ${user.id})`);

    // A re-run is now all-or-nothing: any DB/build failure rolls this entire
    // reset back and preserves the previous course, sessions, and chat.
    await tx.delete(tasks).where(eq(tasks.userId, user.id));
    await tx.delete(topics).where(eq(topics.userId, user.id));
    await tx.delete(subjects).where(eq(subjects.userId, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(messages).where(eq(messages.userId, user.id));

    await tx.update(users).set({
      name, level, course, courseName, year, onboarded: true,
      streak: 0, lastStudyDate: null,
    }).where(eq(users.id, user.id));

    const insertedSubjects = [] as Array<typeof subjects.$inferSelect>;
    for (let index = 0; index < generated.length; index++) {
      const subject = generated[index];
      const inserted = await tx.insert(subjects).values({
        userId: user.id,
        name: subject.name,
        units: subject.units,
        difficulty: subject.difficulty,
        color: subject.color,
        position: index,
      }).returning();
      insertedSubjects.push(inserted[0]);
    }

    const insertedTopics = [] as Array<typeof topics.$inferSelect>;
    for (let subjectIndex = 0; subjectIndex < generated.length; subjectIndex++) {
      const subject = generated[subjectIndex];
      const subjectRow = insertedSubjects[subjectIndex];
      if (!subject.lessons.length) throw new Error(`No lessons generated for ${subject.name}`);
      const values = subject.lessons.map((lesson, position) => ({
        userId: user.id,
        subjectId: subjectRow.id,
        unit: lesson.unit,
        title: lesson.title,
        summary: lesson.summary,
        objectives: lesson.objectives,
        prerequisites: lesson.prerequisites,
        keyConcepts: lesson.keyConcepts,
        practice: lesson.practice,
        depth: lesson.depth,
        sources: lesson.sources,
        difficulty: lesson.difficulty,
        estMinutes: lesson.estMinutes,
        position,
      }));
      insertedTopics.push(...await tx.insert(topics).values(values).returning());
    }

    const weakSubject = weakIndex >= 0 ? String(insertedSubjects[weakIndex].id) : "none";
    const finalSettings = { ...planSettings, weakSubject };
    await tx.update(settings).set(finalSettings).where(eq(settings.userId, user.id));

    const existingTasks = await tx.select().from(tasks).where(eq(tasks.userId, user.id));
    const historyRows = existingTasks.map((t) => ({
      subjectId: t.subjectId, topicId: t.topicId, date: t.date, kind: t.kind,
      status: t.status, plannedMinutes: t.plannedMinutes, actualMinutes: t.actualMinutes,
    }));
    const weekdays = learnWeekdays(historyRows);

    const result = buildPlan(
      insertedSubjects.map((subject) => ({
        id: subject.id, name: subject.name, difficulty: subject.difficulty, color: subject.color,
      })),
      insertedTopics.map((topic) => ({
        id: topic.id, subjectId: topic.subjectId, title: topic.title, unit: topic.unit,
        estMinutes: topic.estMinutes, difficulty: topic.difficulty, mastery: topic.mastery,
        practice: topic.practice,
      })),
      finalSettings,
      { dayFactor: (date) => weekdayLoadFactor(weekdays, date) }
    );
    stats = result.stats;
    const plannedRows = result.tasks.map((task) => ({ ...task, userId: user.id }));
    for (let index = 0; index < plannedRows.length; index += 400) {
      await tx.insert(tasks).values(plannedRows.slice(index, index + 400));
    }
  });

  const state = await fullState(key);
  return NextResponse.json({ ...state, context: buildContext(state, dateFrom(req)), stats: stats! });
}
