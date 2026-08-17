import {
  generateTopics,
  synthesiseSubjects,
  nmimsSem1Subjects,
  isNmimsQuery,
  getNmimsChapters,
  type SeedSubject,
  type GeneratedTopic,
} from "./curriculum";
import { lookupKnowledge, teachFromKnowledge } from "./knowledge";

// Re-export the canonical topic shape so existing imports from "./ai" keep working.
export type { GeneratedTopic } from "./curriculum";

/* ============================================================
   UNIVERSAL ENVIRONMENT VARIABLE FETCHER
============================================================ */
function getSafeKey(keyName: string): string | null {
  try {
    if (typeof process !== "undefined" && process.env && process.env[keyName]) {
      return process.env[keyName] as string;
    }
    // @ts-ignore
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[keyName]) {
      // @ts-ignore
      return import.meta.env[keyName] as string;
    }
  } catch (_) {
    return null;
  }
  return null;
}

type ChatMsg = { role: "user" | "assistant"; content: string };

export function activeProvider(): string | null {
  if (getSafeKey("NEXT_PUBLIC_GEMINI_API_KEY") || getSafeKey("NEXT_PUBLIC_GOOGLE_API_KEY")) return "AI Cloud";
  if (getSafeKey("NEXT_PUBLIC_GROQ_API_KEY")) return "Groq";
  if (getSafeKey("NEXT_PUBLIC_OPENROUTER_API_KEY")) return "OpenRouter";
  return null;
}

