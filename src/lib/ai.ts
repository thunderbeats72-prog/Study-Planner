import {
  generateTopics,
  synthesiseSubjects,
  nmimsSem1Subjects,
  isNmimsQuery,
  getNmimsChapters,
  cbseCatalogFor,
  getCbseChapters,
  isAmityQuery,
  curriculumSources,
  type CurriculumSource,
  type SeedSubject,
  type GeneratedTopic,
} from "./curriculum";
import { lookupKnowledge, teachFromKnowledge } from "./knowledge";

// Re-export the canonical topic shape so existing imports from "./ai" keep working.
export type { GeneratedTopic, CurriculumSource } from "./curriculum";

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
  if (getSafeKey("GEMINI_API_KEY") || getSafeKey("GOOGLE_API_KEY")
    || getSafeKey("NEXT_PUBLIC_GEMINI_API_KEY") || getSafeKey("NEXT_PUBLIC_GOOGLE_API_KEY")) return "AI Cloud";
  if (getSafeKey("GROQ_API_KEY") || getSafeKey("NEXT_PUBLIC_GROQ_API_KEY")) return "Groq";
  if (getSafeKey("OPENROUTER_API_KEY") || getSafeKey("NEXT_PUBLIC_OPENROUTER_API_KEY")) return "OpenRouter";
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
  const geminiKey = getSafeKey("GEMINI_API_KEY") || getSafeKey("GOOGLE_API_KEY")
    || getSafeKey("NEXT_PUBLIC_GEMINI_API_KEY") || getSafeKey("NEXT_PUBLIC_GOOGLE_API_KEY");
  const groqKey = getSafeKey("GROQ_API_KEY") || getSafeKey("NEXT_PUBLIC_GROQ_API_KEY");
  const openrouterKey = getSafeKey("OPENROUTER_API_KEY") || getSafeKey("NEXT_PUBLIC_OPENROUTER_API_KEY");
  const providers = [
    geminiKey ? "gemini" : null,
    groqKey ? "groq" : null,
    openrouterKey ? "openrouter" : null,
  ].filter(Boolean) as Array<"gemini" | "groq" | "openrouter">;
  const deadline = Date.now() + 15000; // one bounded budget for the whole chain

  for (const provider of providers) {
    const remaining = deadline - Date.now();
    if (remaining < 500) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(8500, remaining));
    let text: string | null = null;

    try {
      if (provider === "gemini" && geminiKey) {
        const configured = getSafeKey("GEMINI_MODEL") || getSafeKey("NEXT_PUBLIC_GEMINI_MODEL");
        const geminiModels = [...new Set([configured, "gemini-3.7-flash", "gemini-2.5-flash"].filter(Boolean))] as string[];
        for (const model of geminiModels) {
          if (Date.now() >= deadline) break;
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            {
              method: "POST",
              signal: ctrl.signal,
              headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: messages.map((message) => ({
                  role: message.role === "assistant" ? "model" : "user",
                  parts: [{ text: message.content }],
                })),
                generationConfig: { maxOutputTokens: maxTokens },
              }),
            }
          );
          if (response.ok) {
            const json = await response.json();
            text = json?.candidates?.[0]?.content?.parts
              ?.map((part: { text?: string }) => part.text || "").join("") ?? null;
            if (text) break;
          }
        }
      } else if (provider === "groq" && groqKey) {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: maxTokens,
            messages: [{ role: "system", content: system }, ...messages],
          }),
        });
        if (response.ok) {
          const json = await response.json();
          text = json?.choices?.[0]?.message?.content ?? null;
        }
      } else if (provider === "openrouter" && openrouterKey) {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        if (response.ok) {
          const json = await response.json();
          text = json?.choices?.[0]?.message?.content ?? null;
        }
      }
    } catch {
      // Try the next configured provider within the shared deadline.
    } finally {
      clearTimeout(timer);
    }

    if (text?.trim()) return text.trim();
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
): Promise<{ subjects: SeedSubject[]; source: string; sources: CurriculumSource[] }> {
  const fallback = synthesiseSubjects(courseName, level);
  const query = courseName.toLowerCase();
  const sources = curriculumSources(courseName, "", level);

  // CBSE/NCERT ground truth: exact verified catalog, LLM never invoked.
  if (cbseCatalogFor(courseName)) {
    return { subjects: fallback, source: "Verified NCERT Catalog", sources };
  }

  // LEVEL GUARD: early-years learners get the age-appropriate local
  // catalog, never LLM output (which invents grown-up subject batches
  // for custom course names typed at nursery level).
  if (level === "nursery" || /nursery|pre-?primary|playgroup|kinder|\blkg\b|\bukg\b/i.test(query)) {
    return { subjects: fallback, source: "Verified Early-Years Catalog", sources };
  }

  // ── GROUND-TRUTH INTERCEPTION (LLM BYPASS) ──────────────────────
  // Explicit NMIMS / CDOE queries never touch the LLM: the verified
  // Semester 1 catalog (6 subjects, 76 units) is returned
  // directly so unit counts can never be hallucinated.
  // Bypass ONLY for genuine NMIMS/CDOE queries. Broad keywords like
  // "marketing"/"mba" previously hijacked institution-specific queries
  // ("B.Com Honours — ITM University — Banking and Marketing") away
  // from the LLM, which is the only layer able to fetch a specific
  // institution's syllabus.
  if (isNmimsQuery(courseName) || query.includes("nmims") || query.includes("cdoe")) {
    const verified = fallback.length >= 3 ? fallback : nmimsSem1Subjects();
    return { subjects: verified, source: "Verified NMIMS Database", sources };
  }
  if (isAmityQuery(courseName)) {
    return { subjects: fallback, source: "Verified Amity Catalog", sources };
  }

  const raw = await callLLM(
    "You are an academic curriculum planner. Return a strict JSON array ONLY.",
    [
      {
        role: "user",
        content: `Course/exam: "${courseName}". Education level: ${level}.
        Subjects MUST be age- and level-appropriate for ${level} students; never include subjects outside this level.
        If an institution/university is named, use THAT institution's actual
        published curriculum for the named program/specialisation and term.
        If a board is named (CBSE/ICSE/state), use that board's official
        syllabus. Return the real subject names with realistic unit counts.
        Respond with a JSON array ONLY:
        [{"name":"Exact Subject Name","units":12,"difficulty":"Easy|Medium|Hard","color":"#6366f1"}]`
      }
    ],
    2500
  );

  if (!raw) return { subjects: fallback, source: "aether-local", sources };

  try {
    const parsed = extractJson<SeedSubject[]>(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
      const validated = parsed.slice(0, 10).map((s, i) => ({
        name: String(s.name).slice(0, 80),
        units: Math.min(40, Math.max(2, Number(s.units) || 8)),
        difficulty: (["Easy", "Medium", "Hard"].includes(String(s.difficulty)) ? s.difficulty : "Medium") as SeedSubject["difficulty"],
        color: palette[i % palette.length],
      }));
      return { subjects: validated, source: "AI Cloud Database", sources };
    }
  } catch { /* fall through */ }

  return { subjects: fallback, source: "aether-local", sources };
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
  const nmimsChapters = isNmimsQuery(courseName) ? getNmimsChapters(subjectName) : null;
  if (nmimsChapters) {
    return generateTopics(subjectName, nmimsChapters.length, difficulty, level, courseName);
  }
  const cbseChapters = getCbseChapters(subjectName);
  if (cbseChapters) {
    return generateTopics(subjectName, cbseChapters.length, difficulty, level, courseName);
  }
  if (isNmimsQuery(courseName) || isNmimsQuery(subjectName)) {
    return generateTopics(subjectName, units, difficulty, level, courseName);
  }

  const fallback = generateTopics(subjectName, units, difficulty, level, courseName);
  const raw = await callLLM(
    `You are a strict curriculum architect. Return a strict JSON array ONLY.`,
    [
      {
        role: "user",
        content: `Course: "${courseName}". Level: ${level}. Subject: "${subjectName}".
        Canonical unit count: ${units}. Difficulty: ${difficulty}.
        Generate exactly ${units} ordered, rigorous lessons that progress from prerequisites to synthesis.
        Summaries must identify methods, assumptions, edge cases, and application—not generic study advice.
        Objectives must use higher-order actions such as derive, compare, justify, evaluate, and transfer.
        Do not invent citations; source metadata is attached by the verified application catalog.
        Format: [{"unit":"Unit 1","title":"...","summary":"2-3 specific sentences","objectives":["3-5 measurable outcomes"],"prerequisites":["..."],"keyConcepts":["..."],"practice":"specific graded task","depth":"Foundation|Core|Advanced|Synthesis","difficulty":"Easy|Medium|Hard","estMinutes":60}]`,
      },
    ],
    Math.min(4000, 800 + units * 120)
  );

  if (!raw) return fallback;

  const parsed = extractJson<GeneratedTopic[]>(raw);
  if (!parsed || !Array.isArray(parsed) || parsed.length < 2) return fallback;

  // Always return the canonical count. If the provider stops early, fill the
  // missing tail from the deterministic advanced curriculum rather than
  // silently creating a subject with fewer lessons than advertised.
  return Array.from({ length: units }, (_, i) => {
    const t = parsed[i] || fallback[i];
    const base = fallback[i];
    const depth = (["Foundation", "Core", "Advanced", "Synthesis"].includes(String(t?.depth))
      ? t.depth : base.depth) as GeneratedTopic["depth"];
    return {
      unit: String(t?.unit || `Unit ${i + 1}`).slice(0, 40),
      title: String(t?.title || base.title || `Lesson ${i + 1}`).slice(0, 160),
      summary: String(t?.summary || base.summary).slice(0, 1200),
      objectives: Array.isArray(t?.objectives) && t.objectives.length
        ? t.objectives.slice(0, 5).map((item) => String(item).slice(0, 240))
        : base.objectives,
      prerequisites: Array.isArray(t?.prerequisites) && t.prerequisites.length
        ? t.prerequisites.slice(0, 4).map((item) => String(item).slice(0, 200))
        : base.prerequisites,
      keyConcepts: Array.isArray(t?.keyConcepts) && t.keyConcepts.length
        ? t.keyConcepts.slice(0, 6).map((item) => String(item).slice(0, 160))
        : base.keyConcepts,
      practice: String(t?.practice || base.practice).slice(0, 600),
      depth,
      // Source details only come from the curated application catalog.
      sources: base.sources,
      difficulty: (["Easy", "Medium", "Hard"].includes(String(t?.difficulty))
        ? t.difficulty : base.difficulty) as "Easy" | "Medium" | "Hard",
      estMinutes: Math.min(180, Math.max(20, Number(t?.estMinutes) || base.estMinutes)),
    };
  });
}

