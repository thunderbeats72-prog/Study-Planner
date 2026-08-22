import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings, subjects, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { buildContext, dateFrom, fullState, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import { regeneratePlan } from "@/lib/generate";
import {
  assertDateWindow, booleanValue, enumValue, finiteNumber, isoDate,
  readJsonObject, textValue, validationPayload,
} from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STUDY_DAYS = ["all", "6days", "weekdays"] as const;
const PLAN_MODES = ["syllabus", "revision", "mock"] as const;
const STUDY_STYLES = ["balanced", "theory", "practice"] as const;
const THEMES = ["silver-lavender", "mint", "sunset", "dark", "obsidian", "nebula"] as const;

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 16_000); }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const key = keyFrom(req);
  const localDate = dateFrom(req);
  const user = await getOrCreateUser(key);
  const current = await getSettings(user.id);
  const patch: Record<string, unknown> = {};
  let newName: string | null = null;

  try {
    if (body.name != null) {
      newName = textValue(body.name, "name", { required: true, max: 100 });
    }
    if (body.startDate != null) patch.startDate = isoDate(body.startDate, "startDate");
    if (body.examDate != null) patch.examDate = isoDate(body.examDate, "examDate");
    if (body.dailyHours != null) patch.dailyHours = finiteNumber(body.dailyHours, "dailyHours", { min: 0.25, max: 16 });
    if (body.subjectsPerDay != null) patch.subjectsPerDay = finiteNumber(body.subjectsPerDay, "subjectsPerDay", { min: 1, max: 10, integer: true });
    if (body.studyDays != null) patch.studyDays = enumValue(body.studyDays, "studyDays", STUDY_DAYS);
    if (body.bufferDays != null) patch.bufferDays = finiteNumber(body.bufferDays, "bufferDays", { min: 0, max: 90, integer: true });
    if (body.planMode != null) patch.planMode = enumValue(body.planMode, "planMode", PLAN_MODES);
    if (body.studyStyle != null) patch.studyStyle = enumValue(body.studyStyle, "studyStyle", STUDY_STYLES);
    if (body.revisionWeeks != null) patch.revisionWeeks = finiteNumber(body.revisionWeeks, "revisionWeeks", { min: 0, max: 52, integer: true });
    if (body.theme != null) patch.theme = enumValue(body.theme, "theme", THEMES);
    if (body.pomodoro != null) patch.pomodoro = finiteNumber(body.pomodoro, "pomodoro", { min: 1, max: 180, integer: true });
    if (body.shortBreak != null) patch.shortBreak = finiteNumber(body.shortBreak, "shortBreak", { min: 1, max: 60, integer: true });
    if (body.longBreak != null) patch.longBreak = finiteNumber(body.longBreak, "longBreak", { min: 1, max: 120, integer: true });
    if (body.confetti != null) patch.confetti = booleanValue(body.confetti, "confetti");
    if (body.sounds != null) patch.sounds = booleanValue(body.sounds, "sounds");

    if (body.weakSubject != null) {
      const weak = String(body.weakSubject);
      if (weak === "none") patch.weakSubject = "none";
      else {
        const id = finiteNumber(weak, "weakSubject", { min: 1, max: 2_147_483_647, integer: true });
        const owned = await db
          .select({ id: subjects.id })
          .from(subjects)
          .where(and(eq(subjects.id, id), eq(subjects.userId, user.id)))
          .limit(1);
        if (!owned.length) throw new Error("WEAK_SUBJECT_NOT_FOUND");
        patch.weakSubject = String(id);
      }
    }

    const startDate = String(patch.startDate || current.startDate);
    const examDate = String(patch.examDate || current.examDate);
    assertDateWindow(startDate, examDate);
  } catch (error) {
    if (error instanceof Error && error.message === "WEAK_SUBJECT_NOT_FOUND") {
      return NextResponse.json({ error: "Weak subject not found.", code: "SUBJECT_NOT_FOUND" }, { status: 404 });
    }
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  if (newName) await db.update(users).set({ name: newName }).where(eq(users.id, user.id));
  if (Object.keys(patch).length) {
    await db.update(settings).set(patch).where(eq(settings.userId, user.id));
  }

  const shouldReplan = body._replan === true;
  let stats = null;
  if (shouldReplan) {
    const next = await getSettings(user.id);
    try {
      stats = await regeneratePlan(user.id, next, { fromToday: true, today: localDate });
    } catch (error) {
      // Restore schedule-affecting settings if the atomic task replacement
      // failed; the learner keeps a coherent old plan rather than mixed state.
      await db.update(settings).set({
        startDate: current.startDate,
        examDate: current.examDate,
        dailyHours: current.dailyHours,
        subjectsPerDay: current.subjectsPerDay,
        studyDays: current.studyDays,
        bufferDays: current.bufferDays,
        planMode: current.planMode,
        studyStyle: current.studyStyle,
        weakSubject: current.weakSubject,
        revisionWeeks: current.revisionWeeks,
      }).where(eq(settings.userId, user.id));
      throw error;
    }
  }

  const state = await fullState(key);
  return NextResponse.json({ ...state, context: buildContext(state, localDate), stats });
}
