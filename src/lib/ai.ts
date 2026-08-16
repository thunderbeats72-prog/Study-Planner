import { generateTopics, lookupTopicBank, synthesiseSubjects, type GeneratedTopic, type SeedSubject } from "./curriculum";
import { lookupKnowledge, teachFromKnowledge } from "./knowledge";

/* ============================================================
   LLM PROVIDER LAYER (CASCADING FALLBACK)
============================================================ */
type ChatMsg = { role: "user" | "assistant"; content: string };

export function activeProvider(): string | null {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "AI Cloud";
  if (process.env.GROQ_API_KEY) return "Groq";
  if (process.env.OPENROUTER_API_KEY) return "OpenRouter";
  return null;
}

export async function callLLM(
  system: string,
  messages: ChatMsg[],
  maxTokens = 2500 // Increased tokens to allow for full comprehensive MBA syllabuses
): Promise<string | null> {
  const providers = ["gemini", "groq", "openrouter"];

  for (const provider of providers) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 18000); 
      let text: string | null = null;

      if (provider === "gemini" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
        const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        const model = process.env.GEMINI_MODEL || "gemini-1.5-flash"; 
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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
      } 
      else if (provider === "groq" && process.env.GROQ_API_KEY) {
        const key = process.env.GROQ_API_KEY;
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
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
      } 
      else if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
        const key = process.env.OPENROUTER_API_KEY;
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
          headers: { 
            "content-type": "application/json", 
            "authorization": `Bearer ${key}`,
            "HTTP-Referer": "https://studyplanner.netlify.app", 
            "X-Title": "Study Planner Pro" 
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
    } catch (error) { continue; }
  }
  return null;
}

function extractJson<T>(raw: string): T | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : raw;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const endBrace = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
  try { return JSON.parse(body.slice(start, endBrace + 1)) as T; } 
  catch { return null; }
}

/* ============================================================
   CURRICULUM SYNTHESIS (STRICT ACCURACY FOR INSTITUTIONS)
============================================================ */
export async function aiSuggestSubjects(
  courseName: string,
  level: string
): Promise<{ subjects: SeedSubject[]; source: string }> {
  const fallback = synthesiseSubjects(courseName, level);

  const raw = await callLLM(
    "You are an elite academic curriculum planner. Reply with strict JSON only.",
    [
      {
        role: "user",
        content: `Course/exam: "${courseName}". Education level: ${level}. 
        You must act as the official syllabus generator for this exact institution and specialization. 
        List ALL the actual core and specialization subjects (Minimum 8 subjects, maximum 16 subjects) as a strict JSON array. 
        For example, if the course is "MBA Marketing NMIMS CDOE", you MUST explicitly output the real subjects such as 'Business Communication', 'Financial Accounting', 'Micro & Macro Economics', 'Organizational Behavior', 'Marketing Management', 'Operations Management', etc. 
        "units" MUST be the realistic number of chapters or modules for that specific subject (strictly choose a number between 6 to 15). 
        Format: [{"name":"Marketing Management","units":10,"difficulty":"Medium","color":"#6366f1"}]. 
        JSON array only, no other text.`
      }
    ],
    2000
  );
  
  if (!raw) return { subjects: fallback, source: "aether-local" };

  try {
    const parsed = extractJson<SeedSubject[]>(raw);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
      return {
        // Allows up to 16 subjects to ensure complete MBA curriculums are loaded
        subjects: parsed.slice(0, 16).map((s, i) => ({
          name: String(s.name).slice(0, 80),
          units: Math.min(30, Math.max(2, Number(s.units) || 8)),
          difficulty: (["Easy", "Medium", "Hard"].includes(String(s.difficulty)) ? s.difficulty : "Medium") as SeedSubject["difficulty"],
          color: /^#[0-9a-f]{6}$/i.test(String(s.color)) ? s.color : palette[i % palette.length],
        })),
        source: "AI Cloud Database",
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
    `You are a strict curriculum architect. Produce a lesson-by-lesson syllabus breakdown as strict JSON only.`,
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
   LOCAL TUTOR ENGINE (In-App Commands & Final Fallback)
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

function round(n: number): number { return Math.round(n * 10000) / 10000; }
function percentQ(q: string): string | null {
  const m = q.match(/what\s+is\s+(\d+\.?\d*)\s*%\s*of\s*(\d+\.?\d*)/i);
  if (!m) return null;
  const v = (parseFloat(m[1]) / 100) * parseFloat(m[2]);
  return `${m[1]}% of ${m[2]} = **${round(v)}**`;
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
  
  // FIX: Properly parses and triggers all theme variants (midnight, dark, obsidian, etc.)
  if (/\btheme\b/i.test(n) || /\b(midnight|dark|obsidian|nebula|emerald|sunset|mint|silver|lavender|samsung|light|black)\b/i.test(n)) {
    if (/\b(midnight|dark|black)\b/i.test(n)) return { type: "theme", payload: "theme-dark" };
    if (/\b(obsidian)\b/i.test(n)) return { type: "theme", payload: "theme-obsidian" };
    if (/\b(nebula)\b/i.test(n)) return { type: "theme", payload: "theme-nebula" };
    if (/\b(emerald|mint)\b/i.test(n)) return { type: "theme", payload: "theme-mint" };
    if (/\b(sunset|champagne)\b/i.test(n)) return { type: "theme", payload: "theme-sunset" };
    if (/\b(light|samsung|clean)\b/i.test(n)) return { type: "theme", payload: "theme-sunset" };
    if (/\b(silver|lavender)\b/i.test(n)) return { type: "theme", payload: "theme-silver-lavender" };
    return { type: "theme", payload: "theme-dark" };
  }

  return undefined;
}

export async function localTutor(q: string, ctx: TutorContext): Promise<TutorReply> {
  const action = parseCommand(q);
  const n = q.toLowerCase();

  if (action?.type === "replan") {
    return { text: `No problem, falling behind is built into the design, that's what buffer days are for. I'm rebalancing your schedule now. Give me a second...`, action };
  }
  if (action) {
    const msgs: Record<string, string> = {
      navigate: `Opening **${String(action.payload)}** for you.`,
      startTimer: `Clock started. Session logged against your current subject. Put the phone in another room.`,
      stopTimer: `Session stopped and logged. Nice work.`,
      break: `Break started. Stand up, look 6 metres away for 20 seconds, drink water.`,
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

  if (/how (do|should) i (answer|approach|structure|write|solve|tackle|start)/i.test(n)) {
    return { text: `### How to approach: this\n\n**1. Decode the command word.**\n**2. Plan for 60 seconds before writing.**\n**3. Open with a precise 1-line definition.**` };
  }

  const subjectHint = ctx.subjects.find((s) => n.includes(s.name.toLowerCase().split(" ")[0]))?.name;
  const knowledge = await lookupKnowledge(q);
  if (knowledge) return { text: teachFromKnowledge(knowledge, q, ctx.level, subjectHint) };

  return { text: `I couldn't reach any AI servers and my local database doesn't have a specific answer for this. Try asking me to explain a specific concept, change your theme, or ask *"what should I study today?"*` };
}

export function tutorSystemPrompt(ctx: TutorContext): string {
  return `You are AETHER, the built-in AI tutor and study coach inside "Study Planner Pro". Learner: ${ctx.name}   Level: ${ctx.level}   Course: ${ctx.courseName} Exam date: ${ctx.examDate}. Rules: Teach, don't just answer. Use markdown. Be concise.`;
}
