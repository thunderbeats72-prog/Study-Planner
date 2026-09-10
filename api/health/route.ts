import { db } from "@/db";
import { sql } from "drizzle-orm";
import { configuredProviders, llmHealthSnapshot } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = configuredProviders();
  const llm = llmHealthSnapshot();
  const ai = {
    mode: providers.length ? "cloud-with-local-fallback" : "local-only",
    configuredProviders: providers,
    // Deep per-provider diagnosis (live probe) lives at POST /api/ai-status.
    diagnostics: "GET/POST /api/ai-status",
    lastRequest: llm,
  };
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      database: "ok",
      ai,
      checkedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({
      ok: false,
      database: "unavailable",
      ai,
      checkedAt: new Date().toISOString(),
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
