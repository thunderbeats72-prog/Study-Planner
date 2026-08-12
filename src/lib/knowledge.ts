/* Keyless knowledge retrieval used by the AETHER tutor when no LLM key is set.
   Runs server-side only. */

const UA = "StudyPlannerPro/1.0 (educational study planner)";

async function jget<T>(url: string, ms = 9000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA, accept: "application/json" } });
    clearTimeout(timer);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const STOP = new Set([
  "what", "whats", "is", "are", "the", "a", "an", "of", "in", "on", "to", "for", "and", "or",
  "explain", "define", "definition", "describe", "tell", "me", "about", "how", "does", "do",
  "did", "can", "you", "please", "give", "why", "when", "which", "with", "that", "this", "it",
  "i", "my", "concept", "topic", "meaning", "means", "simple", "words", "short", "notes",
  "difference", "between", "help", "understand", "understanding", "study", "learn", "teach",
]);

export function searchTerms(q: string): string {
  const cleaned = q
    .toLowerCase()
    .replace(/[?!.,;:"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter((w) => w.length > 1 && !STOP.has(w));
  return (words.length ? words : cleaned.split(" ")).slice(0, 8).join(" ");
}

export type Knowledge = {
  title: string;
  extract: string;
  url: string;
  related: string[];
};

type WikiSearch = { query?: { search?: { title: string; pageid: number }[] } };
type WikiSummary = {
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
  type?: string;
};
type WikiExtract = {
  query?: { pages?: Record<string, { title?: string; extract?: string; pageid?: number }> };
};

/** Search Wikipedia and return a rich extract for the best matching article. */
export async function lookupKnowledge(question: string): Promise<Knowledge | null> {
  const term = searchTerms(question);
  if (!term) return null;

  const search = await jget<WikiSearch>(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      term
    )}&srlimit=4&format=json&origin=*`
  );
  const hits = search?.query?.search || [];
  if (!hits.length) return null;

  const best = hits[0];
  const ex = await jget<WikiExtract>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=0&exchars=2400&pageids=${best.pageid}&format=json&origin=*`
  );
  let extract = "";
  const pages = ex?.query?.pages;
  if (pages) {
    const first = Object.values(pages)[0];
    extract = (first?.extract || "").trim();
  }
  if (!extract) {
    const sum = await jget<WikiSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(best.title.replace(/ /g, "_"))}`
    );
    extract = (sum?.extract || "").trim();
  }
  if (!extract || extract.length < 60) return null;

  return {
    title: best.title,
    extract,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(best.title.replace(/ /g, "_"))}`,
    related: hits.slice(1, 4).map((h) => h.title),
  };
}

function sentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

/** Pull the most information-dense sentences (definitions, causes, mechanisms). */
function keySentences(all: string[], max: number): string[] {
  const scored = all.map((s) => {
    let score = 0;
    if (/\bis\b|\bare\b|\brefers to\b|\bdefined as\b|\bmeans\b/.test(s)) score += 3;
    if (/\bbecause\b|\bcauses?\b|\bresults? in\b|\bleads? to\b|\bdue to\b/.test(s)) score += 2;
    if (/\bconsists? of\b|\bcomprises?\b|\bincludes?\b|\btypes?\b|\bcategor/.test(s)) score += 2;
    if (/\d/.test(s)) score += 1;
    if (s.length > 200) score -= 1;
    return { s, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.s);
}

/**
 * Turn a raw encyclopedia extract into a genuine tutor-style lesson — not a
 * copy-paste. It restructures the material into: one-line definition, why it
 * matters, a mechanism/components breakdown, a worked/exam angle, common
 * mistakes, and a self-test — all adapted to the learner's level.
 */
export function teachFromKnowledge(
  k: Knowledge,
  question: string,
  level: string,
  subjectHint?: string
): string {
  const s = sentences(k.extract);
  if (!s.length) return `I found a reference for **${k.title}** but couldn't extract a clean explanation. Try rephrasing, or give me the exact sub-topic.`;

  const definition = s[0];
  const supporting = keySentences(s.slice(1), 4);
  const young = level === "nursery" || level === "school" || level === "primary";
  const deep = level === "phd" || level === "pg";

  const out: string[] = [];
  out.push(`### ${k.title}`);
  out.push("");

  // 1. Definition, level-adapted
  if (young) {
    out.push(`**In one line:** ${simplify(definition)}`);
  } else {
    out.push(`**Definition.** ${definition}`);
  }

  // 2. Why it matters / where it fits
  out.push("");
  out.push(`**Why it matters.** ${whyItMatters(k.title, subjectHint, question)}`);

  // 3. The mechanism / components — restructured, not dumped
  if (supporting.length) {
    out.push("");
    out.push(deep ? "**Key mechanisms & structure**" : "**How it actually works**");
    supporting.forEach((d, i) => out.push(`${i + 1}. ${d}`));
  }

  // 4. Exam / application angle — this is the part that isn't "wikipedia"
  out.push("");
  out.push("**Exam angle**");
  if (young) {
    out.push(`- If a question asks about *${k.title}*, first say what it is, then give one everyday example.`);
    out.push(`- Draw it if you can — a labelled picture earns easy marks.`);
  } else if (deep) {
    out.push(`- Be ready to state assumptions, edge cases, and one criticism of the standard view.`);
    out.push(`- Link *${k.title}* to an adjacent framework and explain where they diverge.`);
  } else {
    out.push(`- Lead your answer with a crisp 1-line definition, then structure the body around the points above.`);
    out.push(`- Add one concrete example or a worked numerical — examiners reward application, not recall.`);
  }

  // 5. Common mistakes + self test
  out.push("");
  out.push("**Watch out for**");
  out.push(`- Don't confuse the *definition* with an *example* of it — state both separately.`);
  out.push(`- Learn the boundary conditions: when does this **not** apply?`);
  out.push("");
  out.push("**Test yourself now**");
  out.push(`1. Explain *${k.title}* in one sentence without looking.`);
  out.push(`2. Give one example and one non-example.`);
  out.push(`3. ${deep ? "Name one limitation and a source that addresses it." : "Solve one question that uses it."}`);

  if (subjectHint) {
    out.push("");
    out.push(`_This sits inside **${subjectHint}** in your plan. Mark the lesson done once you can pass the self-test above._`);
  }
  if (k.related.length) {
    out.push("");
    out.push(`**Study next:** ${k.related.join(" · ")} — ask me *"explain ${k.related[0]}"*.`);
  }
  out.push("");
  out.push(`<sub>Reference: ${k.url}</sub>`);
  return out.join("\n");
}

function simplify(sentence: string): string {
  // Shorten and de-jargon a definition for young learners.
  const first = sentence.split(/[,;(]/)[0].trim();
  return first.length > 20 ? first + "." : sentence;
}

function whyItMatters(title: string, subject: string | undefined, question: string): string {
  if (/exam|marks|score/i.test(question)) return `It's a recurring exam topic — understanding it well protects easy marks.`;
  if (subject) return `It's a building block in **${subject}** — later topics assume you already understand ${title}.`;
  return `Grasping ${title} makes the topics built on top of it far easier, so it's worth over-learning now.`;
}
