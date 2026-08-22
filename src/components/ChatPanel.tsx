"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, mdToHtml, escapeHtml, type MessageRow } from "@/lib/client";
import { IconChat, IconCheck, IconClose, IconCopy, IconSend, IconSpark } from "./icons";

const QUICKS = [
  "What should I study today?",
  "I'm behind — replan",
  "Explain my weakest topic in detail",
];

type HealthSnapshot = {
  ai?: { mode?: string; configuredProviders?: string[] };
};

export default function ChatPanel({
  open, setOpen, messages, onSend, thinking, provider, learner,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: MessageRow[];
  onSend: (q: string) => void;
  thinking: boolean;
  provider?: string | null;
  learner?: { name: string; daysLeft: number; progressPct: number; streak: number; todayDone: number; todayTotal: number };
}) {
  const [text, setText] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submitLock = useRef(false);
  useEffect(() => { if (!thinking) submitLock.current = false; }, [thinking]);

  // Fetch active provider info once per session for the status chip.
  useEffect(() => {
    if (!open || health) return;
    let alive = true;
    api<HealthSnapshot>("/api/health", { timeoutMs: 10_000 })
      .then((snapshot) => { if (alive) setHealth(snapshot); })
      .catch(() => { /* status chip falls back to the provider prop */ });
    return () => { alive = false; };
  }, [open, health]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, open]);

  // Focus the composer when the sheet opens on pointer devices (avoids
  // popping the mobile keyboard on touch, where the FAB tap is recent).
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
    onSend(msg);
    setText("");
    requestAnimationFrame(autosize);
  };

  const copyMessage = async (m: MessageRow) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((current) => (current === m.id ? null : current)), 1600);
    } catch { /* clipboard blocked — silently ignore */ }
  };

  const isCloudActive = !!(
    health?.ai?.configuredProviders?.length
    || provider
  );

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(!open)} aria-label="AI tutor">
        {open ? <IconClose size={20} /> : <IconChat />}
      </button>

      {open && <button className="ai-scrim" aria-label="Close Shigun" onClick={() => setOpen(false)} />}
      {open && (
        <div
          className={`ai-panel glass-panel${thinking ? " is-thinking" : ""}`}
          role="dialog" aria-modal="true" aria-label="SHIGUN AI tutor chat"
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        >
          <div className="ai-sheet-handle" aria-hidden="true" />
          <div className="ai-head">
            <div className="ai-head-main">
              <div className="brand-logo-icon ai-avatar"><IconSpark size={16} /></div>
              <div className="ai-identity">
                <div className="ai-title">Shigun <span>AI Study Coach</span></div>
                <div className={`ai-status${isCloudActive ? "" : " off"}`} aria-live="polite">
                  {thinking
                    ? "Thinking…"
                    : isCloudActive
                      ? "AI + ML engine active"
                      : "ML engine active · add an AI key to unlock cloud tutoring"}
                </div>
              </div>
              <button className="ai-close" aria-label="Close chat" onClick={() => setOpen(false)}><IconClose size={17} /></button>
            </div>
          </div>

          <div className="ai-msgs" role="log" aria-busy={thinking || undefined}>
            {!messages.length && learner && (
              <div className="companion-hello">
                <div className="companion-orb"><IconSpark size={22} /></div>
                <h4 className="companion-title">
                  {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, {learner.name.split(" ")[0]}
                </h4>
                <p className="companion-sub">
                  {learner.todayTotal > 0 && learner.todayDone >= learner.todayTotal
                    ? "Everything done for today — impressive."
                    : learner.todayTotal > 0
                      ? `${learner.todayTotal - learner.todayDone} of ${learner.todayTotal} sessions left today · ${learner.daysLeft} days to your exam.`
                      : `${learner.daysLeft} days to your exam · ${learner.progressPct}% of syllabus completed.`}
                </p>
                <p className="companion-hint">Ask me anything about your studies, plan, or subjects.</p>
              </div>
            )}
            {!messages.length && !learner && (
              <div className="ai-msg bot">
                Hi! I&apos;m Shigun — your AI study coach. Ask me anything about your subjects, plan, or progress.
              </div>
            )}
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`ai-message-row ${isUser ? "user" : "bot"}`}>
                  {!isUser && <div className="ai-mini-avatar" aria-hidden="true"><IconSpark size={11} /></div>}
                  <div className={`ai-msg ${isUser ? "user" : "bot"}`}
                    title={new Date(m.createdAt).toLocaleString()}
                    dangerouslySetInnerHTML={{ __html: isUser ? escapeHtml(m.content) : mdToHtml(m.content) }} />
                  {!isUser && (
                    <button
                      className={`ai-copy${copiedId === m.id ? " copied" : ""}`}
                      aria-label={copiedId === m.id ? "Copied" : "Copy answer"}
                      title={copiedId === m.id ? "Copied!" : "Copy answer"}
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
                  <span className="thinking-label">Thinking through your answer</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="ai-quick" aria-label="Suggested questions">
            <span className="ai-quick-label">Try</span>
            {QUICKS.map((q) => <button key={q} onClick={() => send(q)} disabled={thinking}>{q}</button>)}
          </div>

          <div className="ai-input-row ai-composer">
            <textarea
              ref={inputRef}
              className="input-field ai-chat-input"
              placeholder="Message Shigun…  (Shift+Enter for a new line)"
              value={text}
              rows={1}
              aria-label="Message Shigun"
              onChange={(e) => { setText(e.target.value); autosize(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
            />
            <button className="btn btn-primary ai-send" aria-label="Send message" onClick={() => send()} disabled={thinking || !text.trim()}><IconSend /></button>
          </div>
        </div>
      )}
    </>
  );
}
