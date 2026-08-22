import { db } from "@/db";
import { sql } from "drizzle-orm";
import { configuredProviders, llmHealthSnapshot } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = configuredProviders();
  const llm = llmHealthSnapshot();
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      database: "ok",
      ai: {
        mode: providers.length ? "cloud-with-local-fallback" : "local-only",
        configuredProviders: providers,
        lastRequest: llm,
      },
      checkedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({
      ok: false,
      database: "unavailable",
      ai: { mode: providers.length ? "configured" : "local-only", configuredProviders: providers },
      checkedAt: new Date().toISOString(),
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
