/* Keyless knowledge retrieval used by the SHIGUN tutor when no LLM key is set.
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
  // Conversational and filler words that make a Wikipedia/glossary search worse.
  "got", "so", "mean", "lot", "too", "really", "like", "just", "ok", "okay", "hey", "hi",
  "some", "thing", "anything", "something", "someone", "anyone", "now", "then",
  "there", "here", "much", "many", "more", "most", "very", "also", "even", "only",
]);

export function searchTerms(q: string): string {
  const cleaned = q
    .toLowerCase()
    .replace(/[?!.,;:"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter((w) => w.length > 1 && !STOP.has(w));
  // De-duplicate repeated keywords ("buffer … buffer … buffer") and drop
  // filler words so a search term is a real noun phrase, not a sentence.
  const unique = Array.from(new Set(words));
  return (unique.length ? unique : cleaned.split(" ")).slice(0, 8).join(" ");
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

/* ============================================================
   OFFLINE GLOSSARY — answers that never need the network.
   Wikipedia, and even the LLM/cloud, can be unreachable on
   restricted networks. These curated entries keep SHIGUN useful
   and specific for common study words and coursework terms.
============================================================ */
type LocalConcept = {
  terms: string[];
  title: string;
  definition: string;
  how: string[];
  example?: string;
  related?: string[];
};

const LOCAL_CONCEPTS: LocalConcept[] = [
  {
    terms: ["buffer"],
    title: "Buffer",
    definition: "A buffer is a temporary storage area that holds data while it is moving from one place to another.",
    how: [
      "Data is placed in the buffer first, then sent out when the receiving device or software is ready.",
      "This smooths out speed differences, so a faster source is not forced to wait for a slower destination.",
      "You see buffers in streaming video, audio playback, typing, and network data transfer.",
    ],
    example: "When a video pauses and shows \"buffering\", it is filling a small temporary store of video data before playing it smoothly.",
    related: ["cache", "RAM"],
  },
  {
    terms: ["cache"],
    title: "Cache",
    definition: "A cache is a small, fast temporary store that keeps recently used data close to where it will be needed.",
    how: [
      "The first request fetches and stores the data; later requests read it from the cache instead of repeating the work.",
      "Caches trade a little memory for a large speed gain, which is why apps load faster after their first visit.",
    ],
    related: ["buffer", "RAM"],
  },
  {
    terms: ["ram"],
    title: "RAM (Random Access Memory)",
    definition: "RAM is the fast working memory a computer uses while it is running programs.",
    how: [
      "It stores the data and instructions a program is currently using.",
      "It is volatile: the contents disappear when the power is turned off.",
    ],
    related: ["buffer", "cache"],
  },
  {
    terms: ["cpu", "processor"],
    title: "CPU (Central Processing Unit)",
    definition: "The CPU is the part of a computer that actually executes instructions.",
    how: [
      "It fetches an instruction, decodes what it means, executes it, then moves to the next one.",
      "More instructions per second means a faster and more responsive system.",
    ],
    related: ["RAM"],
  },
  {
    terms: ["algorithm"],
    title: "Algorithm",
    definition: "An algorithm is a step-by-step set of rules for solving a problem or completing a task.",
    how: [
      "A good algorithm has a clear input, a clear output, and a finite number of steps.",
      "It is judged not only by correctness but also by how much time and memory it needs.",
    ],
    example: "A recipe is an everyday algorithm: take ingredients, follow ordered steps, get a finished dish.",
  },
  {
    terms: ["artificial intelligence", "ai"],
    title: "Artificial Intelligence",
    definition: "Artificial intelligence is the ability of a machine or program to perform tasks that normally need human intelligence.",
    how: [
      "It uses patterns, data, and learned rules to make predictions, classify things, or generate text.",
      "Simple AI can be rule-based; modern AI usually learns from large amounts of examples.",
    ],
    related: ["algorithm"],
  },
  {
    terms: ["database"],
    title: "Database",
    definition: "A database is an organised collection of data that can be searched, updated, and managed efficiently.",
    how: [
      "Data is stored in tables with rows and columns, and queries retrieve exactly the needed records.",
      "Indexes make common lookups fast, while constraints keep the data consistent.",
    ],
    related: ["algorithm"],
  },
  {
    terms: ["neuron"],
    title: "Neuron",
    definition: "A neuron is a nerve cell that carries and processes information in the brain and nervous system.",
    how: [
      "It receives signals through dendrites, sends a signal along its axon, and releases chemicals at the synapse.",
      "Learning and memory work by strengthening or weakening connections between neurons.",
    ],
    related: ["synapse", "memory"],
  },
  {
    terms: ["synapse"],
    title: "Synapse",
    definition: "A synapse is the junction where a neuron communicates with the next cell.",
    how: [
      "Signals cross the gap chemically using neurotransmitters.",
      "Repeated use strengthens the pathway, which is the biological basis of learning and habit.",
    ],
    related: ["neuron", "memory"],
  },
  {
    terms: ["attention"],
    title: "Attention",
    definition: "Attention is the process of selectively focusing on some information while ignoring other information.",
    how: [
      "It is limited in capacity, so not everything in the environment can be processed at once.",
      "Attention can be divided between tasks with difficulty, and it can be sustained for a limited time.",
    ],
    example: "In a lecture, your attention decides which spoken details are encoded into memory.",
    related: ["perception"],
  },
  {
    terms: ["perception"],
    title: "Perception",
    definition: "Perception is the process of interpreting sensory information so it becomes a meaningful experience.",
    how: [
      "The senses detect raw signals, then the brain organises and interprets them.",
      "Context, past experience, and expectations can all change what you perceive.",
    ],
    related: ["attention"],
  },
  {
    terms: ["classical conditioning"],
    title: "Classical Conditioning",
    definition: "Classical conditioning is learning in which a neutral stimulus comes to trigger a response after being paired with a stimulus that already triggers it.",
    how: [
      "A natural stimulus (like food) is repeatedly paired with a neutral one (like a bell).",
      "After enough pairings, the neutral stimulus alone produces the learned response.",
    ],
    example: "Pavlov's dogs salivated to a bell after learning that the bell predicted food.",
  },
  {
    terms: ["operant conditioning"],
    title: "Operant Conditioning",
    definition: "Operant conditioning is learning through the consequences of a behaviour.",
    how: [
      "Reinforcement increases the chance of repeating a behaviour.",
      "Punishment decreases the chance, and the timing of the consequence matters.",
    ],
    example: "A study reward that follows each completed session is reinforcement for that habit.",
  },
  {
    terms: ["cognitive psychology"],
    title: "Cognitive Psychology",
    definition: "Cognitive psychology is the study of mental processes such as attention, memory, language, problem solving, and decision making.",
    how: [
      "It treats the mind as an information-processing system.",
      "Researchers use experiments, reaction times, and mental workload measures to infer hidden processes.",
    ],
    related: ["attention", "perception", "memory"],
  },
  {
    terms: ["photosynthesis"],
    title: "Photosynthesis",
    definition: "Photosynthesis is the process by which green plants use light to make food from carbon dioxide and water.",
    how: [
      "Chlorophyll absorbs light energy in the leaves.",
      "The energy is used to convert carbon dioxide and water into glucose, releasing oxygen.",
    ],
    related: ["cell"],
  },
  {
    terms: ["cell"],
    title: "Cell",
    definition: "A cell is the basic unit of life; all living organisms are made of one or more cells.",
    how: [
      "Cells carry out essential jobs like taking in nutrients, releasing energy, and reproducing.",
      "Different cell types become specialised for different tasks in complex organisms.",
    ],
    related: ["atom", "osmosis"],
  },
  {
    terms: ["atom"],
    title: "Atom",
    definition: "An atom is the smallest unit of an element that keeps its chemical identity.",
    how: [
      "It contains protons and neutrons in the nucleus and electrons moving around it.",
      "Atoms combine into molecules, and molecules make up most everyday substances.",
    ],
    related: ["molecule"],
  },
  {
    terms: ["gravity"],
    title: "Gravity",
    definition: "Gravity is the force that pulls objects with mass toward each other.",
    how: [
      "On Earth it pulls every object downward, which is why dropped items fall.",
      "It keeps planets in orbit around the Sun and shapes the tides.",
    ],
  },
  {
    terms: ["osmosis"],
    title: "Osmosis",
    definition: "Osmosis is the movement of water across a membrane from a weaker solution to a stronger solution.",
    how: [
      "The membrane lets water pass but blocks larger dissolved particles.",
      "Water moves until the concentrations on both sides become balanced.",
    ],
    related: ["cell"],
  },
  {
    terms: ["mitosis"],
    title: "Mitosis",
    definition: "Mitosis is the process by which one cell divides to form two identical daughter cells.",
    how: [
      "The cell copies its DNA, then separates those copies into two new nuclei.",
      "The result is two cells with the same genetic information, used for growth and repair.",
    ],
    related: ["cell"],
  },
];

