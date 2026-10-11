/**
 * EMAIL PREVIEW - render the real transactional templates, at real widths.
 * ───────────────────────────────────────────────────────────────────────
 * `npm run email:preview` writes `.spp-mail-preview/` (gitignored) and prints
 * the command that serves it. Nothing here re-implements a template: it calls
 * the very same `digestHtml` / `weeklyHtml` / `verificationEmail` the cron
 * sweep and the sign-up flow call, so what you see in the browser is what a
 * learner gets in their inbox - desktop column layout and the phone media
 * queries included, because each email is displayed inside an iframe of that
 * exact width.
 */

import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { digestHtml, digestSubject, weekdayName, weeklyHtml, weeklySubject } from "../src/lib/digest";
import type { DigestInput, WeeklyInput } from "../src/lib/digest";
import { verificationEmail } from "../src/lib/verificationMail";

const OUT = ".spp-mail-preview";
/** The origin the templates build absolute image URLs from; rewritten below
 *  to a relative path so the preview loads the artwork from its own folder. */
const SITE = "https://planner.example.com";

const today = "2026-04-14";
const tasks: DigestInput["tasks"] = [
  { id: 2, userId: 1, date: "2026-04-12", subjectId: 1, topicId: null, kind: "study", title: "Costing overhaul: chapter 6 revision set", detail: "", plannedMinutes: 60, actualMinutes: 0, status: "pending", position: 1 },
  { id: 3, userId: 1, date: "2026-04-13", subjectId: 2, topicId: null, kind: "study", title: "Business economics quiz", detail: "", plannedMinutes: 40, actualMinutes: 0, status: "pending", position: 1 },
  { id: 1, userId: 1, date: today, subjectId: 1, topicId: null, kind: "study", title: "Marginal costing - practice sheet", detail: "", plannedMinutes: 45, actualMinutes: 0, status: "pending", position: 1 },
  { id: 4, userId: 1, date: today, subjectId: 2, topicId: null, kind: "study", title: "Demand elasticity notes", detail: "", plannedMinutes: 30, actualMinutes: 0, status: "pending", position: 2 },
  { id: 5, userId: 1, date: today, subjectId: 3, topicId: null, kind: "recall", title: "Spaced recall: national income accounting", detail: "", plannedMinutes: 15, actualMinutes: 0, status: "pending", position: 3 },
];

const base: DigestInput = {
  name: "Arjun",
  today,
  weekday: weekdayName(today),
  tasks,
  subjects: [
    { id: 1, name: "Cost Accounting" },
    { id: 2, name: "Business Economics" },
    { id: 3, name: "Macroeconomics" },
  ],
  sessions: [{ date: "2026-04-13", minutes: 95 }],
  dailyHours: 2,
  examDate: "2026-05-10",
  streak: 5,
  appUrl: `${SITE}/planner`,
  unsubscribeUrl: `${SITE}/api/email/unsubscribe?u=7&k=all&t=sig`,
};

const weekly: WeeklyInput = {
  ...base,
  today: "2026-04-19",
  weekday: "Sunday",
  weekStart: "2026-04-13",
  weekEnd: "2026-04-19",
  weekSessions: [
    { date: "2026-04-13", minutes: 45 },
    { date: "2026-04-14", minutes: 60 },
    { date: "2026-04-15", minutes: 40 },
    { date: "2026-04-16", minutes: 0 },
    { date: "2026-04-18", minutes: 80 },
  ],
  streak: 9,
};

/** Make the artwork load from the preview folder instead of a live host. */
function relativiseAssets(html: string): string {
  return html.split(`${SITE}/email/`).join("./email/");
}

