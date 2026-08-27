/**
 * PREVIEW-ONLY SAMPLE DATA
 * ────────────────────────
 * This module exists so the app can be reviewed in a sandbox/preview
 * environment that has no PostgreSQL attached. It is *only* consulted from the
 * fallback branch of `fullState()` and *only* when `SPP_DEMO_DATA=1` is set in
 * the environment. In every normal deployment (any deployment with a working
 * DATABASE_URL, and any deployment without the flag) it is dead code.
 *
 * The module also keeps a small IN-MEMORY mutation layer (task overrides,
 * extra tasks, session logs, settings overrides) so that in demo mode the
 * interactive API routes (clock in/out, Done/Skip/Edit, settings) return
 * healthy responses instead of 5xx — a preview visitor should be able to
 * exercise the exact flows a real learner uses, without any database.
 */

import { addDays, todayStr } from "./planner";
import { defaultFallbackState } from "./state";

export function demoDataEnabled(): boolean {
  return process.env.SPP_DEMO_DATA === "1";
}

const SUBJECTS = [
  { name: "Financial Accounting", color: "#6366f1", difficulty: "hard", units: 6, weight: 1.2 },
  { name: "Business Statistics", color: "#0ea5e9", difficulty: "medium", units: 5, weight: 1 },
  { name: "Microeconomics", color: "#f59e0b", difficulty: "medium", units: 5, weight: 1 },
  { name: "Business Law", color: "#10b981", difficulty: "easy", units: 4, weight: 0.9 },
];

const TOPIC_TITLES: Record<string, string[]> = {
  "Financial Accounting": [
    "Accounting equation & the dual aspect",
    "Journal entries and ledger posting",
    "Trial balance and rectification of errors",
    "Depreciation: SLM vs WDV",
    "Final accounts of a sole trader",
    "Bank reconciliation statements",
  ],
  "Business Statistics": [
    "Measures of central tendency",
    "Dispersion: variance & standard deviation",
    "Correlation and rank correlation",
    "Regression lines and prediction",
    "Index numbers",
  ],
  Microeconomics: [
    "Demand, supply and market equilibrium",
    "Elasticity of demand",
    "Consumer equilibrium & indifference curves",
    "Production function and returns to scale",
    "Cost curves in the short run",
  ],
  "Business Law": [
    "Essentials of a valid contract",
    "Offer, acceptance and consideration",
    "Discharge and breach of contract",
    "Sale of Goods Act — conditions & warranties",
  ],
};

const KINDS = ["learn", "practice", "revise"] as const;

type DemoTask = {
  id: number; userId: number; date: string; subjectId: number | null; topicId: number | null;
  kind: string; title: string; detail: string; plannedMinutes: number;
  actualMinutes: number; status: string; position: number;
};

type DemoSubject = {
  id: number; userId: number; name: string; color: string; difficulty: string;
  units: number; weight: number; position: number;
};

type DemoTopic = {
  id: number; userId: number; subjectId: number; unit: string; title: string;
  summary: string; objectives: string[]; prerequisites: string[]; keyConcepts: string[];
  practice: string; depth: string; sources: never[]; difficulty: string;
  estMinutes: number; position: number; mastery: number; status: string;
};

type DemoSession = {
  id: number; userId: number; subjectId: number | null; taskId: number | null;
  date: string; minutes: number; mode: string; eventId: string | null; createdAt: string;
};

// ── In-memory mutation layer (reset whenever the dev server restarts) ──────
const taskOverrides = new Map<number, Partial<DemoTask>>();
const deletedTaskIds = new Set<number>();
const extraTasks: DemoTask[] = [];
const liveSessions: DemoSession[] = [];
const settingsOverrides: Record<string, unknown> = {};
const userOverrides: Record<string, unknown> = {};
const subjectOverrides = new Map<number, Partial<DemoSubject>>();
const deletedSubjectIds = new Set<number>();
const extraSubjects: DemoSubject[] = [];
const extraTopics: DemoTopic[] = [];
let nextExtraTaskId = 2000;
let nextExtraSubjectId = 200;
let nextExtraTopicId = 2000;
let nextSessionId = 5000;

export function demoPatchTask(id: number, patch: Partial<DemoTask>): void {
  taskOverrides.set(id, { ...(taskOverrides.get(id) || {}), ...patch });
}

export function demoPatchManyTasks(ids: number[], patch: Partial<DemoTask>): void {
  for (const id of ids) demoPatchTask(id, patch);
}

