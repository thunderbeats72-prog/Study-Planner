import { generateTopics, lookupTopicBank, synthesiseSubjects, type GeneratedTopic, type SeedSubject } from "./curriculum";
import { lookupKnowledge, teachFromKnowledge } from "./knowledge";

/* ============================================================
   LLM PROVIDER LAYER (MASTER SWITCH)
============================================================ */

// --- 1. PASTE YOUR KEYS HERE ---
const GEMINI_KEY = "AQ.Ab8RN6JqNqlw-cppQes2J3GtSUNUsGSR-jldRwlPziFsT3dusQ";
const GROQ_KEY = "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";
const OPENROUTER_KEY = "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";

// --- 2. CHOOSE YOUR AI ---
export function activeProvider(): string | null {
  return "gemini"; // Change to "groq" or "openrouter" as needed
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
      // FIX: Updated to the correct, active Gemini 1.5 Flash model
      const model = "gemini-1.5-flash";
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

      // FIX: Added HTTP-Referer headers required by OpenRouter
      const r = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${key}`,
          "HTTP-Referer": "https://studyplanner.netlify.app",
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
   CURRICULUM SYNTHESIS
============================================================ */
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

export async function aiSuggestSubjects(
  courseName: string,
  level: string
): Promise<{ subjects: SeedSubject[]; source: string }> {
  // FIX: Force the app to ALWAYS use the highly accurate local syllabus dictionary.
  // This stops the AI from hallucinating irrelevant subjects for courses like NMIMS.
  const preciseSyllabus = synthesiseSubjects(courseName, level);
  return { subjects: preciseSyllabus, source: "aether-database (high accuracy)" };
}

/* ============================================================
   LOCAL TUTOR ENGINE (works with zero API keys)
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
  return `**Solving ${m[0]}**\n\n1. Move the constant: ${a}x = ${c} ${b >= 0 ? "-" : "+"} ${Math.abs(b)} = ${c - b}\n2. Divide both sides by ${a}: x = ${c - b} / ${a}\n\n**x = ${Math.round(x * 10000) / 10000}**`;
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
    roots = `x  = ${Math.round(((-b + Math.sqrt(disc)) / (2 * a)) * 10000) / 10000}, x  = ${Math.round(((-b - Math.sqrt(disc)) / (2 * a)) * 10000) / 10000}`;
  } else if (disc === 0) {
    roots = `x = ${Math.round((-b / (2 * a)) * 10000) / 10000} (repeated root)`;
  } else {
    roots = `x = ${Math.round((-b / (2 * a)) * 10000) / 10000}   ${Math.round((Math.sqrt(-disc) / (2 * a)) * 10000) / 10000}i (complex roots)`;
  }
  return `**Quadratic:** ${a}x  ${b >= 0 ? "+" : "-"} ${Math.abs(b)}x ${c >= 0 ? "+" : "-"} ${Math.abs(c)} = 0\n\nDiscriminant D = **${Math.round(disc * 10000) / 10000}**\n\n**${roots}**`;
}

function percentQ(q: string): string | null {
  const m = q.match(/what\s+is\s+(\d+\.?\d*)\s*%\s*of\s*(\d+\.?\d*)/i);
  if (!m) return null;
  const v = (parseFloat(m[1]) / 100) * parseFloat(m[2]);
  return `${m[1]}% of ${m[2]} = **${Math.round(v * 10000) / 10000}**`;
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
  return undefined;
}

export async function localTutor(q: string, ctx: TutorContext): Promise<TutorReply> {
  const action = parseCommand(q);
  const n = q.toLowerCase();
  if (action?.type === "replan") {
    return { text: `No problem   falling behind is built into the design, that's what buffer days are for. I'm rebalancing your schedule now: unfinished lessons get pushed forward, the daily load is re-spread across the remaining ${ctx.daysLeft} days, and your weakest subject keeps priority. Give me a second       `, action };
  }
  if (action) {
    const msgs: Record<string, string> = {
      navigate: `Opening **${String(action.payload)}** for you.`,
      startTimer: `Clock started. Session logged against your current subject   I'll add the minutes to today's task automatically. Put the phone in another room.`,
      stopTimer: `Session stopped and logged. Nice work.`,
      break: `Break started. Stand up, look 6 metres away for 20 seconds, drink water. I'll ping you back in.`,
      zen: `Zen mode engaged. Nothing on screen but the timer.`,
    };
    return { text: msgs[action.type] || "Done.", action };
  }
  if (/(what|which).*(today|now)|today'?s (plan|task|study|load)|what should i (study|do)/.test(n)) {
    if (!ctx.today.length) return { text: `Nothing is scheduled for today.` };
    const list = ctx.today.map((t, i) => `${i + 1}. **${t.title}**   ${t.minutes} min`).join("\n");
    return { text: `Here's today (${ctx.today.reduce((a, t) => a + t.minutes, 0)} min total):\n\n${list}\n\nStart with #1. Say *"start timer"* and I'll clock you in.` };
  }
  const pct = percentQ(q); if (pct) return { text: pct };
  const quad = solveQuadratic(q); if (quad) return { text: quad };
  const lin = solveLinear(q); if (lin) return { text: lin };
  const mathExpr = q.replace(/^(what is|calculate|compute|solve|=)\s*/i, "").replace(/[?=]/g, "").trim();
  if (/^[\d\s+\-*/().^% ]+$/.test(mathExpr) && /\d/.test(mathExpr) && /[+\-*/^]/.test(mathExpr)) {
    const v = evalMath(mathExpr);
    if (v !== null) return { text: `**${mathExpr} = ${Math.round(v * 10000) / 10000}**` };
  }
  const subjectHint = ctx.subjects.find((s) => n.includes(s.name.toLowerCase().split(" ")[0]))?.name;
  const knowledge = await lookupKnowledge(q);
  if (knowledge) return { text: teachFromKnowledge(knowledge, q, ctx.level, subjectHint) };
  return { text: `I couldn't find a solid reference for that. Try giving me the exact wording or ask me to explain a concept from your syllabus!` };
}

export function tutorSystemPrompt(ctx: TutorContext): string {
  return `You are AETHER, the built-in AI tutor and study coach inside "Study Planner Pro". Learner: ${ctx.name}   Level: ${ctx.level}   Course: ${ctx.courseName} Exam date: ${ctx.examDate} (${ctx.daysLeft} days left)   Daily target: ${ctx.dailyHours}h Overall syllabus progress: ${ctx.progressPct}%   Streak: ${ctx.streak} days   Hours this week: ${ctx.hoursThisWeek}   Overdue tasks: ${ctx.overdue} Subjects: ${ctx.subjects.map((s) => `${s.name} (${s.done}/${s.total} lessons, ${s.difficulty})`).join("; ")} Today's plan: ${ctx.today.length ? ctx.today.map((t) => `${t.title} [${t.minutes}m, ${t.status}]`).join("; ") : "nothing scheduled"} Rules: - Teach, don't just answer. Show the reasoning steps for any problem (maths, science, logic, essays). - Match the learner's level: for nursery/school keep language simple and warm; for PhD be rigorous and cite frameworks. - Be concise but complete. Use markdown: bold key terms, numbered steps, short lists. - Always relate advice back to their actual plan and remaining days when it's relevant. - If the learner is behind, be encouraging and practical   never shame them. - If they ask you to change the app (replan, start timer, open a page), confirm briefly; the app handles the action.`;
}
