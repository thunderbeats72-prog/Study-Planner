import { NextResponse } from "next/server";
import { buildContext, dateFrom, fullState, getSettings } from "@/lib/state";
import { requireUser } from "@/lib/auth";
import { regeneratePlan } from "@/lib/generate";
import { demoDataEnabled } from "@/lib/demoState";
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
  const user = await requireUser(req);
  const key = user.userKey;
  const localDate = dateFrom(req);

  // ── Preview without a database: the demo plan is already balanced. ───────
  if (demoDataEnabled()) {
    const state = await fullState(key);
    return NextResponse.json({ ...state, context: buildContext(state, localDate) });
  }
  // ── End of preview branch ────────────────────────────────────────────────

  const settings = await getSettings(user.id);
  const stats = await regeneratePlan(user.id, settings, { fromToday: true, today: localDate });
  const state = await fullState(key);
  return NextResponse.json({ ...state, context: buildContext(state, localDate), stats });
}