export function demoDeleteTask(id: number): void {
  deletedTaskIds.add(id);
  taskOverrides.delete(id);
  for (let i = 0; i < extraTasks.length; i++) {
    if (extraTasks[i].id === id) { extraTasks.splice(i, 1); break; }
  }
}

export function demoAddTask(task: Omit<DemoTask, "id" | "userId">): DemoTask {
  const row: DemoTask = { ...task, id: nextExtraTaskId++, userId: 0 };
  extraTasks.push(row);
  return row;
}

export function demoAddSession(session: Omit<DemoSession, "id" | "userId">): DemoSession {
  const row: DemoSession = { ...session, id: nextSessionId++, userId: 0 };
  liveSessions.push(row);
  return row;
}

export function demoSessionMinutesForTask(taskId: number): number {
  return liveSessions
    .filter((s) => s.taskId === taskId)
    .reduce((a, s) => a + s.minutes, 0);
}

export function demoPatchSettings(patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (k !== "_replan") settingsOverrides[k] = v;
  }
}

export function demoPatchUser(patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) userOverrides[k] = v;
}

export function demoAddSubject(input: { name: string; color: string; difficulty: string; units: number }): DemoSubject {
  const row: DemoSubject = {
    id: nextExtraSubjectId++, userId: 0, name: input.name, color: input.color,
    difficulty: input.difficulty, units: input.units, weight: 1, position: 99,
  };
  extraSubjects.push(row);
  for (let i = 0; i < Math.min(input.units, 8); i++) {
    extraTopics.push({
      id: nextExtraTopicId++, userId: 0, subjectId: row.id,
      unit: `Unit ${i + 1}`,
      title: `${input.name} — Module ${i + 1}: core concepts`,
      summary: `Core ideas, worked examples and the exam-style questions for module ${i + 1} of ${input.name}.`,
      objectives: [`Explain the key ideas of module ${i + 1}`, "Solve two exam-level questions unaided"],
      prerequisites: i ? [`${input.name} — Module ${i}: core concepts`] : [],
      keyConcepts: ["Definition", "Worked example", "Common mistake"],
      practice: "5 practice questions with answers",
      depth: "standard",
      sources: [],
      difficulty: input.difficulty,
      estMinutes: 45,
      position: i,
      mastery: 0.2,
      status: "pending",
    });
  }
  return row;
}

export function demoPatchSubject(id: number, patch: Partial<DemoSubject>): void {
  subjectOverrides.set(id, { ...(subjectOverrides.get(id) || {}), ...patch });
}

export function demoDeleteSubject(id: number): void {
  deletedSubjectIds.add(id);
  subjectOverrides.delete(id);
  for (let i = 0; i < extraSubjects.length; i++) {
    if (extraSubjects[i].id === id) { extraSubjects.splice(i, 1); break; }
  }
}

/** Reset everything a "Re-run Setup" would wipe. */
export function demoResetMutations(): void {
  taskOverrides.clear();
  deletedTaskIds.clear();
  extraTasks.length = 0;
  liveSessions.length = 0;
  subjectOverrides.clear();
  deletedSubjectIds.clear();
  extraSubjects.length = 0;
  extraTopics.length = 0;
  nextExtraTaskId = 2000;
  nextExtraSubjectId = 200;
  nextExtraTopicId = 2000;
  nextSessionId = 5000;
}

export type DemoState = Omit<
  ReturnType<typeof defaultFallbackState>,
  "tasks" | "sessions" | "subjects" | "topics"
> & {
  tasks: DemoTask[];
  sessions: DemoSession[];
  subjects: DemoSubject[];
  topics: DemoTopic[];
};

