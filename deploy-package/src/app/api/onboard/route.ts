import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, settings, subjects, topics, tasks, sessions, messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildContext, fullState, getOrCreateUser, keyFrom } from "@/lib/state";
import { regeneratePlan, synthesiseTopicsForSubject } from "@/lib/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  name: string;
  level: string;
  course: string;
  courseName: string;
  year: string;
  institution?: string;
  specialisation?: string;
  board?: string;
  attempt?: string;
  priorPrep?: string;
  subjects: { name: string; units: number; difficulty: string; color: string }[];
  startDate: string;
  examDate: string;
  dailyHours: number;
  subjectsPerDay: number;
  studyDays: string;
  bufferDays: number;
  planMode: string;
  studyStyle: string;
  weakSubject: string;
  revisionWeeks: number;
};

export async function POST(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const b = (await req.json()) as Body;

  // ── HARD RESET: a re-run of setup starts from absolute zero. ──
  // Previously only tasks/topics/subjects were deleted, so old sessions
  // (logged minutes), chat history, mastery and streak bled into the
  // "new" course. Everything user-scoped except identity + preferences
  // is wiped here, in FK-safe order.
  await db.delete(tasks).where(eq(tasks.userId, user.id));
  await db.delete(topics).where(eq(topics.userId, user.id));
  await db.delete(subjects).where(eq(subjects.userId, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await db.delete(messages).where(eq(messages.userId, user.id));

  await db
    .update(users)
    .set({
      name: b.name?.trim() || "Learner",
      level: b.level || "ug",
      course: b.course || "custom",
      courseName: b.courseName || "Custom Course",
      year: b.year || "1",
      onboarded: true,
      // fresh course = fresh history metrics
      streak: 0,
      lastStudyDate: null,
    })
    .where(eq(users.id, user.id));

  const settingsPayload = {
    startDate: b.startDate,
    examDate: b.examDate,
    dailyHours: Number(b.dailyHours) || 2,
    subjectsPerDay: Number(b.subjectsPerDay) || 2,
    studyDays: b.studyDays || "all",
    bufferDays: Number(b.bufferDays) || 0,
    planMode: b.planMode || "syllabus",
    studyStyle: b.studyStyle || "balanced",
    weakSubject: "none",
    revisionWeeks: Number(b.revisionWeeks) || 0,
  };

  const created: { id: number; wizardIndex: number }[] = [];
  for (let i = 0; i < b.subjects.length; i++) {
    const s = b.subjects[i];
    const ins = await db
      .insert(subjects)
      .values({
        userId: user.id,
        name: s.name,
        units: Math.max(1, Math.min(40, Number(s.units) || 6)),
        difficulty: s.difficulty || "Medium",
        color: s.color || "#6366f1",
        position: i,
      })
      .returning();
    created.push({ id: ins[0].id, wizardIndex: i });
  }

  // AI curriculum synthesis (parallel, bounded)
  await Promise.all(
    created.map((c) => {
      const s = b.subjects[c.wizardIndex];
      return synthesiseTopicsForSubject(
        user.id,
        c.id,
        s.name,
        Math.max(1, Math.min(40, Number(s.units) || 6)),
        s.difficulty || "Medium",
        b.level,
        b.courseName
      );
    })
  );

  // map weak subject (wizard sends index-based id)
  let weak = "none";
  const wi = Number(b.weakSubject);
  if (!Number.isNaN(wi) && wi >= 0 && created[wi]) weak = String(created[wi].id);

  await db
    .update(settings)
    .set({ ...settingsPayload, weakSubject: weak })
    .where(eq(settings.userId, user.id));

  const stats = await regeneratePlan(user.id, { ...settingsPayload, weakSubject: weak });
  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s), stats });
}
