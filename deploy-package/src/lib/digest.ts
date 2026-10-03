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
import {
  EMAIL,
  emailAssetBaseFromUrl,
  emailEscape,
  emailFooter,
  emailHeader,
  heroCard,
  illustration,
  infoCard,
  metric,
  primaryButton,
  shell,
} from "./emailTheme";

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

function circleIcon(label: string, tone: "purple" | "red" | "blue" = "purple"): string {
  const color = tone === "red" ? "#ef476f" : tone === "blue" ? "#4b7bec" : "#6253eb";
  const bg = tone === "red" ? "#ffe8ee" : tone === "blue" ? "#eaf1ff" : "#eeeaff";
  return `<div style="width:48px;height:48px;border-radius:999px;background:${bg};color:${color};text-align:center;line-height:48px;font-size:22px;font-weight:900">${emailEscape(label)}</div>`;
}

function taskListHtml(input: DigestInput): string {
  const esc = emailEscape;
  const f = digestFacts(input);
  if (!f.todays.length) {
    return `<p style="${EMAIL.p}">No lessons planned - a rest day or a catch-up day.</p>`;
  }
  return (
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">` +
    f.todays
      .map((task, index) => {
        const subject = subjectName(input, task.subjectId);
        const border = index === 0 ? "" : "border-top:1px solid #eeeaf8;";
        return (
          `<tr>` +
          `<td style="${border}padding:12px 8px 12px 0;width:38px;vertical-align:top">` +
          `<div style="width:30px;height:30px;border-radius:999px;background:#efecff;color:#6253eb;text-align:center;line-height:30px;font-size:13px;font-weight:900">${index + 1}</div>` +
          `</td>` +
          `<td style="${border}padding:12px 8px;vertical-align:top">` +
          `<div style="font-size:14px;line-height:1.45;color:#171a38;font-weight:800">${esc(task.title)}</div>` +
          (subject ? `<div style="font-size:12px;line-height:1.45;color:#777b9a;margin-top:2px">${esc(subject)}</div>` : "") +
          `</td>` +
          `<td align="right" style="${border}padding:12px 0 12px 8px;vertical-align:top;width:82px">` +
          `<span style="display:inline-block;border-radius:11px;background:#f0edff;color:#6253eb;padding:7px 10px;font-size:12px;line-height:1;font-weight:900;white-space:nowrap">${esc(minLabel(task.plannedMinutes))}</span>` +
          `</td>` +
          `</tr>`
        );
      })
      .join("") +
    `</table>`
  );
}