/* ============================================================
   LLM CALLER — Gemini → Groq → OpenRouter Fallback Chain
============================================================ */
export async function callLLM(
  system: string,
  messages: ChatMsg[],
  maxTokens = 2500
): Promise<string | null> {
  const providers = ["gemini", "groq", "openrouter"];

  for (const provider of providers) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 18000);
      let text: string | null = null;

      const geminiKey = getSafeKey("NEXT_PUBLIC_GEMINI_API_KEY") || getSafeKey("NEXT_PUBLIC_GOOGLE_API_KEY");
      const groqKey = getSafeKey("NEXT_PUBLIC_GROQ_API_KEY");
      const openrouterKey = getSafeKey("NEXT_PUBLIC_OPENROUTER_API_KEY");
      const geminiModel = getSafeKey("NEXT_PUBLIC_GEMINI_MODEL") || "gemini-1.5-flash";

      if (provider === "gemini" && geminiKey) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            signal: ctrl.signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: messages.map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
              })),
              generationConfig: { maxOutputTokens: maxTokens },
            }),
          }
        );
        if (r.ok) {
          const j = await r.json();
          text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? null;
        }
      } else if (provider === "groq" && groqKey) {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: maxTokens,
            messages: [{ role: "system", content: system }, ...messages],
          }),
        });
        if (r.ok) {
          const j = await r.json();
          text = j?.choices?.[0]?.message?.content ?? null;
        }
      } else if (provider === "openrouter" && openrouterKey) {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${openrouterKey}`,
            "HTTP-Referer": "https://studyplanner.netlify.app",
            "X-Title": "Study Planner Pro",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            max_tokens: maxTokens,
            messages: [{ role: "system", content: system }, ...messages],
          }),
        });
        if (r.ok) {
          const j = await r.json();
          text = j?.choices?.[0]?.message?.content ?? null;
        }
      }

      clearTimeout(timer);
      if (text && text.trim()) return text.trim();
    } catch (_) {
      continue;
    }
  }
  return null;
}

function extractJson<T>(raw: string): T | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : raw;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const endBrace = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
  try {
    return JSON.parse(body.slice(start, endBrace + 1)) as T;
  } catch {
    return null;
  }
}

/* ============================================================
   AI SUBJECT MATCHER
============================================================ */
export async function aiSuggestSubjects(
  courseName: string,
  level: string
): Promise<{ subjects: SeedSubject[]; source: string }> {
  const fallback = synthesiseSubjects(courseName, level);
  const query = courseName.toLowerCase();

  // ── GROUND-TRUTH INTERCEPTION (LLM BYPASS) ──────────────────────
  // NMIMS / CDOE / MBA / Marketing queries never touch the LLM: the
  // verified Semester 1 catalog (6 subjects, 76 units) is returned
  // directly so unit counts can never be hallucinated.
  if (
    isNmimsQuery(courseName) ||
    query.includes("nmims") ||
    query.includes("cdoe") ||
    query.includes("marketing") ||
    query.includes("mba")
  ) {
    // synthesiseSubjects already resolves NMIMS ground truth (and handles
    // explicit semester filters); if it returned the locked Sem-1 set use
    // it as-is, otherwise fall back to the canonical catalog directly.
    const nmims = isNmimsQuery(courseName);
    const verified = fallback.length >= 3 ? fallback : nmimsSem1Subjects();
    return {
      subjects: verified,
      source: nmims ? "Verified NMIMS Database" : "Verified Catalog",
    };
  }

  const raw = await callLLM(
    "You are an academic curriculum planner. Return a strict JSON array ONLY.",
    [
      {
        role: "user",
        content: `Course/exam: "${courseName}". Education level: ${level}.
        Generate the core subjects for Semester 1 as a JSON array:
        [{"name":"Exact Subject Name","units":12,"difficulty":"Medium","color":"#6366f1"}]`
      }
    ],
    2500
  );

  if (!raw) return { subjects: fallback, source: "aether-local" };

  try {
    const parsed = extractJson<SeedSubject[]>(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
      const validated = parsed.slice(0, 8).map((s, i) => ({
        name: String(s.name).slice(0, 80),
        units: Math.min(40, Math.max(2, Number(s.units) || 8)),
        difficulty: (["Easy", "Medium", "Hard"].includes(String(s.difficulty)) ? s.difficulty : "Medium") as SeedSubject["difficulty"],
        color: palette[i % palette.length],
      }));
      return { subjects: validated, source: "AI Cloud Database" };
    }
  } catch { /* fall through */ }

  return { subjects: fallback, source: "aether-local" };
}

/* ============================================================
   TOPIC RESOLUTION
============================================================ */
export async function aiGenerateTopics(
  subjectName: string,
  units: number,
  difficulty: string,
  level: string,
  courseName: string
): Promise<GeneratedTopic[]> {
  // ── GROUND-TRUTH INTERCEPTION (LLM BYPASS) ──────────────────────
  // If this subject belongs to the verified NMIMS catalog, load the exact
  // textbook chapter titles from the ground-truth bank — never the LLM.
  // generateTopics() internally locks the unit count to the chapter list.
  const nmimsChapters = getNmimsChapters(subjectName);
  if (nmimsChapters) {
    return generateTopics(subjectName, nmimsChapters.length, difficulty, level);
  }
  if (isNmimsQuery(courseName) || isNmimsQuery(subjectName)) {
    return generateTopics(subjectName, units, difficulty, level);
  }

  const fallback = generateTopics(subjectName, units, difficulty, level);
  const raw = await callLLM(
    `You are a strict curriculum architect. Return a strict JSON array ONLY.`,
    [
      {
        role: "user",
        content: `Subject: "${subjectName}". Canonical unit count: ${units}. Difficulty: ${difficulty}.
        Generate exactly ${units} lessons.
        Format: [{"unit":"Unit 1","title":"...","summary":"...","objectives":["..."],"difficulty":"Medium","estMinutes":45}]`,
      },
    ],
    Math.min(4000, 800 + units * 120)
  );

  if (!raw) return fallback;

  const parsed = extractJson<GeneratedTopic[]>(raw);
  if (!parsed || !Array.isArray(parsed) || parsed.length < 2) return fallback;

  return parsed.slice(0, units).map((t, i) => ({
    unit: t.unit || `Unit ${i + 1}`,
    title: String(t.title || fallback[i]?.title || `Lesson ${i + 1}`).slice(0, 160),
    summary: String(t.summary || fallback[i]?.summary || ""),
    objectives: Array.isArray(t.objectives) ? t.objectives.slice(0, 4).map(String) : [],
    difficulty: (["Easy", "Medium", "Hard"].includes(String(t.difficulty)) ? t.difficulty : "Medium") as "Easy" | "Medium" | "Hard",
    estMinutes: Math.min(180, Math.max(15, Number(t.estMinutes) || 45)),
  }));
}

export type TutorContext = {
  name: string; courseName: string; level: string; examDate: string; daysLeft: number; dailyHours: number;
  subjects: { id: number; name: string; difficulty: string; done: number; total: number }[];
  today: { title: string; kind: string; minutes: number; status: string }[];
  progressPct: number; streak: number; hoursThisWeek: number; overdue: number;
};
export type TutorReply = { text: string; action?: { type: string; payload?: unknown } };

function round(n: number): number { return Math.round(n * 10000) / 10000; }
function percentQ(q: string): string | null {
  const m = q.match(/what\s+is\s+(\d+\.?\d*)\s*%\s*of\s*(\d+\.?\d*)/i);
  if (!m) return null;
  const v = (parseFloat(m[1]) / 100) * parseFloat(m[2]);
  return `${m[1]}% of ${m[2]} = **${round(v)}**`;
}

export function parseCommand(q: string): TutorReply["action"] | undefined {
  const n = q.toLowerCase().trim().replace(/[.!?]+$/, "");

  // ── Break / timer state transitions (checked BEFORE navigation so
  //    "resume", "end break", "pause" never get mis-routed) ──
  if (/\b(resume|end (my |the )?break|back from (my |the )?break|break('?s)? over|continue (the )?(session|timer|studying))\b/.test(n)) return { type: "resume" };
  if (/\b(pause (the )?(timer|clock|session)|pause\b|hold (the )?timer)\b/.test(n) && !/\bbreak\b/.test(n)) return { type: "pause" };
  if (/\b(take a break|break time|need a break|short break|give me a break)\b/.test(n)) return { type: "break" };

  // ── Navigation ──
  if (/\b(planner|schedule|my plan|timetable)\b/.test(n) && /\b(open|go|show|view|take me|see)\b/.test(n)) return { type: "navigate", payload: "planner" };
  if (/\b(dashboard|overview|home|stats?)\b/.test(n) && /\b(open|go|show|view|take me|see)\b/.test(n)) return { type: "navigate", payload: "dashboard" };
  if (/\b(subjects?|syllabus|topics?|lessons?)\b/.test(n) && /\b(open|go|show|view|manage|edit)\b/.test(n)) return { type: "navigate", payload: "subjects" };
  if (/\b(settings?|preferences?|options?|profile)\b/.test(n) && /\b(open|go|show|change|edit)\b/.test(n)) return { type: "navigate", payload: "settings" };
  if (/\b(focus( page| view| tab)?|pomodoro)\b/.test(n) && /\b(open|go|show|view|take me|see)\b/.test(n)) return { type: "navigate", payload: "focus" };
  if (/^\/?(planner|schedule)$/.test(n)) return { type: "navigate", payload: "planner" };
  if (/^\/?(dashboard|overview)$/.test(n)) return { type: "navigate", payload: "dashboard" };
  if (/^\/?(subjects|syllabus)$/.test(n)) return { type: "navigate", payload: "subjects" };
  if (/^\/?(settings)$/.test(n)) return { type: "navigate", payload: "settings" };
  if (/^\/?(focus|pomodoro)$/.test(n)) return { type: "navigate", payload: "focus" };

  // ── Clock ──
  if (/\b(clock ?in|start (the )?(timer|clock|focus|session|studying|study)|begin (studying|session|focus)|let'?s study|i'?m ready to study)\b/.test(n)) return { type: "startTimer" };
  if (/\b(clock ?out|stop (the )?(timer|clock|session)|end (the )?(session|study)|i'?m done|finished studying)\b/.test(n)) return { type: "stopTimer" };
  if (/\b(zen|focus mode|full ?screen|distraction ?free|deep work mode)\b/.test(n)) return { type: "zen" };
  if (/\b(re-?plan|rebuild|regenerate|reschedule|re-?balance|redo my (plan|schedule)|fix my (plan|schedule)|update my plan)\b/.test(n)) return { type: "replan" };

  if (n.includes("theme") || /\b(midnight|dark|obsidian|nebula|emerald|sunset|mint|silver|lavender|samsung|light|black)\b/.test(n)) {
    // Payloads are the raw THEME IDS stored in settings.theme — the UI
    // applies them as `theme-${id}`, so never prefix "theme-" here.
    if (/(midnight|dark|black)/.test(n)) return { type: "theme", payload: "dark" };
    if (/(obsidian)/.test(n)) return { type: "theme", payload: "obsidian" };
    if (/(nebula)/.test(n)) return { type: "theme", payload: "nebula" };
    if (/(emerald|mint)/.test(n)) return { type: "theme", payload: "mint" };
    if (/(sunset|champagne)/.test(n)) return { type: "theme", payload: "sunset" };
    if (/(light|samsung|clean)/.test(n)) return { type: "theme", payload: "sunset" };
    if (/(silver|lavender)/.test(n)) return { type: "theme", payload: "silver-lavender" };
    return { type: "theme", payload: "dark" };
  }
  return undefined;
}

export async function localTutor(q: string, ctx: TutorContext): Promise<TutorReply> {
  const action = parseCommand(q);
  const n = q.toLowerCase();

  if (action?.type === "replan") {
    return { text: `Schedule rebalanced against your remaining syllabus.`, action };
  }
  if (action) {
    const msgs: Record<string, string> = {
      navigate: `Opening **${String(action.payload)}** for you.`,
      startTimer: `Clock started. Session logged against your current subject.`,
      stopTimer: `Session logged. Well done.`,
      break: `Break started. Hydrate and relax for a few minutes.`,
      pause: `Timer paused. Say "resume" when ready.`,
      resume: `Resumed — back on the clock.`,
      zen: `Zen mode active.`,
      theme: `Theme updated.`,
    };
    return { text: msgs[action.type] || "Done.", action };
  }

  if (/(what|which).*(today|now)|today'?s (plan|task|study|load)|what should i (study|do)/.test(n)) {
    if (!ctx.today.length) return { text: `Nothing scheduled for today.` };
    const list = ctx.today.map((t, i) => `${i + 1}. **${t.title}** (${t.minutes} min)`).join("\n");
    return { text: `Here is today's schedule:\n\n${list}\n\nSay *"start timer"* to begin.` };
  }

  const pct = percentQ(q);
  if (pct) return { text: pct };

  const aiResponse = await callLLM(tutorSystemPrompt(ctx), [{ role: "user", content: q }], 800);
  if (aiResponse) return { text: aiResponse };

  const subjectHint = ctx.subjects.find((s) => n.includes(s.name.toLowerCase().split(" ")[0]))?.name;
  const knowledge = await lookupKnowledge(q);
  if (knowledge) return { text: teachFromKnowledge(knowledge, q, ctx.level, subjectHint) };

  return { text: `Ask me to explain any concept from your subjects or say *"what should I study today?"*` };
}

