"use client";

import React, { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { IconCheck, IconRefresh, IconWarn } from "./icons";

type Cooldown = { provider: string; model: string | null; reason: string; secondsLeft: number };

type ServerStatus = {
  mode?: string;
  configuredProviders?: string[];
  serverProviders?: string[];
  activeProvider?: string | null;
  lastRequest?: { ok: boolean | null; provider: string | null; checkedAt: string | null } | null;
  cooldowns?: Cooldown[];
};

/**
 * Settings → AI coach: connection status only.
 *
 * SHIGUN is configured exclusively through the DEPLOYMENT environment
 * (GEMINI_API_KEY, CEREBRAS_API_KEY, … on the server). Every learner on the
 * deployment shares those keys automatically — nobody pastes a key anywhere
 * in the app, and there is nothing to toggle. This card simply reports the
 * live state: which providers are connected, which one answered last, and
 * whether any leg is briefly benched (rate limit, etc.).
 */
export default function AiCoachCard() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-status", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ServerStatus | null;
      if (json && typeof json === "object") {
        setStatus(json);
        setError(null);
      } else {
        setError("Couldn't check the AI connection just now.");
      }
    } catch {
      setError("Couldn't check the AI connection just now. Tutoring is unaffected — try refreshing.");
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await read();
    })();
    return () => {
      alive = false;
    };
  }, [read]);

  const providers = status?.serverProviders ?? status?.configuredProviders ?? [];
  const connected = providers.length > 0;
  const cooldowns = status?.cooldowns ?? [];
  const rateLimited = cooldowns.filter((entry) => entry.reason === "rate_limit");

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-2xl border p-3",
          connected
            ? "border-[var(--success-accent)]/30 bg-[var(--success-accent)]/8"
            : "border-[var(--warn-accent,var(--accent))]/30 bg-[var(--accent)]/8",
        )}
      >
        <span className="mt-0.5 shrink-0">
          {loading ? (
            <IconRefresh size={15} className="text-[var(--text-dim)]" />
          ) : connected ? (
            <IconCheck size={15} className="text-[var(--success-accent)]" />
          ) : (
            <IconWarn size={15} className="text-[var(--accent)]" />
          )}
        </span>
        <p className="text-[length:var(--fs-sm)] font-semibold leading-snug" style={{ color: "var(--text-main)" }}>
          {loading ? (
            "Checking the deployment's AI connection…"
          ) : connected ? (
            <>
              Cloud tutoring is <strong>connected through this deployment&apos;s own keys</strong> —{" "}
              {providers.join(", ")}. No key is ever entered in the app; every learner on this deployment
              gets the same cloud tutoring automatically.
            </>
          ) : (
            <>
              This deployment has <strong>no AI provider keys configured</strong>, so Shigun answers from
              your plan, syllabus and the on-device engine. The deployment owner adds keys (e.g.{" "}
              <span className="mono">GEMINI_API_KEY</span>) to the server environment once, and they switch
              cloud tutoring on for everyone.
            </>
          )}
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3.5 space-y-2">
        <p className="text-[length:var(--fs-sm)] font-extrabold" style={{ color: "var(--text-main)" }}>
          Automatic failover
        </p>
        <p className="text-[length:var(--fs-meta)] font-medium leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Questions are answered by the deployment&apos;s provider chain — Gemini, Cerebras, Groq, Mistral,
          SambaNova, Cohere, OpenRouter — in the order its keys are configured. If one provider hits a limit
          or goes down, the next one answers inside the same request. Only when every provider fails does
          Shigun answer from the on-device engine, so a question is never left unanswered.
        </p>
        {!loading && status && (
          <div className="space-y-1.5 pt-1">
            {status.lastRequest?.ok && status.lastRequest.provider && (
              <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
                Last answer came from <strong style={{ color: "var(--text-main)" }}>{status.lastRequest.provider}</strong>.
              </p>
            )}
            {status.lastRequest?.ok === false && (
              <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
                The last cloud request did not get through — the on-device engine answered. The next provider
                in the chain picks up the next question.
              </p>
            )}
            {rateLimited.length > 0 && (
              <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--warn-accent, var(--accent))" }}>
                Temporarily rate-limited: {rateLimited.map((entry) => entry.provider).join(", ")}.
                {" "}{cooldowns.length > rateLimited.length && `${cooldowns.length - rateLimited.length} more leg(s) on a short cooldown.`}
                Other providers answer in the meantime.
              </p>
            )}
          </div>
        )}
        {error && (
          <p className="text-[length:var(--fs-meta)] font-semibold" style={{ color: "var(--danger-accent, crimson)" }}>
            {error}
          </p>
        )}
        <div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setChecking(true);
              void read();
            }}
            disabled={loading}
          >
            <IconRefresh size={14} /> {checking ? "Checking…" : "Refresh status"}
          </button>
        </div>
      </div>
    </div>
  );
}
