import { generateTopics, lookupTopicBank, synthesiseSubjects, type GeneratedTopic, type SeedSubject } from "./curriculum";
import { lookupKnowledge, teachFromKnowledge } from "./knowledge";

/* ============================================================
   LLM PROVIDER LAYER (HARDCODED KEYS AS REQUESTED)
============================================================ */

// --- 1. PASTE YOUR API KEYS HERE ---
const GEMINI_KEY = "AQ.Ab8RN6JqNqlw-cppQes2J3GtSUNUsGSR-jldRwlPziFsT3dusQ";
const GROQ_KEY = "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";
const OPENROUTER_KEY = "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";

// --- 2. CHOOSE YOUR AI ---
// Change this to "gemini", "groq", or "openrouter"
export function activeProvider(): string | null {
  return "gemini"; 
}

export async function callLLM(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens = 1400
): Promise<string | null> {
  const provider = activeProvider();
  if (!provider) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    let text: string | null = null;

    if (provider === "gemini") {
      const model = "gemini-1.5-flash"; // Highly stable and fast model
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
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
      const j = await r.json();
      text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? null;
      
    } else {
      let url = "";
      let key = "";
      let model = "";

      if (provider === "groq") {
        url = "https://api.groq.com/openai/v1/chat/completions";
        key = GROQ_KEY;
        model = "llama-3.3-70b-versatile"; 
      } else if (provider === "openrouter") {
        url = "https://openrouter.ai/api/v1/chat/completions";
        key = OPENROUTER_KEY;
        model = "openai/gpt-4o-mini"; 
      }

      const r = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { 
          "content-type": "application/json", 
          authorization: `Bearer ${key}`,
          "HTTP-Referer": "https://studyplanner.netlify.app", // Crucial for OpenRouter
          "X-Title": "Study Planner Pro" 
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      const j = await r.json();
      text = j?.choices?.[0]?.message?.content ?? null;
    }

    clearTimeout(timer);
    return text && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
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
   CURRICULUM SYNTHESIS (Strict AI Prompting for Relevant Courses)
============================================================ */
export async function aiSuggestSubjects(
  courseName: string,
  level: string
): Promise<{ subjects: SeedSubject[]; source: string }> {
  const fallback = synthesiseSubjects(courseName, level);
  const provider = activeProvider();
  
  if (!provider || provider === "none") return { subjects: fallback, source: "aether-local" };

  const raw = await callLLM(
    "You are a curriculum designer. Reply with strict JSON only.",
    [
      {
        role: "user",
        content: `Course/exam: "${courseName}". Education level: ${level}. Analyse this specific course specialization and institution. List the 4-8 REAL core subjects/papers a student actually studies for this exact program, as a JSON array: [{"name":"...","units":8,"difficulty":"Easy|Medium|Hard","color":"#6366f1"}]. "units" MUST BE the total number of major chapters/lessons in that specific subject (choose between 4 to 15). For example, if it is an MBA in Marketing, ensure core subjects like 'Marketing Management', 'Consumer Behaviour', 'Quantitative Methods' are explicitly included. JSON array only, no other text.`
      }
    ],
    800
  );
  
  if (!raw) return { subjects: fallback, source: "aether-local" };

  try {
    const parsed = extractJson<SeedSubject[]>(raw);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
      return {
        subjects: parsed.slice(0, 10).map((s, i) => ({
          name: String(s.name).slice(0, 80),
          units: Math.min(30, Math.max(2, Number(s.units) || 8)),
          difficulty: (["Easy", "Medium", "Hard"].includes(String(s.difficulty)) ? s.difficulty : "Medium") as SeedSubject["difficulty"],
          color: /^#[0-9a-f]{6}$/i.test(String(s.color)) ? s.color : palette[i % palette.length],
        })),
        source: provider,
      };
    }
  } catch { /* fall through */ }
  
  return { subjects: fallback, source: "aether-local" };
}

export async function aiGenerateTopics(
  subjectName: string,
  units: number,
  difficulty: string,
  level: string,
  courseName: string
): Promise<GeneratedTopic[]> {
  const fallback = generateTopics(subjectName, units, difficulty, level);
  const raw = await callLLM(
    `You are a curriculum architect. Produce a lesson-by-lesson syllabus breakdown as strict JSON only.`,
    [
      {
        role: "user",
        content: `Course: ${courseName} (level: ${level}). Subject: "${subjectName}". Difficulty: ${difficulty}. Return exactly ${units} sequential lessons ordered from foundational to advanced, as a JSON array. Each item: {"unit":"Unit 1","title":"...","summary":"2 sentence study instruction","objectives":["...","...","..."],"difficulty":"Easy|Medium|Hard","estMinutes":45} JSON array only, no prose.`,
      },
    ],
    2500
  );
  if (!raw) return fallback;
  const parsed = extractJson<GeneratedTopic[]>(raw);
  if (!parsed || !Array.isArray(parsed) || parsed.length < 2) return fallback;
  return parsed.slice(0, units).map((t, i) => ({
    unit: t.unit || `Unit ${i + 1}`,
    title: String(t.title || fallback[i]?.title || `Lesson ${i + 1}`).slice(0, 160),
    summary: String(t.summary || fallback[i]?.summary || ""),
    objectives: Array.isArray(t.objectives) ? t.objectives.slice(0, 4).map(String) : [],
    difficulty: (["Easy", "Medium", "Hard"].includes(String(t.difficulty))
      ? t.difficulty
      : "Medium") as "Easy" | "Medium" | "Hard",
    estMinutes: Math.min(180, Math.max(15, Number(t.estMinutes) || 45)),
  }));
}

/* ============================================================
   LOCAL TUTOR ENGINE (Original Full Logic Restored)
============================================================ */
export type TutorContext = {
  name: string;
  courseName: string;
  level: string;
  examDate: string;
  daysLeft: number;
  dailyHours: number;
  subjects: { id: number; name: string; difficulty: string; done: number; total: number }[];
  today: { title: string; kind: string; minutes: number; status: string }[];
  progressPct: number;
  streak: number;
  hoursThisWeek: number;
  overdue: number;
};

export type TutorReply = { text: string; action?: { type: string; payload?: unknown } };

function tokenize(expr: string): string[] | null {
  const t = expr.match(/(\d+\.?\d*|[+\-*/^()%]|sqrt|sin|cos|tan|log|ln|pi|e)/g);
  return t && t.join("").replace(/\s/g, "").length === expr.replace(/\s/g, "").length ? t : null;
}

export function evalMath(expr: string): number | null {
  const cleaned = expr.replace(/\s+/g, "").replace(/ /g, "*").replace(/ /g, "/").replace(/\^/g, "**");
  if (!/^[-+*/().%\d\s*]+$/.test(cleaned)) return null;
  if (!/\d/.test(cleaned)) return null;
  try {
    const val = Function(`"use strict";return (${cleaned});`)() as number;
    return Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

function solveLinear(q: string): string | null {
  const m = q.match(/(-?\d*\.?\d*)\s*x\s*([+-]\s*\d+\.?\d*)?\s*=\s*(-?\d+\.?\d*)/i);
  if (!m) return null;
  const a = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : parseFloat(m[1]);
  const b = m[2] ? parseFloat(m[2].replace(/\s/g, "")) : 0;
  const c = parseFloat(m[3]);
  if (!a) return null;
  const x = (c - b) / a;
  return `**Solving ${m[0]}**\n\n1. Move the constant: ${a}x = ${c} ${b >= 0 ? "-" : "+"} ${Math.abs(b)} = ${c - b}\n2. Divide both sides by ${a}: x = ${c - b} / ${a}\n\n**x = ${round(x)}**`;
}

function solveQuadratic(q: string): string | null {
  const m = q.replace(/\s/g, "").match(/(-?\d*)x\^?2([+-]\d*)x?([+-]\d+)?=0/i);
  if (!m) return null;
  const a = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : parseFloat(m[1]);
  const b = m[2] ? (m[2] === "+" ? 1 : m[2] === "-" ? -1 : parseFloat(m[2])) : 0;
  const c = m[3] ? parseFloat(m[3]) : 0;
  const disc = b * b - 4 * a * c;
  let roots: string;
  if (disc > 0) {
    roots = `x  = ${round((-b + Math.sqrt(disc)) / (2 * a))}, x  = ${round((-b - Math.sqrt(disc)) / (2 * a))}`;
  } else if (disc === 0) {
    roots = `x = ${round(-b / (2 * a))} (repeated root)`;
  } else {
    roots = `x = ${round(-b / (2 * a))}   ${round(Math.sqrt(-disc) / (2 * a))}i (complex roots)`;
  }
  return `**Quadratic:** ${a}x  ${b >= 0 ? "+" : "-"} ${Math.abs(b)}x ${c >= 0 ? "+" : "-"} ${Math.abs(c)} = 0\n\nDiscriminant D = **${round(disc)}**\n\n**${roots}**`;
}

function simultaneous(q: string): string | null {
  const eqs = q.match(/-?\d*\.?\d*\s*x\s*[+-]\s*\d*\.?\d*\s*y\s*=\s*-?\d+\.?\d*/gi);
  if (!eqs || eqs.length < 2) return null;
  const parse2 = (e: string) => {
    const m = e.replace(/\s/g, "").match(/(-?\d*\.?\d*)x([+-]\d*\.?\d*)y=(-?\d+\.?\d*)/i);
    if (!m) return null;
    const a = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : parseFloat(m[1]);
    const b = m[2] === "+" ? 1 : m[2] === "-" ? -1 : parseFloat(m[2]);
    return { a, b, c: parseFloat(m[3]) };
  };
  const e1 = parse2(eqs[0]); const e2 = parse2(eqs[1]);
  if (!e1 || !e2) return null;
  const det = e1.a * e2.b - e2.a * e1.b;
  if (!det) return `These equations are **not independent**.`;
  const x = (e1.c * e2.b - e2.c * e1.b) / det;
  const y = (e1.a * e2.c - e2.a * e1.c) / det;
  return `**Simultaneous equations**\nx = **${round(x)}**\ny = **${round(y)}**`;
}

function integral(q: string): string | null {
  if (!/integrate|integral|antiderivative/i.test(q)) return null;
  const terms = q.match(/(-?\d*\.?\d*)x\^?(\d*)/g);
  if (!terms || !terms.length) return null;
  const parts = terms.map((t) => {
    const mm = t.match(/(-?\d*\.?\d*)x\^?(\d*)/)!;
    const coef = mm[1] === "" || mm[1] === "+" ? 1 : mm[1] === "-" ? -1 : parseFloat(mm[1]);
    const pow = mm[2] ? parseInt(mm[2]) : 1;
    return `${round(coef / (pow + 1))}x^${pow + 1}`;
  });
  return `**Integral:**   **${parts.join(" + ").replace(/\+ -/g, "- ")} + C**`;
}

function numberTheory(q: string): string | null {
  const nums = (q.match(/\d+/g) || []).map(Number);
  if (/\bhcf\b|\bgcd\b/i.test(q) && nums.length >= 2) {
    const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
    return `**HCF/GCD of ${nums.join(", ")} = ${nums.reduce((a, b) => g(a, b))}**`;
  }
  if (/\blcm\b/i.test(q) && nums.length >= 2) {
    const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
    return `**LCM of ${nums.join(", ")} = ${nums.reduce((a, b) => (a * b) / g(a, b))}**`;
  }
  if (/\bprime\b/i.test(q) && nums.length === 1) {
    const n = nums[0]; let p = n > 1;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; }
    return `**${n} is ${p ? "a prime" : "not a prime"} number.**`;
  }
  if (/average|mean/i.test(q) && nums.length >= 3) {
    const sum = nums.reduce((a, b) => a + b, 0);
    return `**Mean of ${nums.join(", ")} = ${round(sum / nums.length)}**`;
  }
  return null;
}

function derivative(q: string): string | null {
  if (!/derivative|differentiate|d\/dx/i.test(q)) return null;
  const terms = q.match(/(-?\d*\.?\d*)x\^?(\d*)/g);
  if (!terms || !terms.length) return null;
  const parts = terms.map((t) => {
    const mm = t.match(/(-?\d*\.?\d*)x\^?(\d*)/)!;
    const coef = mm[1] === "" || mm[1] === "+" ? 1 : mm[1] === "-" ? -1 : parseFloat(mm[1]);
    const pow = mm[2] ? parseInt(mm[2]) : 1;
    if (pow === 1) return `${coef}`;
    return `${round(coef * pow)}x${pow - 1 === 1 ? "" : "^" + (pow - 1)}`;
  });
  return `**Derivative:** **${parts.join(" + ").replace(/\+ -/g, "- ")}**`;
}

function round(n: number): number { return Math.round(n * 10000) / 10000; }

function percentQ(q: string): string | null {
  const m = q.match(/what\s+is\s+(\d+\.?\d*)\s*%\s*of\s*(\d+\.?\d*)/i);
  if (!m) return null;
  const v = (parseFloat(m[1]) / 100) * parseFloat(m[2]);
  return `${m[1]}% of ${m[2]} = **${round(v)}**`;
}

const CONCEPTS: Record<string, string> = {
  "spaced repetition": "**Spaced repetition** means reviewing material at increasing intervals...",
  "active recall": "**Active recall** = closing the book and forcing your brain to retrieve the answer...",
  "pomodoro": "**Pomodoro** = 25 minutes of single-task focus + 5 minutes break...",
};

function findConcept(q: string): string | null {
  const n = q.toLowerCase();
  let best: { key: string; len: number } | null = null;
  for (const key of Object.keys(CONCEPTS)) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(n) && (!best || key.length > best.len)) best = { key, len: key.length };
  }
  return best ? CONCEPTS[best.key] : null;
}

