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
  } catch (e) {
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

export async function callLLM(
  system: string,
  messages: ChatMsg[],
  maxTokens = 3500
): Promise<string | null> {
  const providers = ["gemini", "groq", "openrouter"];

  for (const provider of providers) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
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
    } catch {
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

/**
 * Normalises subject names and ensures clean formatting.
 */
function cleanSubjectList(subjects: SeedSubject[]): SeedSubject[] {
  const out: SeedSubject[] = [];

  for (const s of subjects) {
    const name = String(s.name || "").trim();
    if (!name) continue;

    const isBundledEconomics =
      /econom/i.test(name) && /micro/i.test(name) && /macro/i.test(name);

    if (isBundledEconomics) {
      out.push({ ...s, name: "Micro Economics", units: s.units || 10 });
      out.push({ ...s, name: "Macro Economics", units: s.units || 10 });
      continue;
    }

    out.push(s);
  }

  const seen = new Set<string>();
  return out.filter((s) => {
    const key = s.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * AI Subject Suggestion using Deep Knowledge Retrieval.
 * Fetches the EXACT, authentic real-world unit count without artificial truncations or caps.
 */
export async function aiSuggestSubjects(
  courseName: string,
  level: string
): Promise<{ subjects: SeedSubject[]; source: string }> {
  const fallback = synthesiseSubjects(courseName, level);

  const systemPrompt = `You are an authoritative academic curriculum architect with comprehensive, deep knowledge of worldwide higher education, school boards, professional bodies, and university syllabi (including NMIMS, DU, IGNOU, CBSE, ICSE, UPSC, GATE, CFA, US/UK universities, etc.).

Your task is to perform Deep Knowledge Retrieval to fetch the authentic, official real-world syllabus for the requested course.

Guidelines:
1. Deep Knowledge Retrieval: Retrieve the EXACT, authentic subjects and realistic unit/chapter counts for each subject as prescribed in the official syllabus.
2. Authentic Unit Counts: DO NOT artificially compress, truncate, or cap unit counts. For example, if "Organizational Behavior" in an NMIMS MBA has 16 units, return units: 16. If "Quantitative Methods" has 12 units, return units: 12. If a course subject has 6, 8, 12, 16, or 20 units, return the authentic number.
3. Separation: Keep distinct papers separate (e.g. Micro Economics and Macro Economics are separate subjects).
4. Output Format: Return a STRICT JSON array of objects with keys "name", "units", "difficulty" (Easy | Medium | Hard), and "color" (hex). No surrounding prose or markdown fences.`;

  const userPrompt = `Course/Exam Title: "${courseName}"
Education Level: "${level}"

Retrieve the exact authentic curriculum papers and their authentic real-world unit/chapter counts.
Output format (strict JSON array only):
[
  {"name": "Subject Name", "units": 16, "difficulty": "Medium", "color": "#6366f1"}
]`;

  const raw = await callLLM(systemPrompt, [{ role: "user", content: userPrompt }], 3000);

  if (!raw) return { subjects: fallback, source: "aether-local" };

  try {
    const parsed = extractJson<SeedSubject[]>(raw);
    if (Array.isArray(parsed) && parsed.length >= 1) {
      const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#8b5cf6"];
      const normalised: SeedSubject[] = parsed.map((s, i) => ({
        name: String(s.name || "").trim().slice(0, 90),
        units: Math.max(1, Math.min(50, Math.round(Number(s.units)) || 8)),
        difficulty: (["Easy", "Medium", "Hard"].includes(String(s.difficulty)) ? s.difficulty : "Medium") as SeedSubject["difficulty"],
        color: /^#[0-9a-f]{6}$/i.test(String(s.color)) ? s.color : palette[i % palette.length],
      }));

      const cleaned = cleanSubjectList(normalised);
      if (cleaned.length >= 1) {
        return { subjects: cleaned, source: "AI Cloud Database" };
      }
    }
  } catch {
    /* fallback */
  }

  return { subjects: fallback, source: "aether-local" };
}

/**
 * AI Topic & Lesson Breakdown with Deep Knowledge Retrieval & Logical Unit Bifurcation.
 * If units are dense, logically bifurcates heavy units into clear, digestible study blocks.
 */
export async function aiGenerateTopics(
  subjectName: string,
  units: number,
  difficulty: string,
  level: string,
  courseName: string,
  dailyHoursLimit = 2
): Promise<GeneratedTopic[]> {
  const fallback = generateTopics(subjectName, units, difficulty, level);

  const systemPrompt = `You are an elite curriculum breakdown and pedagogical sequencing engine.
Your task is to generate a comprehensive, lesson-by-lesson syllabus breakdown for a subject using Deep Knowledge Retrieval.

Pedagogical Rules:
1. Deep Knowledge Retrieval: Retrieve authentic, sequential lesson/chapter topics for "${subjectName}" matching the official curriculum for "${courseName}".
2. Unit Bifurcation: If a unit is conceptually dense, heavy in calculations, or requires multi-step analysis, logically bifurcate it into digestible, high-impact study blocks (e.g. "Unit X (Part 1): Concepts & Frameworks", "Unit X (Part 2): Applications & Case Problems") suitable for a ${dailyHoursLimit}-hour daily study commitment.
3. Completeness: Provide detailed 2-sentence study instructions ("summary"), 2-3 actionable learning objectives ("objectives"), accurate difficulty rating, and estimated study minutes (30-60 mins).
4. Strict JSON output: Return ONLY a JSON array.`;

  const userPrompt = `Course: "${courseName}" (${level})
Subject: "${subjectName}"
Target Number of Lessons/Units: ${units}
Subject Difficulty: ${difficulty}

Generate exactly ${units} sequenced lessons as a JSON array of objects with keys:
- "unit": string (e.g. "Unit 1", "Unit 1 (Part 1)", "Unit 2", etc.)
- "title": string (Specific, authoritative lesson title)
- "summary": string (Concise study guideline)
- "objectives": string[] (2-3 concrete objectives)
- "difficulty": "Easy" | "Medium" | "Hard"
- "estMinutes": number (between 25 and 75)`;

  const raw = await callLLM(systemPrompt, [{ role: "user", content: userPrompt }], 3500);

  if (!raw) return fallback;

  try {
    const parsed = extractJson<GeneratedTopic[]>(raw);
    if (parsed && Array.isArray(parsed) && parsed.length >= 1) {
      return parsed.slice(0, units).map((t, i) => ({
        unit: t.unit || `Unit ${i + 1}`,
        title: String(t.title || fallback[i]?.title || `Lesson ${i + 1}`).trim().slice(0, 160),
        summary: String(t.summary || fallback[i]?.summary || `Comprehensive study of ${t.title || `Unit ${i + 1}`}.`),
        objectives: Array.isArray(t.objectives) && t.objectives.length
          ? t.objectives.slice(0, 4).map(String)
          : [`Understand core theories of ${t.title || `Unit ${i + 1}`}`, "Complete practice problems and case questions"],
        difficulty: (["Easy", "Medium", "Hard"].includes(String(t.difficulty))
          ? t.difficulty
          : "Medium") as "Easy" | "Medium" | "Hard",
        estMinutes: Math.min(120, Math.max(20, Number(t.estMinutes) || 45)),
      }));
    }
  } catch {
    /* fallback */
  }

  return fallback;
}

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

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function percentQ(q: string): string | null {
  const m = q.match(/what\s+is\s+(\d+\.?\d*)\s*%\s*of\s*(\d+\.?\d*)/i);
  if (!m) return null;
  const v = (parseFloat(m[1]) / 100) * parseFloat(m[2]);
  return `${m[1]}% of ${m[2]} = **${round(v)}**`;
}

export function parseCommand(q: string): TutorReply["action"] | undefined {
  const n = q.toLowerCase().trim().replace(/[.!]+$/, "");

  if (/\b(planner|schedule|my plan|timetable)\b/.test(n) && /\b(open|go|show|view|take me|see)\b/.test(n))
    return { type: "navigate", payload: "planner" };
  if (/\b(dashboard|overview|home|stats?)\b/.test(n) && /\b(open|go|show|view|take me|see)\b/.test(n))
    return { type: "navigate", payload: "dashboard" };
  if (/\b(subjects?|syllabus|topics?|lessons?)\b/.test(n) && /\b(open|go|show|view|manage|edit)\b/.test(n))
    return { type: "navigate", payload: "subjects" };
  if (/\b(settings?|preferences?|options?|profile)\b/.test(n) && /\b(open|go|show|change|edit)\b/.test(n))
    return { type: "navigate", payload: "settings" };
  if (/^\/?(planner|schedule)$/.test(n)) return { type: "navigate", payload: "planner" };
  if (/^\/?(dashboard|overview)$/.test(n)) return { type: "navigate", payload: "dashboard" };
  if (/^\/?(subjects|syllabus)$/.test(n)) return { type: "navigate", payload: "subjects" };
  if (/^\/?(settings)$/.test(n)) return { type: "navigate", payload: "settings" };
  if (
    /\b(clock ?in|start (the )?(timer|clock|focus|session|studying|study)|begin (studying|session|focus)|let'?s study|i'?m ready to study)\b/.test(
      n
    )
  )
    return { type: "startTimer" };
  if (
    /\b(clock ?out|stop (the )?(timer|clock|session)|end (the )?(session|study)|i'?m done|finished studying)\b/.test(
      n
    )
  )
    return { type: "stopTimer" };
  if (/\b(take a break|break time|pause (the )?(timer|clock|session)|need a break)\b/.test(n))
    return { type: "break" };
  if (/\b(zen|focus mode|full ?screen|distraction ?free|deep work mode)\b/.test(n))
    return { type: "zen" };
  if (
    /\b(re-?plan|rebuild|regenerate|reschedule|re-?balance|redo my (plan|schedule)|fix my (plan|schedule)|update my plan)\b/.test(
      n
    )
  )
    return { type: "replan" };

  if (
    n.includes("theme") ||
    /\b(midnight|dark|obsidian|nebula|emerald|sunset|mint|silver|lavender|samsung|light|black)\b/.test(n)
  ) {
    if (/(midnight|dark|black)/.test(n)) return { type: "theme", payload: "dark" };
    if (/(obsidian)/.test(n)) return { type: "theme", payload: "obsidian" };
    if (/(nebula)/.test(n)) return { type: "theme", payload: "nebula" };
    if (/(emerald|mint)/.test(n)) return { type: "theme", payload: "mint" };
    if (/(sunset|champagne)/.test(n)) return { type: "theme", payload: "sunset" };
    if (/(silver|lavender)/.test(n)) return { type: "theme", payload: "silver-lavender" };
    return { type: "theme", payload: "dark" };
  }
  return undefined;
}

export async function localTutor(q: string, ctx: TutorContext): Promise<TutorReply> {
  const action = parseCommand(q);
  const n = q.toLowerCase();

  if (action?.type === "replan") {
    return {
      text: `Understood! I am rebalancing your schedule mathematically right now...`,
      action,
    };
  }
  if (action) {
    const msgs: Record<string, string> = {
      navigate: `Opening **${String(action.payload)}** for you.`,
      startTimer: `Clock started. Session logged against your active subject. Happy studying!`,
      stopTimer: `Session stopped and logged. Excellent work.`,
      break: `Break started. Step away, stretch, hydrate, and rest your eyes.`,
      zen: `Zen mode engaged. Distraction-free focus activated.`,
      theme: `Theme updated.`,
    };
    return { text: msgs[action.type] || "Done.", action };
  }

  if (/(what|which).*(today|now)|today'?s (plan|task|study|load)|what should i (study|do)/.test(n)) {
    if (!ctx.today.length)
      return {
        text: `Nothing is currently scheduled for today — either it's a rest day or your plan has not been generated yet.`,
      };
    const list = ctx.today.map((t, i) => `${i + 1}. **${t.title}** (${t.minutes} min)`).join("\n");
    return {
      text: `Here is your scheduled study load for today (${ctx.today.reduce((a, t) => a + t.minutes, 0)} min total):\n\n${list}\n\nSay *"clock in"* or click the timer to begin!`,
    };
  }

  const pct = percentQ(q);
  if (pct) return { text: pct };

  if (/how (do|should) i (answer|approach|structure|write|solve|tackle|start)/i.test(n)) {
    return {
      text: `### Strategy Guide\n\n**1. Understand the core requirements.**\n**2. Outline key points before writing or solving.**\n**3. Support your response with definitions, structured diagrams, and real-world examples.**`,
    };
  }

  const aiResponse = await callLLM(
    tutorSystemPrompt(ctx),
    [{ role: "user", content: q }],
    1200
  );

  if (aiResponse) {
    return { text: aiResponse };
  }

  const subjectHint = ctx.subjects.find((s) => n.includes(s.name.toLowerCase().split(" ")[0]))?.name;
  const knowledge = await lookupKnowledge(q);
  if (knowledge) return { text: teachFromKnowledge(knowledge, q, ctx.level, subjectHint) };

  return {
    text: `I'm ready to help you study. You can ask me to explain any concept, solve a problem, structure an exam answer, or ask *"what should I study today?"*`,
  };
}

export function tutorSystemPrompt(ctx: TutorContext): string {
  return `You are AETHER, an expert AI tutor, curriculum mentor, and study coach inside "Study Planner Pro".
Learner: ${ctx.name}
Level: ${ctx.level}
Course: ${ctx.courseName}
Exam Date: ${ctx.examDate} (${ctx.daysLeft} days remaining)
Syllabus Progress: ${ctx.progressPct}%
Active Subjects: ${ctx.subjects.map((s) => `${s.name} (${s.done}/${s.total} lessons)`).join(", ")}

Instructions:
- Be encouraging, concise, highly pedagogical, and clear.
- Explain concepts using first principles, practical intuition, structured step-by-step breakdowns, and worked examples.
- Use GitHub Flavored Markdown for formatting.`;
}
