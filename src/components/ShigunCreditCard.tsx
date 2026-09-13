"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { IconBolt, IconRefresh } from "./icons";

type Usage = {
  used: number;
  limit: number;
  periodStart: string;
  remaining: number;
  exhausted: boolean;
  fraction: number;
};

type CreditState = {
  usage: Usage;
  dailyLimit: number;
  mode: string;
  activeProvider: string | null;
  checkedAt?: string;
};

/**
 * Settings → AI coach → Shigun usage.
 *
 * One credit = one tutor question answered by the cloud AI layer. The meter
 * shows today's usage as a percentage and rolls over automatically each day.
 * It is INFORMATIONAL ONLY: it never pauses, throttles or degrades tutoring —
 * answers keep flowing past 100%, and plan/syllabus/timer answers never
 * touch it.
 */
export default function ShigunCreditCard() {
  const [state, setState] = useState<CreditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [softError, setSoftError] = useState<string | null>(null);

  const read = useCallback(async () => {
    try {
      const json = await api<CreditState>("/api/shigun-usage", { cache: "no-store" });
      setState(json);
      setSoftError(null);
    } catch {
      setSoftError("Usage can't be loaded right now — tutoring itself is unaffected.");
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const usage = state?.usage;
  const pct = usage ? Math.min(100, Math.round(usage.fraction * 100)) : 0;
  const barColor = pct >= 100
    ? "var(--warn-accent, var(--accent))"
    : pct >= 75
      ? "var(--accent)"
      : "var(--success-accent)";

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconBolt size={16} className="text-[var(--accent)]" />
            <span className="text-[length:var(--fs-sm)] font-extrabold" style={{ color: "var(--text-main)" }}>
              Shigun usage today
            </span>
          </div>
          {!loading && usage && (
            <span className="mono text-[length:var(--fs-meta)] font-bold" style={{ color: "var(--text-dim)" }}
              title={`${usage.used} of ${usage.limit} credits used`}>
              {pct}% used
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
            Loading usage…
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
              <strong>{usage.used}</strong> of {usage.limit} AI credits used today · resets automatically each day.
            </p>
          </>
        ) : null}

        {softError && (
          <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
            {softError}
          </p>
        )}

        <div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setRefreshing(true);
              void read();
            }}
            disabled={loading || refreshing}
          >
            <IconRefresh size={14} /> {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
        Each credit is one tutor question answered by the cloud AI layer. The meter is informational only —
        it never pauses tutoring, and never affects plan, syllabus or timer answers.
      </p>
    </div>
  );
}