function answerStrategy(q: string, ctx: TutorContext): string {
  const topic = q.replace(/.*how (do|should) i (answer|approach|structure|write|solve|tackle|start)\s*/i, "").replace(/[?.]/g, "").trim();
  const deep = ctx.level === "phd" || ctx.level === "pg";
  return `### How to approach: ${topic || "this"}\n\n**1. Decode the command word.**\n**2. Plan for 60 seconds.**\n**3. Open with a precise 1-line definition.**`;
}

function topicExplainer(q: string, ctx: TutorContext): string | null {
  const n = q.toLowerCase();
  const wantsOverview = /(syllabus|overview|plan for|chapters|units|roadmap|where to start|how to study)/i.test(n);
  if (!wantsOverview) return null;
  for (const s of ctx.subjects) {
    if (n.includes(s.name.toLowerCase().split(" ")[0]) && s.name.length > 3) {
      const bank = lookupTopicBank(s.name) || [];
      const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
      return `### ${s.name}   study roadmap\nYou're **${pct}%** through (${s.done}/${s.total} lessons).\n\n**Recommended order**\n${bank.slice(0, 10).map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
    }
  }
  return null;
}

export function parseCommand(q: string): TutorReply["action"] | undefined {
  const n = q.toLowerCase().trim().replace(/[.!]+$/, "");
  
  if (/\b(planner|schedule|my plan|timetable)\b/.test(n) && /\b(open|go|show|view|take me|see)\b/.test(n)) return { type: "navigate", payload: "planner" };
  if (/\b(dashboard|overview|home|stats?)\b/.test(n) && /\b(open|go|show|view|take me|see)\b/.test(n)) return { type: "navigate", payload: "dashboard" };
  if (/\b(subjects?|syllabus|topics?|lessons?)\b/.test(n) && /\b(open|go|show|view|manage|edit)\b/.test(n)) return { type: "navigate", payload: "subjects" };
  if (/\b(settings?|preferences?|options?|profile)\b/.test(n) && /\b(open|go|show|change|edit)\b/.test(n)) return { type: "navigate", payload: "settings" };
  if (/^\/?(planner|schedule)$/.test(n)) return { type: "navigate", payload: "planner" };
  if (/^\/?(dashboard|overview)$/.test(n)) return { type: "navigate", payload: "dashboard" };
  if (/^\/?(subjects|syllabus)$/.test(n)) return { type: "navigate", payload: "subjects" };
  if (/^\/?(settings)$/.test(n)) return { type: "navigate", payload: "settings" };
  if (/\b(clock ?in|start (the )?(timer|clock|focus|session|studying|study)|begin (studying|session|focus)|let'?s study|i'?m ready to study)\b/.test(n)) return { type: "startTimer" };
  if (/\b(clock ?out|stop (the )?(timer|clock|session)|end (the )?(session|study)|i'?m done|finished studying)\b/.test(n)) return { type: "stopTimer" };
  if (/\b(take a break|break time|pause (the )?(timer|clock|session)|need a break)\b/.test(n)) return { type: "break" };
  if (/\b(zen|focus mode|full ?screen|distraction ?free|deep work mode)\b/.test(n)) return { type: "zen" };
  if (/\b(re-?plan|rebuild|regenerate|reschedule|re-?balance|redo my (plan|schedule)|fix my (plan|schedule)|update my plan)\b/.test(n)) return { type: "replan" };
  if (/\b(catch me up|i'?m behind|fell behind|too much pending|way behind|missed (days|class)|rebalance|reschedule)\b/.test(n)) return { type: "replan" };
  if (/\b(behind|fallback)\b/.test(n) && /\b(study|studies|plan|schedule|syllabus|exam|prep|revision|backlog|pending|help)\b/.test(n)) return { type: "replan" };

  if (/\btheme\b/.test(n) || /\b(midnight|dark|obsidian|nebula|emerald|sunset|mint|silver|lavender|samsung|light)\b/.test(n)) {
    if (/\b(midnight|dark)\b/.test(n)) return { type: "theme", payload: "theme-dark" };
    if (/\b(obsidian)\b/.test(n)) return { type: "theme", payload: "theme-obsidian" };
    if (/\b(nebula)\b/.test(n)) return { type: "theme", payload: "theme-nebula" };
    if (/\b(emerald|mint)\b/.test(n)) return { type: "theme", payload: "theme-mint" };
    if (/\b(sunset|champagne)\b/.test(n)) return { type: "theme", payload: "theme-sunset" };
    if (/\b(light|samsung|clean)\b/.test(n)) return { type: "theme", payload: "theme-sunset" };
    if (/\b(silver|lavender)\b/.test(n)) return { type: "theme", payload: "theme-silver-lavender" };
    if (/\btheme\b/.test(n)) return { type: "theme", payload: "theme-dark" };
  }

  return undefined;
}

export async function localTutor(q: string, ctx: TutorContext): Promise<TutorReply> {
  const action = parseCommand(q);
  const n = q.toLowerCase();

  if (action?.type === "replan") {
    return {
      text: `No problem   falling behind is built into the design, that's what buffer days are for. I'm rebalancing your schedule now: unfinished lessons get pushed forward, the daily load is re-spread across the remaining ${ctx.daysLeft} days, and your weakest subject keeps priority. Give me a second       `,
      action,
    };
  }
  if (action) {
    const msgs: Record<string, string> = {
      navigate: `Opening **${String(action.payload)}** for you.`,
      startTimer: `Clock started. Session logged against your current subject   I'll add the minutes to today's task automatically. Put the phone in another room.`,
      stopTimer: `Session stopped and logged. Nice work.`,
      break: `Break started. Stand up, look 6 metres away for 20 seconds, drink water. I'll ping you back in.`,
      zen: `Zen mode engaged. Nothing on screen but the timer.`,
      theme: `Theme changed instantly.`
    };
    return { text: msgs[action.type] || "Done.", action };
  }

  if (/(what|which).*(today|now)|today'?s (plan|task|study|load)|what should i (study|do)/.test(n)) {
    if (!ctx.today.length)
      return { text: `Nothing is scheduled for today   either it's a rest day or the plan hasn't been generated yet.` };
    const list = ctx.today.map((t, i) => `${i + 1}. **${t.title}**   ${t.minutes} min`).join("\n");
    return { text: `Here's today (${ctx.today.reduce((a, t) => a + t.minutes, 0)} min total):\n\n${list}\n\nStart with #1. Say *"start timer"* and I'll clock you in.` };
  }

  const pct = percentQ(q); if (pct) return { text: pct };
  const sim = simultaneous(q); if (sim) return { text: sim };
  const quad = solveQuadratic(q); if (quad) return { text: quad };
  const lin = solveLinear(q); if (lin) return { text: lin };
  const der = derivative(q); if (der) return { text: der };
  const integ = integral(q); if (integ) return { text: integ };
  const nt = numberTheory(q); if (nt) return { text: nt };

  const mathExpr = q.replace(/^(what is|calculate|compute|solve|=)\s*/i, "").replace(/[?=]/g, "").trim();
  if (/^[\d\s+\-*/().^% ]+$/.test(mathExpr) && /\d/.test(mathExpr) && /[+\-*/^]/.test(mathExpr)) {
    const v = evalMath(mathExpr);
    if (v !== null) return { text: `**${mathExpr} = ${round(v)}**` };
  }

  const concept = findConcept(q); if (concept) return { text: concept };
  const topic = topicExplainer(q, ctx); if (topic) return { text: topic };

  if (/^(hi|hello|hey|yo)\b/.test(n)) {
    return { text: `Hey ${ctx.name}! ${ctx.daysLeft} days to go and you're ${ctx.progressPct}% through ${ctx.courseName}.\n\nAsk me to explain a topic, solve a problem, or say *"replan"* if you've slipped.` };
  }

  const cmp = q.match(/difference between (.+?) and ([^?.]+)/i) || q.match(/compare (.+?) (?:and|vs\.?|with) ([^?.]+)/i);
  if (cmp) {
    const [a, b] = [cmp[1].trim(), cmp[2].trim()];
    const [ka, kb] = await Promise.all([lookupKnowledge(a), lookupKnowledge(b)]);
    if (ka && kb) return { text: `**${ka.title} vs ${kb.title}**\n\n**1. ${ka.title}**\n${ka.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")}\n\n**2. ${kb.title}**\n${kb.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")}\n\n<sub>Sources: ${ka.url}   ${kb.url}</sub>` };
  }

  if (/how (do|should) i (answer|approach|structure|write|solve|tackle|start)/i.test(n)) {
    return { text: answerStrategy(q, ctx) };
  }

  const subjectHint = ctx.subjects.find((s) => n.includes(s.name.toLowerCase().split(" ")[0]))?.name;
  const knowledge = await lookupKnowledge(q);
  if (knowledge) return { text: teachFromKnowledge(knowledge, q, ctx.level, subjectHint) };

  return { text: `I couldn't reach the AI or find a reference for that one. Try asking me to explain a specific concept, change your theme, or ask *"what should I study today?"*` };
}

