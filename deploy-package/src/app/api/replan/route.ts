import { NextResponse } from "next/server";
import { buildContext, fullState, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import { regeneratePlan } from "@/lib/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const st = await getSettings(user.id);
  const stats = await regeneratePlan(user.id, st, { fromToday: true });
  const s = await fullState(key);
  return NextResponse.json({ ...s, context: buildContext(s), stats });
}
