"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { mdToHtml, escapeHtml, type MessageRow } from "@/lib/client";
import { IconChat, IconClose, IconGear, IconSend, IconSpark, IconVolume } from "./icons";
import {
  VOICE_OPTIONS, SPEECH_RATE_OPTIONS, voiceSupported, speakLong, stopSpeaking, listen, learnSttLang,
  prepareVoicePlayback, resolveVoiceId, type ListenHandle,
} from "@/lib/voice";
import { mergeTranscriptSegments } from "@/lib/transcript";

const QUICKS = [
  "What should I study today?",
  "I'm behind — replan",
  "Explain my weakest topic",
  "How am I doing?",
  "हिंदी में समझाओ",
];

/** Below this confidence the transcript waits for review instead of
 *  auto-sending — no more gibberish being fired off as a message. */
const AUTO_SEND_CONFIDENCE = 0.72;

export default function ChatPanel({
  open, setOpen, messages, onSend, thinking, learner, speechHints = [],
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: MessageRow[];
  onSend: (q: string, meta?: { voice?: boolean; voiceId?: string }) => void;
  thinking: boolean;
  provider?: string | null;
  learner?: { name: string; daysLeft: number; progressPct: number; streak: number; todayDone: number; todayTotal: number };
  speechHints?: string[];
}) {
  const [text, setText] = useState("");
  const voiceReplyArmed = useRef(false);
  const [voiceId, setVoiceId] = useState("f1");
  const [speechRate, setSpeechRate] = useState(1.15);
  const [voiceMenu, setVoiceMenu] = useState(false);
  const [listening, setListening] = useState(false);
  const [micWaking, setMicWaking] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [voiceHint, setVoiceHint] = useState("");
  const [speakProgress, setSpeakProgress] = useState<{ done: number; total: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const lastSpokenId = useRef<number>(0);
  const openRef = useRef(open);
  const listenSession = useRef(0);
  const submitLock = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { if (!thinking) submitLock.current = false; }, [thinking]);
  const support = typeof window !== "undefined" ? voiceSupported() : { stt: false, tts: false };

  useEffect(() => {
    const saved = localStorage.getItem("shigun-voice-id");
    const timer = window.setTimeout(() => setVoiceId(resolveVoiceId(saved)), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { localStorage.setItem("shigun-voice-id", voiceId); }, [voiceId]);
  useEffect(() => {
    const saved = Number(localStorage.getItem("shigun-speech-rate"));
    const timer = window.setTimeout(() => {
      if (SPEECH_RATE_OPTIONS.some((option) => option.value === saved)) setSpeechRate(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { localStorage.setItem("shigun-speech-rate", String(speechRate)); }, [speechRate]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking, open]);

  useEffect(() => {
    if (!voiceMenu) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setVoiceMenu(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setVoiceMenu(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [voiceMenu]);

  const speakReply = useCallback((content: string) => {
    if (!support.tts || !content.trim()) return;
    stopSpeaking();
    setVoiceErr("");
    setVoiceNotice("");
    setVoicePreparing(true);
    setSpeaking(false);
    setSpeakProgress(null);
    void speakLong(content, voiceId, {
      onStart: () => { setVoicePreparing(false); setSpeaking(true); },
      onProgress: (done, total) => setSpeakProgress(total > 1 ? { done, total } : null),
      onEnd: () => { setVoicePreparing(false); setSpeaking(false); setSpeakProgress(null); },
      onFallback: (message) => { setVoiceErr(""); setVoiceNotice(message); },
      onError: (message) => setVoiceErr(message),
    }, { rate: speechRate });
  }, [speechRate, support.tts, voiceId]);

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant" && message.id > 0) || null;

  useEffect(() => {
    if (!voiceReplyArmed.current || !support.tts) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant" && last.id !== lastSpokenId.current && last.id > 0) {
      lastSpokenId.current = last.id;
      voiceReplyArmed.current = false;
      speakReply(last.content);
    }
  }, [messages, speakReply, support.tts]);

  useEffect(() => {
    if (open) return;
    listenSession.current++;
    stopSpeaking(); listenRef.current?.stop(); listenRef.current = null;
    const timer = window.setTimeout(() => {
      if (!openRef.current) {
        setListening(false); setSpeaking(false); setVoicePreparing(false);
        setMicWaking(false); setSpeakProgress(null); setVoiceNotice(""); setVoiceMenu(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const dispatch = (message: string, fromVoice = false): boolean => {
    const msg = message.trim();
    if (!msg || thinking || submitLock.current) return false;
    submitLock.current = true;
    onSend(msg, { voice: fromVoice, voiceId });
    return true;
  };

  const send = (q?: string) => {
    const msg = (q ?? text).trim();
    if (!dispatch(msg, q === undefined && voiceReplyArmed.current)) return;
    setText("");
    setVoiceHint("");
  };

  const toggleListen = async () => {
    setVoiceErr("");
    setVoiceNotice("");
    if (speaking || voicePreparing) {
      stopSpeaking();
      setSpeaking(false);
      setVoicePreparing(false);
      setSpeakProgress(null);
      return;
    }
    if (listening) {
      listenRef.current?.stop();
      listenRef.current = null;
      setListening(false);
      return;
    }
    if (micWaking) {
      listenSession.current++;
      setMicWaking(false);
      return;
    }

    void prepareVoicePlayback();
    stopSpeaking(); setSpeaking(false); setVoicePreparing(false);
    const token = ++listenSession.current;
    setMicWaking(true);
    setVoiceHint("");
    const isCurrent = () => token === listenSession.current && openRef.current;
    const h = await listen(
      (interim) => { if (isCurrent()) setText(interim); },
      (final) => {
        if (!isCurrent()) return;
        setListening(false);
        setMicWaking(false);
        listenRef.current = null;
        if (!final.text.trim()) {
          if (!final.cancelled) setVoiceErr("I didn't hear anything clearly — tap the mic and try once more.");
          return;
        }
        setText(final.text);
        learnSttLang(final.text);
        if (final.confidence >= AUTO_SEND_CONFIDENCE) {
          voiceReplyArmed.current = true;
          if (dispatch(final.text, true)) setText("");
        } else {
          voiceReplyArmed.current = true;
          setVoiceHint(final.confidence > 0
            ? `Heard you (${Math.round(final.confidence * 100)}%) — check, then send.`
            : "Heard you — check the text, then send.");
        }
      },
      (err) => {
        if (!isCurrent()) return;
        setListening(false); setMicWaking(false); listenRef.current = null; setVoiceErr(err);
      },
      { hints: speechHints }
    );
    if (!isCurrent()) { h?.stop(); return; }
    if (h) { listenRef.current = h; setMicWaking(false); setListening(true); }
    else setMicWaking(false);
  };

  const selectedVoice = VOICE_OPTIONS.find((voice) => voice.id === voiceId) || VOICE_OPTIONS[0];
  const live = listening || micWaking;
  const status = micWaking ? "Mic…"
    : listening ? "Listening"
    : voicePreparing ? selectedVoice.label
    : speaking ? (speakProgress ? `${selectedVoice.label} · ${speakProgress.done}/${speakProgress.total}` : selectedVoice.label)
    : thinking ? "Thinking"
    : selectedVoice.label;

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(!open)} aria-label="AI tutor">
        {open ? <IconClose size={20} /> : <IconChat />}
      </button>

      {open && <button className="ai-scrim" aria-label="Close Shigun" onClick={() => setOpen(false)} />}
      {open && (
        <div
          className={`ai-panel glass-panel${thinking ? " is-thinking" : ""}${live ? " is-listening" : ""}${voicePreparing ? " is-preparing" : ""}${speaking ? " is-speaking" : ""}${messages.length ? " has-thread" : ""}`}
          role="dialog" aria-modal="true" aria-label="SHIGUN AI tutor chat"
        >
          <div className="ai-sheet-handle" aria-hidden="true" />
          <div className="ai-head">
            <div className="brand-logo-icon ai-avatar"><IconSpark size={16} /></div>
            <div className="ai-identity">
              <div className="ai-title">Shigun</div>
              <div className="ai-status">{status}</div>
            </div>
            <div className="ai-head-actions">
              {support.tts && (
                <>
                  <button
                    className={`voice-replay${speaking || voicePreparing ? " active" : ""}`}
                    onClick={() => {
                      if (speaking || voicePreparing) {
                        stopSpeaking();
                        setSpeaking(false);
                        setVoicePreparing(false);
                        setSpeakProgress(null);
                        return;
                      }
                      if (lastAssistant) speakReply(lastAssistant.content);
                    }}
                    disabled={thinking || (!lastAssistant && !speaking && !voicePreparing)}
                    aria-label={speaking || voicePreparing ? "Stop spoken reply" : "Read the latest reply aloud"}
                    title={speaking || voicePreparing ? "Stop" : "Play"}
                  >
                    <IconVolume size={15} />
                  </button>
                  <div className="voice-menu-wrap" ref={menuRef}>
                    <button
                      className={`voice-menu-btn${voiceMenu ? " open" : ""}`}
                      onClick={() => setVoiceMenu((v) => !v)}
                      aria-haspopup="menu"
                      aria-expanded={voiceMenu}
                      aria-label="Voice and speed"
                      title="Voice and speed"
                    >
                      <IconGear size={15} />
                    </button>
                    {voiceMenu && (
                      <div className="voice-menu" role="menu">
                        <div className="voice-menu-label">Voice — same in every language</div>
                        {VOICE_OPTIONS.map((voice) => (
                          <button
                            key={voice.id}
                            role="menuitemradio"
                            aria-checked={voiceId === voice.id}
                            className={`voice-menu-item${voiceId === voice.id ? " selected" : ""}`}
                            onClick={() => setVoiceId(voice.id)}
                          >
                            <span>{voice.label}</span>
                            <small>{voice.hint}</small>
                          </button>
                        ))}
                        <div className="voice-menu-label">Speed</div>
                        <div className="voice-speed-row">
                          {SPEECH_RATE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              className={`voice-speed-chip${speechRate === option.value ? " selected" : ""}`}
                              onClick={() => setSpeechRate(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
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
                    ? "Everything done for today."
                    : learner.todayTotal > 0
                      ? `${learner.todayTotal - learner.todayDone} sessions left · ${learner.daysLeft} days to exam.`
                      : `${learner.daysLeft} days to exam · ${learner.progressPct}% complete.`}
                </p>
              </div>
            )}
            {!messages.length && !learner && (
              <div className="ai-msg bot">
                Hi! I&apos;m Shigun. Ask me anything, or tap the mic.
              </div>
            )}
            {messages.map((m) => {
              const isUser = m.role === "user";
              const visibleContent = isUser ? mergeTranscriptSegments([m.content]) : m.content;
              return (
                <div key={m.id} className={`ai-message-row ${isUser ? "user" : "bot"}`}>
                  {!isUser && <div className="ai-mini-avatar" aria-hidden="true"><IconSpark size={11} /></div>}
                  <div className={`ai-msg ${isUser ? "user" : "bot"}`}
                    dangerouslySetInnerHTML={{ __html: isUser ? escapeHtml(visibleContent) : mdToHtml(visibleContent) }} />
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

          {live && (
            <div className="voice-live" role="status">
              <span className="voice-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <span><strong>{micWaking ? "Mic" : "Listening"}</strong>{text ? ` · ${text}` : ""}</span>
              <button onClick={() => void toggleListen()}>Done</button>
            </div>
          )}
          {voiceErr && <div className="voice-err" role="alert">{voiceErr}</div>}
          {voiceNotice && <div className="voice-note" role="status">{voiceNotice}</div>}
          {voiceHint && <div className="voice-hint">{voiceHint}</div>}

          {!messages.length && (
            <div className="ai-quick">
              {QUICKS.map((q) => <button key={q} onClick={() => send(q)} disabled={thinking}>{q}</button>)}
            </div>
          )}

          <div className="ai-input-row">
            {support.stt && (
              <button
                className={`voice-btn${live ? " listening" : ""}${voicePreparing ? " preparing" : ""}${speaking ? " speaking" : ""}`}
                onClick={() => void toggleListen()}
                disabled={thinking}
                aria-label={live ? "Stop listening" : speaking || voicePreparing ? "Stop the voice" : "Speak to Shigun"}
                title={live ? "Stop listening" : speaking || voicePreparing ? "Stop" : "Speak — language is detected automatically"}
              >
                {speaking || voicePreparing
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" /></svg>
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />
                    </svg>}
              </button>
            )}
            <input className="input-field ai-chat-input" placeholder={live ? "Listening…" : "Message Shigun…"} value={text}
              aria-label="Message Shigun"
              onChange={(e) => { setText(e.target.value); if (voiceHint) setVoiceHint(""); }} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="btn btn-primary ai-send" aria-label="Send message" onClick={() => send()} disabled={thinking || !text.trim()}><IconSend /></button>
          </div>
        </div>
      )}
    </>
  );
}
