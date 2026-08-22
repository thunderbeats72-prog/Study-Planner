"use client";

import React, { useEffect, useRef, useState } from "react";
import { mdToHtml, escapeHtml, type MessageRow } from "@/lib/client";
import { IconChat, IconClose, IconSend, IconSpark } from "./icons";

const QUICKS = [
  "What should I study today?",
  "I'm behind — replan",
  "Explain my weakest topic in detail",
];

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
  const endRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);
  useEffect(() => { if (!thinking) submitLock.current = false; }, [thinking]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, open]);

  const send = (q?: string) => {
    const msg = (q ?? text).trim();
    if (!msg || thinking || submitLock.current) return;
    submitLock.current = true;
    onSend(msg);
    setText("");
  };

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
        >
          <div className="ai-sheet-handle" aria-hidden="true" />
          <div className="ai-head">
            <div className="ai-head-main">
              <div className="brand-logo-icon ai-avatar"><IconSpark size={16} /></div>
              <div className="ai-identity">
                <div className="ai-title">Shigun <span>AI Tutor</span></div>
                <div className="ai-status">
                  {thinking
                    ? "Working on your answer"
                    : provider ? `${provider} configured · local fallback ready` : "Local tutor ready"}
                </div>
              </div>
              <button className="ai-close" aria-label="Close chat" onClick={() => setOpen(false)}><IconClose size={17} /></button>
            </div>
          </div>

          <div className="ai-msgs">
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
                Hi! I&apos;m Shigun. Ask me anything about your studies.
              </div>
            )}
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`ai-message-row ${isUser ? "user" : "bot"}`}>
                  {!isUser && <div className="ai-mini-avatar" aria-hidden="true"><IconSpark size={11} /></div>}
                  <div className={`ai-msg ${isUser ? "user" : "bot"}`}
                    dangerouslySetInnerHTML={{ __html: isUser ? escapeHtml(m.content) : mdToHtml(m.content) }} />
                </div>
              );
            })}
            {thinking && (
              <div className="ai-message-row bot thinking-row">
                <div className="ai-mini-avatar" aria-hidden="true"><IconSpark size={11} /></div>
                <div className="ai-msg bot">
                  <span className="thinking-dots"><i /><i /><i /></span>
                  <span className="thinking-label">Thinking through your plan</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="ai-quick">
            <span className="ai-quick-label">Try</span>
            {QUICKS.map((q) => <button key={q} onClick={() => send(q)} disabled={thinking}>{q}</button>)}
          </div>

          <div className="ai-input-row">
            <input
              className="input-field ai-chat-input"
              placeholder="Message Shigun…"
              value={text}
              aria-label="Message Shigun"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="btn btn-primary ai-send" aria-label="Send message" onClick={() => send()} disabled={thinking || !text.trim()}><IconSend /></button>
          </div>
        </div>
      )}
    </>
  );
}