/** Deterministic, dependency-free sample state shaped exactly like AppState. */
export function demoFallbackState(userKey: string): DemoState {
  const base = defaultFallbackState(userKey);
  const today = todayStr();

  const subjects = SUBJECTS.map((s, i) => ({
    id: i + 1,
    userId: 0,
    name: s.name,
    color: s.color,
    difficulty: s.difficulty,
    units: s.units,
    weight: s.weight,
    position: i,
  }));

  // In-memory subject mutations: deleted subjects vanish (with their topics
  // and tasks), edited subjects keep their changes, added subjects appear.
  const liveSubjects = subjects
    .filter((s) => !deletedSubjectIds.has(s.id))
    .map((s) => (subjectOverrides.has(s.id) ? { ...s, ...subjectOverrides.get(s.id) } : s));
  for (const s of extraSubjects) {
    liveSubjects.push(subjectOverrides.has(s.id) ? { ...s, ...subjectOverrides.get(s.id) } : s);
  }
  const liveSubjectIds = new Set(liveSubjects.map((s) => s.id));

  let topicId = 0;
  const topics = subjects.flatMap((subject) =>
    (TOPIC_TITLES[subject.name] || []).map((title, index) => ({
      id: ++topicId,
      userId: 0,
      subjectId: subject.id,
      unit: `Unit ${index + 1}`,
      title,
      summary: `${title} — core ideas, worked examples and the exam-style questions that come from this section.`,
      objectives: [`Explain ${title.toLowerCase()}`, "Solve two exam-level questions unaided"],
      prerequisites: index ? [(TOPIC_TITLES[subject.name] || [])[index - 1]] : [],
      keyConcepts: ["Definition", "Worked example", "Common mistake"],
      practice: "5 practice questions with answers",
      depth: "standard",
      sources: [],
      difficulty: subject.difficulty,
      estMinutes: 45,
      position: index,
      mastery: index < 2 ? 0.7 : 0.2,
      status: index < 2 ? "done" : "pending",
    })),
  );

  let taskId = 0;
  const tasks: DemoTask[] = [];
  // Two days behind (overdue), today, and the next six days.
  for (let offset = -2; offset <= 6; offset++) {
    const date = addDays(today, offset);
    const count = offset === 0 ? 4 : 3;
    for (let i = 0; i < count; i++) {
      if (offset === 6 && i === 2) {
        tasks.push({
          id: ++taskId,
          userId: 0,
          date,
          subjectId: null,
          topicId: null,
          kind: "mock",
          title: "Weekly Checkpoint · Test #1",
          detail: "Mixed test on everything covered in the last 7 study days. Time it strictly, then log every mistake in your error notebook.",
          plannedMinutes: 40,
          actualMinutes: 0,
          status: "pending",
          position: 2,
        });
        continue;
      }
      const topic = topics[(Math.abs(offset) * 3 + i * 2) % topics.length];
      const subject = subjects.find((s) => s.id === topic.subjectId)!;
      const kind = KINDS[(offset + i + 3) % KINDS.length];
      tasks.push({
        id: ++taskId,
        userId: 0,
        date,
        subjectId: subject.id,
        topicId: topic.id,
        kind,
        title: `${subject.name} · ${topic.title}`,
        detail: topic.summary,
        plannedMinutes: kind === "learn" ? 45 : kind === "practice" ? 35 : 25,
        actualMinutes: 0,
        status: offset < 0 ? (i === 0 ? "done" : "pending") : offset === 0 && i === 0 ? "done" : "pending",
        position: i,
      });
    }
  }

  const sessions = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    userId: 0,
    subjectId: subjects[i % subjects.length].id,
    taskId: null,
    date: addDays(today, -i),
    minutes: 35 + ((i * 13) % 60),
    mode: "focus",
    eventId: null,
    createdAt: new Date().toISOString(),
  }));

  // Apply the in-memory mutation layer: every API interaction a preview
  // visitor makes (clock in, Done, Edit, added tasks, theme change) is
  // reflected here so the next state response reflects it.
  const mutatedTasks = tasks
    .filter((t) => !deletedTaskIds.has(t.id) && (t.subjectId == null || liveSubjectIds.has(t.subjectId)))
    .map((t) => (taskOverrides.has(t.id) ? { ...t, ...taskOverrides.get(t.id) } : t));
  for (const t of [...extraTasks]) {
    mutatedTasks.push(taskOverrides.has(t.id) ? { ...t, ...taskOverrides.get(t.id) } : t);
  }

  const liveTopics = [
    ...topics.filter((t) => liveSubjectIds.has(t.subjectId)),
    ...extraTopics.filter((t) => liveSubjectIds.has(t.subjectId)),
  ];

  const allSessions = [...sessions, ...liveSessions];

  return {
    ...base,
    user: { ...base.user, name: "Preview Learner", courseName: "B.Com (Honours)", streak: 6, ...userOverrides },
    settings: { ...base.settings, ...settingsOverrides },
    subjects: liveSubjects,
    topics: liveTopics,
    tasks: mutatedTasks,
    sessions: allSessions,
  } as DemoState;
}
