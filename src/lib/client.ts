"use client";

export type UserRow = {
  id: number; userKey: string; name: string; level: string; course: string;
  courseName: string; year: string; onboarded: boolean; streak: number; lastStudyDate: string | null;
};
export type SettingsRow = {
  id: number; userId: number; startDate: string; examDate: string; dailyHours: number;
  subjectsPerDay: number; studyDays: string; bufferDays: number; planMode: string;
  studyStyle: string; weakSubject: string; revisionWeeks: number; theme: string;
  pomodoro: number; shortBreak: number; longBreak: number; confetti: boolean; sounds: boolean;
};
export type SubjectRow = {
  id: number; userId: number; name: string; color: string; difficulty: string;
  units: number; weight: number; position: number;
};
export type TopicRow = {
  id: number; userId: number; subjectId: number; unit: string; title: string; summary: string;
  objectives: string[]; difficulty: string; estMinutes: number; position: number;
  mastery: number; status: string;
};
export type TaskRow = {
  id: number; userId: number; date: string; subjectId: number | null; topicId: number | null;
  kind: string; title: string; detail: string; plannedMinutes: number; actualMinutes: number;
  status: string; position: number;
};
export type SessionRow = {
  id: number; userId: number; subjectId: number | null; taskId: number | null;
  date: string; minutes: number; mode: string; createdAt: string;
};
export type MessageRow = { id: number; userId: number; role: string; content: string; createdAt: string };
export type Ctx = {
  name: string; courseName: string; level: string; examDate: string; daysLeft: number;
  dailyHours: number; progressPct: number; streak: number; hoursThisWeek: number; overdue: number;
  subjects: { id: number; name: string; difficulty: string; done: number; total: number }[];
  today: { title: string; kind: string; minutes: number; status: string }[];
};
export type AppState = {
  user: UserRow; settings: SettingsRow; subjects: SubjectRow[]; topics: TopicRow[];
  tasks: TaskRow[]; sessions: SessionRow[]; messages: MessageRow[]; context: Ctx;
  aiProvider?: string | null; stats?: PlanStats | null;
};
export type PlanStats = {
  studyDays: number; learnDays: number; revisionDays: number; bufferDays: number;
  totalTopics: number; scheduledTopics: number; projectedFinish: string | null;
  dailyMinutes: number; requiredMinutes: number; feasible: boolean; loadRatio: number;
};

export function userKey(): string {
  if (typeof window === "undefined") return "anon";
  let k = localStorage.getItem("spp-user-key");
  if (!k) {
    k = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("spp-user-key", k);
  }
  return k;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", "x-user-key": userKey(), ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
export const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const addDays = (s: string, n: number) => {
  const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d);
};
export const today = () => fmtDate(new Date());
export const dayDiff = (a: string, b: string) =>
  Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
export const prettyDate = (s: string) =>
  parseDate(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
export const prettyLong = (s: string) =>
  parseDate(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function escapeHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function mdToHtml(md: string): string {
  const esc = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/^### (.*)$/gm, "<strong>$1</strong>")
    .replace(/^## (.*)$/gm, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

export const KIND_META: Record<string, { label: string; color: string }> = {
  learn: { label: "Lesson", color: "#6366f1" },
  revise: { label: "Recall", color: "#f59e0b" },
  practice: { label: "Practice", color: "#10b981" },
  mock: { label: "Test", color: "#ef4444" },
  buffer: { label: "Buffer", color: "#64748b" },
};

export const THEMES = [
  { id: "silver-lavender", label: "Silver Lavender" },
  { id: "mint", label: "Mint Fresh" },
  { id: "sunset", label: "Sunset" },
  { id: "dark", label: "Midnight" },
  { id: "obsidian", label: "Obsidian" },
  { id: "nebula", label: "Nebula" },
];
