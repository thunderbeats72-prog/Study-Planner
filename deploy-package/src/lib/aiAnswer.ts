/* ============================================================
   ANSWER SANITY GATE — "is this text actually an answer?"
   ────────────────────────────────────────────────────────
   WHY THIS EXISTS
   Every leg of the chain was judged by its HTTP status alone. That is
   not enough. Free community relays (Pollinations, Kilo Gateway, the
   OVHcloud anonymous tier) answer with **HTTP 200 and a valid
   OpenAI-shaped body whose `content` is an error notice**:

     "The API key used for this request has reached its budget.
      Please raise the key budget, then try again. …
      🌸 Ad 🌸 Powered by Pollinations.AI free text APIs."

   Status 200 + non-empty `content` used to mean SUCCESS, so:
     1. the notice was shown to the learner as if SHIGUN had written it;
     2. the leg was recorded as the one that "worked" and became STICKY,
        so every later message paid the broken relay first;
     3. because a "cloud answer" existed, the on-device ML engine — the
        last-resort tutor that always works — never ran at all.

   This module is the single place that decides whether a 200 body is a
   real answer. It is imported by the server provider chain (`lib/ai.ts`),
   so one definition of "that was a provider notice, not an answer" covers
   every cloud leg. It has NO server-only imports and touches no globals,
   so it is safe in any runtime.

   FALSE POSITIVES ARE THE REAL RISK. This is a study planner used by
   accounting students: "the department has reached its budget ceiling"
   and "the credit balance exceeded the limit" are perfectly good
   sentences about cost accounting. So the detector is deliberately
   asymmetric:
     • HARD markers are relay-specific strings no lesson ever contains
       (`edit-key?id=`, `raise the key budget`, `<!doctype html>`).
     • CONTEXT markers ("reached its budget", "quota exhausted") are
       only believed when the answer ALSO names AI plumbing AND does not
       look like a lesson. A lesson always wins.
============================================================ */

/** Which failure family the noise belongs to — reuses the existing error
 *  vocabulary so the cooldown tables, `/api/ai-status` output and the
 *  learner-facing notices keep working unchanged. */
export type NoiseReason = "auth" | "rate_limit" | "provider";

export type NoiseVerdict =
  | { noise: false; text: string }
  | { noise: true; reason: NoiseReason; matched: string };

