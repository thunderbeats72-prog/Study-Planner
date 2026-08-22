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
import { detectLanguage, isMostlyEnglish } from "./language";

function isMostlyEnglishQuery(q: string): boolean {
  return isMostlyEnglish(q);
}

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
  if (getSafeKey("OPENAI_API_KEY") || getSafeKey("NEXT_PUBLIC_OPENAI_API_KEY")) return "OpenAI";
  if (getSafeKey("OPENROUTER_API_KEY") || getSafeKey("NEXT_PUBLIC_OPENROUTER_API_KEY")) return "OpenRouter";
  return null;
}

/* ============================================================
   LLM CALLER — Gemini → Groq → OpenRouter Fallback Chain
============================================================ */
let llmLastError: string | null = null;

/** Last provider/model failure, surfaced to /api/chat meta so the app can
 *  tell whether a bad model/key or a network outage caused the local fallback. */
export function llmError(): string | null {
  return llmLastError;
}

function recordLlmError(message: string): void {
  llmLastError = message;
}

async function fetchText(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Gemini model candidates in preference order. The configured model is tried
 *  first, then the stable/current models. This avoids a single bad
 *  NEXT_PUBLIC_GEMINI_MODEL value silently killing the whole chain. */
function geminiModels(): string[] {
  const configured = getSafeKey("GEMINI_MODEL") || getSafeKey("NEXT_PUBLIC_GEMINI_MODEL");
  const candidates = [
    configured,
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-flash-latest",
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite",
  ].filter((model): model is string => Boolean(model?.trim()));
  return [...new Set(candidates)];
}

async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMsg[],
  maxTokens: number,
  timeoutMs: number
): Promise<string | null> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers = { "content-type": "application/json", "x-goog-api-key": apiKey };
  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  const attempts: Array<Record<string, unknown>> = [
    {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    },
    // Some Gemini model versions reject systemInstruction; retry the same
    // request with the system prompt folded into the first user turn.
    {
      contents: [
        { role: "user", parts: [{ text: `${system}\n\n---\n\n${messages[0]?.content || ""}` }] },
        ...contents.slice(1),
      ],
      generationConfig: { maxOutputTokens: maxTokens },
    },
  ];

  for (const body of attempts) {
    const response = await fetchText(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }, timeoutMs).catch((error) => {
      recordLlmError(`Gemini ${model}: ${error instanceof Error ? error.message : "network error"}`);
      return null;
    });
    if (!response) return null;
    if (response.ok) {
      const json = await response.json().catch(() => null);
      const text = json?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "").join("") ?? null;
      if (text?.trim()) return text.trim();
    } else {
      const err = await response.text().catch(() => "");
      recordLlmError(`Gemini ${model}: HTTP ${response.status} ${err.slice(0, 160)}`);
      if (response.status === 400) continue; // retry with inline-system shape
      return null;
    }
  }
  recordLlmError(`Gemini ${model}: no usable response`);
  return null;
}