const LANGUAGE_CAPABILITY_RE = /\b(speak|talk|chat|communicate|reply|respond|answer)\b/i;

/** Deterministic language-capability replies prevent the tutor from falsely
 * claiming it only supports English/Hindi. The cloud and local speech layers
 * both support these scripts, so the response is immediately usable aloud. */
export function languageCapabilityReply(query: string): string | null {
  if (!LANGUAGE_CAPABILITY_RE.test(query)) return null;
  const languages: Array<{ match: RegExp; reply: string }> = [
    {
      match: /\b(bangla|bengali)\b/i,
      reply: "হ্যাঁ, আমি বাংলায় কথা বলতে পারি। আপনার পড়াশোনা নিয়ে কীভাবে সাহায্য করতে পারি?",
    },
    {
      match: /\bhindi\b/i,
      reply: "हाँ, मैं हिंदी में बात कर सकता हूँ। आपकी पढ़ाई में किस तरह मदद करूँ?",
    },
    {
      match: /\bmarathi\b/i,
      reply: "हो, मी मराठीत बोलू शकतो. तुमच्या अभ्यासात मी कशी मदत करू?",
    },
    {
      match: /\btamil\b/i,
      reply: "ஆம், நான் தமிழில் பேச முடியும். உங்கள் படிப்பில் எப்படி உதவலாம்?",
    },
    {
      match: /\btelugu\b/i,
      reply: "అవును, నేను తెలుగులో మాట్లాడగలను. మీ చదువులో ఎలా సహాయం చేయాలి?",
    },
    {
      match: /\bkannada\b/i,
      reply: "ಹೌದು, ನಾನು ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಬಲ್ಲೆ. ನಿಮ್ಮ ಓದಿನಲ್ಲಿ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
    },
    {
      match: /\bgujarati\b/i,
      reply: "હા, હું ગુજરાતીમાં વાત કરી શકું છું. તમારા અભ્યાસમાં કેવી રીતે મદદ કરું?",
    },
    {
      match: /\b(punjabi|panjabi)\b/i,
      reply: "ਹਾਂ, ਮੈਂ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਸਕਦਾ ਹਾਂ। ਤੁਹਾਡੀ ਪੜ੍ਹਾਈ ਵਿੱਚ ਕਿਵੇਂ ਮਦਦ ਕਰਾਂ?",
    },
    {
      match: /\barabic\b/i,
      reply: "نعم، يمكنني التحدث بالعربية. كيف أساعدك في دراستك؟",
    },
  ];
  return languages.find((language) => language.match.test(query))?.reply || null;
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
    if (/(bright|lighter|light|samsung|clean|white)/.test(n)) return { type: "theme", payload: "silver-lavender" };
    if (/(silver|lavender)/.test(n)) return { type: "theme", payload: "silver-lavender" };
    // Vague requests ("something nicer/brighter/cooler") fall through to
    // the LLM, which understands intent and replies with [[action:theme:x]].
    // The old catch-all returned DARK here and hijacked every vague ask.
  }
  return undefined;
}

