"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { mdToHtml, escapeHtml, type MessageRow } from "@/lib/client";
import { IconChat, IconClose, IconSend, IconSpark, IconVolume } from "./icons";
import {
  VOICE_OPTIONS, SPEECH_RATE_OPTIONS, STT_LANG_OPTIONS, voiceSupported, speakLong, stopSpeaking, listen, learnSttLang,
  prepareVoicePlayback, type ListenHandle,
} from "@/lib/voice";
import { mergeTranscriptSegments } from "@/lib/transcript";

const QUICKS = [
  "What should I study today?",
  "I'm behind — replan",
  "Explain my weakest topic in detail",
  "How am I doing?",
  "Give me 5 practice questions",
  "Start timer",
  "हिंदी में समझाओ",
  "Explain in simple words",
];

/** Below this confidence the transcript waits for review instead of
 *  auto-sending — no more gibberish being fired off as a message. */
const AUTO_SEND_CONFIDENCE = 0.72;

export default function ChatPanel({
  open, setOpen, messages, onSend, thinking, provider, learner, speechHints = [],
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
  const voiceReplyArmed = useRef(false); // speak the next reply only after mic input
  const [voiceId, setVoiceId] = useState("f1");
  const [sttLang, setSttLang] = useState("en-IN");
  const [speechRate, setSpeechRate] = useState(1.15);
  const [listening, setListening] = useState(false);
  const [micWaking, setMicWaking] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [voiceHint, setVoiceHint] = useState(""); // "review what I heard" prompt
  const [speakProgress, setSpeakProgress] = useState<{ done: number; total: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const lastSpokenId = useRef<number>(0);
  const openRef = useRef(open);
  const listenSession = useRef(0); // invalidates a pending mic start on cancel/close
  const submitLock = useRef(false); // closes the double-tap window before React rerenders
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { if (!thinking) submitLock.current = false; }, [thinking]);
  const support = typeof window !== "undefined" ? voiceSupported() : { stt: false, tts: false };

  // Voice profile IDs and STT language map to fixed user preferences.
  useEffect(() => {
    const saved = localStorage.getItem("shigun-voice-id");
    const timer = window.setTimeout(() => {
      if (saved && VOICE_OPTIONS.some((voice) => voice.id === saved)) setVoiceId(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { localStorage.setItem("shigun-voice-id", voiceId); }, [voiceId]);

  useEffect(() => {
    const saved = localStorage.getItem("shigun-stt-lang");
    const timer = window.setTimeout(() => {
      if (saved && STT_LANG_OPTIONS.some((opt) => opt.id === saved || opt.bcp === saved)) {
        const matched = STT_LANG_OPTIONS.find((opt) => opt.id === saved || opt.bcp === saved);
        if (matched) setSttLang(matched.id);
      } else {
        setSttLang("en-IN");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { localStorage.setItem("shigun-stt-lang", sttLang); }, [sttLang]);

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

  // Seamless voice: if the user SPOKE their message, Shigun speaks back —
  // the FULL answer, chunk by chunk for long lessons.
  useEffect(() => {
    if (!voiceReplyArmed.current || !support.tts) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant" && last.id !== lastSpokenId.current && last.id > 0) {
      lastSpokenId.current = last.id;
      voiceReplyArmed.current = false;
      speakReply(last.content);
    }
  }, [messages, speakReply, support.tts]);

  // Stop everything when the panel closes
  useEffect(() => {
    if (open) return;
    listenSession.current++; // cancel any in-flight mic warm-up
    stopSpeaking(); listenRef.current?.stop(); listenRef.current = null;
    const timer = window.setTimeout(() => {
      if (!openRef.current) { setListening(false); setSpeaking(false); setVoicePreparing(false); setMicWaking(false); setSpeakProgress(null); setVoiceNotice(""); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const dispatch = (message: string, fromVoice = false): boolean => {
    const msg = message.trim();
    if (!msg || thinking || submitLock.current) return false;
    submitLock.current = true;
    // Always tell the tutor which voice is selected so its grammar (gender,
    // verb agreement) matches the voice that will speak the reply.
    onSend(msg, { voice: fromVoice, voiceId });
    return true;
  };

  const send = (q?: string) => {
    const msg = (q ?? text).trim();
    if (!dispatch(msg, q === undefined && voiceReplyArmed.current)) return;
    setText("");
    setVoiceHint("");
  };

  const forceEnglishStt = () => {
    setSttLang("en-IN");
    localStorage.setItem("shigun-stt-lang", "en-IN");
    setText("");
    setVoiceErr("");
    setVoiceNotice("Microphone input switched to English.");
    if (listening || micWaking) {
      listenRef.current?.stop();
      listenRef.current = null;
      setListening(false);
      setMicWaking(false);
      window.setTimeout(() => {
        void toggleListen();
      }, 120);
    }
  };

  const toggleListen = async () => {
    setVoiceErr("");
    setVoiceNotice("");
    // While Shigun is speaking, the mic button doubles as STOP — one tap
    // silences the answer instead of hunting for a control.
    if (speaking || voicePreparing) {
      stopSpeaking();
      setSpeaking(false);
      setVoicePreparing(false);
      setSpeakProgress(null);
      return;
    }
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
    stopSpeaking(); setSpeaking(false); setVoicePreparing(false);
    const token = ++listenSession.current;
    setMicWaking(true);            // instant feedback — button pulses immediately
    setVoiceHint("");
    const isCurrent = () => token === listenSession.current && openRef.current;

    const activeBcp = STT_LANG_OPTIONS.find((opt) => opt.id === sttLang)?.bcp || "en-IN";

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
          if (dispatch(final.text, true)) setText("");
        } else {
          // unsure — show the transcript for a quick review instead of
          // sending a wrong message
          voiceReplyArmed.current = true;
          setVoiceHint(final.confidence > 0
            ? `I heard you (${Math.round(final.confidence * 100)}% sure) — check the text, then send or edit.`
            : "I heard you — check the text, then send or edit.");
        }
      },
      (err) => {
        if (!isCurrent()) return;
        setListening(false); setMicWaking(false); listenRef.current = null; setVoiceErr(err);
      },
      { lang: activeBcp, hints: speechHints }
    );
    if (!isCurrent()) { h?.stop(); return; }
    if (h) { listenRef.current = h; setMicWaking(false); setListening(true); }
    else setMicWaking(false);
  };

  const selectedVoiceName = VOICE_OPTIONS.find((voice) => voice.id === voiceId)?.label.split(" · ")[0] || "Shigun";
  const selectedSttLabel = STT_LANG_OPTIONS.find((opt) => opt.id === sttLang)?.label || "English (IN)";

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(!open)} aria-label="AI tutor">
        {open ? <IconClose size={20} /> : <IconChat />}
      </button>

      {open && <button className="ai-scrim" aria-label="Close Shigun" onClick={() => setOpen(false)} />}
      {open && (
        <div
          className={`ai-panel glass-panel${thinking ? " is-thinking" : ""}${listening || micWaking ? " is-listening" : ""}${voicePreparing ? " is-preparing" : ""}${speaking ? " is-speaking" : ""}`}
          role="dialog" aria-modal="true" aria-label="SHIGUN AI tutor chat"
        >
          <div className="ai-sheet-handle" aria-hidden="true" />
          <div className="ai-head">
            <div className="ai-head-main">
              <div className="brand-logo-icon ai-avatar"><IconSpark size={16} /></div>
              <div className="ai-identity">
                <div className="ai-title">Shigun <span>AI Tutor</span></div>
                <div className="ai-status">
                  {micWaking ? "Preparing microphone"
                    : listening ? `Listening in ${selectedSttLabel}`
                    : voicePreparing ? `Preparing ${selectedVoiceName}…`
                    : speaking
                      ? `${selectedVoiceName} speaking${speakProgress ? ` · part ${speakProgress.done}/${speakProgress.total}` : ""}`
                      : thinking ? "Working on your answer"
                      : provider ? `${provider} configured · local fallback ready` : "Local tutor ready"}
                </div>
              </div>
              <button className="ai-close" aria-label="Close chat" onClick={() => setOpen(false)}><IconClose size={17} /></button>
            </div>

            <div className="ai-toolbar">
              <div className="ai-toolbar-group" title="Speech Input Language">
                <span className="ai-toolbar-label">Input</span>
                <select
                  className="voice-select stt-select"
                  value={sttLang}
                  onChange={(e) => setSttLang(e.target.value)}
                  aria-label="Speech recognition input language"
                >
                  {STT_LANG_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {support.tts && (
                <>
                  <div className="ai-toolbar-group" title="Shigun Voice Persona">
                    <span className="ai-toolbar-label">Voice</span>
                    <select
                      className="voice-select"
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      aria-label="Shigun voice (female or male)"
                    >
                      {VOICE_OPTIONS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.id === "device" ? v.label : `${v.label} ${v.gender === "male" ? "♂" : "♀"}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="ai-toolbar-group" title="Spoken Speed">
                    <select
                      className="voice-select voice-speed-select"
                      value={speechRate}
                      onChange={(e) => setSpeechRate(Number(e.target.value))}
                      aria-label="Spoken answer speed"
                    >
                      {SPEECH_RATE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

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
                    title={speaking || voicePreparing ? "Stop spoken reply" : "Read the latest reply aloud"}
                  >
                    <IconVolume size={14} />
                  </button>
                </>
              )}
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
                <p className="companion-hint">Ask me anything, give a command, or tap the mic and talk to me in English or your language.</p>
              </div>
            )}
            {!messages.length && !learner && (
              <div className="ai-msg bot">
                Hi! I&apos;m Shigun. Ask me anything about your studies, or tap the mic and talk to me.
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
                  <span className="thinking-label">Thinking through your plan</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {(listening || micWaking) && (
            <div className="voice-live" role="status">
              <span className="voice-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <span className="voice-live-text">
                <strong>{micWaking ? "Preparing mic" : "Listening"}</strong>
                {text ? ` · ${text}` : ` · Listening in ${selectedSttLabel}`}
              </span>
              {sttLang !== "en-IN" && (
                <button type="button" className="voice-switch-btn" onClick={forceEnglishStt} title="Switch to English microphone mode">
                  🇬🇧 English
                </button>
              )}
              <button type="button" className="voice-finish-btn" onClick={() => void toggleListen()}>Finish</button>
            </div>
          )}
          {voiceErr && <div className="voice-err" role="alert">{voiceErr}</div>}
          {voiceNotice && <div className="voice-note" role="status">{voiceNotice}</div>}
          {voiceHint && <div className="voice-hint">{voiceHint}</div>}

          <div className="ai-quick">
            <span className="ai-quick-label">Try</span>
            {QUICKS.map((q) => <button key={q} onClick={() => send(q)} disabled={thinking}>{q}</button>)}
          </div>

          <div className="ai-input-row">
            {support.stt && (
              <button
                className={`voice-btn${listening || micWaking ? " listening" : ""}${voicePreparing ? " preparing" : ""}${speaking ? " speaking" : ""}`}
                onClick={() => void toggleListen()}
                disabled={thinking}
                aria-label={listening || micWaking ? "Stop listening" : speaking || voicePreparing ? "Stop the voice" : "Speak to Shigun"}
                title={listening || micWaking ? "Stop listening" : speaking || voicePreparing ? "Stop the voice" : `Speak to Shigun — input set to ${selectedSttLabel}`}
              >
                {speaking || voicePreparing
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" /></svg>
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" />
                    </svg>}
              </button>
            )}
            <input
              className="input-field ai-chat-input"
              placeholder={listening || micWaking ? `Listening in ${selectedSttLabel}…` : "Message Shigun…"}
              value={text}
              aria-label="Message Shigun"
              onChange={(e) => { setText(e.target.value); if (voiceHint) setVoiceHint(""); }}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="btn btn-primary ai-send" aria-label="Send message" onClick={() => send()} disabled={thinking || !text.trim()}><IconSend /></button>
          </div>
        </div>
      )}
    </>
  );
}