/** Relay boilerplate that never belongs in a lesson, whatever the topic. */
const HARD_NOISE: { re: RegExp; reason: NoiseReason }[] = [
  // Pollinations' budget wall — the exact notice that reached learners.
  { re: /raise the key budget/i, reason: "auth" },
  { re: /edit-key\?id=/i, reason: "auth" },
  { re: /api key used for this request/i, reason: "auth" },
  { re: /topping up the wallet/i, reason: "auth" },
  { re: /contact whoever runs the app/i, reason: "auth" },
  { re: /this (isn't|is not) your pollinations account/i, reason: "auth" },
  // Generic vendor strings that are never lesson content.
  { re: /insufficient[_\s-]?(quota|balance|credits?|funds)/i, reason: "auth" },
  { re: /billing[_\s-]hard[_\s-]limit/i, reason: "auth" },
  { re: /(invalid|incorrect|expired|revoked|malformed)\s+api[\s_-]?key/i, reason: "auth" },
  { re: /api[\s_-]?key\s+(is\s+)?(invalid|missing|expired|revoked|not valid)/i, reason: "auth" },
  { re: /exceeded your (current )?quota/i, reason: "rate_limit" },
  { re: /error code:\s*[45]\d\d/i, reason: "provider" },
  { re: /\b(50[234])\b[^\n]{0,24}(bad gateway|service unavailable|gateway timeout)/i, reason: "provider" },
  { re: /<!doctype html|<html[\s>]/i, reason: "provider" },
  { re: /attention required!\s*\|\s*cloudflare|ray id:\s*[0-9a-f]{8}/i, reason: "provider" },
  { re: /model (is |was )?(currently )?overloaded/i, reason: "rate_limit" },
  { re: /no (available|usable|healthy) (provider|model|upstream)/i, reason: "provider" },
  { re: /(rate limit|too many requests)[^\n]{0,40}(try again|please wait|retry|later)/i, reason: "rate_limit" },
  { re: /your account (has |is |was )?(been )?(deactivated|suspended|disabled|blocked)/i, reason: "auth" },
  { re: /^\s*(error|exception|fatal)\s*(:|\bcode\b)/i, reason: "provider" },
  { re: /^\s*(oops|sorry)[,!]\s+(something went wrong|an error occurred|we ran into)/i, reason: "provider" },
];

/** Words that belong to AI plumbing and NOT to a syllabus. Deliberately
 *  excludes accounting vocabulary ("credit", "balance", "quota", "budget",
 *  "billing") so a cost-accounting lesson can never self-trigger. */
const AI_PLUMBING =
  /\b(api|api[-\s_]?key|llm|large language model|openai|chatgpt|gpt-[\w.-]+|gemini|groq|cerebras|mistral|cohere|sambanova|openrouter|pollinations|kilo|ovhcloud|hugging\s?face|deepinfra|endpoint|inference|request id|trace id|status code|http\s?\d{3}|429|401|403|rate limit|tokens? per (minute|second|day)|tpm|rpm|free tier|paid (plan|tier)|deployment|webhook|bearer token)\b/i;

/** A relay notice talks TO the app's user about THEIR account; a lesson
 *  talks ABOUT the subject. Second-person address is the tie-breaker for a
 *  short ambiguous answer that names no AI plumbing at all. */
const ADDRESSES_USER =
  /\b(your (api|keys?|accounts?|requests?|plans?|subscription|balance|credits?|quota|usage|tier|billing|wallet|organisation|organization)|please (try again|wait|retry|contact|visit|check your|sign|log ?in)|contact (us|the administrator|whoever|your)|this request|visit (your|the) dashboard|sign (in|up) to (continue|use)|log ?in to (continue|use))\b/i;

/** Ambiguous on their own — only believed next to AI plumbing, and never
 *  inside something shaped like a lesson. */
const CONTEXT_NOISE: { re: RegExp; reason: NoiseReason }[] = [
  { re: /(reached|exceeded|exhausted|out of|depleted|ran (out|past)|over)[^\n]{0,40}(budget|quota|credits?|balance|funds|allowance|limit)/i, reason: "auth" },
  { re: /(budget|quota|credits?|balance|funds|allowance)[^\n]{0,40}(reached|exceeded|exhausted|depleted|is empty|ran out|is depleted)/i, reason: "auth" },
  { re: /unauthori[sz]ed|permission denied|forbidden/i, reason: "auth" },
  { re: /internal server error|service unavailable|bad gateway|gateway timeout/i, reason: "provider" },
  { re: /please (upgrade|subscribe|add (a )?(payment|billing)|top ?up)/i, reason: "auth" },
  { re: /(key|token|account|subscription)[^\n]{0,40}(invalid|expired|revoked|rejected|denied)/i, reason: "auth" },
];

/** Marketing the relays staple onto an otherwise good answer. Removed
 *  rather than treated as a failure — the learner still gets the lesson.
 *  Anchored to the TAIL and applied only to the last 700 characters, so a
 *  `---` divider in the middle of a real lesson is never cut off. */
const AD_BLOCKS: RegExp[] = [
  /\n*-{3,}\s*\n\s*(🌸\s*)?(support|powered by)[\s\S]*$/i,
  /\n*(🌸\s*)?\*?\*?ad\*?\*?\s*🌸[\s\S]*$/i,
  /\n*powered by\s+\[?pollinations[\s\S]*$/i,
  /\n*support (us|our mission)[\s\S]*?(kofi|patreon|donate|pollinations)[\s\S]*$/i,
  /\n*\[?support (pollinations|our mission)[^\n]*\]?\([^\n)]*\)[\s\S]*$/i,
];

const AD_TAIL_WINDOW = 700;

function stripAdTail(input: string): string {
  const apply = (chunk: string) => {
    let out = chunk;
    for (const block of AD_BLOCKS) out = out.replace(block, "");
    return out;
  };
  const cut = input.length <= AD_TAIL_WINDOW
    ? apply(input)
    : input.slice(0, input.length - AD_TAIL_WINDOW) + apply(input.slice(input.length - AD_TAIL_WINDOW));
  // An ad block usually sits under a rule; take the orphaned rule with it.
  return cut.replace(/\s+$/, "").replace(/(?:\s*\n\s*(?:-{3,}|\*{3,}|_{3,}))+\s*$/, "").trim();
}

/** Strip relay advertising from the tail of an answer. Returns `""` when
 *  nothing but advertising was there. Never removes a short-but-real
 *  reply ("Yes — start with the ledger."). */
export function stripRelayAds(text: string): string {
  const input = String(text ?? "");
  const stripped = stripAdTail(input);
  if (stripped.length < 24 && stripped !== input.trim()) return "";
  return stripped.length >= 24 ? stripped : input.trim();
}

/**
 * Does this look like teaching? A lesson has structure — a heading, a
 * list, or several sentences. A relay notice is one or two lines about
 * the relay. When in doubt the lesson wins: suppressing a real answer is
 * far worse than letting one odd sentence through.
 */
function looksLikeLesson(text: string): boolean {
  const body = text.trim();
  if (/^\s{0,3}#{1,6}\s/m.test(body)) return true;                 // markdown heading
  // A real list (3+ items). Counted, never `.test()`ed — a /g regex keeps
  // lastIndex between calls and would flip its own answer on reuse.
  if ((body.match(/^\s*(?:[-*•]|\d+[.)])\s+\S/gm) || []).length >= 3) return true;
  const sentences = body.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 24);
  return sentences.length >= 4 || body.length >= 900;
}

/**
 * Classify one model answer.
 * Returns `{ noise: false, text }` with relay advertising stripped, or
 * `{ noise: true, reason, matched }` when the "answer" is really the
 * provider talking about itself — in which case the caller must bench the
 * leg and keep walking the chain instead of showing it to a learner.
 */
export function classifyModelAnswer(raw: string | null | undefined): NoiseVerdict {
  const input = String(raw ?? "");
  if (!input.trim()) return { noise: true, reason: "provider", matched: "empty answer" };

  for (const { re, reason } of HARD_NOISE) {
    if (re.test(input)) return { noise: true, reason, matched: input.match(re)?.[0] ?? "relay notice" };
  }

  // A structured lesson is never mistaken for a provider notice.
  if (!looksLikeLesson(input)) {
    for (const { re, reason } of CONTEXT_NOISE) {
      const at = input.search(re);
      if (at < 0) continue;
      const phrase = input.match(re)?.[0] ?? "";
      const near = input.slice(Math.max(0, at - 200), at + phrase.length + 200);
      if (AI_PLUMBING.test(near) || ADDRESSES_USER.test(input)) {
        return { noise: true, reason, matched: phrase };
      }
    }
  }

  const cleaned = stripRelayAds(input);
  // Nothing survived the ad strip: the whole body was the relay talking.
  if (!cleaned.trim()) return { noise: true, reason: "provider", matched: "relay advertising only" };
  return { noise: false, text: cleaned };
}

/** Convenience: the cleaned answer, or `null` when the leg must be skipped. */
export function sanitizeModelAnswer(raw: string | null | undefined): string | null {
  const verdict = classifyModelAnswer(raw);
  return verdict.noise ? null : verdict.text;
}

/** True when the text is a provider talking about itself, not an answer. */
export function isRelayNoise(raw: string | null | undefined): boolean {
  return classifyModelAnswer(raw).noise;
}