export function instantTutorReply(q: string, ctx: TutorContext): TutorReply | null {
  const n = q.toLowerCase();
  if (/(what|which).*(today|now)|today'?s (plan|task|study|load)|what should i (study|do)/.test(n)) {
    const pending = ctx.today.filter((task) => task.status === "pending");
    if (!pending.length) return { text: "Nothing is pending for today. Use the extra time for active recall or a short mixed practice set." };
    const list = pending.slice(0, 6).map((task, index) => `${index + 1}. **${task.title}** (${task.minutes} min)`).join("\n");
    return { text: `Here is your priority order for today:\n\n${list}\n\nSay *“start timer”* when you are ready.` };
  }
  if (/how am i doing|my progress|progress report|performance/.test(n)) {
    return {
      text: `You are **${ctx.progressPct}%** through the syllabus with a **${ctx.streak}-day streak**. You studied **${ctx.hoursThisWeek} hours** this week and have **${ctx.overdue} overdue task${ctx.overdue === 1 ? "" : "s"}**. ${ctx.overdue ? "Clear the oldest overdue lesson first, then return to today's plan." : "Your schedule is current—protect the streak with today's highest-priority lesson."}`,
    };
  }
  if (/weakest (topic|subject)|what.*weak|where.*struggl/.test(n)) {
    const weakest = [...ctx.subjects]
      .filter((subject) => subject.total > 0)
      .sort((a, b) => (a.done / a.total) - (b.done / b.total))[0];
    if (weakest) {
      const pct = Math.round((weakest.done / weakest.total) * 100);
      return { text: `Your lowest-completion subject is **${weakest.name}** at **${pct}%** (${weakest.done}/${weakest.total} lessons). Open Subjects and choose its first pending lesson; I can then teach it from first principles.` };
    }
  }
  if (/i'?m behind|am i behind|catch up|overdue/.test(n)) {
    return ctx.overdue
      ? { text: `You have **${ctx.overdue} overdue task${ctx.overdue === 1 ? "" : "s"}**. Use **Rebalance schedule** once; it will move unfinished work forward without touching completed lessons.` }
      : { text: "You have no overdue tasks. Stay with today's plan rather than adding extra work." };
  }
  return null;
}

