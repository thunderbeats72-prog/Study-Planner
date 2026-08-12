import { generateTopics, lookupTopicBank, synthesiseSubjects, type GeneratedTopic, type SeedSubject } from "./curriculum";
import { lookupKnowledge, teachFromKnowledge } from "./knowledge";

/* ============================================================
   LLM PROVIDER LAYER (optional — falls back to local engine)
============================================================ */

type ChatMsg = { role: "user" | "assistant"; content: string };

export function activeProvider(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return null;
}

export async function callLLM(
  system: string,
  messages: ChatMsg[],
  maxTokens = 1400
): Promise<string | null> {
  const provider = activeProvider();
  if (!provider) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    let text: string | null = null;

    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
          max_tokens: maxTokens,
          system,
          messages,
        }),
      });
      const j = await r.json();
      text = Array.isArray(j?.content)
        ? j.content.map((c: { text?: string }) => c.text || "").join("").trim()
        : null;
    } else if (provider === "gemini") {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
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
      const j = await r.json();
      text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? null;
    } else {
      const cfg: Record<string, { url: string; key: string; model: string }> = {
        openai: {
          url: "https://api.openai.com/v1/chat/completions",
          key: process.env.OPENAI_API_KEY as string,
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        },
        groq: {
          url: "https://api.groq.com/openai/v1/chat/completions",
          key: process.env.GROQ_API_KEY as string,
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        },
        openrouter: {
          url: "https://openrouter.ai/api/v1/chat/completions",
          key: process.env.OPENROUTER_API_KEY as string,
          model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        },
      };
      const c = cfg[provider];
      const r = await fetch(c.url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${c.key}` },
        body: JSON.stringify({
          model: c.model,
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
        content: `Course: ${courseName} (level: ${level}). Subject: "${subjectName}". Difficulty: ${difficulty}.
Return exactly ${units} sequential lessons ordered from foundational to advanced, as a JSON array.
Each item: {"unit":"Unit 1","title":"...","summary":"2 sentence study instruction","objectives":["...","...","..."],"difficulty":"Easy|Medium|Hard","estMinutes":45}
JSON array only, no prose.`,
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

/* --- safe math evaluator --- */
function tokenize(expr: string): string[] | null {
  const t = expr.match(/(\d+\.?\d*|[+\-*/^()%]|sqrt|sin|cos|tan|log|ln|pi|e)/g);
  return t && t.join("").replace(/\s/g, "").length === expr.replace(/\s/g, "").length ? t : null;
}

export function evalMath(expr: string): number | null {
  const cleaned = expr
    .replace(/\s+/g, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\^/g, "**");
  if (!/^[-+*/().%\d\s*]+$/.test(cleaned)) return null;
  if (!/\d/.test(cleaned)) return null;
  try {
    // eslint-disable-next-line no-new-func
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
  return `**Solving ${m[0]}**\n\n1. Move the constant: ${a}x = ${c} ${b >= 0 ? "-" : "+"} ${Math.abs(b)} = ${c - b}\n2. Divide both sides by ${a}: x = ${c - b} / ${a}\n\n**x = ${round(x)}**\n\n*Check:* ${a}(${round(x)}) ${b >= 0 ? "+" : "-"} ${Math.abs(b)} = ${round(a * x + b)} ✓`;
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
    roots = `x₁ = ${round((-b + Math.sqrt(disc)) / (2 * a))}, x₂ = ${round((-b - Math.sqrt(disc)) / (2 * a))}`;
  } else if (disc === 0) {
    roots = `x = ${round(-b / (2 * a))} (repeated root)`;
  } else {
    roots = `x = ${round(-b / (2 * a))} ± ${round(Math.sqrt(-disc) / (2 * a))}i (complex roots)`;
  }
  return `**Quadratic:** ${a}x² ${b >= 0 ? "+" : "-"} ${Math.abs(b)}x ${c >= 0 ? "+" : "-"} ${Math.abs(c)} = 0\n\n1. Identify a = ${a}, b = ${b}, c = ${c}\n2. Discriminant D = b² − 4ac = ${b}² − 4(${a})(${c}) = **${round(disc)}**\n3. Quadratic formula: x = (−b ± √D) / 2a\n\n**${roots}**`;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
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
  if (!det) return `These two equations are **not independent** (determinant = 0), so they either have no solution or infinitely many.`;
  const x = (e1.c * e2.b - e2.c * e1.b) / det;
  const y = (e1.a * e2.c - e2.a * e1.c) / det;
  return `**Simultaneous equations**\n\n1. ${eqs[0]}\n2. ${eqs[1]}\n\n**Method — elimination / Cramer's rule**\nD = (${e1.a})(${e2.b}) − (${e2.a})(${e1.b}) = **${round(det)}**\nx = [(${e1.c})(${e2.b}) − (${e2.c})(${e1.b})] / D = **${round(x)}**\ny = [(${e1.a})(${e2.c}) − (${e2.a})(${e1.c})] / D = **${round(y)}**\n\n**x = ${round(x)}, y = ${round(y)}**\n\n*Check in equation 1:* ${round(e1.a * x + e1.b * y)} = ${e1.c} ✓`;
}

function integral(q: string): string | null {
  if (!/integrate|integral|antiderivative|∫/i.test(q)) return null;
  const terms = q.match(/(-?\d*\.?\d*)x\^?(\d*)/g);
  if (!terms || !terms.length) return null;
  const parts = terms.map((t) => {
    const mm = t.match(/(-?\d*\.?\d*)x\^?(\d*)/)!;
    const coef = mm[1] === "" || mm[1] === "+" ? 1 : mm[1] === "-" ? -1 : parseFloat(mm[1]);
    const pow = mm[2] ? parseInt(mm[2]) : 1;
    return `${round(coef / (pow + 1))}x^${pow + 1}`;
  });
  return `**Power rule for integration:** ∫axⁿ dx = a·xⁿ⁺¹/(n+1) + C\n\nTerm by term → **${parts.join(" + ").replace(/\+ -/g, "- ")} + C**\n\nAlways add the constant of integration for indefinite integrals.`;
}

function numberTheory(q: string): string | null {
  const nums = (q.match(/\d+/g) || []).map(Number);
  if (/\bhcf\b|\bgcd\b|highest common factor/i.test(q) && nums.length >= 2) {
    const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
    const r = nums.reduce((a, b) => g(a, b));
    return `**HCF/GCD of ${nums.join(", ")} = ${r}**\n\nMethod (Euclid's algorithm): repeatedly replace the larger number by the remainder of dividing it by the smaller, until the remainder is 0.`;
  }
  if (/\blcm\b|least common multiple/i.test(q) && nums.length >= 2) {
    const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
    const r = nums.reduce((a, b) => (a * b) / g(a, b));
    return `**LCM of ${nums.join(", ")} = ${r}**\n\nUse LCM(a,b) = a×b ÷ HCF(a,b). For more than two numbers, apply it pairwise.`;
  }
  if (/\bprime\b/i.test(q) && nums.length === 1) {
    const n = nums[0];
    let p = n > 1;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; }
    return `**${n} is ${p ? "a prime" : "not a prime"} number.**\n\nTest: check divisibility by every integer up to √${n} ≈ ${Math.floor(Math.sqrt(n))}. ${p ? "None divide it." : "At least one divides it exactly."}`;
  }
  if (/average|mean/i.test(q) && nums.length >= 3) {
    const sum = nums.reduce((a, b) => a + b, 0);
    return `**Mean of ${nums.join(", ")}**\n\nSum = ${sum}, count = ${nums.length}\nMean = ${sum} ÷ ${nums.length} = **${round(sum / nums.length)}**`;
  }
  return null;
}

