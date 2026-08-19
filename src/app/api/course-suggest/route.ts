import { NextResponse } from "next/server";
import { db } from "@/db";
import { courseQueries } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { aiSuggestSubjects } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { courseName, level } = (await req.json()) as { courseName: string; level: string };
  const name = (courseName || "").trim();
  if (!name) return NextResponse.json({ error: "courseName required" }, { status: 400 });

  const result = await aiSuggestSubjects(name, level || "ug");

  // ── Coverage telemetry ─────────────────────────────────────────
  // Log every query with its resolution source. Queries that resolve
  // from "aether-local" (generic heuristics) or the LLM are catalog
  // gaps — the ranked list of what to verify and add next. Fire and
  // forget: telemetry must never break or slow the user's request.
  db.insert(courseQueries)
    .values({ query: name.slice(0, 200), level: level || "", source: result.source })
    .catch(() => {});

  return NextResponse.json(result);
}

/**
 * GET /api/course-suggest — coverage report.
 * Returns the most-requested queries grouped by resolution source, so
 * you can see exactly which courses users search for that only get
 * generic fallbacks. Add ?gaps=1 to see only unresolved ones.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const gapsOnly = url.searchParams.get("gaps") === "1";

  const rows = await db
    .select({
      query: sql<string>`lower(${courseQueries.query})`,
      source: courseQueries.source,
      count: sql<number>`count(*)::int`,
      lastSeen: sql<string>`max(${courseQueries.createdAt})::text`,
    })
    .from(courseQueries)
    .groupBy(sql`lower(${courseQueries.query})`, courseQueries.source)
    .orderBy(desc(sql`count(*)`))
    .limit(100);

  const verifiedSources = new Set([
    "Verified NMIMS Database",
    "Verified NCERT Catalog",
    "Verified Catalog",
  ]);
  const report = gapsOnly ? rows.filter((r) => !verifiedSources.has(r.source)) : rows;

  return NextResponse.json({
    note: gapsOnly
      ? "Catalog gaps: most-requested queries resolving via heuristics/LLM. Verify & add these to COURSE_DB first."
      : "All course queries by frequency. Sources starting with 'Verified' are ground-truth catalog hits.",
    total: report.length,
    queries: report,
  });
}