export async function localTutor(
  q: string,
  ctx: TutorContext,
  options: { skipCloud?: boolean } = {}
): Promise<TutorReply> {
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

  const instant = instantTutorReply(q, ctx);
  if (instant) return instant;

  const pct = percentQ(q);
  if (pct) return { text: pct };

  if (!options.skipCloud) {
    const aiResponse = await callLLM(tutorSystemPrompt(ctx), [{ role: "user", content: q }], 800);
    if (aiResponse) return { text: aiResponse };
  }

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
  return `You are SHIGUN, the built-in study coach for Study Planner Pro.

TODAY'S DATE IS ${dateStr}. This is the real current date — trust it completely,
even if it is later than your training data. Never call the current date "the
future", never mention your training cutoff, and never refuse a question because
of dates. If asked about news or live events, simply say you don't have live
news access in one short sentence, then pivot to something useful (e.g. offer
a current-affairs study strategy if their course includes it).

Learner: ${ctx.name}. Course: ${ctx.courseName}. Days Left: ${ctx.daysLeft} (exam: ${ctx.examDate}). Progress: ${ctx.progressPct}%.
Streak: ${ctx.streak} days. This week: ${ctx.hoursThisWeek}h studied vs ${ctx.dailyHours * 7}h target. Overdue tasks: ${ctx.overdue}.
Use these numbers when coaching — be specific, reference their actual data.
Teach step-by-step using clear markdown formatting.
Voice: intelligent, concise, supportive, confident — like a calm senior tutor.
Use at most one emoji per reply, and only when it genuinely helps; usually use none.
Never use hype ("CRUSHING IT!!!"), all-caps excitement, or emoji chains.

LANGUAGE: You are multilingual. Reply in the language/script the learner uses or explicitly
requests, including Bengali/Bangla, Hindi, Marathi, Tamil, Telugu, Kannada, Gujarati,
Punjabi, Arabic, and English. Never claim that you only support English or Hindi. If the
learner writes an Indian language in Latin script, answer naturally in that language;
use its native script when they explicitly ask whether you can speak it.

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