function percentQ(q: string): string | null {
  const m = q.match(/what\s+is\s+(\d+\.?\d*)\s*%\s*of\s*(\d+\.?\d*)/i);
  if (!m) return null;
  const v = (parseFloat(m[1]) / 100) * parseFloat(m[2]);
  return `${m[1]}% of ${m[2]} = (${m[1]} ÷ 100) × ${m[2]} = **${round(v)}**`;
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
  return `**Power rule:** d/dx(axⁿ) = n·a·xⁿ⁻¹\n\nTerm by term → **${parts.join(" + ").replace(/\+ -/g, "- ")}**`;
}

const CONCEPTS: Record<string, string> = {
  "spaced repetition":
    "**Spaced repetition** means reviewing material at increasing intervals (1 day → 3 days → 7 days → 21 days) instead of cramming. Every time you *almost* forget something and then recall it, the memory trace gets stronger. Your planner already inserts automatic 48-hour and 1-week recall tasks after every lesson — those small 15-minute blocks are doing most of the heavy lifting for long-term retention.",
  "active recall":
    "**Active recall** = closing the book and forcing your brain to retrieve the answer. Re-reading feels productive but produces almost no durable learning. Practical routine: after each lesson, take a blank page and write everything you remember for 5 minutes, then compare with your notes and highlight only the gaps.",
  "pomodoro":
    "**Pomodoro** = 25 minutes of single-task focus + 5 minutes break, then a longer 15-minute break every 4 cycles. The point isn't the number 25 — it's that a *bounded* session removes the dread of starting. Use the Focus Studio timer, pick the subject, and commit to just one cycle. Starting is the hard part.",
  "feynman":
    "**Feynman technique**: 1) Write the concept name at the top of a page. 2) Explain it as if teaching a 12-year-old. 3) Every time you stumble or reach for jargon, that's your gap — go back to the source. 4) Simplify and use an analogy. If you can't explain it simply, you don't understand it yet.",
  "interleaving":
    "**Interleaving** means mixing different topics/subjects in one session instead of blocking one topic for hours. It feels harder and slower — which is exactly why it works: your brain has to select the right strategy each time. Your planner interleaves subjects per day for this reason.",
  "procrastinat":
    "Procrastination is almost never a time-management problem — it's an **emotion-regulation** problem. The task feels ambiguous or threatening, so your brain avoids it. Fixes that actually work:\n\n1. **Shrink the unit** — commit to 10 minutes, not 3 hours.\n2. **Make step 1 stupidly concrete** — 'open the book to page 84 and read one paragraph.'\n3. **Remove the phone from the room** (not just face-down).\n4. **Use implementation intentions** — 'At 7pm, at my desk, I will do Lesson 3.'\n5. **Forgive the last miss.** Guilt increases avoidance; self-compassion reduces it.",
  "consistency":
    "Consistency comes from **lowering the activation energy**, not raising motivation. Three levers:\n\n1. **Anchor** the session to something you already do daily (after dinner → 1 lesson).\n2. **Minimum viable day** — on bad days do a 15-minute recall task instead of skipping entirely. Never miss twice.\n3. **Visible streak** — the streak counter in your sidebar exists precisely for this.\n\nThe plan is designed with buffer days so one bad day never breaks the schedule.",
  "burnout":
    "Signs of burnout: dropping retention, irritability, dreading the desk, sleeping badly. Recovery protocol: take one **full** day off (guilt-free), then return at 50% load for two days. Reduce daily hours in Settings and hit *Re-plan with AI* — a smaller plan you actually follow beats a heroic plan you abandon.",
  "memory":
    "Memory tricks worth using: **chunking** (group items into 3–4s), **method of loci** (place items along a familiar walk), **acronyms** for ordered lists, **dual coding** (draw it as well as write it), and **sleep** — consolidation happens overnight, so a 7-hour night is a study technique.",
  "note":
    "Best note format for retention is the **Cornell layout**: main notes on the right, cue questions on the left, 3-line summary at the bottom. The cue column turns your notes into a self-test — which is the only part that actually builds memory.",
  "exam":
    "Exam-day protocol: 1) Two-pass strategy — sweep all easy marks first, then return to the hard ones. 2) Budget minutes per mark and check the clock at 25%/50%/75%. 3) Never leave a scoring question blank for a hard one. 4) Sleep beats a final all-nighter every single time.",
  "mock":
    "Mock tests are diagnostics, not scores. The 45 minutes *after* the mock matter more than the mock: classify each mistake as (a) concept gap, (b) silly error, (c) time pressure. Only (a) goes back on the study plan; (b) needs a checklist; (c) needs timed drills.",
  "swot":
    "**SWOT analysis** maps **S**trengths & **W**eaknesses (internal, controllable) against **O**pportunities & **T**hreats (external, uncontrollable). Practical use: don't just list — *cross* them. Strength × Opportunity = where to attack; Weakness × Threat = what to defend. In an exam, always finish with a strategic recommendation drawn from the grid, not just the four lists.",
  "marketing mix":
    "**The 4 Ps (Marketing Mix):** Product (features, quality, branding), Price (strategy, discounts, positioning), Place (channels, distribution, coverage), Promotion (advertising, PR, sales promotion, personal selling). Services add 3 more Ps: People, Process, Physical evidence. Exam tip: apply each P to the *specific* product in the question — generic definitions score low.",
  "stp":
    "**STP = Segmentation → Targeting → Positioning.** 1) *Segment* the market by demographics/psychographics/behaviour/geography. 2) *Target* the segment(s) worth serving (evaluate size, growth, competition, fit). 3) *Position* your offer in the target's mind via a differentiation and a positioning statement. It's the strategic step that comes *before* the 4 Ps.",
  "porter":
    "**Porter's Five Forces** assess industry attractiveness: 1) Threat of new entrants, 2) Bargaining power of suppliers, 3) Bargaining power of buyers, 4) Threat of substitutes, 5) Competitive rivalry. Strong forces = thin profits. Use it to explain *why* an industry is (un)profitable and where a firm should build defences.",
  "demand":
    "**Law of demand:** as price rises, quantity demanded falls (ceteris paribus), because of the substitution and income effects. Draw the downward-sloping curve; distinguish a *movement along* it (price change) from a *shift* of it (income, tastes, substitutes, expectations). Elasticity tells you how sensitive quantity is to price.",
  "elasticity":
    "**Price elasticity of demand (PED)** = %Δ quantity ÷ %Δ price. |PED|>1 elastic (luxuries), <1 inelastic (necessities), =1 unit elastic. Key exam link: if demand is inelastic, a price *rise* increases total revenue; if elastic, a price *cut* does. Determinants: substitutes, necessity, proportion of income, time horizon.",
  "photosynthesis":
    "**Photosynthesis** converts light energy into chemical energy: 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂. Two stages: 1) *Light reactions* in the thylakoid — split water, make ATP & NADPH, release O₂. 2) *Calvin cycle* in the stroma — fix CO₂ using ATP/NADPH to build glucose. Exam trap: light reactions need light directly; the Calvin cycle uses the products of the light reactions, not light itself.",
  "newton":
    "**Newton's three laws:** 1) *Inertia* — a body stays at rest/uniform motion unless acted on by a net force. 2) *F = ma* — net force = mass × acceleration (the workhorse for numericals). 3) *Action–reaction* — forces come in equal, opposite pairs on different bodies. Always draw a free-body diagram before applying law 2.",
  "supply and demand":
    "**Market equilibrium** is where the supply and demand curves cross — the price where quantity supplied = quantity demanded. Above it, surplus pushes price down; below it, shortage pushes price up. Shifts in either curve create a new equilibrium; practise predicting the direction of price and quantity for each shift.",
};