export function digestHtml(input: DigestInput): string {
  const f = digestFacts(input);
  const subject = digestSubject(input);
  const assetBase = emailAssetBaseFromUrl(input.appUrl);
  const esc = emailEscape;
  const firstSubject = f.now ? subjectName(input, f.now.subjectId) : "";
  const todayCount = f.todays.length;
  const todayLabel = `${todayCount} lesson${todayCount === 1 ? "" : "s"}`;
  const statusParts = [
    `${input.streak} day${input.streak === 1 ? "" : "s"} streak`,
    f.yesterdayMinutes > 0 ? minLabel(f.yesterdayMinutes) : "nothing logged",
    f.daysLeft != null && f.daysLeft >= 0 ? `${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"}` : "exam date unset",
  ];

  const hero = heroCard(
    `For ${input.name} - ${input.today}`,
    esc(subject),
    "Your best next step, today's lessons and recovery status in one calm note.",
    illustration("digest", assetBase),
  );

  const startBlock = infoCard(
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
      `<td style="width:62px;vertical-align:top;padding-right:14px">${circleIcon("▶")}</td>` +
      `<td style="vertical-align:top">` +
      (f.now
        ? `<p style="${EMAIL.p}"><span style="font-weight:900;color:#101334">Start here:</span> <span style="color:#5b4bd5;font-weight:900">${esc(f.now.title)}</span>` +
          `${firstSubject ? ` <span style="color:#676b8a">(${esc(firstSubject)})</span>` : ""}` +
          ` - ${esc(minLabel(f.now.plannedMinutes))}, ${esc(reasonLabel(f.now.reason).toLowerCase())}.</p>`
        : `<p style="${EMAIL.p}"><span style="font-weight:900;color:#101334">Start here:</span> Nothing is due right now. The plan is clear.</p>`) +
      `</td></tr></table>`,
    "soft",
  );

  const todayBlock = infoCard(
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:8px"><tr>` +
      `<td style="vertical-align:middle;width:52px;padding-right:12px">${circleIcon("✓")}</td>` +
      `<td style="vertical-align:middle">` +
      `<div style="${EMAIL.h2}">Today</div>` +
      `<div style="font-size:16px;line-height:1.35;font-weight:900;color:#101334">${esc(todayLabel)}, ${esc(minLabel(f.plannedMinutes))} planned</div>` +
      `</td>` +
      `<td align="right" style="vertical-align:middle"><span style="display:inline-block;border-radius:12px;background:#f0edff;color:#6253eb;padding:8px 11px;font-size:12px;line-height:1;font-weight:900">${esc(minLabel(f.plannedMinutes))}</span></td>` +
      `</tr></table>` +
      taskListHtml(input),
  );

  const backlogBlock =
    f.backlog.count > 0
      ? infoCard(
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
            `<td style="width:62px;vertical-align:top;padding-right:14px">${circleIcon("!", "red")}</td>` +
            `<td style="vertical-align:top">` +
            `<div style="${EMAIL.h2};color:#a84358">Overdue</div>` +
            `<p style="${EMAIL.p}"><span style="font-size:18px;font-weight:900;color:#c8324f">${f.backlog.count} unfinished task${f.backlog.count === 1 ? "" : "s"} (${esc(minLabel(f.backlog.minutes))}).</span><br/>` +
            `<span style="color:#6f738e">${
              f.recovery
                ? `Suggested recovery: +${f.recovery.minutesPerDay} min/day for ${f.recovery.days} day${f.recovery.days === 1 ? "" : "s"}, no cramming.`
                : "They fit with today's plan - no extra pace needed."
            }</span></p>` +
            `</td>` +
            `<td align="right" style="vertical-align:middle;width:142px">${illustration("overdue", assetBase)}</td>` +
            `</tr></table>`,
          "danger",
        )
      : "";

  const metricsBlock = infoCard(
    `<div style="${EMAIL.h2}">Where you stand</div>` +
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 -6px">` +
      `<tr>` +
      metric("Streak", `${input.streak} day${input.streak === 1 ? "" : "s"}`) +
      metric("Yesterday", f.yesterdayMinutes > 0 ? minLabel(f.yesterdayMinutes) : "none", "#4b7bec") +
      metric("Exam", f.daysLeft != null && f.daysLeft >= 0 ? `${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"}` : "not set", "#5b4bd5") +
      `</tr></table>` +
      `<p style="${EMAIL.p};margin-top:12px;color:#676b8a">${esc(encouragementFor(input.today))}</p>`,
    "blue",
  );

  const content =
    emailHeader(assetBase) +
    hero +
    startBlock +
    todayBlock +
    backlogBlock +
    metricsBlock +
    `<div style="padding:4px 28px 24px">${primaryButton(input.appUrl, "Open the planner", "→")}</div>` +
    emailFooter("You receive this once a day because the daily digest is on for your account.", input.unsubscribeUrl, assetBase);

  return shell(subject, `For ${input.name}: ${statusParts.join(" · ")}`, content);
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
  const assetBase = emailAssetBaseFromUrl(input.appUrl);
  const esc = emailEscape;
  const subject = weeklySubject(input);

  const upcoming = pendingNext.length
    ? infoCard(
        `<div style="${EMAIL.h2}">Coming up</div>` +
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">` +
          pendingNext
            .map((task, index) => {
              const border = index === 0 ? "" : "border-top:1px solid #eeeaf8;";
              return (
                `<tr>` +
                `<td style="${border}padding:11px 10px 11px 0;width:92px;vertical-align:top;color:#6253eb;font-size:12px;line-height:1.4;font-weight:900">${esc(task.date)}</td>` +
                `<td style="${border}padding:11px 10px;vertical-align:top;color:#171a38;font-size:14px;line-height:1.45;font-weight:800">${esc(task.title)}</td>` +
                `<td align="right" style="${border}padding:11px 0 11px 10px;width:82px;vertical-align:top"><span style="display:inline-block;border-radius:11px;background:#f0edff;color:#6253eb;padding:7px 10px;font-size:12px;line-height:1;font-weight:900;white-space:nowrap">${esc(minLabel(task.plannedMinutes))}</span></td>` +
                `</tr>`
              );
            })
            .join("") +
          `</table>`,
      )
    : "";

  const backlog =
    f.backlog.count > 0
      ? infoCard(
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
            `<td style="width:62px;vertical-align:top;padding-right:14px">${circleIcon("!", "red")}</td>` +
            `<td style="vertical-align:top">` +
            `<div style="${EMAIL.h2};color:#a84358">Still overdue</div>` +
            `<p style="${EMAIL.p}"><span style="font-weight:900;color:#c8324f">${f.backlog.count} task${f.backlog.count === 1 ? "" : "s"} (${esc(minLabel(f.backlog.minutes))}).</span>` +
            (f.recovery
              ? `<br/><span style="color:#6f738e">Suggested recovery: +${f.recovery.minutesPerDay} min/day for ${f.recovery.days} day${f.recovery.days === 1 ? "" : "s"}.</span>`
              : "") +
            `</p></td></tr></table>`,
          "danger",
        )
      : "";

  const daysToExam = f.daysLeft != null && f.daysLeft >= 0 ? `${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"}` : "not set";
  const hero = heroCard(
    `${input.weekStart} to ${input.weekEnd}`,
    esc(subject),
    "A clean recap of study time, finished tasks, backlog and what comes next.",
    illustration("weekly", assetBase),
  );

  const metricsBlock = infoCard(
    `<div style="${EMAIL.h2}">Week scorecard</div>` +
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 -6px">` +
      `<tr>` +
      metric("Logged", minLabel(minutes)) +
      metric("Study days", `${days}`) +
      metric("Finished", `${done}`) +
      `</tr><tr>` +
      metric("Streak", `${input.streak} day${input.streak === 1 ? "" : "s"}`, "#4b7bec") +
      metric("Exam", daysToExam, "#5b4bd5") +
      metric("Backlog", `${f.backlog.count}`, f.backlog.count > 0 ? "#c8324f" : "#2f9e72") +
      `</tr></table>` +
      `<p style="${EMAIL.p};margin-top:12px;color:#676b8a">${esc(encouragementFor(input.today))}</p>`,
    "blue",
  );

  const content =
    emailHeader(assetBase) +
    hero +
    metricsBlock +
    backlog +
    upcoming +
    `<div style="padding:4px 28px 24px">${primaryButton(input.appUrl, "Open the planner", "→")}</div>` +
    emailFooter("You receive this on Sunday evenings because the weekly summary is on for your account.", input.unsubscribeUrl, assetBase);

  return shell(subject, `Logged ${minLabel(minutes)} across ${days} study day${days === 1 ? "" : "s"}.`, content);
}