const frames = [
  { file: "digest.html", label: "Daily digest", note: "The 7pm plan email, with an overdue backlog", html: relativiseAssets(digestHtml(base)), subject: digestSubject(base) },
  { file: "weekly.html", label: "Weekly review", note: "The Sunday recap (separate opt-in)", html: relativiseAssets(weeklyHtml(weekly)), subject: weeklySubject(weekly) },
  {
    file: "verify.html",
    label: "Email verification",
    note: "Sign-up / Settings - the one transactional mail",
    ...(() => {
      const built = verificationEmail(`${SITE}/api/auth/verify-email?u=7&k=abc123&t=sig`, { assetBase: "." });
      return { html: built.html, subject: built.subject };
    })(),
  },
];

const widths = [
  { px: 700, name: "Desktop", hint: "700px - Outlook, Gmail web, Apple Mail" },
  { px: 390, name: "Phone", hint: "390px - iPhone 15, Pixel 8" },
  { px: 320, name: "Small phone", hint: "320px - iPhone SE, Galaxy Z Fold cover" },
];

const index = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Study Planner Pro - email preview</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;padding:28px 22px 60px;background:#14162b;color:#e9eaf6;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
  h1{font-size:20px;margin:0 0 6px;letter-spacing:-.01em}
  p.lede{margin:0 0 26px;color:#9aa0c4;font-size:13.5px;line-height:1.6;max-width:70ch}
  p.lede a{color:#a99cff}
  section{margin-bottom:38px}
  h2{font-size:15px;margin:0 0 2px}
  .meta{color:#8f95bb;font-size:12.5px;margin:0 0 14px}
  .subject{color:#c9c3ff;font-size:12.5px;margin:0 0 14px;font-weight:600}
  .row{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
  figure{margin:0}
  figcaption{font-size:11.5px;color:#8f95bb;margin:0 0 7px;letter-spacing:.04em;text-transform:uppercase;font-weight:700}
  figcaption em{display:block;text-transform:none;letter-spacing:0;font-weight:400;font-style:normal;margin-top:3px;color:#767c9f}
  iframe{background:#fff;border:0;border-radius:14px;display:block;box-shadow:0 18px 50px rgba(0,0,0,.45)}
  .links{margin-top:8px;font-size:12px}
  .links a{color:#8f95bb;text-decoration:none;border-bottom:1px dashed #4a4e70}
</style></head>
<body>
<h1>Study Planner Pro - email template preview</h1>
<p class="lede">Rendered from <code>src/lib/digest.ts</code> and
<code>src/lib/verificationMail.ts</code> - the same code the mailer uses. Each
column is a real browser viewport, so the phone columns are exercising the
media queries exactly as a handset would. Open a frame on its own to use your
devtools device toolbar: ${frames.map((f) => `<a href="./${f.file}">${f.label}</a>`).join(", ")}.
Image artwork is served from this preview folder; a live deployment reads the
same files from <code>APP_URL/email/&#42;</code>.</p>
${frames
  .map(
    (f) => `<section>
  <h2>${f.label}</h2>
  <p class="meta">${f.note}</p>
  <p class="subject">Subject line: ${f.subject}</p>
  <div class="row">
  ${widths
    .map(
      (w) => `<figure>
    <figcaption>${w.name}<em>${w.hint}</em></figcaption>
    <iframe src="./${f.file}" width="${w.px}" height="820" title="${f.label} at ${w.px}px"></iframe>
  </figure>`,
    )
    .join("")}
  </div>
</section>`,
  )
  .join("\n")}
</body></html>
`;

async function main(): Promise<void> {
  await mkdir(join(OUT, "email"), { recursive: true });
  await cp(join("public", "email"), join(OUT, "email"), { recursive: true });
  for (const frame of frames) {
    await writeFile(join(OUT, frame.file), frame.html, "utf8");
    console.log(`wrote ${OUT}/${frame.file} (${frame.html.length} bytes)`);
  }
  await writeFile(join(OUT, "index.html"), index, "utf8");
  console.log(`wrote ${OUT}/index.html`);
  console.log(`\nserve it with:  npx --yes http-server ${OUT} -p 4173 -a 0.0.0.0 -c-1`);
}

main().catch((error) => {
  console.error("Email preview failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

