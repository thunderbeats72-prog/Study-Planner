/**
 * THE DIGEST - what the email actually says.
 * ──────────────────────────────────────────
 * Every number and recommendation in this email comes from the SAME logic
 * the app itself uses, never a re-implementation:
 *
 *   best next task      src/lib/prioritization.ts  (nextAction)
 *   overdue backlog     src/lib/recovery.ts        (backlogFor)
 *   recovery suggestion src/lib/recovery.ts        (suggestedRecovery on the
 *                                                overload the learner's own
 *                                                daily hours leave)
 *
 * This module is PURE: it receives plain rows plus the learner's local
 * date and returns { subject, text, html }. The subject changes every day
 * ("Monday: 3 lessons, start with Cost Accounting") because a static
 * subject is what teaches a filter - and a spam folder - to ignore you.
 */

import type { TaskRow } from "./client";
import { addDays, diffDays } from "./planner";
import { nextAction, reasonLabel } from "./prioritization";
import { backlogFor, dailyCapacityMinutes, suggestedRecovery, todayOverload } from "./recovery";

export type DigestInput = {
  /** The learner's display name ("Nila"). */
  name: string;
  /** The local date this digest belongs to, YYYY-MM-DD. */
  today: string;
  /** Long weekday of `today` after locale-neutral maths ("Monday"). */
  weekday: string;
  tasks: readonly TaskRow[];
  subjects: readonly { id: number; name: string }[];
  sessions: readonly { date: string; minutes: number }[];
  dailyHours: number;
  examDate: string | null;
  streak: number;
  /** Footer links. */
  appUrl: string;
  unsubscribeUrl: string;
};

export type WeeklyInput = DigestInput & {
  /** Sessions across the seven local days ending yesterday. */
  weekSessions: readonly { date: string; minutes: number }[];
  weekStart: string;
  weekEnd: string;
};

