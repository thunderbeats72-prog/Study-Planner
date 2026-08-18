"use client";

import React, { useEffect, useRef, useState } from "react";
import { mdToHtml, type MessageRow } from "@/lib/client";
import { IconChat, IconClose, IconSend, IconSpark } from "./icons";

const QUICKS = [
  "What should I study today?",
  "I'm behind — replan",
  "Explain my weakest topic",
  "How am I doing?",
  "Give me 5 practice questions",
  "Start timer",
];

export default function ChatPanel({
  open, setOpen, messages, onSend, thinking, provider,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: MessageRow[];
  onSend: (q: string) => void;
  thinking: boolean;
  provider?: string | null;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, thinking, open]);

  const send = () => {
    const q = text.trim();
    if (!q || thinking) return;
    setText("");
    onSend(q);
  };

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(!open)} aria-label="AI tutor">
        {open ? <IconClose size={20} /> : <IconChat />}
      </button>

      {open && (
        <div className="ai-panel glass-panel slide-in">
          <div className="ai-head">
            <div className="brand-logo-icon" style={{ width: 32, height: 32 }}><IconSpark size={16} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: ".9rem", fontWeight: 800 }}>AETHER AI Tutor</div>
              <div className="ai-status">{provider ? `${provider} connected` : "hybrid engine online"}</div>
            </div>
            <button className="btn btn-xs btn-secondary" onClick={() => setOpen(false)}><IconClose size={13} /></button>
          </div>

          <div className="ai-msgs">
            {!messages.length && (
              <div className="ai-msg bot">
                Hi! I&apos;m your personal AI tutor. I can explain any lesson in your plan, solve problems step by step,
                answer doubts, and run the app for you — try <strong>&quot;replan&quot;</strong>, <strong>&quot;start timer&quot;</strong>,
                or <strong>&quot;what should I study today?&quot;</strong>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`ai-msg ${m.role === "user" ? "user" : "bot"}`}
                dangerouslySetInnerHTML={{ __html: m.role === "user" ? m.content : mdToHtml(m.content) }} />
            ))}
            {thinking && (
              <div className="ai-msg bot">
                <span className="thinking-dots"><i /><i /><i /></span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="ai-quick">
            {QUICKS.map((q) => <button key={q} onClick={() => onSend(q)}>{q}</button>)}
          </div>

          <div className="ai-input-row">
            <input className="input-field" placeholder="Ask anything, or type a command…" value={text}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="btn btn-primary" onClick={send} disabled={thinking}><IconSend /></button>
          </div>
        </div>
      )}
    </>
  );
}
