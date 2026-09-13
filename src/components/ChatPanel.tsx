"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { mdToHtml, escapeHtml, type MessageRow } from "@/lib/client";
import { IconChat, IconCheck, IconClose, IconCopy, IconSend, IconSpark } from "./icons";
import { getByokKeys, byokHeader, byokProviderIds, onByokChange } from "@/lib/byok";
import { freeBridgeEnabled, onBridgeChange, setFreeBridgeAllowedByOperator } from "@/lib/aiBridge";

const QUICKS = [
  "What should I study today?",
  "I'm behind — replan",
  "Explain my weakest topic in detail",
];

type HealthSnapshot = {
  ai?: { mode?: string; configuredProviders?: string[]; freeBridgeAllowed?: boolean };
};

/** What the last tutor reply actually came from — set by the page after
 *  each /api/chat round-trip. "cloud" = a provider answered; "local" =
 *  cloud was configured but the on-device engine answered instead;
 *  "instant" = a deterministic reply (commands, greetings, plan queries)
 *  that never needed the cloud. */
export type LastReplySource = "cloud" | "local" | "instant" | null;

export default function ChatPanel({
  open, setOpen, messages, onSend, thinking, provider, learner, onOpenSettings,
  lastSource = null, lastVia = null,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: MessageRow[];
  onSend: (q: string) => void;
  thinking: boolean;
  provider?: string | null;
  lastSource?: LastReplySource;
  /** Which side of the wire produced the last answer: the learner's own key
   *  called from this browser ("own-key"), a free community endpoint ("free"),
   *  or null for the server's own chain / the on-device engine. */
  lastVia?: "own-key" | "free" | null;
  learner?: { name: string; daysLeft: number; progressPct: number; streak: number; todayDone: number; todayTotal: number };
  /** Opens Settings → AI coach so a learner can connect a cloud key. */
  onOpenSettings?: () => void;
}) {
  const [text, setText] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [ownKeys, setOwnKeys] = useState<string[]>([]);
  /* The free community endpoint is a bridge leg this browser can use with no
     key at all. The panel has to know about it, or a learner who never pastes
     a key keeps being told the AI "isn't connected" while it is answering. */
  const [freeOn, setFreeOn] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /* A send lock prevents double-submits on mobile. It MUST clear whenever a
     send was not actually started — `onSend` can bail out (empty text, a
     request already in flight) before `thinking` ever flips, and before this
     guard the lock then stayed set forever: the button went dead and no
     further message could be sent until a reload. Releasing on a short timer
     as well as on `thinking` makes that state impossible. */
  const submitLock = useRef(false);
  const releaseLock = useCallback(() => { submitLock.current = false; }, []);
  useEffect(() => {
    if (!thinking) {
      const timer = window.setTimeout(releaseLock, 0);
      return () => window.clearTimeout(timer);
    }
  }, [thinking, messages.length, releaseLock]);

  /* Tell the document the coach is open. On desktop the panel is a floating
     card, and a floating card over a working page hides whatever is under it —
     the Planner's Add Task / Rebalance row especially. `body.ai-open` lets the
     workspace pull its content clear of the panel instead of letting the panel
     sit on top of the controls. On phones the panel is a bottom sheet with a
     scrim, so the same class is a no-op there. */
  useEffect(() => {
    document.body.classList.toggle("ai-open", open);
    return () => document.body.classList.remove("ai-open");
  }, [open]);

  // Fetch health on every open — cheap, no-store, and we use raw fetch so
  // a 503 (db down) still preserves ai.configuredProviders from the body.
  // Also probe /api/ai-status GET for the shared llm snapshot.
  /* Keys pasted in Settings → AI coach live in this browser, so the panel
     must track them itself — the server alone cannot know. */
  useEffect(() => {
    let alive = true;
    const readOwn = () => {
      if (!alive) return;
      setOwnKeys(byokProviderIds(getByokKeys()));
      setFreeOn(freeBridgeEnabled());
    };
    readOwn();
    const off = onByokChange(() => readOwn());
    const offBridge = onBridgeChange(() => readOwn());
    return () => {
      alive = false;
      off();
      offBridge();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/health", {
          cache: "no-store",
          headers: { "x-ai-keys": byokHeader() },
        });
        const json = await res.json().catch(() => ({}));
        if (alive && json && typeof json === "object") {
          setHealth(json as HealthSnapshot);
          /* A deployment can forbid the free community relays for everyone
             (AI_FREE_BRIDGE=off). Obey it before labelling the connection. */
          setFreeBridgeAllowedByOperator((json as HealthSnapshot).ai?.freeBridgeAllowed);
          setFreeOn(freeBridgeEnabled());
          return;
        }
      } catch {}
      // Fallback to dedicated ai-status endpoint (doesn't need DB)
      try {
        const res2 = await fetch("/api/ai-status", {
          cache: "no-store",
          headers: { "x-ai-keys": byokHeader() },
        });
        const json2 = await res2.json().catch(() => ({}));
        if (alive && json2 && typeof json2 === "object") {
          // Normalize to HealthSnapshot shape
          const snap: HealthSnapshot = {
            ai: {
              mode: (json2 as any).mode,
              configuredProviders: (json2 as any).configuredProviders,
              freeBridgeAllowed: (json2 as any).freeBridgeAllowed,
            },
          };
          setHealth(snap);
          setFreeBridgeAllowedByOperator((json2 as any).freeBridgeAllowed);
          setFreeOn(freeBridgeEnabled());
        }
      } catch {
        /* fall back to provider prop */
      }
    };
    fetchHealth();
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, open]);

  useEffect(() => {
    if (open && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, [open]);

  const autosize = useCallback(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
  }, []);

  const send = (q?: string) => {
    const msg = (q ?? text).trim();
    if (!msg || thinking || submitLock.current) return;
    submitLock.current = true;
    // If the parent refuses the send (empty input, request in flight) the
    // lock is released on the next tick rather than wedging the composer.
    window.setTimeout(releaseLock, 400);
    onSend(msg);
    setText("");
    requestAnimationFrame(autosize);
  };

  const copyMessage = async (m: MessageRow) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((cur) => (cur === m.id ? null : cur)), 1600);
    } catch { /* clipboard blocked */ }
  };

  /* Cloud is active if the deployment has providers, the page prop says a
     model answered, this browser saved a key in Settings → AI coach, or the
     free community endpoint is switched on. Which provider it is stays
     private — clean UI, no vendor lock-in feel — but HOW it is reached does
     not: a free public relay is labelled as one. */
  const serverCloud = !!(health?.ai?.configuredProviders?.length || provider);
  const isCloudActive = serverCloud || ownKeys.length > 0 || freeOn;
  /** Only the free community legs can answer — no deployment key, no own key. */
  const freeOnly = !serverCloud && ownKeys.length === 0 && freeOn;

  /* The header used to say "Ready" whenever a key existed — even while every
     cloud call was failing and the learner was getting fallback text. The
     label now follows the LAST REAL REPLY: a cloud answer shows "Cloud AI",
     a fallback shows "Local engine" so the state on screen matches what the
     learner is experiencing. */
  const degraded = isCloudActive && lastSource === "local";
  const answeredByFree = lastSource === "cloud" && lastVia === "free";
  const statusText = thinking
    ? "Thinking…"
    : !isCloudActive
      ? "Local mode"
      : lastSource === "cloud"
        ? answeredByFree
          ? "Cloud AI · free endpoint"
          : "Cloud AI · connected"
        : degraded
          ? "Cloud busy · local engine answered"
          : freeOnly
            ? "Free AI endpoint · ready"
            : "Ready";
  const statusTitle = !isCloudActive
    ? "Shigun is answering with the on-device study engine, so it is still plan-aware but less conversational. Connect a free key in Settings → AI coach for full tutoring."
    : degraded
      ? "The cloud providers didn't answer the last message in time, so the on-device engine replied. Send it again — the next provider in the chain picks it up."
      : answeredByFree || freeOnly
        ? "No AI key is configured, so this answer came from a free community AI endpoint, called straight from this device. Your question and plan summary were sent to that provider. Add your own key in Settings → AI coach for a private, faster connection — or switch the free endpoint off there."
        : "Shigun is connected to its cloud AI layer, grounded by the on-device ML engine.";

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(!open)} aria-label="Open Shigun">
        {open ? <IconClose size={20} /> : <IconChat />}
      </button>

      {open && <button className="ai-scrim" aria-label="Close Shigun" onClick={() => setOpen(false)} />}
      {open && (
        <div
          className={`ai-panel${thinking ? " is-thinking" : ""}`}
          role="dialog" aria-modal="true" aria-label="Shigun study coach"
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        >
          {/* ── Header ── */}
          <div className="ai-head">
            <div className="ai-head-main">
              <div className="shigun-avatar" aria-hidden="true">
                <IconSpark size={15} />
                {isCloudActive && <span className="shigun-avatar-ring" />}
              </div>
              <div className="ai-identity">
                <div className="ai-title">Shigun</div>
                <div
                  className={`ai-status${isCloudActive && !degraded ? "" : " off"}`}
                  aria-live="polite"
                  title={statusTitle}
                >
                  {statusText}
                </div>
              </div>
              <button className="ai-close" aria-label="Close" onClick={() => setOpen(false)}>
                <IconClose size={16} />
              </button>
            </div>
          </div>

          {/* ── Messages ── */}
          <div className="ai-msgs" role="log" aria-busy={thinking || undefined}>
            {!messages.length && learner && (
              <div className="companion-hello">
                <div className="companion-orb"><IconSpark size={20} /></div>
                <h4 className="companion-title">
                  {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"},{" "}
                  {learner.name.split(" ")[0]}
                </h4>
                <p className="companion-sub">
                  {learner.todayTotal > 0 && learner.todayDone >= learner.todayTotal
                    ? "All sessions done for today — great work."
                    : learner.todayTotal > 0
                      ? `${learner.todayTotal - learner.todayDone} of ${learner.todayTotal} sessions left · ${learner.daysLeft}d to exam`
                      : `${learner.daysLeft} days to exam · ${learner.progressPct}% complete`}
                </p>
                <p className="companion-hint">Ask anything about your plan, subjects, or progress.</p>
              </div>
            )}
            {!messages.length && !learner && (
              <div className="companion-hello">
                <div className="companion-orb"><IconSpark size={20} /></div>
                <h4 className="companion-title">Hi, I&apos;m Shigun</h4>
                <p className="companion-hint">Your AI study coach. Ask me anything.</p>
              </div>
            )}
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`ai-message-row ${isUser ? "user" : "bot"}`}>
                  {!isUser && <div className="ai-mini-avatar" aria-hidden="true"><IconSpark size={11} /></div>}
                  <div
                    className={`ai-msg ${isUser ? "user" : "bot"}`}
                    title={new Date(m.createdAt).toLocaleString()}
                    dangerouslySetInnerHTML={{ __html: isUser ? escapeHtml(m.content) : mdToHtml(m.content) }}
                  />
                  {!isUser && (
                    <button
                      className={`ai-copy${copiedId === m.id ? " copied" : ""}`}
                      aria-label={copiedId === m.id ? "Copied" : "Copy"}
                      onClick={() => void copyMessage(m)}
                    >
                      {copiedId === m.id ? <IconCheck size={12} /> : <IconCopy size={13} />}
                    </button>
                  )}
                </div>
              );
            })}
            {thinking && (
              <div className="ai-message-row bot thinking-row">
                <div className="ai-mini-avatar" aria-hidden="true"><IconSpark size={11} /></div>
                <div className="ai-msg bot">
                  <span className="thinking-dots"><i /><i /><i /></span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* ── Connect prompt ──
              With no cloud key the coach can only answer from the learner's
              own plan, which reads as "the AI is broken". Say so plainly and
              offer the one action that fixes it. */}
          {!isCloudActive && onOpenSettings && (
            <div className="ai-connect">
              <div className="ai-connect-text">
                <strong>Full AI chat isn’t connected yet.</strong> Right now I answer from your
                plan and syllabus only.
              </div>
              <button
                type="button"
                className="ai-connect-btn"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
              >
                <IconSpark size={13} /> Connect AI
              </button>
            </div>
          )}

          {/* Free community endpoint only: say plainly where the answer comes
              from and offer the upgrade. A learner must never discover by
              accident that a public relay saw their question. */}
          {freeOnly && onOpenSettings && (
            <div className="ai-connect ai-connect-free">
              <div className="ai-connect-text">
                <strong>No key needed — a free community AI endpoint is answering.</strong> Your
                question and plan summary go to that provider from this device. Add your own key
                for a private, faster connection.
              </div>
              <button
                type="button"
                className="ai-connect-btn"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
              >
                <IconSpark size={13} /> Add my key
              </button>
            </div>
          )}

          {/* ── Quick suggestions ── */}
          <div className="ai-quick" aria-label="Suggested questions">
            {QUICKS.map((q) => (
              <button key={q} onClick={() => send(q)} disabled={thinking}>{q}</button>
            ))}
          </div>

          {/* ── Composer ── */}
          <div className="ai-input-row ai-composer">
            <textarea
              ref={inputRef}
              className="input-field ai-chat-input"
              placeholder="Ask Shigun…"
              value={text}
              rows={1}
              aria-label="Message Shigun"
              onChange={(e) => { setText(e.target.value); autosize(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
            />
            <button
              className="btn btn-primary ai-send"
              aria-label="Send"
              onClick={() => send()}
              disabled={thinking || !text.trim()}
            >
              <IconSend />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