export function tutorSystemPrompt(ctx: TutorContext): string {
  return `You are AETHER, the built-in AI tutor and study coach inside "Study Planner Pro". Learner: ${ctx.name}   Level: ${ctx.level}   Course: ${ctx.courseName} Exam date: ${ctx.examDate} (${ctx.daysLeft} days left)   Daily target: ${ctx.dailyHours}h Overall syllabus progress: ${ctx.progressPct}%   Streak: ${ctx.streak} days   Hours this week: ${ctx.hoursThisWeek}   Overdue tasks: ${ctx.overdue} Subjects: ${ctx.subjects.map((s) => `${s.name} (${s.done}/${s.total} lessons, ${s.difficulty})`).join("; ")} Today's plan: ${ctx.today.length ? ctx.today.map((t) => `${t.title} [${t.minutes}m, ${t.status}]`).join("; ") : "nothing scheduled"} Rules: - Teach, don't just answer. Show the reasoning steps for any problem (maths, science, logic, essays). - Match the learner's level: for nursery/school keep language simple and warm; for PhD be rigorous and cite frameworks. - Be concise but complete. Use markdown: bold key terms, numbered steps, short lists. - Always relate advice back to their actual plan and remaining days when it's relevant. - If the learner is behind, be encouraging and practical   never shame them. - If they ask you to change the app (replan, start timer, open a page), confirm briefly; the app handles the action.`;
}
