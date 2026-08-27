import { NextResponse } from "next/server";
import { db } from "@/db";
import { subjects, tasks, topics } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import { buildContext, dateFrom, fullState, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import { regeneratePlan } from "@/lib/generate";
import { aiGenerateTopics, type GeneratedTopic } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  enumValue, finiteNumber, positiveId, readJsonObject, textValue, validationPayload,
} from "@/lib/validation";
import { withDbGuard } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function topicValues(userId: number, subjectId: number, generated: GeneratedTopic[]) {
  return generated.map((topic, position) => ({
    userId, subjectId, unit: topic.unit, title: topic.title, summary: topic.summary,
    objectives: topic.objectives, prerequisites: topic.prerequisites,
    keyConcepts: topic.keyConcepts, practice: topic.practice, depth: topic.depth,
    sources: topic.sources, difficulty: topic.difficulty,
    estMinutes: topic.estMinutes, position,
  }));
}

async function stateResponse(
  key: string,
  localDate: string,
  stats: Awaited<ReturnType<typeof regeneratePlan>>
) {
  const state = await fullState(key);
  return NextResponse.json({ ...state, context: buildContext(state, localDate), stats });
}

export const POST = withDbGuard(postSubjects);

async function postSubjects(req: Request) {
  const limit = checkRateLimit(req, "subject-generate", 8, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many curriculum changes. Please wait and try again.", code: "RATE_LIMITED" }, {
      status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) },
    });
  }
  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 12_000); }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  let name: string;
  let units: number;
  let difficulty: typeof DIFFICULTIES[number];
  let color: string;
  try {
    name = textValue(body.name, "name", { required: true, max: 160 });
    units = finiteNumber(body.units, "units", { min: 1, max: 40, integer: true, fallback: 6 });
    difficulty = enumValue(body.difficulty, "difficulty", DIFFICULTIES, "Medium");
    color = typeof body.color === "string" && COLOR_RE.test(body.color) ? body.color : "#6366f1";
  } catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const existing = await db.select().from(subjects).where(eq(subjects.userId, user.id));
  if (existing.length >= 12) return NextResponse.json({ error: "A plan can contain at most 12 subjects." }, { status: 400 });
  if (existing.some((subject) => subject.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return NextResponse.json({ error: "That subject already exists.", code: "DUPLICATE_SUBJECT" }, { status: 409 });
  }

  const generated = await aiGenerateTopics(name, units, difficulty, user.level, user.courseName);
  let subjectId = 0;
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(subjects).values({
      userId: user.id, name, units, difficulty, color, position: existing.length,
    }).returning();
    subjectId = inserted[0].id;
    await tx.insert(topics).values(topicValues(user.id, subjectId, generated));
  });

  try {
    const settingsRow = await getSettings(user.id);
    return stateResponse(key, dateFrom(req), await regeneratePlan(user.id, settingsRow, { fromToday: true, today: dateFrom(req) }));
  } catch (error) {
    // Adding a subject is reversible; if schedule regeneration fails, remove
    // the half-added curriculum and leave the previous plan untouched.
    await db.transaction(async (tx) => {
      await tx.delete(topics).where(and(eq(topics.userId, user.id), eq(topics.subjectId, subjectId)));
      await tx.delete(subjects).where(and(eq(subjects.userId, user.id), eq(subjects.id, subjectId)));
    });
    throw error;
  }
}

export const PATCH = withDbGuard(patchSubjects);

async function patchSubjects(req: Request) {
  const limit = checkRateLimit(req, "subject-generate", 8, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many curriculum changes. Please wait and try again.", code: "RATE_LIMITED" }, {
      status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) },
    });
  }
  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 12_000); }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  let id: number;
  try { id = positiveId(body.id, "id") as number; }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }
  const previous = (await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.id, id), eq(subjects.userId, user.id)))
    .limit(1))[0];
  if (!previous) return NextResponse.json({ error: "Subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });

  let name: string;
  let units: number;
  let difficulty: typeof DIFFICULTIES[number];
  let color: string;
  try {
    name = body.name == null ? previous.name : textValue(body.name, "name", { required: true, max: 160 });
    units = body.units == null ? previous.units : finiteNumber(body.units, "units", { min: 1, max: 40, integer: true });
    difficulty = body.difficulty == null
      ? previous.difficulty as typeof DIFFICULTIES[number]
      : enumValue(body.difficulty, "difficulty", DIFFICULTIES);
    color = body.color == null ? previous.color : typeof body.color === "string" && COLOR_RE.test(body.color)
      ? body.color
      : (() => { throw new Error("INVALID_COLOR"); })();
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_COLOR") {
      return NextResponse.json({ error: "color must be a six-digit hex colour." }, { status: 400 });
    }
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const allSubjects = await db.select().from(subjects).where(eq(subjects.userId, user.id));
  if (allSubjects.some((subject) => subject.id !== id && subject.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return NextResponse.json({ error: "That subject already exists.", code: "DUPLICATE_SUBJECT" }, { status: 409 });
  }

  const curriculumChanged = name !== previous.name || units !== previous.units || difficulty !== previous.difficulty;
  const generated = curriculumChanged
    ? await aiGenerateTopics(name, units, difficulty, user.level, user.courseName)
    : null;

  await db.transaction(async (tx) => {
    await tx.update(subjects).set({ name, units, difficulty, color })
      .where(and(eq(subjects.id, id), eq(subjects.userId, user.id)));
    if (!generated) return;

    const existingTopics = await tx
      .select()
      .from(topics)
      .where(and(eq(topics.userId, user.id), eq(topics.subjectId, id)))
      .orderBy(asc(topics.position));
    const values = topicValues(user.id, id, generated);
    for (let index = 0; index < Math.min(existingTopics.length, values.length); index++) {
      const value = values[index];
      // Keep id/mastery/status/FSRS history while refreshing curriculum text.
      await tx.update(topics).set(value).where(and(
        eq(topics.id, existingTopics[index].id), eq(topics.userId, user.id)
      ));
    }
    if (values.length > existingTopics.length) {
      await tx.insert(topics).values(values.slice(existingTopics.length));
    } else if (existingTopics.length > values.length) {
      await tx.delete(topics).where(and(
        eq(topics.userId, user.id), eq(topics.subjectId, id), gt(topics.position, values.length - 1)
      ));
    }
  });

  const settingsRow = await getSettings(user.id);
  return stateResponse(key, dateFrom(req), await regeneratePlan(user.id, settingsRow, { fromToday: true, today: dateFrom(req) }));
}

export const DELETE = withDbGuard(deleteSubjects);

async function deleteSubjects(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  let id: number;
  try { id = positiveId(new URL(req.url).searchParams.get("id"), "id") as number; }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const deleted = await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.userId, user.id), eq(subjects.id, id)))
      .limit(1);
    if (!owned.length) return false;
    await tx.delete(topics).where(and(eq(topics.userId, user.id), eq(topics.subjectId, id)));
    await tx.delete(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.subjectId, id)));
    await tx.delete(subjects).where(and(eq(subjects.userId, user.id), eq(subjects.id, id)));
    return true;
  });
  if (!deleted) return NextResponse.json({ error: "Subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });

  const settingsRow = await getSettings(user.id);
  return stateResponse(key, dateFrom(req), await regeneratePlan(user.id, settingsRow, { fromToday: true, today: dateFrom(req) }));
}
