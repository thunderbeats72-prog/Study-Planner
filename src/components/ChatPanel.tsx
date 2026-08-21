"use client";

import React, { useEffect, useRef, useState } from "react";
import { mdToHtml, escapeHtml, type MessageRow } from "@/lib/client";
import { IconChat, IconClose, IconSend, IconSpark } from "./icons";
import {
  VOICE_OPTIONS, voiceSupported, speak, stopSpeaking, listen, learnSttLang,
  prepareVoicePlayback, type ListenHandle,
} from "@/lib/voice";

const QUICKS = [
  "What should I study today?",
  "I'm behind — replan",
  "Explain my weakest topic",
  "How am I doing?",
  "Give me 5 practice questions",
  "Start timer",
];

/** Below this confidence the transcript waits for review instead of
 *  auto-sending — no more gibberish being fired off as a message. */
const AUTO_SEND_CONFIDENCE = 0.72;

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
  const voiceReplyArmed = useRef(false); // speak the next reply only after mic input
  const [voiceId, setVoiceId] = useState("f1");
  const [listening, setListening] = useState(false);
  const [micWaking, setMicWaking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const [voiceHint, setVoiceHint] = useState(""); // "review what I heard" prompt
  const endRef = useRef<HTMLDivElement>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const lastSpokenId = useRef<number>(0);
  const openRef = useRef(open);
  const listenSession = useRef(0); // invalidates a pending mic start on cancel/close
  useEffect(() => { openRef.current = open; }, [open]);
  const support = typeof window !== "undefined" ? voiceSupported() : { stt: false, tts: false };

  // Voice profile IDs map to fixed cloud voices, so persisting the ID keeps
  // the same Shigun voice selected on every viewport on this device.
  useEffect(() => {
    const saved = localStorage.getItem("shigun-voice-id");
    const timer = window.setTimeout(() => {
      if (saved && VOICE_OPTIONS.some((voice) => voice.id === saved)) setVoiceId(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { localStorage.setItem("shigun-voice-id", voiceId); }, [voiceId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, open]);

  // Seamless voice: if the user SPOKE their message, Shigun speaks back.
  useEffect(() => {
    if (!voiceReplyArmed.current || !support.tts) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant" && last.id !== lastSpokenId.current && last.id > 0) {
      lastSpokenId.current = last.id;
      voiceReplyArmed.current = false;
      setSpeaking(true);
      speak(last.content, voiceId, () => setSpeaking(false));
    }
  }, [messages, voiceId, support.tts]);

  // Stop everything when the panel closes
  useEffect(() => {
    if (open) return;
    listenSession.current++; // cancel any in-flight mic warm-up
    stopSpeaking(); listenRef.current?.stop(); listenRef.current = null;
    const timer = window.setTimeout(() => {
      if (!openRef.current) { setListening(false); setSpeaking(false); setMicWaking(false); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const send = (q?: string) => {
    const msg = (q ?? text).trim();
    if (!msg || thinking) return;
    setText("");
    setVoiceHint("");
    onSend(msg);
  };

  const toggleListen = async () => {
    setVoiceErr("");
    if (listening) {
      // Do not invalidate this session: stop() delivers the last interim/final
      // transcript, including the words spoken just before the tap.
      listenRef.current?.stop();
      listenRef.current = null;
      setListening(false);
      return;
    }
    if (micWaking) {
      listenSession.current++; // invalidate the pending permission/start call
      setMicWaking(false);
      return;
    }

    // Resume Web Audio inside the tap gesture. The cloud reply can then play
    // after recognition + network work even on iOS autoplay-restricted pages.
    void prepareVoicePlayback();
    stopSpeaking(); setSpeaking(false);
    const token = ++listenSession.current;
    setMicWaking(true);            // instant feedback — button pulses immediately
    setVoiceHint("");
    const isCurrent = () => token === listenSession.current && openRef.current;
    const h = await listen(
      (interim) => { if (isCurrent()) setText(interim); },
      (final) => {
        if (!isCurrent()) return; // cancelled, replaced, or closed session
        setListening(false);
        setMicWaking(false);
        listenRef.current = null;
        if (!final.text.trim()) {
          // manual stop with nothing captured = stay quiet; engine gave up = explain
          if (!final.cancelled) setVoiceErr("I didn't hear anything clearly — tap the mic and try once more.");
          return;
        }
        setText(final.text);
        learnSttLang(final.text);
        if (final.confidence >= AUTO_SEND_CONFIDENCE) {
          // confident — seamless send, reply comes back aloud
          voiceReplyArmed.current = true;
          setText("");
          onSend(final.text.trim());
        } else {
          // unsure — show the transcript for a quick review instead of
          // sending a wrong message (fixes the 2-3 retry loop)
          voiceReplyArmed.current = true;
          setVoiceHint(final.confidence > 0
            ? `I heard you (${Math.round(final.confidence * 100)}% sure) — check the text, then send or edit.`
            : "I heard you — check the text, then send or edit.");
        }
      },
      (err) => {
        if (!isCurrent()) return;
        setListening(false); setMicWaking(false); listenRef.current = null; setVoiceErr(err);
      }
    );
    if (!isCurrent()) { h?.stop(); return; }
    if (h) { listenRef.current = h; setMicWaking(false); setListening(true); }
    else setMicWaking(false);
  };

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(!open)} aria-label="AI tutor">
        {open ? <IconClose size={20} /> : <IconChat />}
      </button>

      {open && (
        <div className="ai-panel glass-panel slide-in" role="dialog" aria-label="SHIGUN AI tutor chat">
          <div className="ai-sheet-handle" aria-hidden="true" />
          <div className="ai-head">
            <div className="brand-logo-icon" style={{ width: 32, height: 32 }}><IconSpark size={16} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: ".9rem", fontWeight: 800 }}>SHIGUN AI Tutor</div>
              <div className="ai-status">
                {micWaking ? "waking mic…" : listening ? "listening…" : speaking ? "speaking…" : provider ? `${provider} connected` : "hybrid engine online"}
              </div>
            </div>
            {support.tts && (
              <select
                className="voice-select"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                aria-label="Voice"
                title="Shigun's voice"
              >
                {VOICE_OPTIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            )}
            <button className="btn btn-xs btn-secondary" aria-label="Close chat" onClick={() => setOpen(false)}><IconClose size={13} /></button>
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
                      : `${learner.daysLeft} days to your exam · ${learner.progressPct}% of the syllabus behind you.`}
                </p>
                <p className="companion-hint">Ask me anything, give a command, or tap the mic and just talk.</p>
              </div>
            )}
            {!messages.length && !learner && (
              <div className="ai-msg bot">
                Hi! I&apos;m Shigun. Ask me anything about your studies, or tap the mic and talk to me.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`ai-msg ${m.role === "user" ? "user" : "bot"}`}
                dangerouslySetInnerHTML={{ __html: m.role === "user" ? escapeHtml(m.content) : mdToHtml(m.content) }} />
            ))}
            {thinking && (
              <div className="ai-msg bot">
                <span className="thinking-dots"><i /><i /><i /></span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {voiceErr && <div className="voice-err" role="alert">{voiceErr}</div>}
          {voiceHint && <div className="voice-hint">{voiceHint}</div>}

          <div className="ai-quick">
            {QUICKS.map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}
          </div>

          <div className="ai-input-row">
            {support.stt && (
              <button
                className={`voice-btn${listening || micWaking ? " listening" : ""}${speaking ? " speaking" : ""}`}
                onClick={() => void toggleListen()}
                aria-label={listening || micWaking ? "Stop listening" : "Speak to Shigun"}
                title={listening || micWaking ? "Stop listening" : "Speak to Shigun"}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </button>
            )}
            <input className="input-field ai-chat-input" placeholder={listening || micWaking ? "Listening… speak now" : "Ask anything, or tap the mic…"} value={text}
              onChange={(e) => { setText(e.target.value); if (voiceHint) setVoiceHint(""); }} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="btn btn-primary" aria-label="Send message" onClick={() => send()} disabled={thinking}><IconSend /></button>
          </div>
        </div>
      )}
    </>
  );
}
