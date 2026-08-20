import { NextResponse } from "next/server";
import { buildContext, fullState, keyFrom } from "@/lib/state";
import { activeProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await fullState(keyFrom(req));
  return NextResponse.json({ ...s, context: buildContext(s), aiProvider: activeProvider() });
}
