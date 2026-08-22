import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { courseQueries } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { aiSuggestSubjects } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";
import { readJsonObject, textValue, validationPayload } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeTokenMatch(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const limit = checkRateLimit(req, "course-suggest", 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many course assessments. Please wait a moment and try again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 8_000); }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  let name: string;
  let level: string;
  try {
    name = textValue(body.courseName, "Course name", { required: true, max: 500 });
    level = textValue(body.level, "Education level", { max: 40, fallback: "ug" }) || "ug";
  } catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  const result = await aiSuggestSubjects(name, level);

  // Coverage reporting is opt-in because assessment strings can contain an
  // institution or study goal. A normal deployment should not silently retain
  // those searches.
  if (process.env.ENABLE_COURSE_TELEMETRY === "true") {
    void db.insert(courseQueries)
      .values({ query: name.slice(0, 200), level, source: result.source })
      .catch(() => undefined);
  }

  return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
}

/** Private curriculum-coverage report for maintainers. */
export async function GET(req: Request) {
  const expected = process.env.COURSE_REPORT_TOKEN || "";
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (!expected || !safeTokenMatch(supplied, expected)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

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

  const report = gapsOnly ? rows.filter((row) => !row.source.startsWith("Verified")) : rows;
  return NextResponse.json({ total: report.length, queries: report });
}
