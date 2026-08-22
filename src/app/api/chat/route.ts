import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { buildContext, fullState, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import {
  callLLM, localTutor, parseCommand, tutorSystemPrompt, activeProvider,
  extractLlmAction, languageCapabilityReply, instantTutorReply, commandReply,
  voiceGenderFor, llmError,
} from "@/lib/ai";
import { regeneratePlan } from "@/lib/generate";
import { mergeTranscriptSegments } from "@/lib/transcript";
import { detectLanguage } from "@/lib/language";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type GroundingState = Awaited<ReturnType<typeof fullState>>;

const CURRICULUM_GENERIC_TOKENS = new Set([
  "what", "which", "should", "today", "now", "study", "explain", "answer", "question",
  "topic", "topics", "subject", "subjects", "syllabus", "plan", "schedule", "give",
  "detail", "simple", "words", "weak", "weakest", "progress", "how", "am", "i", "about",
  "difference", "between", "meaning", "define", "definition", "elaborate", "teach",
  "help", "need", "want", "make", "learn", "learning", "lesson", "lessons", "practice",
]);

function curriculumTokens(text: string): string[] {
  return text.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !CURRICULUM_GENERIC_TOKENS.has(token));
}

function curriculumGrounding(question: string, state: GroundingState): string {
  const normalized = question.toLowerCase();
  const queryTokens = new Set(curriculumTokens(question));
  const subjectById = new Map(state.subjects.map((subject) => [subject.id, subject]));
  const ranked = state.topics
    .map((topic) => {
      const title = topic.title.toLowerCase();
      const exact = normalized.includes(title) ? 40 : 0;
      const titleTokens = new Set(curriculumTokens(title));
      const conceptTokens = new Set(curriculumTokens([
        ...(topic.keyConcepts || []),
        ...(topic.objectives || []),
        topic.summary,
      ].join(" ")));
      const titleOverlap = [...titleTokens].filter((token) => queryTokens.has(token)).length;
      const conceptOverlap = [...conceptTokens].filter((token) => queryTokens.has(token)).length;
      const subject = subjectById.get(topic.subjectId);
      const subjectHit = subject && normalized.includes(subject.name.toLowerCase()) ? 4 : 0;
      const score = exact + titleOverlap * 4 + conceptOverlap * 2 + subjectHit;
      const meaningful = exact > 0 || (titleOverlap + conceptOverlap) >= 2;
      return { topic, subject, score, titleOverlap, conceptOverlap, meaningful };
    })
    .filter((candidate) => candidate.meaningful && candidate.score >= 5)
    .sort((a, b) => b.score - a.score || b.titleOverlap - a.titleOverlap)
    .slice(0, 1);

  if (!ranked.length) return "";
  const lessons = ranked.map(({ topic, subject }) => {
    const sources = (topic.sources || []).map((source) =>
      `${source.title} — ${source.publisher}${source.section ? `, section: ${source.section}` : ""}`
    ).join("; ");
    return [
      `Lesson: ${topic.title} (${subject?.name || "course"}, ${topic.unit}, ${topic.depth})`,
      `Summary: ${topic.summary}`,
      `Key concepts: ${(topic.keyConcepts || []).join(", ")}`,
      `Outcomes: ${(topic.objectives || []).join("; ")}`,
      `Practice: ${topic.practice}`,
      sources ? `Approved sources: ${sources}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return `\n\nCURRICULUM-GROUNDED CONTEXT:\n${lessons}\nUse this lesson context first. Cite only the approved source titles/publishers above; never invent a citation.`;
}

export async function POST(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const { message, source, voiceId } = (await req.json()) as { message: string; source?: "voice" | "text"; voiceId?: string };
  const rawText = (message || "").trim();
  // The reply's grammar (gender/verb agreement) follows the selected voice.
  const voiceGender = voiceGenderFor(voiceId || "f1");
  // Apply strict echo cleanup only to microphone messages. Typed prose is
  // preserved exactly, including intentional repetition.
  const text = source === "voice" ? mergeTranscriptSegments([rawText]) : rawText;
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });

  const state = await fullState(key);
  const ctx = buildContext(state);
  let action = parseCommand(text);
  const languageReply = languageCapabilityReply(text, voiceGender);
  const instantReply = action ? null : instantTutorReply(text, ctx);

  await db.insert(messages).values({ userId: user.id, role: "user", content: text });

  let finalText: string;
  let replanned = false;

  if (languageReply) {
    finalText = languageReply;
  } else if (action) {
    // A recognised in-app command: give a short, deterministic confirmation
    // (in the SAME language the learner spoke) and let the app perform the
    // action. No LLM/knowledge lookup needed.
    if (action.type === "replan") {
      const st = await getSettings(user.id);
      await regeneratePlan(user.id, st, { fromToday: true });
      replanned = true;
    }
    finalText = commandReply(action, text, ctx.daysLeft, voiceGender);
  } else if (instantReply) {
    // Common plan/progress questions are answered from live app data without
    // paying a model round-trip, so they feel immediate and stay factual.
    finalText = instantReply.text;
  } else {
    // Normal question → LLM if available, else the local reasoning engine.
    let reply: string | null = null;
    const cloudAttempted = !!activeProvider();
    if (cloudAttempted) {
      const history = state.messages.slice(-10).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));
      const spokenLang = detectLanguage(text);
      const systemPrompt = tutorSystemPrompt(ctx, { voiceGender })
        + curriculumGrounding(text, state)
        + `\n\nDETECTED LEARNER LANGUAGE: ${spokenLang}. Answer in this language unless they clearly asked for another.`
        + (source === "voice"
          ? "\n\nVOICE TURN: Lead directly with the answer without long preambles. If the learner asked for detail, a lesson, or an explanation, answer in full depth — the app speaks long answers in consecutive parts."
          : "");
      reply = await callLLM(systemPrompt, [...history, { role: "user", content: text }], 2400);
    }
    if (reply) {
      // The LLM may have emitted an [[action:...]] tag for requests the
      // regex parser didn't recognise (unusual phrasing, other languages).
      // Strip the tag from the visible reply and execute the action.
      const extracted = extractLlmAction(reply);
      finalText = extracted.text || "Done.";
      if (extracted.action) {
        action = extracted.action;
        if (action.type === "replan") {
          const st = await getSettings(user.id);
          await regeneratePlan(user.id, st, { fromToday: true });
          replanned = true;
        }
      }
    } else {
      // Do not call the same cloud chain a second time after a provider
      // timeout/failure; the local knowledge path should answer immediately.
      const local = await localTutor(text, ctx, { skipCloud: cloudAttempted, voiceGender });
      finalText = local.text;
      if (local.action) action = local.action;
    }
  }

  await db.insert(messages).values({ userId: user.id, role: "assistant", content: finalText });

  const fresh = replanned ? await fullState(key) : state;
  const freshMsgs = await db
    .select()
    .from(messages)
    .where(eq(messages.userId, user.id))
    .orderBy(asc(messages.id));
  return NextResponse.json({
    reply: finalText,
    action: action || null,
    state: { ...fresh, messages: freshMsgs, context: buildContext(fresh) },
    replanned,
    provider: activeProvider(),
    source: activeProvider() ? "cloud" : "local",
    aiError: llmError(),
  });
}

export async function DELETE(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  await db.delete(messages).where(eq(messages.userId, user.id));
  return NextResponse.json({ ok: true });
}
