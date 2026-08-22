import { NextResponse } from "next/server";
import { buildContext, dateFrom, fullState, keyFrom } from "@/lib/state";
import { activeProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const state = await fullState(keyFrom(req));
    return NextResponse.json({
      ...state,
      context: buildContext(state, dateFrom(req)),
      aiProvider: activeProvider(),
    });
  } catch (error) {
    const message = error instanceof Error && /DATABASE_URL/.test(error.message)
      ? "The database is not configured. Add DATABASE_URL (see .env.example) and redeploy."
      : "The study planner database is temporarily unavailable. Please try again shortly.";
    console.error("State route failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message, code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
