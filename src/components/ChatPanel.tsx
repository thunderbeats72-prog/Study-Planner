"use client";

import React, { useEffect, useRef, useState } from "react";
import { mdToHtml, type MessageRow } from "@/lib/client";
import { IconChat, IconClose, IconSend, IconSpark } from "./icons";
import { VOICE_OPTIONS, voiceSupported, speak, stopSpeaking, listen, type ListenHandle } from "@/lib/voice";

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
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceId, setVoiceId] = useState("f1");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const lastSpokenId = useRef<number>(0);
  const support = typeof window !== "undefined" ? voiceSupported() : { stt: false, tts: false };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, thinking, open]);

  // Voice mode: speak each new Shigun reply aloud
  useEffect(() => {
    if (!voiceMode || !support.tts) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant" && last.id !== lastSpokenId.current && last.id > 0) {
      lastSpokenId.current = last.id;
      setSpeaking(true);
      speak(last.content, voiceId, () => setSpeaking(false));
    }
  }, [messages, voiceMode, voiceId, support.tts]);

  // Stop everything when the panel closes
  useEffect(() => {
    if (!open) { stopSpeaking(); listenRef.current?.stop(); setListening(false); setSpeaking(false); }
  }, [open]);

  const send = (q?: string) => {
    const msg = (q ?? text).trim();
    if (!msg || thinking) return;
    setText("");
    onSend(msg);
  };

  const toggleListen = () => {
    setVoiceErr("");
    if (listening) { listenRef.current?.stop(); setListening(false); return; }
    stopSpeaking(); setSpeaking(false);
    const h = listen(
      (interim) => setText(interim),
      (final) => { setListening(false); setText(""); if (final) { setVoiceMode(true); onSend(final); } },
      (err) => { setListening(false); setVoiceErr(err); }
    );
    if (h) { listenRef.current = h; setListening(true); }
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: ".9rem", fontWeight: 800 }}>SHIGUN AI Tutor</div>
              <div className="ai-status">
                {listening ? "listening…" : speaking ? "speaking…" : provider ? `${provider} connected` : "hybrid engine online"}
              </div>
            </div>
            {support.tts && (
              <select
                className="voice-select"
                value={voiceMode ? voiceId : "off"}
                onChange={(e) => {
                  if (e.target.value === "off") { setVoiceMode(false); stopSpeaking(); setSpeaking(false); }
                  else { setVoiceMode(true); setVoiceId(e.target.value); }
                }}
                aria-label="Voice"
              >
                <option value="off">Voice off</option>
                {VOICE_OPTIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            )}
            <button className="btn btn-xs btn-secondary" onClick={() => setOpen(false)}><IconClose size={13} /></button>
          </div>

          <div className="ai-msgs">
            {!messages.length && (
              <div className="ai-msg bot">
                Hi! I&apos;m Shigun, your personal AI tutor. I can explain any lesson, solve problems step by step,
                and run the app for you — try <strong>&quot;replan&quot;</strong>, <strong>&quot;start timer&quot;</strong>,
                or tap the mic and just talk to me.
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

          {voiceErr && <div className="voice-err">{voiceErr}</div>}

          <div className="ai-quick">
            {QUICKS.map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}
          </div>

          <div className="ai-input-row">
            {support.stt && (
              <button
                className={`voice-btn${listening ? " listening" : speaking ? " speaking" : ""}`}
                onClick={toggleListen}
                aria-label={listening ? "Stop listening" : "Speak to Shigun"}
                title={listening ? "Stop listening" : "Speak to Shigun"}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </button>
            )}
            <input className="input-field" placeholder={listening ? "Listening…" : "Ask anything, or tap the mic…"} value={text}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="btn btn-primary" onClick={() => send()} disabled={thinking}><IconSend /></button>
          </div>
        </div>
      )}
    </>
  );
}
