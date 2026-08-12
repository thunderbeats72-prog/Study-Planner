import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { buildContext, fullState, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import { callLLM, localTutor, parseCommand, tutorSystemPrompt, activeProvider } from "@/lib/ai";
import { regeneratePlan } from "@/lib/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const { message } = (await req.json()) as { message: string };
  const text = (message || "").trim();
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });

  const state = await fullState(key);
  const ctx = buildContext(state);
  const action = parseCommand(text);

  await db.insert(messages).values({ userId: user.id, role: "user", content: text });

  let finalText: string;
  let replanned = false;

  if (action) {
    // A recognised in-app command: give a short, deterministic confirmation and
    // let the app perform the action. No LLM/knowledge lookup needed.
    if (action.type === "replan") {
      const st = await getSettings(user.id);
      await regeneratePlan(user.id, st, { fromToday: true });
      replanned = true;
    }
    const confirmations: Record<string, string> = {
      navigate: `Opening **${String(action.payload)}** for you. ✅`,
      startTimer: `⏱️ Clocked in. Time is now recording against today's task and will show in your Planner. Put the phone in another room — one lesson, one focus.`,
      stopTimer: `✅ Clocked out and your minutes are saved to today's task in the Planner.`,
      break: `☕ Break started. Stand, look 6 m away for 20 s, hydrate. Say *"clock in"* when you're back.`,
      zen: `🧘 Zen mode on — just you and the timer.`,
      replan: `Rebalancing your schedule now — unfinished lessons are being pushed forward and re-spread across your remaining **${ctx.daysLeft} days**, weakest subject kept first. Done in a moment. ✅`,
      theme: `Done! Switched your active theme instantly. Let me know if you want to try any other style like *obsidian*, *nebula*, *sunset*, *mint*, or *lavender*. 🎨`,
    };
    finalText = confirmations[action.type] || "Done. ✅";
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
    const local = await localTutor(text, ctx);
    finalText = reply || local.text;
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