export function tutorSystemPrompt(ctx: TutorContext): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata",
  });
  return `You are AETHER, the built-in study coach for Study Planner Pro.

TODAY'S DATE IS ${dateStr}. This is the real current date — trust it completely,
even if it is later than your training data. Never call the current date "the
future", never mention your training cutoff, and never refuse a question because
of dates. If asked about news or live events, simply say you don't have live
news access in one short sentence, then pivot to something useful (e.g. offer
a current-affairs study strategy if their course includes it).

Learner: ${ctx.name}. Course: ${ctx.courseName}. Days Left: ${ctx.daysLeft} (exam: ${ctx.examDate}). Progress: ${ctx.progressPct}%.
Teach step-by-step using clear markdown formatting.

APP CONTROL — you CAN control this app. When the user asks you to perform an app action
(in ANY language or phrasing), append ONE action tag on its own final line, then it will
be executed automatically. Available tags:
[[action:navigate:planner]]  [[action:navigate:dashboard]]  [[action:navigate:subjects]]
[[action:navigate:settings]]  [[action:navigate:focus]]
[[action:theme:dark]]  [[action:theme:obsidian]]  [[action:theme:nebula]]
[[action:theme:mint]]  [[action:theme:sunset]]  [[action:theme:silver-lavender]]
[[action:startTimer]]  [[action:stopTimer]]  [[action:pause]]  [[action:resume]]
[[action:break]]  [[action:zen]]  [[action:replan]]
Theme names: midnight/dark/black → dark; lavender/silver/light → silver-lavender;
emerald → mint; champagne → sunset. "Previous/default theme" → silver-lavender.
Rules: emit at most ONE tag, only when the user clearly requests that action.
Never claim you cannot control themes, timers, navigation or replanning — you can.
For pure study questions, do not emit any tag.`;
}

/**
 * Extract a trailing [[action:...]] tag emitted by the LLM and convert it
 * to the same action shape parseCommand produces. Returns the cleaned
 * reply text (tag stripped) plus the action, if any.
 */
export function extractLlmAction(reply: string): {
  text: string;
  action?: TutorReply["action"];
} {
  const m = reply.match(/\[\[action:([a-zA-Z]+)(?::([a-z0-9-]+))?\]\]/);
  if (!m) return { text: reply };

  const type = m[1];
  const payload = m[2];
  const text = reply.replace(/\s*\[\[action:[^\]]*\]\]\s*/g, "\n").trim();

  const NAV = new Set(["planner", "dashboard", "subjects", "settings", "focus"]);
  const THEMES_SET = new Set(["dark", "obsidian", "nebula", "mint", "sunset", "silver-lavender"]);
  const BARE = new Set(["startTimer", "stopTimer", "pause", "resume", "break", "zen", "replan"]);

  if (type === "navigate" && payload && NAV.has(payload)) return { text, action: { type, payload } };
  if (type === "theme" && payload && THEMES_SET.has(payload)) return { text, action: { type, payload } };
  if (BARE.has(type)) return { text, action: { type } };
  return { text };
}
