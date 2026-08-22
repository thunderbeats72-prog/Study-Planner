import { db } from "@/db";
import { sql } from "drizzle-orm";
import { connect, type Socket } from "node:net";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ProbeResult = { ok: boolean; latencyMs?: number; error?: string };

function envKey(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value;
  }
  return "";
}

async function fetchProbe(url: string, timeoutMs = 5000): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const response = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "StudyPlannerPro/1.0" },
      redirect: "manual",
    });
    clearTimeout(timer);
    await response.body?.cancel?.();
    return { ok: response.status >= 200 && response.status < 500, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unreachable",
      latencyMs: Date.now() - started,
    };
  }
}

/** TLS/DNS connectivity probe — used for hosts that refuse plain HTTPS fetch
 *  immediately (the Edge TTS host returns a TLS reset from serverless runtimes). */
function tcpProbe(host: string, port = 443, timeoutMs = 5000): Promise<ProbeResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket: Socket = connect({ host, port }, () => {
      socket.end();
      resolve({ ok: true, latencyMs: Date.now() - started });
    });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "timeout", latencyMs: Date.now() - started });
    });
    socket.on("error", (error) => {
      socket.destroy();
      resolve({ ok: false, error: error.message, latencyMs: Date.now() - started });
    });
  });
}

function configuredAiProvider(): string {
  if (envKey("GEMINI_API_KEY", "GOOGLE_API_KEY", "NEXT_PUBLIC_GEMINI_API_KEY", "NEXT_PUBLIC_GOOGLE_API_KEY")) return "gemini";
  if (envKey("GROQ_API_KEY", "NEXT_PUBLIC_GROQ_API_KEY")) return "groq";
  if (envKey("OPENAI_API_KEY", "NEXT_PUBLIC_OPENAI_API_KEY")) return "openai";
  if (envKey("OPENROUTER_API_KEY", "NEXT_PUBLIC_OPENROUTER_API_KEY")) return "openrouter";
  return "";
}

export async function GET() {
  let database = { ok: true };
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = { ok: false };
  }

  // Run the network probes in parallel so the health check stays fast even
  // when the runtime has no internet / serverless egress is blocked.
  const [internet, edge, knowledge, providerHost] = await Promise.all([
    fetchProbe("https://example.com/"),
    tcpProbe("speech.platform.bing.com"),
    fetchProbe("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=buffer&srlimit=1&format=json&origin=*"),
    tcpProbe("generativelanguage.googleapis.com"),
  ]);

  const provider = configuredAiProvider();

  return Response.json({
    ok: database.ok,
    timestamp: new Date().toISOString(),
    db: database,
    ai: {
      configuredProvider: provider,
      keyConfigured: !!provider,
      hostReachable: provider ? providerHost : { ok: false, error: "no cloud AI key configured" },
    },
    voice: {
      provider: "edge-keyless",
      hostReachable: edge,
    },
    knowledge: {
      provider: "wikipedia",
      reachable: internet.ok && knowledge.ok,
      internet,
      wikipedia: knowledge,
    },
    summary: {
      cloudAi: provider ? "configured" : "not-configured",
      internet: internet.ok ? "reachable" : "blocked/unreachable",
      neuralVoice: edge.ok ? "reachable" : "blocked/unreachable",
      wikipedia: knowledge.ok ? "reachable" : "blocked/unreachable",
    },
  });
}
