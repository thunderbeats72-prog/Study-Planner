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
export type CurriculumSourceRow = {
  title: string; publisher: string; type: "Official syllabus" | "Primary text" | "Reference";
  url?: string; note?: string; section?: string;
};
export type TopicRow = {
  id: number; userId: number; subjectId: number; unit: string; title: string; summary: string;
  objectives: string[]; prerequisites: string[]; keyConcepts: string[]; practice: string;
  depth: string; sources: CurriculumSourceRow[]; difficulty: string; estMinutes: number; position: number;
  mastery: number; status: string;
};
export type TaskRow = {
  id: number; userId: number; date: string; subjectId: number | null; topicId: number | null;
  kind: string; title: string; detail: string; plannedMinutes: number; actualMinutes: number;
  status: string; position: number;
};
export type SessionRow = {
  id: number; userId: number; subjectId: number | null; taskId: number | null;
  date: string; minutes: number; mode: string; eventId?: string | null; createdAt: string;
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

const USER_KEY_STORAGE = "spp-user-key";
const USER_KEY_COOKIE = "spp_user_key";
const USER_KEY_RE = /^u_[A-Za-z0-9_-]{12,120}$/;
let volatileUserKey = "";

function generatedUserKey(): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `u_${random}`;
}

/**
 * A stable anonymous account key. localStorage can throw in private/locked
 * browser modes, so a first-party cookie and an in-memory value provide safe
 * fallbacks instead of making every API request crash before it starts.
 */
export function userKey(): string {
  if (typeof window === "undefined") return "anon";
  if (USER_KEY_RE.test(volatileUserKey)) return volatileUserKey;

  let stored = "";
  try { stored = localStorage.getItem(USER_KEY_STORAGE) || ""; } catch { /* storage is unavailable */ }
  if (!USER_KEY_RE.test(stored)) {
    try {
      const cookie = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${USER_KEY_COOKIE}=`));
      stored = cookie ? decodeURIComponent(cookie.slice(USER_KEY_COOKIE.length + 1)) : "";
    } catch { /* cookies are unavailable */ }
  }

  volatileUserKey = USER_KEY_RE.test(stored) ? stored : generatedUserKey();
  try { localStorage.setItem(USER_KEY_STORAGE, volatileUserKey); } catch { /* use cookie/memory fallback */ }
  try {
    document.cookie = `${USER_KEY_COOKIE}=${encodeURIComponent(volatileUserKey)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  } catch { /* memory fallback still works for this page */ }
  return volatileUserKey;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiRequestInit = RequestInit & { timeoutMs?: number };

export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = 30_000, signal: callerSignal, ...requestInit } = init;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);

  const headers = new Headers(init.headers);
  headers.set("x-user-key", userKey());
  const localNow = new Date();
  headers.set(
    "x-local-date",
    `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`
  );
  if (requestInit.body != null && !(requestInit.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  try {
    const res = await fetch(path, { ...requestInit, headers, signal: controller.signal });
    const raw = await res.text();
    let payload: unknown = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = raw; }
    }
    if (!res.ok) {
      const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
      const message = typeof body?.error === "string"
        ? body.error
        : typeof body?.message === "string"
          ? body.message
          : `Request failed (${res.status}).`;
      throw new ApiError(
        message,
        res.status,
        typeof body?.code === "string" ? body.code : undefined,
        res.status === 408 || res.status === 429 || res.status >= 500
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError("The request took too long. Please try again.", 408, "REQUEST_TIMEOUT", true);
    }
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0, "NETWORK_ERROR", true);
  } finally {
    window.clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
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
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function mdToHtml(md: string): string {
  // Escape first, then add only the tiny, explicit markup subset below.
  // This function feeds dangerouslySetInnerHTML, so unknown HTML and unsafe
  // URL protocols must remain inert text.
  const esc = escapeHtml(md);

  const safeLink = (_match: string, label: string, href: string): string => {
    const normalized = href.trim();
    if (!/^(https?:\/\/|mailto:)/i.test(normalized)) return label;
    const external = /^https?:\/\//i.test(normalized);
    return `<a href="${normalized}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
  };

  // Inline formatting applied per line (after escaping).
  const inline = (s: string): string =>
    s
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, safeLink)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/^#{1,3}\s*(.*)$/, "<strong>$1</strong>");

  const lines = esc.split("\n");
  const out: string[] = [];
  let textBuf: string[] = [];
  let listType: "ol" | "ul" | null = null;
  let inCode = false;
  let codeBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length) { out.push(textBuf.map(inline).join("<br/>")); textBuf = []; }
  };
  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      closeList();
      flushText();
      if (inCode) {
        out.push(`<pre><code>${codeBuf.join("\n")}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ol) {
      flushText();
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${inline(ol[2])}</li>`);
    } else if (ul) {
      flushText();
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else {
      closeList();
      textBuf.push(line);
    }
  }
  if (inCode) { flushText(); out.push(`<pre><code>${codeBuf.join("\n")}</code></pre>`); }
  closeList();
  flushText();
  return out.join("");
}

export const KIND_META: Record<string, { label: string; color: string }> = {
  learn: { label: "Lesson", color: "#6366f1" },
  revise: { label: "Recall", color: "#f59e0b" },
  practice: { label: "Practice", color: "#10b981" },
  mock: { label: "Test", color: "#ef4444" },
  buffer: { label: "Buffer", color: "#64748b" },
};

/**
 * Canonical form for weekly checkpoint titles.
 *
 * Older scheduler builds wrote `Weekly Checkpoint Test #0` (zero-based,
 * no middle dot) and a few intermediate variants exist in real databases
 * (e.g. `Weekly Checkpoint · Test #0`). Any of those should render as
 * `Weekly Checkpoint · Test #1` — the same 1-based, dotted form the
 * current scheduler emits — so no user ever sees a "Test #0" again.
 * Anything that is not a checkpoint title is returned untouched.
 */
export function normalizeCheckpointTitle(title: string): string {
  const match = title.match(/^Weekly Checkpoint\s*(?:·\s*)?(?:Test\s*)?#(\d+)\s*$/i);
  if (!match) return title;
  const number = Math.max(1, Number(match[1]));
  return `Weekly Checkpoint · Test #${number}`;
}

export const THEMES = [
  { id: "default", label: "Default" },
  { id: "silver-lavender", label: "Silver Lavender" },
  { id: "mint", label: "Mint Fresh" },
  { id: "sunset", label: "Sunset" },
  { id: "dark", label: "Midnight" },
  { id: "obsidian", label: "Obsidian" },
  { id: "nebula", label: "Nebula" },
];
