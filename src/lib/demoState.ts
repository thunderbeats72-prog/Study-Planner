/**
 * PREVIEW-ONLY SAMPLE DATA
 * ────────────────────────
 * This module exists so the app can be reviewed in a sandbox/preview
 * environment that has no PostgreSQL attached. It is *only* consulted from the
 * fallback branch of `fullState()` and *only* when `SPP_DEMO_DATA=1` is set in
 * the environment. In every normal deployment (any deployment with a working
 * DATABASE_URL, and any deployment without the flag) it is dead code.
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

/** Deterministic, dependency-free sample state shaped exactly like AppState. */
export function demoFallbackState(userKey: string) {
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
  type DemoTask = {
    id: number; userId: number; date: string; subjectId: number | null; topicId: number | null;
    kind: string; title: string; detail: string; plannedMinutes: number;
    actualMinutes: number; status: string; position: number;
  };
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

  return {
    ...base,
    user: { ...base.user, name: "Preview Learner", courseName: "B.Com (Honours)", streak: 6 },
    subjects,
    topics,
    tasks,
    sessions,
  } as typeof base;
}
