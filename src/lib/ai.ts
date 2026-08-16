import { generateTopics, lookupTopicBank, synthesiseSubjects, type GeneratedTopic, type SeedSubject } from "./curriculum";
import { lookupKnowledge, teachFromKnowledge } from "./knowledge";

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
   LLM CALLER — Gemini → Groq → OpenRouter fallback chain
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

/* ============================================================
   JSON EXTRACTION
============================================================ */
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
   BROCHURE-ACCURATE HARD CONSTRAINTS
============================================================ */
function enforceBrochureConstraints(parsedSubjects: SeedSubject[]): SeedSubject[] {
  // This physically forces the exact NMIMS CDOE Semester 1 structure
  const requiredSyllabus = [
    { name: "Business Communication", units: 0 },
    { name: "Financial Accounting", units: 0 },
    { name: "Micro Economics & Macro Economics", units: 0 }, // Forces them combined
    { name: "Organizational Behavior", units: 16 }, // Forces exactly 16 units
    { name: "Marketing Management", units: 0 },
    { name: "Quantitative Methods - I", units: 12 } // Forces exactly 12 units
  ];

  const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
  const out: SeedSubject[] = [];

  for (let i = 0; i < requiredSyllabus.length; i++) {
    const req = requiredSyllabus[i];
    // Find the closest match from AI to retain its generated difficulty
    const match = parsedSubjects.find(s => 
      s.name.toLowerCase().includes(req.name.toLowerCase().split(" ")[0]) || 
      s.name.toLowerCase().includes("quant") || s.name.toLowerCase().includes("micro")
    );

    let finalUnits = req.units > 0 ? req.units : (match?.units || 10);
    finalUnits = Math.min(40, Math.max(2, finalUnits)); // Ensure valid numbers

    out.push({
      name: req.name,
      units: finalUnits,
      difficulty: match?.difficulty || "Medium",
      color: palette[i % palette.length]
    });
  }
  return out;
}

export async function aiSuggestSubjects(
  courseName: string,
  level: string
): Promise<{ subjects: SeedSubject[]; source: string }> {
  const fallback = synthesiseSubjects(courseName, level);

  const raw = await callLLM(
    "You are an elite academic curriculum planner. Return a strict JSON array ONLY. DO NOT output conversational text, explanations, or markdown fences outside the JSON.",
    [
      {
        role: "user",
        content: `Course/exam: "${courseName}". Education level: ${level}.
        Based on the official NMIMS CDOE Semester 1 curriculum, you MUST return exactly these 6 core subjects:
        1. "Business Communication"
        2. "Financial Accounting"
        3. "Micro Economics & Macro Economics" (THIS IS A SINGLE COMBINED SUBJECT)
        4. "Organizational Behavior" (Must be exactly 16 units)
        5. "Marketing Management"
        6. "Quantitative Methods - I" (MUST BE EXACTLY 12 UNITS).

        Output format MUST be EXACTLY:
        [{"name":"Exact Subject Name","units":12,"difficulty":"Medium","color":"#6366f1"}]`
      }
    ],
    2500
  );

  if (!raw) return { subjects: fallback, source: "aether-local" };

  try {
    const parsed = extractJson<SeedSubject[]>(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const validated = enforceBrochureConstraints(parsed);
      return { subjects: validated, source: "AI Cloud Database" };
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
    `You are a strict curriculum architect. Return a strict JSON array ONLY. Do NOT output conversational text, pleasantries, or markdown fences outside the JSON.`,
    [
      {
        role: "user",
        content: `Course: ${courseName} (level: ${level}). Subject: "${subjectName}". Canonical unit count: ${units}. Difficulty: ${difficulty}.
        Generate exactly ${units} sequential lessons.
        Format: [{"unit":"Unit 1","title":"...","summary":"2-sentence instruction","objectives":["..."],"difficulty":"Medium","estMinutes":45}]
        JSON ARRAY ONLY.`,
      },
    ],
    Math.min(4000, 800 + units * 120)
  );

  if (!raw) return fallback;

  const parsed = extractJson<GeneratedTopic[]>(raw);
  if (!parsed || !Array.isArray(parsed) || parsed.length < 2) return fallback;

  const maxLessons = units * 2;
  return parsed.slice(0, maxLessons).map((t, i) => ({
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

  if (n.includes("theme") || /\b(midnight|dark|obsidian|nebula|emerald|sunset|mint|silver|lavender|samsung|light|black)\b/.test(n)) {
    if (/(midnight|dark|black)/.test(n)) return { type: "theme", payload: "theme-dark" };
    if (/(obsidian)/.test(n)) return { type: "theme", payload: "theme-obsidian" };
    if (/(nebula)/.test(n)) return { type: "theme", payload: "theme-nebula" };
    if (/(emerald|mint)/.test(n)) return { type: "theme", payload: "theme-mint" };
    if (/(sunset|champagne)/.test(n)) return { type: "theme", payload: "theme-sunset" };
    if (/(light|samsung|clean)/.test(n)) return { type: "theme", payload: "theme-sunset" };
    if (/(silver|lavender)/.test(n)) return { type: "theme", payload: "theme-silver-lavender" };
    return { type: "theme", payload: "theme-dark" };
  }
  return undefined;
}

export async function localTutor(q: string, ctx: TutorContext): Promise<TutorReply> {
  const action = parseCommand(q);
  const n = q.toLowerCase();

  if (action?.type === "replan") {
    return { text: `No problem. I'm rebalancing your schedule now. Give me a second...`, action };
  }
  if (action) {
    const msgs: Record<string, string> = {
      navigate: `Opening **${String(action.payload)}** for you.`,
      startTimer: `Clock started. Session logged against your current subject. Put the phone in another room.`,
      stopTimer: `Session stopped and logged. Nice work.`,
      break: `Break started. Stand up, look 6 metres away for 20 seconds, drink water.`,
      zen: `Zen mode engaged. Nothing on screen but the timer.`,
      theme: `Theme changed instantly.`,
    };
    return { text: msgs[action.type] || "Done.", action };
  }

  if (/(what|which).*(today|now)|today'?s (plan|task|study|load)|what should i (study|do)/.test(n)) {
    if (!ctx.today.length) return { text: `Nothing is scheduled for today.` };
    const list = ctx.today.map((t, i) => `${i + 1}. **${t.title}**   ${t.minutes} min`).join("\n");
    return { text: `Here's today:\n\n${list}\n\nStart with #1. Say *"start timer"* and I'll clock you in.` };
  }

  const pct = percentQ(q); if (pct) return { text: pct };

  const aiResponse = await callLLM(tutorSystemPrompt(ctx), [{ role: "user", content: q }], 800);
  if (aiResponse) return { text: aiResponse };

  const subjectHint = ctx.subjects.find((s) => n.includes(s.name.toLowerCase().split(" ")[0]))?.name;
  const knowledge = await lookupKnowledge(q);
  if (knowledge) return { text: teachFromKnowledge(knowledge, q, ctx.level, subjectHint) };

  return { text: `I couldn't reach any AI servers. Try asking me to explain a specific concept.` };
}

export function tutorSystemPrompt(ctx: TutorContext): string {
  return `You are AETHER, the built-in AI tutor and study coach. Learner: ${ctx.name}. Rules: Be conversational. Use markdown. Teach, don't just give answers.`;
}