function findConcept(q: string): string | null {
  const n = q.toLowerCase();
  // prefer the longest/most-specific matching key
  let best: { key: string; len: number } | null = null;
  for (const key of Object.keys(CONCEPTS)) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(n) && (!best || key.length > best.len)) best = { key, len: key.length };
  }
  return best ? CONCEPTS[best.key] : null;
}

/** Coaching answer for "how do I answer/approach X" — genuinely useful, not a lookup. */
function answerStrategy(q: string, ctx: TutorContext): string {
  const topic = q.replace(/.*how (do|should) i (answer|approach|structure|write|solve|tackle|start)\s*/i, "").replace(/[?.]/g, "").trim();
  const deep = ctx.level === "phd" || ctx.level === "pg";
  return `### How to approach: ${topic || "this"}\n\n**1. Decode the command word.** *Explain / discuss / evaluate / calculate* each demand a different structure — underline it first.\n\n**2. Plan for 60 seconds before writing.** Jot 3–4 bullet points; a structured average answer beats a brilliant unstructured one.\n\n**3. Open with a precise 1-line definition or thesis**, then one point per paragraph: *claim → evidence/example → link back to the question*.\n\n**4. Show your working.** ${deep ? "State assumptions and cite the framework/author you're leaning on." : "For numericals, write the formula, substitute, then compute — marks live in the steps."}\n\n**5. Close deliberately** — a one-line conclusion that answers the exact question asked.\n\nWant me to model an answer? Say *"give a model answer for ${topic || "this topic"}"* and I'll write one with you.`;
}