export async function callLLM(
  system: string,
  messages: ChatMsg[],
  maxTokens = 2500
): Promise<string | null> {
  llmLastError = null;
  const geminiKey = getSafeKey("GEMINI_API_KEY") || getSafeKey("GOOGLE_API_KEY")
    || getSafeKey("NEXT_PUBLIC_GEMINI_API_KEY") || getSafeKey("NEXT_PUBLIC_GOOGLE_API_KEY");
  const groqKey = getSafeKey("GROQ_API_KEY") || getSafeKey("NEXT_PUBLIC_GROQ_API_KEY");
  const openaiKey = getSafeKey("OPENAI_API_KEY") || getSafeKey("NEXT_PUBLIC_OPENAI_API_KEY");
  const openrouterKey = getSafeKey("OPENROUTER_API_KEY") || getSafeKey("NEXT_PUBLIC_OPENROUTER_API_KEY");
  const providers = [
    geminiKey ? "gemini" : null,
    groqKey ? "groq" : null,
    openaiKey ? "openai" : null,
    openrouterKey ? "openrouter" : null,
  ].filter(Boolean) as Array<"gemini" | "groq" | "openai" | "openrouter">;

  if (!providers.length) {
    recordLlmError("no cloud AI key configured");
    return null;
  }

  const deadline = Date.now() + 25000; // one bounded budget for the whole chain

  for (const provider of providers) {
    try {
      if (provider === "gemini" && geminiKey) {
        for (const model of geminiModels()) {
          const remaining = deadline - Date.now();
          if (remaining < 800) break;
          const text = await callGemini(geminiKey, model, system, messages, maxTokens, Math.min(12000, remaining));
          if (text) return text;
        }
      } else if (provider === "groq" && groqKey) {
        const remaining = deadline - Date.now();
        if (remaining < 800) break;
        const response = await fetchText("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: maxTokens,
            messages: [{ role: "system", content: system }, ...messages],
          }),
        }, Math.min(12000, remaining)).catch((error) => {
          recordLlmError(`Groq: ${error instanceof Error ? error.message : "network error"}`);
          return null;
        });
        if (!response) continue;
        if (response.ok) {
          const json = await response.json().catch(() => null);
          const text = json?.choices?.[0]?.message?.content ?? null;
          if (text?.trim()) return text.trim();
        } else {
          const err = await response.text().catch(() => "");
          recordLlmError(`Groq: HTTP ${response.status} ${err.slice(0, 160)}`);
        }
      } else if (provider === "openai" && openaiKey) {
        const remaining = deadline - Date.now();
        if (remaining < 800) break;
        const response = await fetchText("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            max_tokens: maxTokens,
            messages: [{ role: "system", content: system }, ...messages],
          }),
        }, Math.min(12000, remaining)).catch((error) => {
          recordLlmError(`OpenAI: ${error instanceof Error ? error.message : "network error"}`);
          return null;
        });
        if (!response) continue;
        if (response.ok) {
          const json = await response.json().catch(() => null);
          const text = json?.choices?.[0]?.message?.content ?? null;
          if (text?.trim()) return text.trim();
        } else {
          const err = await response.text().catch(() => "");
          recordLlmError(`OpenAI: HTTP ${response.status} ${err.slice(0, 160)}`);
        }
      } else if (provider === "openrouter" && openrouterKey) {
        const remaining = deadline - Date.now();
        if (remaining < 800) break;
        const response = await fetchText("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
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
        }, Math.min(12000, remaining)).catch((error) => {
          recordLlmError(`OpenRouter: ${error instanceof Error ? error.message : "network error"}`);
          return null;
        });
        if (!response) continue;
        if (response.ok) {
          const json = await response.json().catch(() => null);
          const text = json?.choices?.[0]?.message?.content ?? null;
          if (text?.trim()) return text.trim();
        } else {
          const err = await response.text().catch(() => "");
          recordLlmError(`OpenRouter: HTTP ${response.status} ${err.slice(0, 160)}`);
        }
      }
    } catch (error) {
      recordLlmError(`${provider}: ${error instanceof Error ? error.message : "unknown error"}`);
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

const LANGUAGE_CAPABILITY_RE = /\b(speak|talk|chat|communicate|reply|respond|answer|know|understand|handle)\b/i;

/** A language word followed by a subject/domain noun is usually not a
 *  language-capability question. "French Revolution", "Spanish history",
 *  "Hindi literature" and "Bengali grammar" must go to the normal tutor,
 *  not to the canned "I can speak French/Spanish/Hindi…" reply. */
const LANGUAGE_TOPIC_PHRASE_RE =
  /\b(bangla|bengali|hindi|marathi|tamil|telugu|kannada|malayalam|gujarati|punjabi|panjabi|odia|oriya|urdu|nepali|arabic|spanish|español|french|français|german|deutsch|portuguese|português|italian|italiano|russian|chinese|mandarin|japanese|korean|indonesian|bahasa|turkish|türkçe)\s+(revolution|revolutions|literature|history|grammar|course|exam|exams|class|classes|lesson|lessons|subject|subjects|syllabus|chapter|chapters|unit|units|paper|papers|test|tests|question|questions|poetry|fiction|novel|writing|vocabulary|cuisine|food|culture|war|empire|film|films|cinema|movie|movies|music|dance|actor|actress|people|country|civilisation|civilization|speaker|speakers|teacher|teachers|student|students|translation|transcript|literature)\b/i;

/** Deterministic language-capability replies prevent the tutor from falsely
 * claiming it only supports English/Hindi. The cloud and local speech layers
 * both support these scripts, so the response is immediately usable aloud.
 * Gendered languages return feminine/masculine forms to match the voice. */
type CapabilityReply = string | { female: string; male: string };
export function languageCapabilityReply(
  query: string,
  voiceGender: "female" | "male" = "female"
): string | null {
  if (!LANGUAGE_CAPABILITY_RE.test(query)) return null;
  if (LANGUAGE_TOPIC_PHRASE_RE.test(query)) return null;
  const languages: Array<{ match: RegExp; reply: CapabilityReply }> = [
    {
      match: /\b(bangla|bengali)\b/i,
      reply: "হ্যাঁ, আমি বাংলায় কথা বলতে পারি। আপনার পড়াশোনা নিয়ে কীভাবে সাহায্য করতে পারি?",
    },
    {
      match: /\bhindi\b/i,
      reply: {
        female: "हाँ, मैं हिंदी में बात कर सकती हूँ। आपकी पढ़ाई में किस तरह मदद करूँ?",
        male: "हाँ, मैं हिंदी में बात कर सकता हूँ। आपकी पढ़ाई में किस तरह मदद करूँ?",
      },
    },
    {
      match: /\bmarathi\b/i,
      reply: {
        female: "हो, मी मराठीत बोलू शकते. तुमच्या अभ्यासात मी कशी मदत करू?",
        male: "हो, मी मराठीत बोलू शकतो. तुमच्या अभ्यासात मी कशी मदत करू?",
      },
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
      match: /\bmalayalam\b/i,
      reply: "അതെ, ഞാൻ മലയാളത്തിൽ സംസാരിക്കാം. നിങ്ങളുടെ പഠനത്തിൽ എങ്ങനെ സഹായിക്കാം?",
    },
    {
      match: /\bgujarati\b/i,
      reply: "હા, હું ગુજરાતીમાં વાત કરી શકું છું. તમારા અભ્યાસમાં કેવી રીતે મદદ કરું?",
    },
    {
      match: /\b(punjabi|panjabi)\b/i,
      reply: {
        female: "ਹਾਂ, ਮੈਂ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਸਕਦੀ ਹਾਂ। ਤੁਹਾਡੀ ਪੜ੍ਹਾਈ ਵਿੱਚ ਕਿਵੇਂ ਮਦਦ ਕਰਾਂ?",
        male: "ਹਾਂ, ਮੈਂ ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰ ਸਕਦਾ ਹਾਂ। ਤੁਹਾਡੀ ਪੜ੍ਹਾਈ ਵਿੱਚ ਕਿਵੇਂ ਮਦਦ ਕਰਾਂ?",
      },
    },
    {
      match: /\b(odia|oriya)\b/i,
      reply: "ହଁ, ମୁଁ ଓଡ଼ିଆରେ କଥା ହିପାରିବି। ଆପଣଙ୍କ ଅଧ୍ୟୟନରେ ମୁଁ କିପରି ସାହାଯ୍ୟ କରିପାରିବି?",
    },
    {
      match: /\burdu\b/i,
      reply: {
        female: "ہاں، میں اردو میں بات کر سکتی ہوں۔ میں آپ کی پڑھائی میں کیسے مدد کروں؟",
        male: "ہاں، میں اردو میں بات کر سکتا ہوں۔ میں آپ کی پڑھائی میں کیسے مدد کروں؟",
      },
    },
    {
      match: /\bnepali\b/i,
      reply: "हो, म नेपालीमा कुरा गर्न सक्छु। तपाईंको पढाइमा कसरी मद्दत गर्न सक्छु?",
    },
    {
      match: /\barabic\b/i,
      reply: "نعم، يمكنني التحدث بالعربية. كيف أساعدك في دراستك؟",
    },
    {
      match: /\bspanish|español\b/i,
      reply: "Sí, puedo hablar en español. ¿Cómo puedo ayudarte con tus estudios?",
    },
    {
      match: /\bfrench|français\b/i,
      reply: "Oui, je peux parler en français. Comment puis-je vous aider dans vos études ?",
    },
    {
      match: /\bgerman|deutsch\b/i,
      reply: "Ja, ich kann auf Deutsch sprechen. Wie kann ich dir beim Lernen helfen?",
    },
    {
      match: /\bportuguese|português\b/i,
      reply: "Sim, posso falar em português. Como posso ajudar nos seus estudos?",
    },
    {
      match: /\bitalian|italiano\b/i,
      reply: "Sì, posso parlare in italiano. Come posso aiutarti con lo studio?",
    },
    {
      match: /\brussian\b/i,
      reply: "Да, я могу говорить по-русски. Чем я могу помочь в учёбе?",
    },
    {
      match: /\b(chinese|mandarin)\b/i,
      reply: "是的，我可以用中文交谈。需要我怎样帮助你学习？",
    },
    {
      match: /\bjapanese\b/i,
      reply: "はい、日本語で話せます。勉強のお手伝いをしましょうか？",
    },
    {
      match: /\bkorean\b/i,
      reply: "네, 한국어로 대화할 수 있어요. 공부를 어떻게 도와드릴까요?",
    },
    {
      match: /\bindonesian|bahasa\b/i,
      reply: "Ya, saya bisa berbicara dalam bahasa Indonesia. Bagaimana saya bisa membantu belajarmu?",
    },
    {
      match: /\bturkish|türkçe\b/i,
      reply: "Evet, Türkçe konuşabilirim. Derslerinde nasıl yardımcı olabilirim?",
    },
  ];
  const hit = languages.find((language) => language.match.test(query));
  if (!hit) return null;
  return typeof hit.reply === "string" ? hit.reply : hit.reply[voiceGender];
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

/* ── Multilingual command vocabulary ───────────────────────────
   Deterministic intent matching so voice commands work in the
   learner's OWN language, not just English. Scripts are matched
   literally; Hinglish (Latin-script Hindi) is included because
   that is how most Indian learners actually speak to a mic. */
const MULTI = {
  resume: [
    /(\bresume\b|continue (the )?(session|timer|studying))/i,
    /\b(फिर (से )?शुरू|जारी (रखो|रखिए)|चालू रखो)/,
    /(पुन्हा सुरू|सुरू ठेवा|चालू ठेवा)/, // Marathi
    /(পুনরায় শুরু|আবার শুরু|চালিয়ে যাও)/, // Bengali
    /(தொடர்|மீண்டும் தொடங்கு)/, // Tamil
    /(కొనసాగించు|మళ్ళీ మొదలుపెట్టు)/, // Telugu
    /(ಮುಂದುವರಿಸು|ಪುನಃ ಪ್ರಾರಂಭಿಸು)/, // Kannada
    /(ચાલુ રાખો|ફરી શરૂ)/, // Gujarati
    /(ਜਾਰੀ ਰੱਖੋ|ਮੁੜ ਸ਼ੁਰੂ)/, // Punjabi
    /(جاری رکھو|دوبارہ شروع)/, // Urdu
    /(استمر|أكمل)/, // Arabic
    /\b(reprends?|continue)\b/i, // French
    /\b(continúa|sigue|reanuda)\b/i, // Spanish
    /\b(phir (se )?shuru|jaari raho|jari rakho|chaloo raho)\b/i, // Hinglish
  ],
  pause: [
    /\bpause\b|\bhold (on|it)\b/i,
    /(विराम|ठहर (जाओ|जाओ)|रुक जाओ थोड़ी देर)/,
    /(বিরতি নাও|থামা যাক)/,
    /(இடைநிறுத்தம்)/,
    /(విరామం)/,
    /(ವಿರಾಮ)/,
    /(વિરામ)/,
    /(ਵਿਰਾਮ)/,
    /(وقفہ|مکمل روکو)/,
    /\b(pause (karo|kar do)|ruko thoda|hold karo)\b/i, // Hinglish
  ],
  breakTime: [
    /\b(take a break|break time|need a break|short break|give me a break|have a break)\b/i,
    /(ब्रेक|आराम|विश्राम)/,
    /(ब्रेक|विश्रांती)/, // Marathi
    /(ব্রেক|বিশ্রাম|আরাম)/, // Bengali
    /(இடைவேளை|ஓய்வு)/, // Tamil
    /(విరామం తీసుకో|స్వల్ప విశ్రాంతి)/, // Telugu
    /(ವಿರಾಮ ತೆಗೆದುಕೋ|ಸ್ವಲ್ಪ ಆರಾಮ)/, // Kannada
    /(બ્રેક|આરામ)/, // Gujarati
    /(ਬਰੇਕ|ਆਰਾਮ)/, // Punjabi
    /(بریک|آرام)/, // Urdu
    /(استراحة|استرح)/, // Arabic
    /\b(break (lo|le|lena)|araam|rest lo|aaram)\b/i, // Hinglish
  ],
  stop: [
    /\b(stop (the |my )?(timer|clock|session|study|studying)|clock ?out|end (the )?(session|study|timer)|session (khatam|over))\b/i,
    /\b(stop|end|finish) (karo|kar do|karna|it)\b/i,
    /\bi'?m done\b|\bfinished studying\b/i,
    /(घंटी बंद|टाइमर बंद|घड़ी बंद|पढ़ाई बंद|बंद कर (दो|दें)|रोक (दो|दें)|बजना बंद)/,
    /(घंटा बंद|अभ्यास बंद|थांबव)/, // Marathi
    /(ঘড়ি বন্ধ|পড়া বন্ধ|থামাও|বন্ধ করো)/, // Bengali
    /(கடிகாரம் நிறுத்து|நிறுத்து|படிப்பை நிறுத்து)/, // Tamil
    /(గడియారం ఆపు|ఆపు|చదువు ఆపు)/, // Telugu
    /(ಗಡಿಯಾರ ನಿಲ್ಲಿಸು|ನಿಲ್ಲಿಸು|ಓದು ನಿಲ್ಲಿಸು)/, // Kannada
    /(ઘડિયાળ બંધ|રોકો|ભણવું બંધ)/, // Gujarati
    /(ਘੜੀ ਬੰਦ|ਰੋਕੋ|ਪੜ੍ਹਾਈ ਬੰਦ)/, // Punjabi
    /(گھی بند|بند کرو|روکو)/, // Urdu
    /(أوقف|توقف عن)/, // Arabic
    /\b(band (karo|kar do)|rok (do|do na)|rokko|rok lo|khatam karo|bas karo)\b/i, // Hinglish
  ],
  start: [
    /\b(clock ?in|start (the |my )?(timer|clock|focus|session|studying|study)|begin (the |my )?(timer|clock|focus|session|studying|study)|let'?s (start|study)|i'?m ready to study|start studying now|can you start (the )?study)\b/i,
    /(टाइमर (चालू|शुरू)|घड़ी (चालू|शुरू)|पढ़ाई (शुरू|चालू)|शुरू कर (दो|दें)|चालू कर (दो|दें))/,
    /(टाइमर सुरू|अभ्यास सुरू|सुरू करा|चालू करा)/, // Marathi
    /(টাইমার (চালু|শুরু)|পড়া (শুরু|চালু)|শুরু করো)/, // Bengali
    /(கடிகாரம் (தொடங்கு|தொடக்கு)|படிப்பை தொடங்கு|தொடங்கு)/, // Tamil
    /(గడియారం ప్రారంభించు|చదువు మొదలుపెట్టు|ప్రారంభించు)/, // Telugu
    /(ಗಡಿಯಾರ ಪ್ರಾರಂಭಿಸು|ಓದು ಪ್ರಾರಂಭಿಸು|ಆರಂಭಿಸು)/, // Kannada
    /(ટાઈમર શરૂ|ભણવું શરૂ|શરૂ કરો)/, // Gujarati
    /(ਟਾਈਮਰ ਸ਼ੁਰੂ|ਪੜ੍ਹਾਈ ਸ਼ੁਰੂ|ਸ਼ੁਰੂ ਕਰੋ)/, // Punjabi
    /(ٹائمر شروع|پڑھائی شروع|شروع کرو)/, // Urdu
    /(ابدأ|ابدأ المؤقت|ابدأ الدراسة)/, // Arabic
    /\b(shuru (karo|kar do)|start (karo|karna)|chalu (karo|kar do)|chalao|padhai shuru)\b/i, // Hinglish
  ],
  openPlanner: [
    /(योजना|समय सारिणी|टाइमटेबल|शेड्यूल)( दिखाओ| खोलो| खोलें)?/,
    /(সময়সূচি|পরিকল্পনা)( দেখাও| খোলো)?/,
    /(திட்டம்|அட்டவணை)( காட்டு| திற)?/,
    /(ప్లాన్|షెడ్యూల్)( చూపించు| తెరువు)?/,
    /(ಯೋಜನೆ|ವೇಳಾಪಟ್ಟಿ)( ತೋರಿಸು| ತೆರೆ)?/,
    /(યોજના|સમયપત્રક)( બતાવો| ખોલો)?/,
    /(ਯੋਜਨਾ|ਸ਼ਡਿਊਲ)( ਵਿਖਾਓ| ਖੋਲ੍ਹੋ)?/,
    /(منصوبہ|شیڈول)( دکھاؤ| کھولو)?/,
    /\b(planner|schedule|timetable|my plan)( dikhao|kholo|khol do|dikhao na)?\b/i,
    /\bplan (dikhao|kholo|khol do)\b/i,
  ],
  openOverview: [
    /(डैशबोर्ड|ओवरव्यू|होम|मुख्य पृष्ठ)( दिखाओ| खोलो| पर जाओ)?/,
    /(डॅशबोर्ड|ओव्हरव्ह्यू|मुख्यपृष्ठ)( दाखवा| उघडा)?/,
    /(হোম|ড্যাশবোর্ড)( দেখাও| খোলো)?/,
    /(முகப்பு|டாஷ்போர்டு)( காட்டு| திற)?/,
    /(హోమ్|డాష్‌బోర్డ్)( చూపించు| తెరువు)?/,
    /\b(dashboard|overview|home)( dikhao|kholo|chaloo)?\b/i,
  ],
};

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/* ── Localized command confirmations ────────────────────────────
   When a voice command arrives in the learner's own language, the
   acknowledgement answers in that same language — both on screen and
   aloud (the TTS layer detects the script automatically). Falls back
   to English for anything unmatched. */
const SCRIPT_LANG_DETECT: { code: string; range: RegExp }[] = [
  { code: "bn", range: /[\u0980-\u09FF]/ },
  { code: "pa", range: /[\u0A00-\u0A7F]/ },
  { code: "gu", range: /[\u0A80-\u0AFF]/ },
  { code: "or", range: /[\u0B00-\u0B7F]/ },
  { code: "ta", range: /[\u0B80-\u0BFF]/ },
  { code: "te", range: /[\u0C00-\u0C7F]/ },
  { code: "kn", range: /[\u0C80-\u0CFF]/ },
  { code: "ml", range: /[\u0D00-\u0D7F]/ },
  { code: "hi", range: /[\u0900-\u097F]/ }, // also Marathi/Nepali (shared script)
  { code: "ar", range: /[\u0600-\u06FF]/ },  // also Urdu (shared script)
];

type ActionShape = { type: string; payload?: unknown };

const CONFIRMATIONS: Record<string, Partial<Record<"startTimer" | "stopTimer" | "pause" | "resume" | "break" | "navigate" | "replan" | "zen" | "theme", string>>> = {
  hi: {
    startTimer: "घड़ी चालू — आपका अध्ययन समय दर्ज हो रहा है।",
    stopTimer: "घड़ी बंद — आपके मिनट सुरक्षित हो गए। शाबाश!",
    pause: "रोक दिया गया। तैयार हों तो कहें *\"जारी रखो\"*।",
    resume: "फिर से चालू — पढ़ाई जारी रखें।",
    break: "ब्रेक शुरू — पानी पिएँ, आँखों को आराम दें।",
    navigate: "खोल रहा हूँ: {page}।",
    replan: "आपका शेड्यूल फिर से संतुलित कर दिया गया है।",
    zen: "ज़ेन मोड चालू।",
    theme: "थीम बदल दी गई।",
  },
  bn: {
    startTimer: "ঘড়ি চালু — আপনার পড়ার সময় রেকর্ড হচ্ছে।",
    stopTimer: "ঘড়ি বন্ধ — আপনার মিনিট সেভ হয়ে গেছে। দারুণ!",
    pause: "থামানো হলো। প্রস্তুত হলে বলুন *\"চালিয়ে যাও\"*।",
    resume: "আবার চালু — পড়া চালিয়ে যান।",
    break: "বিরতি শুরু — পানি খান, চোখকে বিশ্রাম দিন।",
    navigate: "খুলছি: {page}।",
    replan: "আপনার সময়সূচি নতুন করে সাজানো হয়েছে।",
    zen: "জেন মোড চালু।",
    theme: "থিম বদলে দেওয়া হয়েছে।",
  },
  ta: {
    startTimer: "கடிகாரம் தொடங்கியது — உங்கள் படிப்பு நேரம் பதிவாகிறது.",
    stopTimer: "கடிகாரம் நிறுத்தப்பட்டது — உங்கள் நிமிடங்கள் சேமிக்கப்பட்டன. நன்று!",
    pause: "நிறுத்தப்பட்டது. தயாராக இருந்தால் *\"தொடர்\"* என்று சொல்லுங்கள்.",
    resume: "மீண்டும் தொடங்கியது — படிப்பைத் தொடருங்கள்.",
    break: "இடைவேளை — தண்ணீர் குடியுங்கள், கண்களுக்கு ஓய்வு தருங்கள்.",
    navigate: "திறக்கிறேன்: {page}.",
    replan: "உங்கள் அட்டவணை மீண்டும் சமநிலைப்படுத்தப்பட்டது.",
    zen: "ஜென் பயன்முறை இயக்கப்பட்டது.",
    theme: "தீம் மாற்றப்பட்டது.",
  },
  te: {
    startTimer: "గడియారం ప్రారంభమైంది — మీ చదువు సమయం నమోదవుతోంది.",
    stopTimer: "గడియారం ఆపబడింది — మీ నిమిషాలు సేవ్ చేయబడ్డాయి. బాగుంది!",
    pause: "ఆపబడింది. సిద్ధంగా ఉంటే *\"కొనసాగించు\"* అనండి.",
    resume: "మళ్ళీ ప్రారంభం — చదువు కొనసాగించండి.",
    break: "విరామం — నీరు త్రాగండి, కళ్ళకు విశ్రాంతి ఇవ్వండి.",
    navigate: "తెరుస్తున్నాను: {page}.",
    replan: "మీ షెడ్యూల్ తిరిగి సర్దుబాటు చేయబడింది.",
    zen: "జెన్ మోడ్ ఆన్.",
    theme: "థీమ్ మార్చబడింది.",
  },
  kn: {
    startTimer: "ಗಡಿಯಾರ ಪ್ರಾರಂಭವಾಗಿದೆ — ನಿಮ್ಮ ಓದಿನ ಸಮಯ ದಾಖಲಾಗುತ್ತಿದೆ.",
    stopTimer: "ಗಡಿಯಾರ ನಿಂತಿದೆ — ನಿಮ್ಮ ನಿಮಿಷಗಳು ಉಳಿಸಲ್ಪಟ್ಟಿವೆ. ಸೂಪರ್!",
    pause: "ನಿಂತಿದೆ. ಸಿದ್ಧರಾದಾಗ *\"ಮುಂದುವರಿಸು\"* ಎನ್ನಿ.",
    resume: "ಪುನಃ ಪ್ರಾರಂಭ — ಓದನ್ನು ಮುಂದುವರಿಸಿ.",
    break: "ವಿರಾಮ — ನೀರು ಕುಡಿಯಿರಿ, ಕಣ್ಣುಗಳಿಗೆ ವಿಶ್ರಾಂತಿ ನೀಡಿ.",
    navigate: "ತೆರೆಯುತ್ತಿದ್ದೇನೆ: {page}.",
    replan: "ನಿಮ್ಮ ವೇಳಾಪಟ್ಟಿ ಮರುಸಮತೋಲನಗೊಂಡಿದೆ.",
    zen: "ಜೆನ್ ಮೋಡ್ ಆನ್.",
    theme: "ಥೀಮ್ ಬದಲಾಗಿದೆ.",
  },
  ml: {
    startTimer: "ഘടികാരം തുടങ്ങി — നിങ്ങളുടെ പഠന സമയം രേഖപ്പെടുത്തുന്നു.",
    stopTimer: "ഘടികാരം നിർത്തി — നിങ്ങളുടെ മിനിറ്റുകൾ സേവ് ചെയ്തു. നന്നായി!",
    pause: "നിർത്തി. തയ്യാറായാൽ *\"തുടരൂ\"* പറയൂ.",
    resume: "വീണ്ടും തുടങ്ങി — പഠനം തുടരൂ.",
    break: "ഇടവേള — വെള്ളം കുടിക്കൂ, കണ്ണുകൾക്ക് വിശ്രമം നൽകൂ.",
    navigate: "തുറക്കുന്നു: {page}.",
    replan: "നിങ്ങളുടെ ഷെഡ്യൂൾ വീണ്ടും ക്രമീകരിച്ചു.",
    zen: "സെൻ മോഡ് ഓണാക്കി.",
    theme: "തീം മാറ്റി.",
  },
  gu: {
    startTimer: "ઘડિયાળ ચાલુ — તમારો અભ્યાસ સમય નોંધાઈ રહ્યો છે.",
    stopTimer: "ઘડિયાળ બંધ — તમારા મિનિટ સેવ થઈ ગયા. શાબાશ!",
    pause: "રોકાયું. તૈયાર હો તો કહો *\"ચાલુ રાખો\"*.",
    resume: "ફરી ચાલુ — અભ્યાસ ચાલુ રાખો.",
    break: "વિરામ — પાણી પીઓ, આંખોને આરામ આપો.",
    navigate: "ખોલી રહ્યો છું: {page}.",
    replan: "તમારું શેડ્યૂલ ફરીથી ગોઠવી દીધું છે.",
    zen: "ઝેન મોડ ચાલુ.",
    theme: "થીમ બદલાઈ ગઈ.",
  },
  pa: {
    startTimer: "ਘੜੀ ਚਾਲੂ — ਤੁਹਾਡਾ ਪੜ੍ਹਾਈ ਸਮਾਂ ਦਰਜ ਹੋ ਰਿਹਾ ਹੈ।",
    stopTimer: "ਘੜੀ ਬੰਦ — ਤੁਹਾਡੇ ਮਿੰਟ ਸੰਭਾਲ ਲਏ ਗਏ ਹਨ। ਸ਼ਾਬਾਸ਼!",
    pause: "ਰੁਕ ਗਿਆ। ਤਿਆਰ ਹੋਵੋ ਤਾਂ ਕਹੋ *\"ਜਾਰੀ ਰੱਖੋ\"*।",
    resume: "ਮੁੜ ਚਾਲੂ — ਪੜ੍ਹਾਈ ਜਾਰੀ ਰੱਖੋ।",
    break: "ਬਰੇਕ — ਪਾਣੀ ਪਓ, ਅੱਖਾਂ ਨੂੰ ਆਰਾਮ ਦਿਓ।",
    navigate: "ਖੋਲ੍ਹ ਰਿਹਾ ਹਾਂ: {page}.",
    replan: "ਤੁਹਾਡਾ ਸ਼ਡਿਊਲ ਮੁੜ ਸੰਤੁਲਿਤ ਕਰ ਦਿੱਤਾ ਗਿਆ ਹੈ।",
    zen: "ਜ਼ੈਨ ਮੋਡ ਚਾਲੂ।",
    theme: "ਥੀਮ ਬਦਲ ਦਿੱਤੀ ਗਈ।",
  },
  or: {
    startTimer: "ଘଡ଼ି ଚାଲୁ — ଆପଣଙ୍କ ଅଧ୍ୟୟନ ସମୟ ଲେଖା ହେଉଛି।",
    stopTimer: "ଘଡ଼ି ବନ୍ଦ — ଆପଣଙ୍କ ମିନିଟ୍ ସଞ୍ଚୟ ହୋଇଗଲା। ବାହ୍!",
    pause: "ବନ୍ଦ ହେଲା। ପ୍ରସ୍ତୁତ ହେଲେ କୁହନ୍ତୁ *\"ଜାରି ରଖ\"*।",
    resume: "ପୁଣି ଚାଲୁ — ଅଧ୍ୟୟନ ଜାରି ରଖନ୍ତୁ।",
    break: "ବିରାମ — ପାଣି ପିଅନ୍ତୁ, ଆଖିକୁ ବିଶ୍ରାମ ଦିଅନ୍ତୁ।",
    navigate: "ଖୋଲୁଛି: {page}.",
    replan: "ଆପଣଙ୍କ ସମୟସୂଚୀ ପୁଣି ସନ୍ତୁଳିତ ହୋଇଗଲା।",
    zen: "ଜେନ୍ ମୋଡ୍ ଚାଲୁ।",
    theme: "ଥିମ୍ ବଦଳିଗଲା।",
  },
  ar: {
    startTimer: "بدأ المؤقت — يتم تسجيل وقت دراستك.",
    stopTimer: "أُوقف المؤقت — تم حفظ دقائقك. أحسنت!",
    pause: "متوقف مؤقتًا. عندما تكون مستعدًا قل *«استمر»*.",
    resume: "استُؤنف — تابع الدراسة.",
    break: "استراحة — اشرب الماء وأرِح عينيك.",
    navigate: "أفتح: {page}.",
    replan: "تمت إعادة موازنة جدولك الزمني.",
    zen: "وضع التركيز مشغّل.",
    theme: "تم تغيير المظهر.",
  },
};

/** English fallbacks used when the spoken language has no translation. */
const EN_CONFIRMATIONS: Record<string, string> = {
  navigate: "Opening **{page}**.",
  startTimer: "Clocked in. Time is recording against today's task — one lesson, one focus.",
  stopTimer: "Clocked out. Your minutes are saved to today's task.",
  break: "Break started. Stand up, rest your eyes, hydrate. Say *\"resume\"* when you're back.",
  pause: "Timer paused. Say *\"resume\"* when you're ready to continue.",
  resume: "Back on the clock — picking up where you left off.",
  zen: "Zen mode on — just you and the timer.",
  replan: "Rebalancing your schedule now — unfinished lessons are pushed forward across your remaining days.",
  theme: "Theme updated.",
};

/** Latin-script Hindi (Hinglish) confirmations. Without these a user who
 *  says "timer shuru karo" received an English acknowledgement, which made
 *  the tutor feel like it stopped listening to Hinglish. */
const HINGLISH_CONFIRMATIONS: Record<string, string> = {
  navigate: "Khol raha hoon: **{page}**.",
  startTimer: "Clock shuru. Aaj ke task ke against time record ho raha hai.",
  stopTimer: "Clock band. Minutes save ho gaye. Badhiya!",
  break: "Break shuru. Utho, aankhon ko aaram do, paani piyo. *resume* bolne par wapas.",
  pause: "Timer ruk gaya. Wapas aane par *resume* bolo.",
  resume: "Wapas shuru — wahin se continue.",
  zen: "Zen mode on — sirf tum aur timer.",
  replan: "Schedule rebalance ho raha hai — baaki kaam ko aage badha rahe hain.",
  theme: "Theme update ho gaya.",
};

const PAGE_LABELS: Record<string, string> = {
  planner: "Planner",
  dashboard: "Overview",
  subjects: "Subjects",
  settings: "Settings",
  focus: "Focus Studio",
};

/** Feminine variants of the few command confirmations that self-reference
 *  with gendered first-person forms. The masculine forms live in
 *  CONFIRMATIONS and are the default for a male voice. */
const FEMALE_CONFIRMATIONS: Record<string, Partial<Record<string, string>>> = {
  hi: { navigate: "खोल रही हूँ: {page}।" },
  gu: { navigate: "ખોલી રહી છું: {page}." },
  pa: { navigate: "ਖੋਲ੍ਹ ਰਹੀ ਹਾਂ: {page}." },
};

export function commandReply(
  action: ActionShape,
  sourceText: string,
  daysLeft?: number,
  voiceGender: "female" | "male" = "female"
): string {
  const detected = detectLanguage(sourceText);
  const hinglish = isHinglishText(sourceText);
  const lang =
    (hinglish ? "hinglish" :
      SCRIPT_LANG_DETECT.find((entry) => entry.range.test(sourceText))?.code
      || (detected === "hi-IN" || detected === "mr-IN" || detected === "ne-NP" ? "hi" : undefined)
      || (CONFIRMATIONS[detected.slice(0, 2)] ? detected.slice(0, 2) : undefined));
  const base =
    (hinglish ? HINGLISH_CONFIRMATIONS[action.type] : undefined) ||
    (lang && CONFIRMATIONS[lang]?.[action.type as keyof (typeof CONFIRMATIONS)["hi"]]) ||
    EN_CONFIRMATIONS[action.type] ||
    "Done.";
  const template =
    (voiceGender === "female" && lang && FEMALE_CONFIRMATIONS[lang]?.[action.type]) || base;
  const page = PAGE_LABELS[String(action.payload)] || String(action.payload || "");
  let reply = template.replace("{page}", page);
  if (action.type === "replan" && daysLeft != null && !lang) {
    reply += ` Weakest subject first, spread across your remaining **${daysLeft} days**.`;
  }
  return reply;
}

/** Questions that ask "how/what/why" are not in-app commands. Without this
 *  guard "How do I start studying?", "What is light?", or "Explain dark matter"
 *  were hijacked by the timer/theme parsers and answered as if the user tapped
 *  a button. Real commands (e.g. "start the timer", "dark mode please") still
 *  pass through. */
const HELP_QUESTION_RE =
  /\b(how (do|does|can|could|would|should|to)|how'?s|why (do|does|is|are|would)|when (do|does|is|are)|what (is|are|does|do|was|were)|what'?s|explain|define|definition|meaning|difference (between|in)|should i|do i|can you explain|tell me about|help me understand|i want to know|how should i)\b/i;

function looksLikeHelpQuestion(n: string): boolean {
  return HELP_QUESTION_RE.test(n);
}

export function parseCommand(q: string): TutorReply["action"] | undefined {
  const n = q.toLowerCase().trim().replace(/[.!?]+$/, "");
  if (looksLikeHelpQuestion(n)) return undefined;

  // ── Break / timer state transitions (checked BEFORE navigation so
  //    "resume", "end break", "pause" never get mis-routed) ──
  if (matchesAny(n, MULTI.resume)) return { type: "resume" };
  if (matchesAny(n, MULTI.pause) && !matchesAny(n, MULTI.breakTime)) return { type: "pause" };
  if (matchesAny(n, MULTI.breakTime)) return { type: "break" };

  // ── Navigation ──
  if ((/\b(planner|schedule|my plan|timetable)\b/.test(n) || matchesAny(n, MULTI.openPlanner)) && /(\b(open|go|show|view|take me|see)\b|dikhao|kholo|दिखाओ|खोलो|दाखवा|उघडा|দেখাও|খোলো|காட்டு|చూపించు|ತೋರಿಸು|બતાવો|ਵਿਖਾਓ|دکھاؤ)/i.test(n)) return { type: "navigate", payload: "planner" };
  if ((/\b(dashboard|overview|home|stats?)\b/.test(n) || matchesAny(n, MULTI.openOverview)) && /(\b(open|go|show|view|take me|see)\b|dikhao|kholo|दिखाओ|खोलो|দেখাও|খোলো|காட்டு)/i.test(n)) return { type: "navigate", payload: "dashboard" };
  if (/\b(subjects?|syllabus|topics?|lessons?)\b/.test(n) && /\b(open|go|show|view|manage|edit)\b/.test(n)) return { type: "navigate", payload: "subjects" };
  if (/\b(settings?|preferences?|options?|profile)\b/.test(n) && /\b(open|go|show|change|edit)\b/.test(n)) return { type: "navigate", payload: "settings" };
  if (/\b(focus( page| view| tab)?|pomodoro)\b/.test(n) && /\b(open|go|show|view|take me|see)\b/.test(n)) return { type: "navigate", payload: "focus" };
  if (/^\/?(planner|schedule)$/.test(n)) return { type: "navigate", payload: "planner" };
  if (/^\/?(dashboard|overview)$/.test(n)) return { type: "navigate", payload: "dashboard" };
  if (/^\/?(subjects|syllabus)$/.test(n)) return { type: "navigate", payload: "subjects" };
  if (/^\/?(settings)$/.test(n)) return { type: "navigate", payload: "settings" };
  if (/^\/?(focus|pomodoro)$/.test(n)) return { type: "navigate", payload: "focus" };

  // ── Clock (multilingual: stop is checked before start so a phrase
  //    containing both words resolves to a safe end-of-session) ──
  if (matchesAny(n, MULTI.stop)) return { type: "stopTimer" };
  if (matchesAny(n, MULTI.start)) return { type: "startTimer" };
  if (/\b(zen|focus mode|full ?screen|distraction ?free|deep work mode)\b/.test(n)) return { type: "zen" };
  if (/\b(re-?plan|rebuild|regenerate|reschedule|re-?balance|redo my (plan|schedule)|fix my (plan|schedule)|update my plan)\b/.test(n)) return { type: "replan" };

  // Theme commands must be explicit. "dark", "light", "black", etc. are also
  // ordinary study words ("dark matter", "light waves", "black body"), so a
  // theme word alone is never enough — it needs a mode/theme phrase or a
  // theme-change action word.
  const themeColor = /\b(midnight|dark|obsidian|nebula|emerald|sunset|mint|silver|lavender|samsung|light|black|white)\b/;
  const themeSurface = /\b(theme|mode|background|appearance|wallpaper|skin)\b/;
  const themeAction = /\b(set|change|switch|apply|turn|use|make|activate|try|choose|select|prefer|give|want|enable|disable|put|go)\b/;
  const themePhrase = /(^|\s)(midnight|dark|obsidian|nebula|emerald|sunset|mint|silver|lavender|samsung|light|black|white)\s+(mode|theme|background|appearance|wallpaper|skin)/;
  if (themePhrase.test(n) || (n.includes("theme") && themeColor.test(n) && themeAction.test(n)) || (themeSurface.test(n) && themeColor.test(n) && themeAction.test(n))) {
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

/* ──────────────────────────────────────────────────────────────
   MULTILINGUAL OFFLINE FALLBACK
   The cloud model is the ideal path, but a bad key, a provider
   outage, a blocked network or a keyless deployment must NEVER
   leave a learner with a useless English "tell me more" line after
   a Hindi/Hinglish/Marathi/Tamil/... question. When no model text
   can be obtained we still answer in the SAME language from live
   app data, or ask for the missing topic in that same language.
────────────────────────────────────────────────────────────── */
const HINGLISH_WORDS =
  /(?:^|\s)(aaj|kya|kyaa|hai|hain|hoga|hogi|ho|na|nahi|karo|karna|karne|kijiye|chahiye|mujhe|mujhko|mera|meri|tum|tumhara|aap|aapka|kaun|kaunsa|kaunsi|kab|kahan|padh|padhai|padhna|padhne|padhu|bata|batao|bataiye|samajh|samjha|matlab|toh|lekin|bhi|aur|bhai|yaar|hindi|kar|karo|de|dein|dena)(?:\s|$)/i;

function isHinglishText(q: string): boolean {
  const matches = q.match(HINGLISH_WORDS) || [];
  return matches.length >= 2;
}

type LocalReplyLang =
  | "hinglish" | "hi" | "mr" | "bn" | "ta" | "te" | "kn" | "ml" | "gu" | "pa" | "or"
  | "ur" | "ar" | "ne" | "es" | "fr" | "de" | "pt" | "it" | "ru" | "zh" | "ja" | "ko" | "id" | "tr";

/** Detect the language a local (keyless) reply should be written in.
 *  Latin-script Hinglish is deliberately separate from English because
 *  the project's tutor is supposed to answer Hinglish naturally. */
function localReplyLang(q: string): LocalReplyLang | "en" {
  if (isHinglishText(q)) return "hinglish";
  const code = detectLanguage(q).slice(0, 2);
  const supported: LocalReplyLang[] =
    ["hi", "mr", "bn", "ta", "te", "kn", "ml", "gu", "pa", "or", "ur", "ar", "ne",
     "es", "fr", "de", "pt", "it", "ru", "zh", "ja", "ko", "id", "tr"];
  return (supported.includes(code as LocalReplyLang) ? code as LocalReplyLang : "en");
}

const LOCAL_FALLBACK_TEXT: Record<LocalReplyLang, string> = {
  hinglish: "Sahi jawab ke liye mujhe bas exact topic chahiye — kaunsa subject, kaunsa chapter ya kaunsa topic? Phir aapko seedha sahi jawab milega.",
  hi: "सही जवाब देने के लिए बस विषय या बिंदु बताइए — कौन सा विषय, कौन सा अध्याय या कौन सा टॉपिक? फिर सही जवाब आपको साफ़ मिलेगा।",
  mr: "योग्य उत्तर देण्यासाठी फक्त विषय किंवा मुद्दा सांगा — कोणता विषय, कोणता अध्याय किंवा कोणता टॉपिक? मग योग्य उत्तर मिळेल.",
  bn: "সঠিক উত্তর দিতে কেবল বিষয়টা বলুন — কোন বিষয়, কোন অধ্যায় বা কোন টপিক? তারপর সঠিক উত্তর পাবেন।",
  ta: "சரியான பதில் சொல்ல தலைப்பை மட்டும் சொல்லுங்கள் — எந்தப் பாடம், எந்த அத்தியாயம் அல்லது எந்த தலைப்பு? பிறகு சரியான பதில் கிடைக்கும்.",
  te: "సరైన సమాధానం చెప్పడానికి విషయాన్ని చెప్పండి — ఏ సబ్జెక్ట్, ఏ అధ్యాయం లేదా ఏ టాపిక్? తర్వాత సరైన సమాధానం వస్తుంది.",
  kn: "ಸರಿಯಾದ ಉತ್ತರಕ್ಕಾಗಿ ವಿಷಯವನ್ನು ಹೇಳಿ — ಯಾವ ವಿಷಯ, ಯಾವ ಅಧ್ಯಾಯ ಅಥವಾ ಯಾವ ಟಾಪಿಕ್? ನಂತರ ಸರಿಯಾದ ಉತ್ತರ ಸಿಗುತ್ತದೆ.",
  ml: "ശരിയായ ഉത്തരം ലഭിക്കാൻ വിഷയം പറയൂ — ഏത് വിഷയം, ഏത് അധ്യായം അല്ലെങ്കിൽ ഏത് ടോപിക്? പിന്നെ ശരിയായ ഉത്തരം കിട്ടും.",
  gu: "સાચો જવાબ મેળવવા વિષય કહો — કયો વિષય, કયો અધ્યાય અથવા કયો ટૉપિક? પછી સાચો જવાબ મળશે.",
  pa: "ਸਹੀ ਜਵਾਬ ਲਈ ਵਿਸ਼ਾ ਦੱਸੋ — ਕਿਹੜਾ ਵਿਸ਼ਾ, ਕਿਹੜਾ ਅਧਿਆਇ ਜਾਂ ਕਿਹੜਾ ਟੌਪਿਕ? ਫਿਰ ਸਹੀ ਜਵਾਬ ਮਿਲੇਗਾ।",
  or: "ସଠିକ ଉତ୍ତର ପାଇଁ ବିଷୟ କୁହନ୍ତୁ — କେଉଁ ବିଷୟ, କେଉଁ ଅଧ୍ୟାୟ କିମ୍ବା କେଉଁ ଟପିକ୍? ପରେ ସଠିକ ଉତ୍ତର ମିଳିବ।",
  ur: "درست جواب کے لیے موضوع بتائیں — کون سا مضمون، کون سا باب یا کون سا ٹاپک؟ پھر درست جواب ملے گا۔",
  ar: "لتحصل على إجابة صحيحة، أخبرني بالموضوع فقط — أي مادة، أي فصل أو أي موضوع؟ ثم ستحصل على الإجابة الصحيحة.",
  ne: "सही उत्तर पाउन विषय भन्नुहोस् — कुन विषय, कुन अध्याय वा कुन टपिक? त्यसपछि सही उत्तर पाउनुहुनेछ।",
  es: "Para darte una respuesta correcta, dime el tema — ¿qué materia, capítulo o tema? Después recibirás la respuesta exacta.",
  fr: "Pour une réponse exacte, indiquez le sujet — quelle matière, quel chapitre ou quel thème ? Vous aurez ensuite la réponse précise.",
  de: "Für eine korrekte Antwort nenne mir das Thema — welches Fach, welches Kapitel oder welches Thema? Danach bekommst du die passende Antwort.",
  pt: "Para uma resposta correta, diga o tema — qual matéria, capítulo ou tópico? Depois você receberá a resposta certa.",
  it: "Per darti una risposta corretta, dimmi l'argomento — quale materia, capitolo o tema? Poi riceverai la risposta giusta.",
  ru: "Чтобы получить точный ответ, назовите тему — какой предмет, какая глава или какая тема? Затем вы получите правильный ответ.",
  zh: "为了给你准确回答，请告诉我主题——哪个科目、哪一章或哪个话题？然后你会得到正确的答案。",
  ja: "正確な回答を得るために、テーマを教えてください。どの教科、どの章、どのトピックですか？その後、正しい答えが得られます。",
  ko: "정확한 답을 위해 주제를 알려주세요 — 어떤 과목, 어떤 단원, 어떤 주제인가요? 그러면 정확한 답을 받을 수 있습니다.",
  id: "Untuk jawaban yang tepat, sebutkan topiknya — mata pelajaran, bab, atau topik apa? Kemudian Anda akan mendapat jawaban yang tepat.",
  tr: "Doğru bir cevap için konuyu söyleyin — hangi ders, hangi bölüm ya da hangi konu? Ardından doğru cevabı alacaksınız.",
};

/** Non-cloud answer for commonly asked plan questions in Hindi/Hinglish and
 *  the other scripts the tutor advertises, so a keyless/offline run is still
 *  useful instead of repeating an English "tell me more" line. */
function multilingualInstantReply(q: string, ctx: TutorContext): TutorReply | null {
  const hinglish = isHinglishText(q);
  const tag = detectLanguage(q);
  const isHindiFamily = hinglish || tag === "hi-IN";
  if (!isHindiFamily) return null;

  const pending = ctx.today.filter((task) => task.status === "pending");
  const list = pending.slice(0, 6).map((task, index) =>
    `${index + 1}. **${task.title}** (${task.minutes} min)`
  ).join("\n");

  // आज क्या पढ़ूँ / aaj kya padhu
  if (/(today|aaj|आज).*(study|padh|पढ़|kya|क्या)|(kya|क्या).*(padhu|पढ़ूं|पढ़ूँ|padhna|पढ़ना|study|padhai|पढ़ाई)|(what).*(study|padh)/i.test(q)) {
    if (!pending.length) {
      return hinglish
        ? { text: "Aaj ke liye koi pending task nahi hai. Is extra time ko active recall ya short mixed practice ke liye use karo." }
        : { text: "आज के लिए कोई pending task नहीं है। यह अतिरिक्त समय active recall या छोटी mixed practice के लिए उपयोग करें।" };
    }
    return hinglish
      ? { text: `Aaj ke liye priority order:\n\n${list}\n\nReady ho to bol *"start timer"*.` }
      : { text: `आज के लिए सबसे पहले ये पढ़ें:\n\n${list}\n\nतैयार हों तो बोलें *"start timer"*।` };
  }

  // प्रगति / progress
  if (/(progress|kaise chal rah|kya chal rah|kitna (hua|bacha)|कैसा चल रहा|कितना हुआ|कितना बचा|kya progress)/i.test(q)) {
    const overdueLine = ctx.overdue
      ? (hinglish ? ` ${ctx.overdue} overdue task ${ctx.overdue === 1 ? "hai" : "hain"}.` : ` ${ctx.overdue} overdue task हैं।`)
      : (hinglish ? " Koi overdue task nahi hai." : " कोई overdue task नहीं है।");
    return hinglish
      ? { text: `Aap **${ctx.progressPct}%** syllabus complete kar chuke hain, aur **${ctx.streak} din** ki streak hai. Is week **${ctx.hoursThisWeek} ghante** study hui hai.${overdueLine}` }
      : { text: `आप **${ctx.progressPct}%** सिलेबस पूरा कर चुके हैं, और **${ctx.streak} दिन** की स्ट्रीक है। इस हफ्ते **${ctx.hoursThisWeek} घंटे** पढ़ाई हुई है।${overdueLine}` };
  }

  // सबसे कमज़ोर topic / weak
  if (/(weakest|sabse weak|weak (topic|subject)|kamzor|कमज़ोर|सबसे कमज़ोर|kya .*weak|weak (hu|ho|hai))/i.test(q)) {
    const weakest = [...ctx.subjects]
      .filter((subject) => subject.total > 0)
      .sort((a, b) => (a.done / a.total) - (b.done / b.total))[0];
    if (weakest) {
      const pct = Math.round((weakest.done / weakest.total) * 100);
      return hinglish
        ? { text: `Aapka sabse kamzor subject hai **${weakest.name}** — **${pct}%** complete (${weakest.done}/${weakest.total} lessons). Subjects kholein aur uska pehla pending lesson start karo.` }
        : { text: `आपका सबसे कमज़ोर विषय है **${weakest.name}** — **${pct}%** पूरा (${weakest.done}/${weakest.total} lessons)। Subjects खोलें और इसका पहला pending lesson शुरू करें।` };
    }
  }

  // पीछे / behind
  if (/(behind|piche|पीछे|overdue|late|मैं पीछे|kya (main|mein) piche)/i.test(q)) {
    if (ctx.overdue) {
      const count = ctx.overdue;
      return hinglish
        ? { text: `Aapke paas **${count}** overdue task ${count === 1 ? "hai" : "hain"}. Ek baar **Rebalance schedule** use karo — ye baaki kaam aage le jaayega bina completed lessons ko chhue.` }
        : { text: `आपके पास **${count}** overdue task ${count === 1 ? "है" : "हैं"}। एक बार **Rebalance schedule** उपयोग करें — यह बाकी काम आगे ले जाएगा, completed lessons को बिना छुए।` };
    }
    return hinglish
      ? { text: "Koi overdue task nahi hai. Aaj ke plan par raho, extra kaam jodne ki zaroorat nahi." }
      : { text: "कोई overdue task नहीं है। आज के plan पर रहें, extra काम जोड़ने की ज़रूरत नहीं।" };
  }

  return null;
}

export function instantTutorReply(q: string, ctx: TutorContext): TutorReply | null {
  // Hinglish / non-English canned data replies must answer in the same
  // language before the English-only quick paths below.
  const multilingual = multilingualInstantReply(q, ctx);
  if (multilingual) return multilingual;

  // Non-English / Hinglish turns belong on the multilingual model path.
  // An English canned answer after a Hindi question is what made language
  // support feel broken.
  if (!isMostlyEnglishQuery(q)) return null;
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

/** Only run the Wikipedia/glossary search for clear factual lookup questions.
 *  Open-ended, opinion, advice, or "what is the best/perfect…" questions must
 *  not be answered by an unrelated encyclopedia page. */
function isFactualLookupQuestion(q: string): boolean {
  if (/how\b|\bwhy\b|\bshould\b|\bbest\b|\bperfect\b|\bideal\b|\brecommend\b|\badvice\b|\bopinion\b|\bthink\b|\bfeel\b|\bsolution\b|\bany war\b/i.test(q)) return false;
  return /\b(what is|what's|define|definition of|meaning of|what does .* mean|explain)\b/i.test(q);
}

function multilingualOpenEnded(q: string): string | null {
  const lang = localReplyLang(q);
  if (lang === "en") return null;
  return LOCAL_FALLBACK_TEXT[lang];
}

function openEndedFallback(q: string): string {
  const multilingual = multilingualOpenEnded(q);
  if (multilingual) return multilingual;
  const n = q.toLowerCase();
  if (/\b(perfect|best|ideal|solution)\b|\bany war\b|world peace/i.test(n)) {
    return "That's an open-ended question, so I don't want to give a rushed one-line answer. Tell me the specific angle you need — for example the conflict/exam topic, the course chapter, or whether you want a definition, comparison, or study strategy — and I'll answer it directly.";
  }
  return "I need one more detail to give you the right answer. Tell me the specific topic or subject you mean, and I'll explain it properly rather than guess.";
}

export async function localTutor(
  q: string,
  ctx: TutorContext,
  options: { skipCloud?: boolean; voiceGender?: "female" | "male" } = {}
): Promise<TutorReply> {
  const action = parseCommand(q);
  const n = q.toLowerCase();

  if (action) {
    return { text: commandReply(action, q, ctx.daysLeft, options.voiceGender), action };
  }

  const instant = instantTutorReply(q, ctx);
  if (instant) return instant;

  const pct = percentQ(q);
  if (pct) return { text: pct };

  if (!options.skipCloud) {
    const aiResponse = await callLLM(
      tutorSystemPrompt(ctx, { voiceGender: options.voiceGender }),
      [{ role: "user", content: q }],
      800
    );
    if (aiResponse) return { text: aiResponse };
  }

  // Meta questions about Shigun's engine get an honest status answer instead
  // of a glossary hit; concept questions ("what is AI") still use the lookup.
  if (isSelfEngineQuestion(q)) {
    return { text: selfEngineReply(ctx) };
  }

  if (isFactualLookupQuestion(q)) {
    const subjectHint = ctx.subjects.find((s) => n.includes(s.name.toLowerCase().split(" ")[0]))?.name;
    const knowledge = await lookupKnowledge(q);
    if (knowledge) return { text: teachFromKnowledge(knowledge, q, ctx.level, subjectHint) };
  }

  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(q.trim())) {
    return { text: "Hello! I can help with study planning, explanations, writing, calculations, ideas, and everyday questions. What would you like to explore?" };
  }
  if (/\b(thanks|thank you)\b/i.test(q)) return { text: "You’re welcome. What would you like to do next?" };
  return { text: openEndedFallback(q) };
}

/** Meta questions about SHIGUN's own engine must be answered directly, not
 *  run through the offline glossary. Without this guard "do you connected
 *  with any ai?" was matched by the glossary term 'ai' and answered with the
 *  definition of Artificial Intelligence instead of talking about Shigun. */
const SELF_ENGINE_QUESTION_RE =
  /\b(are you|is shigun|is this|what are you|who are you)\b|\b(do you|does shigun|is shigun)\s+(use|have|connect|run|work|connected|powered|operate)\b|\byou\s+(connected|using|running|powered|linked)\b|\bconnected\s+(to|with)\s+(any\s+)?(ai|llm|engine|model|provider)\b|\b(which|what)\s+(ai|llm|engine|model|provider)\s*(do\s+you|are\s+you|is\s+shigun|you\s+use)\b/i;

function isSelfEngineQuestion(q: string): boolean {
  // "What is AI?" / "Explain artificial intelligence" are real questions
  // about the concept, not about Shigun, so they keep the glossary path.
  if (/\b(what is|explain|define|definition of|meaning of)\s+(an?\s+)?(ai|artificial intelligence)\b/i.test(q)) return false;
  return SELF_ENGINE_QUESTION_RE.test(q);
}

function selfEngineReply(ctx: TutorContext): string {
  const provider = activeProvider();
  const error = llmError();
  const parts = [
    `I'm Shigun, the built-in study coach in **${ctx.courseName}**.`,
    "I run on Study Planner Pro's hybrid engine: the local planner and knowledge base are always available, and the cloud AI model is used on top when this server has a provider key.",
  ];
  if (provider) {
    parts.push(`The cloud AI layer is configured (${provider}).${error ? ` This request couldn't reach it — ${error}.` : ""}`);
  } else {
    parts.push("No cloud AI key is configured on this server, so I'm answering from the built-in hybrid/local engine.");
  }
  return parts.join("\n\n");
}

/** Maps a selected voice profile id to its spoken grammatical gender. */
export function voiceGenderFor(voiceId: string): "female" | "male" {
  return voiceId === "m1" ? "male" : "female";
}

export function tutorSystemPrompt(
  ctx: TutorContext,
  options: { voiceGender?: "female" | "male" } = {}
): string {
  const gender = options.voiceGender || "female";
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
You are also a helpful general conversational assistant: answer ordinary questions,
brainstorming, writing, calculations, and day-to-day requests directly. Do not tell
someone to ask only study questions. Keep app data in the background unless relevant.
Teach step-by-step using clear markdown formatting.
Voice: intelligent, concise, supportive, confident — like a calm senior tutor.
Use at most one emoji per reply, and only when it genuinely helps; usually use none.
Never use hype ("CRUSHING IT!!!"), all-caps excitement, or emoji chains.

VOICE GENDER: You are speaking with a ${gender} voice. In languages with grammatical
gender (Hindi, Urdu, Marathi, Bengali, Gujarati, Punjabi, Nepali, Arabic, Spanish,
French, and others), always use ${gender === "female" ? "feminine" : "masculine"}
first-person verb endings and matching adjective agreement whenever you refer to
yourself, so your grammar matches the voice the learner hears. Do not mention this
rule in your reply — just speak with the correct forms.

LANGUAGE: You are multilingual. Reply in the SAME language/script the learner just used or
explicitly requested, including Bengali/Bangla, Hindi, Marathi, Tamil, Telugu, Kannada,
Malayalam, Gujarati, Punjabi, Odia, Urdu, Nepali, Arabic, Chinese, Japanese, Korean, Thai,
Russian, Spanish, French, German, Portuguese, Italian, Indonesian, Turkish, Hinglish, and
English. Never claim that you only support English or Hindi. If they write Hindi/Marathi
in Latin script (Hinglish), answer in that mix; switch to native script when they ask
whether you can speak it. Do not switch language mid-reply unless they ask you to.

ANSWER DEPTH: match the depth to the request. Short factual questions get short answers.
When the learner asks for an explanation, a lesson, or says anything like "in detail",
"explain fully", "step by step", "in simple words", or the equivalent in their language,
give a COMPLETE structured lesson: a one-line idea, numbered steps, one concrete worked
example, common mistakes to avoid, and a short recap. Never truncate a lesson to stay
brief — long answers are spoken aloud in full by the app, in consecutive parts.

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
