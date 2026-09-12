"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  BYOK_PROVIDERS, byokHeader, byokProviderIds, clearByokKeys, getByokKeys,
  onByokChange, setByokKey, type ByokKeys, type ByokProviderId,
} from "@/lib/byok";
import { IconCheck, IconClose, IconSpark, IconWarn } from "./icons";
import { Select } from "./bits";

type ServerStatus = {
  mode?: string;
  configuredProviders?: string[];
};

type ProbeResult = {
  ok: boolean;
  label?: string;
  detail?: string;
  latencyMs?: number;
  error?: string | null;
};

/**
 * Settings → AI coach.
 *
 * The tutor needs an API key to answer open-ended questions. If this
 * deployment was never given one, every chat used to fall back to the small
 * on-device engine and the learner was told the assistant was unavailable —
 * with no way to fix it. This card lets a key be pasted here and used
 * immediately, no redeploy required.
 *
 * The key lives in this browser's localStorage and travels to this
 * deployment (same origin, HTTPS) on the `x-ai-keys` header. The server uses
 * it for that request only; it never stores or logs it.
 */
export default function AiKeyCard() {
  const [keys, setKeys] = useState<ByokKeys>({});
  const [selected, setSelected] = useState<ByokProviderId>("gemini");
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);

  const savedIds = useMemo(() => byokProviderIds(keys), [keys]);

  /* Read the stored keys after mount (localStorage is browser-only) and stay
     in sync with saves from anywhere in the app. */
  useEffect(() => {
    let alive = true;
    const readStored = async () => {
      const stored = getByokKeys();
      if (alive) setKeys(stored);
    };
    void readStored();
    const off = onByokChange((next) => setKeys(next));
    return () => {
      alive = false;
      off();
    };
  }, []);

  /* Ask the server what IT already has configured, so the card can show
     "already configured on this deployment" and avoid a pointless key paste. */
  useEffect(() => {
    let alive = true;
    const readServer = async () => {
      try {
        const res = await fetch("/api/ai-status", {
          cache: "no-store",
          headers: { "x-ai-keys": byokHeader(getByokKeys()) },
        });
        const json = (await res.json().catch(() => null)) as ServerStatus | null;
        if (alive && json && typeof json === "object") setServer(json);
      } catch {
        /* offline — the saved/local state below is still accurate */
      }
    };
    void readServer();
    return () => {
      alive = false;
    };
  }, [savedIds.length]);

  const refreshServerStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-status", {
        cache: "no-store",
        headers: { "x-ai-keys": byokHeader(getByokKeys()) },
      });
      const json = (await res.json().catch(() => null)) as ServerStatus | null;
      if (json && typeof json === "object") setServer(json);
    } catch {
      /* offline — the saved/local state below is still accurate */
    }
  }, []);

  const serverConfigured = (server?.configuredProviders || []).filter(
    (label) => !savedIds.some((id) => BYOK_PROVIDERS.find((p) => p.id === id)?.label === label),
  );

  const runTest = useCallback(async (id: ByokProviderId, key: string) => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai-status", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ai-keys": JSON.stringify({ [id]: key }),
        },
        body: JSON.stringify({ probe: true }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; probes?: { id: string; ok: boolean; label: string; detail: string; latencyMs: number; error: string | null }[] }
        | null;
      const probe = json?.probes?.find((p) => p.id === id);
      if (probe) {
        setResult({
          ok: probe.ok,
          label: probe.label,
          detail: probe.detail,
          latencyMs: probe.latencyMs,
          error: probe.error,
        });
      } else {
        setResult({ ok: false, detail: "The connection test did not return a result. Try again." });
      }
    } catch {
      setResult({ ok: false, detail: "Could not reach the server. Check your connection." });
    } finally {
      setTesting(false);
    }
  }, []);

  const handleSave = () => {
    const cleaned = draft.trim();
    if (!cleaned) return;
    setByokKey(selected, cleaned);
    setKeys(getByokKeys());
    setDraft("");
    void runTest(selected, cleaned);
    void refreshServerStatus();
  };

  const handleRemove = (id: ByokProviderId) => {
    setByokKey(id, null);
    setKeys(getByokKeys());
    setResult(null);
    void refreshServerStatus();
  };

  const active = savedIds.length > 0 || (server?.configuredProviders?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-2xl border p-3",
          active
            ? "border-[var(--success-accent)]/30 bg-[var(--success-accent)]/8"
            : "border-[var(--warn-accent,var(--accent))]/30 bg-[var(--accent)]/8",
        )}
      >
        <span className="mt-0.5 shrink-0">
          {active ? (
            <IconCheck size={15} className="text-[var(--success-accent)]" />
          ) : (
            <IconWarn size={15} className="text-[var(--accent)]" />
          )}
        </span>
        <p className="text-[length:var(--fs-sm)] font-semibold leading-snug" style={{ color: "var(--text-main)" }}>
          {active ? (
            <>
              Cloud tutoring is <strong>connected</strong>. Shigun will answer open-ended questions in full, and falls
              back to your own syllabus whenever the network is unavailable.
            </>
          ) : (
            <>
              No AI key is configured, so Shigun can only answer from your study plan and syllabus. Paste a key below to
              switch on full AI chat — it takes about a minute.
            </>
          )}
        </p>
      </div>

      {serverConfigured.length > 0 && (
        <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
          Already configured on this deployment: <strong>{serverConfigured.join(", ")}</strong>. A key you add here is
          tried first.
        </p>
      )}

      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,190px)_1fr]">
        <div>
          <label className="lbl" htmlFor="ai-provider">
            Provider
          </label>
          <Select
            id="ai-provider"
            ariaLabel="AI provider"
            value={selected}
            onChange={(v) => {
              setSelected(v as ByokProviderId);
              setResult(null);
            }}
            options={BYOK_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
          />
        </div>
        <div>
          <label className="lbl" htmlFor="ai-key">
            API key
          </label>
          <div className="flex gap-2">
            <input
              id="ai-key"
              className="input-field mono"
              type={revealed ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={BYOK_PROVIDERS.find((p) => p.id === selected)?.envVar || "API key"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) handleSave();
              }}
            />
            <button
              type="button"
              className="btn btn-ghost shrink-0"
              aria-label={revealed ? "Hide key" : "Show key"}
              onClick={() => setRevealed((v) => !v)}
            >
              {revealed ? "Hide" : "Show"}
            </button>
          </div>
        </div>
      </div>

      <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
        {BYOK_PROVIDERS.find((p) => p.id === selected)?.hint}{" "}
        <a
          className="font-bold underline"
          href={BYOK_PROVIDERS.find((p) => p.id === selected)?.keyUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Get a key
        </a>
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!draft.trim() || testing}>
          <IconSpark size={15} /> {testing ? "Testing…" : "Save & test"}
        </button>
        {savedIds.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearByokKeys();
              setKeys({});
              setResult(null);
              void refreshServerStatus();
            }}
          >
            Remove all
          </button>
        )}
      </div>

      {result && (
        <div
          className={cn(
            "rounded-2xl border p-3 text-[length:var(--fs-sm)]",
            result.ok
              ? "border-[var(--success-accent)]/30 bg-[var(--success-accent)]/8"
              : "border-[var(--danger-accent,crimson)]/30 bg-[var(--danger-accent,crimson)]/8",
          )}
        >
          <p className="font-bold" style={{ color: "var(--text-main)" }}>
            {result.ok
              ? `${result.label || "Provider"} connected${result.latencyMs ? ` in ${result.latencyMs} ms` : ""}.`
              : "That key did not work."}
          </p>
          {result.detail && (
            <p className="mt-1 font-medium" style={{ color: "var(--text-dim)" }}>
              {result.detail}
            </p>
          )}
        </div>
      )}

      {savedIds.length > 0 && (
        <div className="space-y-2">
          <p className="lbl">Saved in this browser</p>
          {savedIds.map((id) => {
            const provider = BYOK_PROVIDERS.find((p) => p.id === id);
            const masked = keys[id] || "";
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-[length:var(--fs-sm)] font-extrabold" style={{ color: "var(--text-main)" }}>
                    {provider?.label || id}
                  </span>
                  <span className="mono block truncate text-[length:var(--fs-meta)]" style={{ color: "var(--text-dim)" }}>
                    {masked.slice(0, 4)}…{masked.slice(-4)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost shrink-0"
                  aria-label={`Remove ${provider?.label || id} key`}
                  onClick={() => handleRemove(id)}
                >
                  <IconClose size={14} />
                </button>
              </div>
            );
          })}
          <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
            Keys stay in this browser and are sent only to this deployment. For a shared deployment, set{" "}
            <span className="mono">{BYOK_PROVIDERS.find((p) => p.id === selected)?.envVar}</span> in the server
            environment instead so every learner gets cloud tutoring automatically.
          </p>
        </div>
      )}
    </div>
  );
}
