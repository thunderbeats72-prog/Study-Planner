import { NextResponse } from "next/server";
import { buildContext, dateFrom, fullState, keyFrom } from "@/lib/state";
import { activeProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const state = await fullState(keyFrom(req));
  return NextResponse.json({
    ...state,
    context: buildContext(state, dateFrom(req)),
    aiProvider: activeProvider(),
  });
}
