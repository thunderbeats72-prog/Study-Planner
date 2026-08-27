import { NextResponse } from "next/server";
import { buildContext, dateFrom, fullState, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import { regeneratePlan } from "@/lib/generate";
import { checkRateLimit } from "@/lib/rateLimit";
import { withDbGuard } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withDbGuard(postReplan);

async function postReplan(req: Request) {
  const limit = checkRateLimit(req, "replan", 6, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "The schedule was just rebuilt. Please wait before rebuilding it again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }
  const key = keyFrom(req);
  const localDate = dateFrom(req);
  const user = await getOrCreateUser(key);
  const settings = await getSettings(user.id);
  const stats = await regeneratePlan(user.id, settings, { fromToday: true, today: localDate });
  const state = await fullState(key);
  return NextResponse.json({ ...state, context: buildContext(state, localDate), stats });
}
