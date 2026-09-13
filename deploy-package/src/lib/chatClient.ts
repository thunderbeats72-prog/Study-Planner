"use client";

/* ============================================================
   CHAT TRANSPORT — one route, decided entirely by the deployment
   ─────────────────────────────────────────────────────────────
   Every message goes to POST /api/chat. The server walks the
   deployment's OWN provider chain (GEMINI_API_KEY, CEREBRAS_API_KEY,
   GROQ_API_KEY, … from the server environment) with automatic
   failover between providers, and falls back to the on-device ML
   engine only when every cloud leg failed.

   Learners never enter a key anywhere: whatever the deployment
   configured works for every user automatically. No browser-side
   model calls, no public relays, no extra hops — the server owns
   grounding, actions, replanning and persistence.
============================================================ */

import { api } from "./client";
import type { AppState } from "./client";

export type ChatAiMeta = {
  source: string;
  model: string | null;
  degraded: boolean;
  /** Learner-safe wording only. */
  notice?: string;
  code?: string;
  retryable?: boolean;
  /** Where the answer came from: "server" for every cloud answer. */
  via?: string;
};

export type ChatReply = {
  reply: string;
  action: { type: string; payload?: unknown } | null;
  state: AppState;
  replanned?: boolean;
  ai?: ChatAiMeta;
};

type AskOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Kept for call-site compatibility; the server is the only stage. */
  onStage?: (stage: "server") => void;
};

/**
 * Send one tutor message. The deployment's environment keys answer when any
 * provider is up; the on-device engine answers when none is. Either way the
 * learner always gets a reply.
 */
export async function askTutorMessage(message: string, options: AskOptions = {}): Promise<ChatReply> {
  options.onStage?.("server");
  return api<ChatReply>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
    timeoutMs: options.timeoutMs ?? 60_000,
    signal: options.signal,
  });
}
