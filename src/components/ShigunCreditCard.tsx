"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { cn } from "@/lib/cn";
import { IconBolt, IconCheck, IconRefresh, IconWarn } from "./icons";

type Usage = {
  used: number;
  limit: number;
  periodStart: string;
  remaining: number;
  exhausted: boolean;
  fraction: number;
};

type Cooldown = {
  provider: string;
  model: string | null;
  reason: string;
  secondsLeft: number;
};

type CreditState = {
  usage: Usage;
  dailyLimit: number;
  freeBridgeAllowed: boolean;
  mode: string;
  activeProvider: string | null;
  lastRequest: { ok: boolean | null; provider: string | null; checkedAt: string | null } | null;
  cooldowns: Cooldown[];
  checkedAt?: string;
  reset?: boolean;
};

const REASON_LABEL: Record<string, string> = {
  auth: "key rejected",
  model: "model retired",
  rate_limit: "rate-limited",
  timeout: "timed out",
  network: "network blocked",
  provider: "provider error",
  empty: "empty reply",
  blocked: "blocked",
};

/**
 * Settings → AI coach → Shigun credit.
 *
 * One credit = one tutor question answered by the AI layer. The meter shows
 * today's allowance (auto-rolls over each day), and the reset refills it,
 * forgets remembered provider failures and clears the per-minute rate limiter,
 * so a learner who exhausts the day's credit can resume immediately.
 */
export default function ShigunCreditCard() {
  const [state, setState] = useState<CreditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      const json = await api<CreditState>("/api/shigun-usage", { cache: "no-store" });
      setState(json);
      setError(null);
    } catch {
      setError("Couldn't load Shigun credit. Check your connection.");
    } finally {
      setLoading(false);
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

  const reset = async () => {
    setResetting(true);
    setError(null);
    try {
      const json = await api<CreditState>("/api/shigun-usage", {
        method: "POST",
        body: JSON.stringify({ action: "reset" }),
      });
      setState(json);
    } catch {
      setError("Reset failed. Try again in a moment.");
    } finally {
      setResetting(false);
    }
  };

  const usage = state?.usage;
  const exhausted = usage?.exhausted;
  const cooldowns = state?.cooldowns ?? [];
  const rateLimited = cooldowns.filter((c) => c.reason === "rate_limit");
  const pct = usage ? Math.round(usage.fraction * 100) : 0;
  const barColor = exhausted
    ? "var(--danger-accent, crimson)"
    : pct >= 75
      ? "var(--warn-accent, var(--accent))"
      : "var(--success-accent)";

  return (
    <div className="space-y-3">
      {/* ── Meter ── */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconBolt size={16} className={exhausted ? "text-[var(--danger-accent,crimson)]" : "text-[var(--accent)]"} />
            <span className="text-[length:var(--fs-sm)] font-extrabold" style={{ color: "var(--text-main)" }}>
              Shigun credit
            </span>
          </div>
          {!loading && usage && (
            <span className="mono text-[length:var(--fs-meta)] font-bold" style={{ color: "var(--text-dim)" }}>
              {usage.used} / {usage.limit}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
            Loading credit…
          </p>
        ) : usage ? (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--row-hover, rgba(127,127,127,.15))" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: barColor }}
              />
            </div>
            <p className="text-[length:var(--fs-sm)] font-semibold leading-snug" style={{ color: "var(--text-main)" }}>
              {exhausted ? (
                <>
                  Today&apos;s cloud allowance is <strong>used up</strong> — Shigun is answering from your plan and the
                  on-device engine until you reset it.
                </>
              ) : (
                <>
                  <strong>{usage.remaining}</strong> of {usage.limit} credits left today (resets automatically each
                  day).
                </>
              )}
            </p>
          </>
        ) : null}

        {/* Live provider/relay quota state */}
        {!loading && state && (
          <div className="space-y-1.5 pt-1">
            {state.lastRequest?.ok === false && (
              <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
                Last cloud request did not get through — the local engine answered.
              </p>
            )}
            {state.lastRequest?.ok && state.lastRequest.provider && (
              <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
                Last answer came from <strong style={{ color: "var(--text-main)" }}>{state.lastRequest.provider}</strong>.
              </p>
            )}
            {rateLimited.length > 0 && (
              <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--warn-accent, var(--accent))" }}>
                Provider rate-limited now: {rateLimited.map((c) => `${c.provider}${c.model ? `/${c.model}` : ""}`).join(", ")}.
                {cooldowns.length > rateLimited.length && ` ${cooldowns.length - rateLimited.length} more on cooldown.`}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-[length:var(--fs-meta)] font-semibold" style={{ color: "var(--danger-accent, crimson)" }}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={reset} disabled={resetting || loading}>
            <IconRefresh size={14} /> {resetting ? "Resetting…" : "Reset credit"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void read()} disabled={loading}>
            Refresh
          </button>
        </div>

        {state?.reset && (
          <p className="flex items-center gap-1.5 text-[length:var(--fs-meta)] font-bold" style={{ color: "var(--success-accent)" }}>
            <IconCheck size={14} /> Credit refilled — {usage?.limit ?? state.dailyLimit} available.
          </p>
        )}
      </div>

      <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
        Each credit is one tutor question answered by the AI layer (your key, the free relay, or this deployment&apos;s
        key). It resets automatically every day, and never affects plan, syllabus or timer answers.
      </p>
    </div>
  );
}