export type RenderedEmail = { subject: string; text: string; html: string };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Locale-proof weekday name for a YYYY-MM-DD date. */
export function weekdayName(dateStr: string): string {
  return WEEKDAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

/* One calm line - no emoji, no cheerleader voice, deterministic per date. */
const ENCOURAGEMENT = [
  "Small steps, same seat, every day. That is the whole trick.",
  "Finish the first one. The rest take care of themselves.",
  "An honest hour beats a heroic day that never starts.",
  "You do not need a perfect day. You need today.",
  "Open the book for ten minutes. Momentum does the rest.",
  "Revision done badly still beats revision postponed.",
  "Missed days are already paid for. Today is new.",
];

export function encouragementFor(dateStr: string): string {
  const days = Math.floor(new Date(`${dateStr}T12:00:00Z`).getTime() / 86_400_000);
  return ENCOURAGEMENT[Math.abs(days) % ENCOURAGEMENT.length];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function minLabel(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function subjectName(input: DigestInput, subjectId: number | null): string {
  return input.subjects.find((subject) => subject.id === subjectId)?.name || "";
}

/** The one-line, never-templated subject: weekday, count, first task. */
export function digestSubject(input: DigestInput): string {
  const todaysPending = input.tasks.filter((task) => task.date === input.today && task.status === "pending");
  const count = todaysPending.length;
  const first = nextAction(input.tasks, input.today).now;
  if (count === 0 && !first) return `${input.weekday}: rest day on the plan`;
  if (count === 0) return `${input.weekday}: catch up - ${first!.title.slice(0, 48)}`;
  const lessonWord = count === 1 ? "lesson" : "lessons";
  if (first) return `${input.weekday}: ${count} ${lessonWord}, start with ${first.title.slice(0, 48)}`;
  return `${input.weekday}: ${count} ${lessonWord} planned`;
}

/** The structured facts, one place, so text and html can never disagree. */
export function digestFacts(input: DigestInput) {
  const capacity = dailyCapacityMinutes({ dailyHours: input.dailyHours });
  const backlog = backlogFor(input.tasks, input.today);
  const overload = todayOverload(input.tasks, input.today, capacity);
  const daysLeft = input.examDate ? diffDays(input.today, input.examDate) : null;
  const recovery = suggestedRecovery(overload, Math.max(1, daysLeft ?? 7));
  const now = nextAction(input.tasks, input.today).now;
  const todays = input.tasks.filter((task) => task.date === input.today && task.status === "pending");
  const plannedMinutes = todays.reduce((sum, task) => sum + task.plannedMinutes, 0);
  const yesterday = addDays(input.today, -1);
  const yesterdayMinutes = input.sessions
    .filter((session) => session.date === yesterday)
    .reduce((sum, session) => sum + session.minutes, 0);
  return {
    backlog,
    overloadDays: daysLeft,
    recovery,
    now,
    todays,
    plannedMinutes,
    daysLeft,
    yesterdayMinutes,
  };
}

/* ── text rendering ────────────────────────────────────────────────── */

export function digestText(input: DigestInput): string {
  const f = digestFacts(input);
  const lines: string[] = [];
  lines.push(`${input.weekday}, ${input.today}`, "");
  lines.push(`Hi ${input.name},`);
  lines.push("");
  if (f.now) {
    const subject = subjectName(input, f.now.subjectId);
    lines.push(
      `Start here: ${f.now.title}${subject ? ` (${subject})` : ""} - ${minLabel(f.now.plannedMinutes)}, ${reasonLabel(f.now.reason).toLowerCase()}.`,
    );
  } else {
    lines.push("Nothing is due right now. The plan is clear.");
  }
  lines.push("");
  if (f.todays.length) {
    lines.push(`Today: ${f.todays.length} lesson${f.todays.length === 1 ? "" : "s"}, ${minLabel(f.plannedMinutes)} planned:`);
    for (const task of f.todays) {
      const subject = subjectName(input, task.subjectId);
      lines.push(`  - ${task.title}${subject ? ` - ${subject}` : ""}, ${minLabel(task.plannedMinutes)}`);
    }
  } else {
    lines.push("Today: no lessons planned - a rest day or a catch-up day.");
  }
  if (f.backlog.count > 0) {
    lines.push("");
    lines.push(`Overdue: ${f.backlog.count} unfinished task${f.backlog.count === 1 ? "" : "s"} (${minLabel(f.backlog.minutes)}).`);
    if (f.recovery) {
      lines.push(
        `Suggested recovery: +${f.recovery.minutesPerDay} min/day for ${f.recovery.days} day${f.recovery.days === 1 ? "" : "s"} brings the backlog back without cramming.`,
      );
    } else {
      lines.push("They fit with today's plan - no extra pace needed.");
    }
  }
  lines.push("");
  const status: string[] = [];
  status.push(`Streak: ${input.streak} day${input.streak === 1 ? "" : "s"}`);
  status.push(`Yesterday: ${f.yesterdayMinutes > 0 ? minLabel(f.yesterdayMinutes) : "nothing logged"}`);
  if (f.daysLeft != null && f.daysLeft >= 0) status.push(`${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"} to the exam`);
  lines.push(status.join(" · "));
  lines.push("");
  lines.push(encouragementFor(input.today));
  lines.push("", "Open the planner: " + input.appUrl);
  lines.push("", "-");
  lines.push("You receive this once a day because the daily digest is on for your account.");
  lines.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  return lines.join("\n");
}

/* ── html rendering ────────────────────────────────────────────────── */

const S = {
  body: "margin:0;padding:0;background:#f6f5fa;",
  wrap: "max-width:560px;margin:0 auto;padding:24px 16px;",
  card: "background:#ffffff;border:1px solid #e6e3f0;border-radius:12px;padding:20px 22px;",
  h1: "margin:0 0 4px;font-size:18px;line-height:1.3;color:#18161f;",
  sub: "margin:0 0 16px;font-size:13px;color:#6d6a7c;",
  h2: "margin:18px 0 6px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6d6a7c;",
  item: "margin:4px 0;font-size:14px;line-height:1.5;color:#2a2733;",
  strong: "color:#18161f;font-weight:600;",
  footer: "margin-top:20px;font-size:12px;line-height:1.6;color:#8a8796;",
  link: "color:#5b4bd5;text-decoration:underline;",
} as const;

export function digestHtml(input: DigestInput): string {
  const f = digestFacts(input);
  const subject = digestSubject(input);
  const esc = escapeHtml;
  const rows: string[] = [];

  const startBlock = f.now
    ? `<p style="${S.item}"><span style="${S.strong}">Start here:</span> ${esc(f.now.title)}` +
      `${subjectName(input, f.now.subjectId) ? ` <span style="color:#6d6a7c">(${esc(subjectName(input, f.now.subjectId))})</span>` : ""}` +
      ` - ${esc(minLabel(f.now.plannedMinutes))}, ${esc(reasonLabel(f.now.reason).toLowerCase())}.</p>`
    : `<p style="${S.item}">Nothing is due right now. The plan is clear.</p>`;

  const todayBlock = f.todays.length
    ? `<h2 style="${S.h2}">Today - ${f.todays.length} lesson${f.todays.length === 1 ? "" : "s"}, ${minLabel(f.plannedMinutes)} planned</h2>` +
      f.todays
        .map((task) => {
          const subject = subjectName(input, task.subjectId);
          return `<p style="${S.item}">${esc(task.title)}${subject ? ` <span style="color:#6d6a7c">- ${esc(subject)}</span>` : ""}, ${esc(minLabel(task.plannedMinutes))}</p>`;
        })
        .join("")
    : `<h2 style="${S.h2}">Today</h2><p style="${S.item}">No lessons planned - a rest day or a catch-up day.</p>`;

  const backlogBlock =
    f.backlog.count > 0
      ? `<h2 style="${S.h2}">Overdue</h2>` +
        `<p style="${S.item}">${f.backlog.count} unfinished task${f.backlog.count === 1 ? "" : "s"} (${minLabel(f.backlog.minutes)}).` +
        (f.recovery
          ? `<br/><span style="color:#6d6a7c">Suggested recovery: +${f.recovery.minutesPerDay} min/day for ${f.recovery.days} day${f.recovery.days === 1 ? "" : "s"}, no cramming.</span>`
          : `<br/><span style="color:#6d6a7c">They fit with today's plan - no extra pace needed.</span>`) +
        `</p>`
      : "";

  const statusParts = [
    `Streak: ${input.streak} day${input.streak === 1 ? "" : "s"}`,
    `Yesterday: ${f.yesterdayMinutes > 0 ? minLabel(f.yesterdayMinutes) : "nothing logged"}`,
  ];
  if (f.daysLeft != null && f.daysLeft >= 0) {
    statusParts.push(`${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"} to the exam`);
  }

  rows.push(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>`,
    `<title>${esc(subject)}</title></head>`,
    `<body style="${S.body}"><div style="${S.wrap}"><div style="${S.card}">`,
    `<h1 style="${S.h1}">${esc(subject)}</h1>`,
    `<p style="${S.sub}">For ${esc(input.name)} - ${esc(input.today)}</p>`,
    startBlock,
    todayBlock,
    backlogBlock,
    `<h2 style="${S.h2}">Where you stand</h2>`,
    `<p style="${S.item}">${esc(statusParts.join("  ·  "))}</p>`,
    `<p style="${S.item}"><span style="color:#6d6a7c">${esc(encouragementFor(input.today))}</span></p>`,
    `<p style="${S.item}"><a style="${S.link}" href="${esc(input.appUrl)}">Open the planner</a></p>`,
    `<p style="${S.footer}">You receive this once a day because the daily digest is on for your account.<br/>` +
      `<a style="${S.link}" href="${esc(input.unsubscribeUrl)}">Unsubscribe from these emails</a></p>`,
    `</div></div></body></html>`,
  );
  return rows.join("");
}

/* ── the weekly summary (Sunday evening, separate opt-in) ──────────── */

export function weeklySubject(input: WeeklyInput): string {
  return `Your week in review - ${input.weekStart} to ${input.weekEnd}`;
}

export function weeklyText(input: WeeklyInput): string {
  const minutes = input.weekSessions.reduce((sum, session) => sum + session.minutes, 0);
  const days = new Set(input.weekSessions.filter((session) => session.minutes > 0).map((session) => session.date)).size;
  const done = input.tasks.filter(
    (task) => task.date >= input.weekStart && task.date <= input.weekEnd && task.status === "done",
  ).length;
  const pendingNext = input.tasks
    .filter((task) => task.status === "pending" && task.date > input.weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position)
    .slice(0, 3);
  const f = digestFacts(input);
  const lines: string[] = [];
  lines.push(`Your week, ${input.weekStart} to ${input.weekEnd}`, "");
  lines.push(`Hi ${input.name},`, "");
  lines.push(`Logged: ${minLabel(minutes)} across ${days} study day${days === 1 ? "" : "s"}.`);
  lines.push(`Finished: ${done} task${done === 1 ? "" : "s"}.`);
  lines.push(`Streak: ${input.streak} day${input.streak === 1 ? "" : "s"}.`);
  if (f.daysLeft != null && f.daysLeft >= 0) lines.push(`${f.daysLeft} days to the exam.`);
  if (f.backlog.count > 0) {
    lines.push("", `Still overdue: ${f.backlog.count} task${f.backlog.count === 1 ? "" : "s"} (${minLabel(f.backlog.minutes)}).`);
    if (f.recovery) lines.push(`Suggested recovery: +${f.recovery.minutesPerDay} min/day for ${f.recovery.days} day${f.recovery.days === 1 ? "" : "s"}.`);
  }
  if (pendingNext.length) {
    lines.push("", "Coming up:");
    for (const task of pendingNext) lines.push(`  - ${task.date}: ${task.title}, ${minLabel(task.plannedMinutes)}`);
  }
  lines.push("", encouragementFor(input.today), "", "Open the planner: " + input.appUrl);
  lines.push("", "-", "You receive this on Sunday evenings because the weekly summary is on for your account.");
  lines.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  return lines.join("\n");
}

export function weeklyHtml(input: WeeklyInput): string {
  const minutes = input.weekSessions.reduce((sum, session) => sum + session.minutes, 0);
  const days = new Set(input.weekSessions.filter((session) => session.minutes > 0).map((session) => session.date)).size;
  const done = input.tasks.filter(
    (task) => task.date >= input.weekStart && task.date <= input.weekEnd && task.status === "done",
  ).length;
  const pendingNext = input.tasks
    .filter((task) => task.status === "pending" && task.date > input.weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position)
    .slice(0, 3);
  const f = digestFacts(input);
  const esc = escapeHtml;
  const subject = weeklySubject(input);
  const upcoming = pendingNext.length
    ? `<h2 style="${S.h2}">Coming up</h2>` +
      pendingNext
        .map((task) => `<p style="${S.item}">${esc(task.date)} - ${esc(task.title)}, ${esc(minLabel(task.plannedMinutes))}</p>`)
        .join("")
    : "";
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>` +
    `<title>${esc(subject)}</title></head>` +
    `<body style="${S.body}"><div style="${S.wrap}"><div style="${S.card}">` +
    `<h1 style="${S.h1}">${esc(subject)}</h1>` +
    `<p style="${S.sub}">For ${esc(input.name)}</p>` +
    `<p style="${S.item}"><span style="${S.strong}">Logged:</span> ${esc(minLabel(minutes))} across ${days} study day${days === 1 ? "" : "s"}.</p>` +
    `<p style="${S.item}"><span style="${S.strong}">Finished:</span> ${done} task${done === 1 ? "" : "s"}. Streak: ${input.streak} day${input.streak === 1 ? "" : "s"}.` +
    (f.daysLeft != null && f.daysLeft >= 0 ? ` ${f.daysLeft} days to the exam.` : "") +
    `</p>` +
    (f.backlog.count > 0
      ? `<h2 style="${S.h2}">Still overdue</h2><p style="${S.item}">${f.backlog.count} task${f.backlog.count === 1 ? "" : "s"} (${minLabel(f.backlog.minutes)}).` +
        (f.recovery ? `<br/><span style="color:#6d6a7c">Suggested recovery: +${f.recovery.minutesPerDay} min/day for ${f.recovery.days} day${f.recovery.days === 1 ? "" : "s"}.</span>` : "") +
        `</p>`
      : "") +
    upcoming +
    `<p style="${S.item}"><span style="color:#6d6a7c">${esc(encouragementFor(input.today))}</span></p>` +
    `<p style="${S.item}"><a style="${S.link}" href="${esc(input.appUrl)}">Open the planner</a></p>` +
    `<p style="${S.footer}">You receive this on Sunday evenings because the weekly summary is on for your account.<br/>` +
    `<a style="${S.link}" href="${esc(input.unsubscribeUrl)}">Unsubscribe from these emails</a></p>` +
    `</div></div></body></html>`
  );
}