/** Only used when the learner asks about a *subject overview* (not a specific concept). */
function topicExplainer(q: string, ctx: TutorContext): string | null {
  const n = q.toLowerCase();
  // require an explicit overview/plan intent so single-concept questions fall
  // through to real teaching instead of a syllabus dump.
  const wantsOverview = /(syllabus|overview|plan for|chapters|units|roadmap|where to start|how to study)/i.test(n);
  if (!wantsOverview) return null;
  for (const s of ctx.subjects) {
    if (n.includes(s.name.toLowerCase().split(" ")[0]) && s.name.length > 3) {
      const bank = lookupTopicBank(s.name) || [];
      const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
      return `### ${s.name} — study roadmap\nYou're **${pct}%** through (${s.done}/${s.total} lessons), difficulty *${s.difficulty}*.\n\n**Recommended order**\n${bank
        .slice(0, 10)
        .map((t, i) => `${i + 1}. ${t}`)
        .join("\n")}\n\n**How to run each lesson:** learn the concept → do 8–10 questions immediately → 48-hour recall → weekly mixed test.\n\nAsk me *"explain <topic>"* for any single lesson and I'll teach it step by step.`;
    }
  }
  return null;
}

/* --- in-app command parsing (natural-language, forgiving) --- */
export function parseCommand(q: string): TutorReply["action"] | undefined {
  const n = q.toLowerCase().trim().replace(/[.!]+$/, "");

  // navigation
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

  // clock / timer
  if (/\b(clock ?in|start (the )?(timer|clock|focus|session|studying|study)|begin (studying|session|focus)|let'?s study|i'?m ready to study)\b/.test(n))
    return { type: "startTimer" };
  if (/\b(clock ?out|stop (the )?(timer|clock|session)|end (the )?(session|study)|i'?m done|finished studying)\b/.test(n))
    return { type: "stopTimer" };
  if (/\b(take a break|break time|pause (the )?(timer|clock|session)|need a break)\b/.test(n))
    return { type: "break" };
  if (/\b(zen|focus mode|full ?screen|distraction ?free|deep work mode)\b/.test(n))
    return { type: "zen" };

  // appearance & themes
  if (/\btheme\b/.test(n) || /\b(midnight|dark|obsidian|nebula|emerald|sunset|mint|silver|lavender|samsung|light)\b/.test(n)) {
    if (/\b(midnight|dark)\b/.test(n)) return { type: "theme", payload: "theme-dark" };
    if (/\b(obsidian)\b/.test(n)) return { type: "theme", payload: "theme-obsidian" };
    if (/\b(nebula)\b/.test(n)) return { type: "theme", payload: "theme-nebula" };
    if (/\b(emerald|mint)\b/.test(n)) return { type: "theme", payload: "theme-mint" };
    if (/\b(sunset|champagne)\b/.test(n)) return { type: "theme", payload: "theme-sunset" };
    if (/\b(light|samsung|clean)\b/.test(n)) return { type: "theme", payload: "theme-sunset" }; // fallbacks
    if (/\b(silver|lavender)\b/.test(n)) return { type: "theme", payload: "theme-silver-lavender" };
    // generic theme switch request
    if (/\btheme\b/.test(n)) return { type: "theme", payload: "theme-dark" };
  }

  // re-plan
  if (/\b(re-?plan|rebuild|regenerate|reschedule|re-?balance|redo my (plan|schedule)|fix my (plan|schedule)|update my plan)\b/.test(n))
    return { type: "replan" };
  // catch-up phrases (standalone or with study context)
  if (/\b(catch me up|i'?m behind|fell behind|too much pending|way behind|missed (days|class)|rebalance|reschedule)\b/.test(n))
    return { type: "replan" };
  // "behind" + study context
  if (/\b(behind|fallback)\b/.test(n) && /\b(study|studies|plan|schedule|syllabus|exam|prep|revision|backlog|pending|help)\b/.test(n))
    return { type: "replan" };

  return undefined;
}

export async function localTutor(q: string, ctx: TutorContext): Promise<TutorReply> {
  const action = parseCommand(q);
  const n = q.toLowerCase();

  if (action?.type === "replan") {
    return {
      text: `No problem — falling behind is built into the design, that's what buffer days are for. I'm rebalancing your schedule now: unfinished lessons get pushed forward, the daily load is re-spread across the remaining ${ctx.daysLeft} days, and your weakest subject keeps priority. Give me a second…`,
      action,
    };
  }
  if (action) {
    const msgs: Record<string, string> = {
      navigate: `Opening **${String(action.payload)}** for you.`,
      startTimer: `Clock started. Session logged against your current subject — I'll add the minutes to today's task automatically. Put the phone in another room. 🎯`,
      stopTimer: `Session stopped and logged. Nice work.`,
      break: `Break started. Stand up, look 6 metres away for 20 seconds, drink water. I'll ping you back in.`,
      zen: `Zen mode engaged. Nothing on screen but the timer.`,
    };
    return { text: msgs[action.type] || "Done.", action };
  }

  // schedule questions
  if (/(what|which).*(today|now)|today'?s (plan|task|study|load)|what should i (study|do)/.test(n)) {
    if (!ctx.today.length)
      return {
        text: `Nothing is scheduled for today — either it's a rest day or the plan hasn't been generated yet. If you *want* to study, the highest-value thing right now is a 25-minute recall session on your weakest subject. Want me to build a plan?`,
      };
    const list = ctx.today
      .map((t, i) => `${i + 1}. **${t.title}** — ${t.minutes} min ${t.status === "done" ? "✅" : ""}`)
      .join("\n");
    return {
      text: `Here's today (${ctx.today.reduce((a, t) => a + t.minutes, 0)} min total):\n\n${list}\n\nStart with #1 — it's ordered by cognitive load, hardest first while you're fresh. Say *"start timer"* and I'll clock you in.`,
    };
  }
  if (/(how much|how many).*(left|remain|days)|days left|time left/.test(n)) {
    return {
      text: `**${ctx.daysLeft} days** until ${ctx.examDate}. You're **${ctx.progressPct}%** through the syllabus with ${ctx.streak}-day streak and ${ctx.hoursThisWeek}h logged this week.\n\n${
        ctx.progressPct >= (100 * (1 - ctx.daysLeft / Math.max(1, ctx.daysLeft + 30)))
          ? "You're tracking fine — keep the daily rhythm."
          : "Slightly behind pace. Say *'replan'* and I'll compress the schedule intelligently rather than you trying to cram."
      }`,
    };
  }
  if (/progress|how am i doing|status/.test(n)) {
    const sub = ctx.subjects
      .map((s) => `• ${s.name}: ${s.total ? Math.round((s.done / s.total) * 100) : 0}% (${s.done}/${s.total})`)
      .join("\n");
    return {
      text: `**Progress report for ${ctx.name}**\n\nOverall: **${ctx.progressPct}%** • Streak: ${ctx.streak} days • This week: ${ctx.hoursThisWeek}h • Overdue tasks: ${ctx.overdue}\n\n${sub}\n\n${
        ctx.overdue > 3
          ? "You've got a pile-up. Don't try to do it all today — say *replan* and I'll redistribute it."
          : "Healthy. The main risk now is consistency, not capability."
      }`,
    };
  }

  // math
  const pct = percentQ(q);
  if (pct) return { text: pct };
  const sim = simultaneous(q);
  if (sim) return { text: sim };
  const quad = solveQuadratic(q);
  if (quad) return { text: quad };
  const lin = solveLinear(q);
  if (lin) return { text: lin };
  const der = derivative(q);
  if (der) return { text: der };
  const integ = integral(q);
  if (integ) return { text: integ };
  const nt = numberTheory(q);
  if (nt) return { text: nt };
  const mathExpr = q.replace(/^(what is|calculate|compute|solve|=)\s*/i, "").replace(/[?=]/g, "").trim();
  if (/^[\d\s+\-*/().^%×÷]+$/.test(mathExpr) && /\d/.test(mathExpr) && /[+\-*/^]/.test(mathExpr)) {
    const v = evalMath(mathExpr);
    if (v !== null) return { text: `**${mathExpr} = ${round(v)}**\n\nWant the step-by-step? Ask *"show steps for ${mathExpr}"*.` };
  }

  // concepts & study science
  const concept = findConcept(q);
  if (concept) return { text: concept };

  const topic = topicExplainer(q, ctx);
  if (topic) return { text: topic };

  if (/^(hi|hello|hey|yo)\b/.test(n)) {
    return {
      text: `Hey ${ctx.name}! ${ctx.daysLeft} days to go and you're ${ctx.progressPct}% through ${ctx.courseName}. ${
        ctx.today.length ? `Today's first task is **${ctx.today[0].title}**.` : "Nothing scheduled today."
      }\n\nAsk me to explain a topic, solve a problem, or say *"replan"* if you've slipped.`,
    };
  }

  // "difference between A and B" — fetch both sides and build a comparison
  const cmp = q.match(/difference between (.+?) and ([^?.]+)/i) || q.match(/compare (.+?) (?:and|vs\.?|with) ([^?.]+)/i);
  if (cmp) {
    const [a, b] = [cmp[1].trim(), cmp[2].trim()];
    const [ka, kb] = await Promise.all([lookupKnowledge(a), lookupKnowledge(b)]);
    if (ka && kb) {
      const one = (k: NonNullable<typeof ka>) =>
        k.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
      return {
        text: `**${ka.title} vs ${kb.title}**\n\n**1. ${ka.title}**\n${one(ka)}\n\n**2. ${kb.title}**\n${one(kb)}\n\n**How to answer this in an exam**\n1. Open with one sentence defining each term.\n2. Compare on 3–4 fixed axes (purpose, process, outcome, where it occurs) — a table scores best.\n3. Close with one line on why the distinction matters.\n\n**Make your own comparison table now** with those axes — building it yourself is what makes it stick.\n\n<sub>Sources: ${ka.url} · ${kb.url}</sub>`,
      };
    }
  }

  // "how do I answer / structure / approach" questions → coaching, not a lookup
  if (/how (do|should) i (answer|approach|structure|write|solve|tackle|start)/i.test(n)) {
    return { text: answerStrategy(q, ctx) };
  }

  // real knowledge retrieval — keyless, works for open-ended questions,
  // then RESTRUCTURED into a real lesson (definition → why → mechanism →
  // exam angle → mistakes → self-test), never a raw paste.
  const subjectHint = ctx.subjects.find((s) =>
    n.includes(s.name.toLowerCase().split(" ")[0])
  )?.name;
  const knowledge = await lookupKnowledge(q);
  if (knowledge) {
    return { text: teachFromKnowledge(knowledge, q, ctx.level, subjectHint) };
  }

  // last-resort structured coaching answer
  return {
    text: `I couldn't find a solid reference for that one, so let's reason it out together.\n\n**Your question:** ${q}\n\n**Attack it in this order**\n1. **Classify it** — definition, derivation, numerical, or application? That single choice decides your method.\n2. **List what's given and what's asked.** Most lost marks come from a condition that was read but not written down.\n3. **State the governing rule** (formula, law, doctrine, framework) *before* substituting anything.\n4. **Work forward in small steps**, keeping units and notation consistent throughout.\n5. **Sanity-check** against a limiting case you already trust.\n\nGive me the exact wording, the numbers, or the chapter it comes from and I'll take it line by line. You can also ask me things like *"explain photosynthesis"*, *"solve 3x + 7 = 25"*, *"what should I study today?"* or *"replan"*.`,
  };
}

/* ============================================================
   COURSE → SUBJECT SUGGESTION (used by the wizard)
============================================================ */

export async function aiSuggestSubjects(
  courseName: string,
  level: string
): Promise<{ subjects: SeedSubject[]; source: string }> {
  const fallback = synthesiseSubjects(courseName, level);
  if (!activeProvider()) return { subjects: fallback, source: "aether-local" };

  const raw = await callLLM(
    "You are a curriculum designer. Reply with strict JSON only.",
    [
      {
        role: "user",
        content: `Course/exam: "${courseName}". Education level: ${level}.
List the 4-7 real subjects/papers a student actually studies for this, as a JSON array:
[{"name":"...","units":8,"difficulty":"Easy|Medium|Hard","color":"#6366f1"}]
"units" = number of major chapters/lessons in that subject (3-20). JSON array only.`,
      },
    ],
    800
  );
  if (!raw) return { subjects: fallback, source: "aether-local" };
  try {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fence ? fence[1] : raw;
    const start = body.indexOf("[");
    const parsed = JSON.parse(body.slice(start, body.lastIndexOf("]") + 1)) as SeedSubject[];
    if (Array.isArray(parsed) && parsed.length >= 2) {
      const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
      return {
        subjects: parsed.slice(0, 8).map((s, i) => ({
          name: String(s.name).slice(0, 80),
          units: Math.min(30, Math.max(2, Number(s.units) || 8)),
          difficulty: (["Easy", "Medium", "Hard"].includes(String(s.difficulty)) ? s.difficulty : "Medium") as SeedSubject["difficulty"],
          color: /^#[0-9a-f]{6}$/i.test(String(s.color)) ? s.color : palette[i % palette.length],
        })),
        source: activeProvider() as string,
      };
    }
  } catch { /* fall through */ }
  return { subjects: fallback, source: "aether-local" };
}

export function tutorSystemPrompt(ctx: TutorContext): string {
  return `You are AETHER, the built-in AI tutor and study coach inside "Study Planner Pro".

Learner: ${ctx.name} • Level: ${ctx.level} • Course: ${ctx.courseName}
Exam date: ${ctx.examDate} (${ctx.daysLeft} days left) • Daily target: ${ctx.dailyHours}h
Overall syllabus progress: ${ctx.progressPct}% • Streak: ${ctx.streak} days • Hours this week: ${ctx.hoursThisWeek} • Overdue tasks: ${ctx.overdue}
Subjects: ${ctx.subjects.map((s) => `${s.name} (${s.done}/${s.total} lessons, ${s.difficulty})`).join("; ")}
Today's plan: ${ctx.today.length ? ctx.today.map((t) => `${t.title} [${t.minutes}m, ${t.status}]`).join("; ") : "nothing scheduled"}

Rules:
- Teach, don't just answer. Show the reasoning steps for any problem (maths, science, logic, essays).
- Match the learner's level: for nursery/school keep language simple and warm; for PhD be rigorous and cite frameworks.
- Be concise but complete. Use markdown: bold key terms, numbered steps, short lists.
- Always relate advice back to their actual plan and remaining days when it's relevant.
- If the learner is behind, be encouraging and practical — never shame them.
- If they ask you to change the app (replan, start timer, open a page), confirm briefly; the app handles the action.`;
}
