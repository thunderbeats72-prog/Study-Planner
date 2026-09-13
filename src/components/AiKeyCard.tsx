"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  BYOK_PROVIDERS, byokHeader, byokProviderIds, clearByokKeys, getByokKeys,
  onByokChange, setByokKey, type ByokKeys, type ByokProviderId,
} from "@/lib/byok";
import {
  bridgeAvailability, bridgeCooldowns, clearBridgeFailures, freeBridgeEnabled,
  freeBridgePreference, onBridgeChange, probeBridge, setFreeBridgeAllowedByOperator,
  setFreeBridgePreference, type BridgeProbe,
} from "@/lib/aiBridge";
import { invalidateAiStatus } from "@/lib/chatClient";
import { IconCheck, IconClose, IconSpark, IconWarn } from "./icons";
import { Seg, Select } from "./bits";

type ServerStatus = {
  mode?: string;
  configuredProviders?: string[];
  /** Provider ids the deployment's own environment configured (no BYOK keys). */
  serverProviderIds?: string[];
  /** False when the operator set AI_FREE_BRIDGE=off for every learner. */
  freeBridgeAllowed?: boolean;
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
 * The tutor needs a model to answer open-ended questions. There are three
 * ways one gets connected, and this card owns all three:
 *
 *   1. THE DEPLOYMENT — env vars (GEMINI_API_KEY, GROQ_API_KEY, …). Best for
 *      a shared install: every learner gets cloud tutoring with no setup.
 *   2. THIS BROWSER — paste a key below. It is kept in localStorage and used
 *      immediately, no redeploy. Since v34 the key is also called DIRECTLY
 *      FROM THE BROWSER (lib/aiBridge.ts) when the server cannot reach the
 *      provider itself — which is what makes AI work on a sandboxed preview
 *      whose host has no outbound network.
 *   3. FREE COMMUNITY ENDPOINT — no key at all: an anonymous public relay
 *      answers from this device. Last resort, clearly labelled, one tap off.
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
  /* Browser-side bridge state: the free-endpoint switch and the results of
     testing the connection FROM THIS DEVICE (the only test that tells the
     truth when the server itself has no outbound network). */
  const [freePref, setFreePref] = useState<"on" | "off">("on");
  const [bridgeTesting, setBridgeTesting] = useState(false);
  const [bridgeProbes, setBridgeProbes] = useState<BridgeProbe[] | null>(null);

  const savedIds = useMemo(() => byokProviderIds(keys), [keys]);

  /* Read the stored keys after mount (localStorage is browser-only) and stay
     in sync with saves from anywhere in the app. */
  useEffect(() => {
    let alive = true;
    const readStored = () => {
      if (!alive) return;
      setKeys(getByokKeys());
      setFreePref(freeBridgePreference());
    };
    readStored();
    const off = onByokChange(readStored);
    const offBridge = onBridgeChange(readStored);
    return () => {
      alive = false;
      off();
      offBridge();
    };
  }, []);

  /* Ask the server what IT already has configured, so the card can show
     "already configured on this deployment" and avoid a pointless key paste. */
  const readServer = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-status", {
        cache: "no-store",
        headers: { "x-ai-keys": byokHeader(getByokKeys()) },
      });
      const json = (await res.json().catch(() => null)) as ServerStatus | null;
      if (json && typeof json === "object") {
        setServer(json);
        setFreeBridgeAllowedByOperator(json.freeBridgeAllowed);
        setFreePref(freeBridgePreference());
      }
    } catch {
      /* offline — the saved/local state below is still accurate */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await readServer();
    })();
    return () => {
      alive = false;
    };
  }, [savedIds.length, readServer]);

  /* Ids, not labels: the server says "Gemini" while this card says "Google
     Gemini", and comparing the two strings made a deployment that HAD a key
     look unconfigured. */
  const serverIds = server?.serverProviderIds ?? [];
  const serverConfigured = serverIds
    .filter((id) => !savedIds.includes(id as ByokProviderId))
    .map((id) => BYOK_PROVIDERS.find((provider) => provider.id === id)?.label
      || (server?.configuredProviders ?? [])[serverIds.indexOf(id)]
      || id);

  const availability = bridgeAvailability();

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

  /* Test the connection the way the tutor will actually use it: from this
     browser. On a host with no outbound network the server-side test above
     reports "unreachable" for a perfectly good key, and the learner has no
     way to tell a bad key from a blocked server. This button can. */
  const runBrowserTest = useCallback(async () => {
    setBridgeTesting(true);
    setBridgeProbes(null);
    clearBridgeFailures();
    try {
      const probes = await probeBridge();
      setBridgeProbes(probes);
      const ok = probes.find((probe) => probe.ok);
      setResult(ok
        ? { ok: true, label: ok.label, detail: `${ok.label} answered from this browser — Shigun will use it.`, latencyMs: ok.latencyMs }
        : probes.length
          ? { ok: false, detail: "No provider answered from this browser. The server chain and the on-device engine still will." }
          : { ok: false, detail: "Nothing to test yet — add a key above, or switch on the free community endpoint." });
    } catch {
      setResult({ ok: false, detail: "The browser test could not run. Check your connection." });
    } finally {
      setBridgeTesting(false);
      void readServer();
    }
  }, [readServer]);

  const handleSave = () => {
    const cleaned = draft.trim();
    if (!cleaned) return;
    setByokKey(selected, cleaned);
    setKeys(getByokKeys());
    setDraft("");
    invalidateAiStatus();
    void runTest(selected, cleaned);
    void runBrowserTest();
    void readServer();
  };

  const handleRemove = (id: ByokProviderId) => {
    setByokKey(id, null);
    setKeys(getByokKeys());
    setResult(null);
    invalidateAiStatus();
    clearBridgeFailures();
    void readServer();
  };

  const freeAllowed = server?.freeBridgeAllowed !== false;
  const freeOn = freePref === "on" && freeAllowed;
  const serverActive = serverIds.length > 0;
  const active = serverActive || savedIds.length > 0 || freeOn;
  const cooldowns = bridgeCooldowns();

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
          {serverActive || savedIds.length > 0 ? (
            <>
              Cloud tutoring is <strong>connected</strong>. Shigun will answer open-ended questions in full, and falls
              back to your own syllabus whenever the network is unavailable.
            </>
          ) : freeOn ? (
            <>
              Cloud tutoring runs on the <strong>free community endpoint</strong> — no key needed. Add your own key
              below for a private, faster connection with higher limits.
            </>
          ) : (
            <>
              No AI key is configured and the free endpoint is off, so Shigun can only answer from your study plan and
              syllabus. Paste a key below, or switch the free endpoint on — either takes about a minute.
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
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void runBrowserTest()}
          disabled={bridgeTesting || !availability.canBridge}
          title="Sends one tiny request per available provider straight from this device — the same route Shigun uses."
        >
          {bridgeTesting ? "Testing…" : "Test from this browser"}
        </button>
        {savedIds.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              clearByokKeys();
              setKeys({});
              setResult(null);
              clearBridgeFailures();
              invalidateAiStatus();
              void readServer();
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

      {bridgeProbes && bridgeProbes.length > 0 && (
        <div className="space-y-1.5">
          <p className="lbl">From this browser</p>
          {bridgeProbes.map((probe) => (
            <div
              key={probe.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-[length:var(--fs-sm)] font-extrabold" style={{ color: "var(--text-main)" }}>
                  {probe.label}
                  <span className="ml-1.5 font-semibold" style={{ color: "var(--text-dim)" }}>
                    {probe.kind === "free" ? "free endpoint" : "your key"}
                  </span>
                </span>
                <span className="block text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
                  {probe.detail}
                </span>
              </span>
              <span
                className="mono shrink-0 text-[length:var(--fs-meta)] font-bold"
                style={{ color: probe.ok ? "var(--success-accent)" : "var(--text-dim)" }}
              >
                {probe.ok ? `${probe.latencyMs} ms` : probe.error || "failed"}
              </span>
            </div>
          ))}
          {cooldowns.length > 0 && (
            <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
              Skipped for now (remembered failures):{" "}
              {cooldowns.map((entry) => `${entry.leg}${entry.model ? `/${entry.model}` : ""} (${entry.reason}, ${entry.secondsLeft}s)`).join(", ")}
            </p>
          )}
        </div>
      )}

      {/* ── Free community endpoint ───────────────────────────────
          The zero-setup path. It is a public anonymous relay, so the
          privacy trade-off is stated in plain words next to the switch
          and never hidden behind a tooltip. */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[length:var(--fs-sm)] font-extrabold" style={{ color: "var(--text-main)" }}>
              Free community AI endpoint
            </p>
            <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
              Answers open-ended questions with no key at all, called straight from this device.
            </p>
          </div>
          <Seg<"on" | "off">
            value={freeAllowed ? freePref : "off"}
            onChange={(value) => {
              if (!freeAllowed) return;
              setFreeBridgePreference(value);
              setFreePref(value);
              invalidateAiStatus();
              setResult(null);
            }}
            options={[{ v: "on", label: "On" }, { v: "off", label: "Off" }]}
          />
        </div>
        <p className="text-[length:var(--fs-meta)] font-medium" style={{ color: "var(--text-dim)" }}>
          {!freeAllowed
            ? "Switched off for this deployment by its owner (AI_FREE_BRIDGE=off), so Shigun will never send a question to a public relay. Paste your own key above, or ask the owner to set one server-side."
            : freeOn
            ? "Used only when neither this deployment nor this browser has a key. Your question and a summary of your plan are sent to a public AI relay — OVHcloud AI Endpoints, then Kilo Gateway, then Pollinations, in that order. They are anonymous and rate-limited, they may log prompts, and they are not suitable for anything private. Switch it off any time; your own key always takes priority."
            : "Off. Without a key, Shigun answers from your plan, syllabus and the on-device ML engine only."}
        </p>
      </div>

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
            Keys stay in this browser and are sent only to this deployment — and, when this browser makes the call
            itself, straight to the provider. For a shared deployment, set{" "}
            <span className="mono">{BYOK_PROVIDERS.find((p) => p.id === selected)?.envVar}</span> in the server
            environment instead so every learner gets cloud tutoring automatically.
          </p>
        </div>
      )}
    </div>
  );
}
