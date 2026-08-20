import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { buildContext, fullState, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import {
  callLLM, localTutor, parseCommand, tutorSystemPrompt, activeProvider,
  extractLlmAction, languageCapabilityReply,
} from "@/lib/ai";
import { regeneratePlan } from "@/lib/generate";
import { mergeTranscriptSegments } from "@/lib/transcript";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const { message, source } = (await req.json()) as { message: string; source?: "voice" | "text" };
  const rawText = (message || "").trim();
  // Apply strict echo cleanup only to microphone messages. Typed prose is
  // preserved exactly, including intentional repetition.
  const text = source === "voice" ? mergeTranscriptSegments([rawText]) : rawText;
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });

  const state = await fullState(key);
  const ctx = buildContext(state);
  let action = parseCommand(text);
  const languageReply = languageCapabilityReply(text);

  await db.insert(messages).values({ userId: user.id, role: "user", content: text });

  let finalText: string;
  let replanned = false;

  if (languageReply) {
    finalText = languageReply;
  } else if (action) {
    // A recognised in-app command: give a short, deterministic confirmation and
    // let the app perform the action. No LLM/knowledge lookup needed.
    if (action.type === "replan") {
      const st = await getSettings(user.id);
      await regeneratePlan(user.id, st, { fromToday: true });
      replanned = true;
    }
    const confirmations: Record<string, string> = {
      navigate: `Opening **${String(action.payload)}**.`,
      startTimer: `Clocked in. Time is recording against today's task — one lesson, one focus.`,
      stopTimer: `Clocked out. Your minutes are saved to today's task.`,
      break: `Break started. Stand up, rest your eyes, hydrate. Say *"resume"* when you're back.`,
      pause: `Timer paused. Say *"resume"* when you're ready to continue.`,
      resume: `Back on the clock — picking up where you left off.`,
      zen: `Zen mode on — just you and the timer.`,
      replan: `Rebalancing your schedule now — unfinished lessons are being pushed forward and re-spread across your remaining **${ctx.daysLeft} days**, weakest subject kept first. Done in a moment.`,
      theme: `Theme updated. Other styles: *obsidian*, *nebula*, *sunset*, *mint*, *lavender*.`,
    };
    finalText = confirmations[action.type] || "Done.";
  } else {
    // Normal question → LLM if available, else the local reasoning engine.
    let reply: string | null = null;
    if (activeProvider()) {
      const history = state.messages.slice(-10).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));
      reply = await callLLM(tutorSystemPrompt(ctx), [...history, { role: "user", content: text }], 1600);
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
      const local = await localTutor(text, ctx);
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
  });
}

export async function DELETE(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  await db.delete(messages).where(eq(messages.userId, user.id));
  return NextResponse.json({ ok: true });
}