function isMetaQuestion(q: string): boolean {
  if (/\bwhat is|explain|define|definition of|meaning of\b/i.test(q)) return false;
  return /\b(are you|is shigun|is this|what are you|who are you|do you|does shigun|is shigun)\b|\byou\s+(connected|using|running|powered|linked)\b|\bconnected\s+(to|with)\s+(any\s+)?(ai|llm|engine|model|provider)\b/i.test(q);
}

function localKnowledge(question: string): Knowledge | null {
  const q = question.toLowerCase();
  // Do not let a glossary word ("ai" inside "any ai") answer a meta question
  // about Shigun/its engine.
  if (isMetaQuestion(q)) return null;
  let best: LocalConcept | null = null;
  let bestScore = 0;
  for (const concept of LOCAL_CONCEPTS) {
    const score = concept.terms.reduce((total, term) =>
      total + (q.includes(term) ? term.length : 0), 0);
    if (score > bestScore) {
      best = concept;
      bestScore = score;
    }
  }
  if (!best) return null;
  const extract = [
    best.definition,
    ...best.how,
    best.example ? `Example: ${best.example}` : "",
  ].filter(Boolean).join(" ");
  return {
    title: best.title,
    extract,
    url: "",
    related: best.related || [],
  };
}

/** Search Wikipedia and return a rich extract for the best matching article. */
export async function lookupKnowledge(question: string): Promise<Knowledge | null> {
  // Offline glossary first: it is instant and works even when the server's
  // network cannot reach Wikipedia or the cloud.
  const local = localKnowledge(question);
  if (local) return local;

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
  // This is a fallback research aid, not a citation renderer. The tutor should
  // sound like a tutor, not append a Wikipedia source to every answer.
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
