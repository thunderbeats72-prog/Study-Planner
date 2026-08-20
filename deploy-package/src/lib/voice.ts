"use client";

// ============================================================
//  SHIGUN VOICE — browser-native voice conversation layer.
//  STT via the Web Speech API, TTS via SpeechSynthesis.
//
//  v3 improvements (reliability + accuracy):
//  - MIC PRE-WARM: getUserMedia() is requested once before the first
//    recognition so the permission prompt (and its race condition) is
//    resolved before SpeechRecognition starts. This fixes the classic
//    "first tap does nothing / not-allowed on first try" failure.
//  - WATCHDOG: if the engine never fires `onstart` (mobile quirk),
//    recognition restarts once automatically.
//  - RETRY on not-allowed: some browsers reject the very first start
//    while the permission prompt settles; we retry once.
//  - CONFIDENCE: finals are scored by confidence (max-alternative per
//    segment + average), and the UI can decide whether to auto-send
//    or let the user review a low-confidence transcript.
//  - Single active recognition guard: starting a new listen() always
//    stops any previous one — no overlapping engines.
// ============================================================

export type VoiceOption = { id: string; label: string; gender: "female" | "male" };

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "f1", label: "Female Voice 1", gender: "female" },
  { id: "f2", label: "Female Voice 2", gender: "female" },
  { id: "m1", label: "Male Voice", gender: "male" },
];

/** Supported reply languages: script ranges + BCP-47 + voice prefs. */
export const LANGS: { code: string; bcp: string; range: RegExp }[] = [
  { code: "hi", bcp: "hi-IN", range: /[\u0900-\u097F]/ },  // Devanagari (Hindi/Marathi share)
  { code: "bn", bcp: "bn-IN", range: /[\u0980-\u09FF]/ },  // Bengali
  { code: "ta", bcp: "ta-IN", range: /[\u0B80-\u0BFF]/ },  // Tamil
  { code: "te", bcp: "te-IN", range: /[\u0C00-\u0C7F]/ },  // Telugu
  { code: "kn", bcp: "kn-IN", range: /[\u0C80-\u0CFF]/ },  // Kannada
  { code: "gu", bcp: "gu-IN", range: /[\u0A80-\u0AFF]/ },  // Gujarati
  { code: "pa", bcp: "pa-IN", range: /[\u0A00-\u0A7F]/ },  // Gurmukhi (Punjabi)
  { code: "ar", bcp: "ar-SA", range: /[\u0600-\u06FF]/ },  // Arabic
];

/** Quality-ranked name fragments per option, per language family. */
const VOICE_PREFS: Record<string, Record<string, string[]>> = {
  en: {
    f1: ["Google UK English Female", "Microsoft Sonia", "Samantha", "female"],
    f2: ["Google US English", "Microsoft Aria", "Victoria", "Karen", "female"],
    m1: ["Google UK English Male", "Microsoft Ryan", "Daniel", "Alex", "male"],
  },
  hi: {
    f1: ["Google हिन्दी", "Microsoft Swara", "Lekha", "hi-IN"],
    f2: ["Microsoft Kalpana", "Google हिन्दी", "hi-IN"],
    m1: ["Microsoft Hemant", "Google हिन्दी", "hi-IN"],
  },
};

let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const have = window.speechSynthesis?.getVoices() || [];
    if (have.length) { cachedVoices = have; resolve(have); return; }
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
    setTimeout(() => resolve(window.speechSynthesis?.getVoices() || []), 1500);
  });
}

function pickVoice(optionId: string, lang: string): SpeechSynthesisVoice | null {
  const prefs = VOICE_PREFS[lang]?.[optionId] || [];
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis?.getVoices() || [];
  for (const p of prefs) {
    const hit = voices.find((v) => v.name.toLowerCase().includes(p.toLowerCase()) || v.lang.toLowerCase().includes(p.toLowerCase()));
    if (hit) return hit;
  }
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  if (langVoices.length) {
    const wantFemale = optionId !== "m1";
    const genderHit = langVoices.find((v) =>
      wantFemale ? /female|woman|swara|kalpana|lekha|heera/i.test(v.name) : /male|man|hemant|ravi/i.test(v.name));
    return genderHit || langVoices[0];
  }
  if (lang !== "en") return null;
  return voices.find((v) => v.lang.startsWith("en")) || voices[0] || null;
}

export function voiceSupported(): { stt: boolean; tts: boolean } {
  if (typeof window === "undefined") return { stt: false, tts: false };
  const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return { stt: !!SR, tts: "speechSynthesis" in window };
}

function cleanForSpeech(md: string): string {
  return md
    .replace(/\[\[action:[^\]]*\]\]/g, "")
    .replace(/[*_#`>]+/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

/** Detect the language of a word by script range; Latin defaults to en. */
function wordLang(w: string): string {
  for (const l of LANGS) if (l.range.test(w)) return l.code;
  return "en";
}

/**
 * Split text into language runs so each segment is spoken by a voice
 * of the matching language. Works across all supported scripts.
 */
export function splitLanguageRuns(text: string): { lang: string; text: string }[] {
  const words = text.split(/\s+/);
  const runs: { lang: string; text: string }[] = [];
  for (const w of words) {
    const lang = wordLang(w);
    const last = runs[runs.length - 1];
    if (last && last.lang === lang) last.text += " " + w;
    else runs.push({ lang, text: w });
  }
  return runs.filter((r) => r.text.trim().length > 0);
}

/** BCP-47 tag for a language code. */
function bcpFor(code: string): string {
  return LANGS.find((l) => l.code === code)?.bcp || "en-IN";
}

export async function speak(
  text: string,
  voiceId: string,
  onEnd?: () => void
): Promise<void> {
  if (!("speechSynthesis" in window)) { onEnd?.(); return; }
  await loadVoices();
  window.speechSynthesis.cancel();

  const runs = splitLanguageRuns(cleanForSpeech(text));
  if (!runs.length) { onEnd?.(); return; }

  let idx = 0;
  const speakNext = () => {
    if (idx >= runs.length) { onEnd?.(); return; }
    const run = runs[idx++];
    const utter = new SpeechSynthesisUtterance(run.text);
    const v = pickVoice(voiceId, run.lang);
    if (v) { utter.voice = v; utter.lang = v.lang; }
    else utter.lang = bcpFor(run.lang);
    const profile = voiceId === "m1"
      ? { rate: 0.97, pitch: 0.78 }   // Male: deeper, measured
      : voiceId === "f2"
        ? { rate: 1.08, pitch: 1.12 } // Female 2: brighter, quicker
        : { rate: 1.0, pitch: 1.0 };  // Female 1: natural baseline
    utter.rate = profile.rate * (run.lang === "en" ? 1.02 : 0.96);
    utter.pitch = profile.pitch;
    utter.onend = speakNext;
    utter.onerror = speakNext;
    window.speechSynthesis.speak(utter);
  };
  speakNext();
}

export function stopSpeaking(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/* ============================================================
   LISTENING (STT)
============================================================ */

export type ListenHandle = { stop: () => void };
export type ListenFinal = { text: string; confidence: number };

const LAST_LANG_KEY = "shigun-stt-lang";

/** Persisted auto-detected speaking language (defaults to en-IN). */
export function preferredSttLang(): string {
  if (typeof window === "undefined") return "en-IN";
  return localStorage.getItem(LAST_LANG_KEY) || "en-IN";
}

/** Update the preference from a transcript's dominant script. */
export function learnSttLang(transcript: string): void {
  for (const l of LANGS) {
    if (l.range.test(transcript)) {
      localStorage.setItem(LAST_LANG_KEY, l.bcp);
      return;
    }
  }
  localStorage.setItem(LAST_LANG_KEY, "en-IN");
}

/* ── Mic pre-warm ─────────────────────────────────────────────
   The #1 cause of "first tap does nothing" is the permission prompt
   racing SpeechRecognition.start(). Requesting a throwaway audio
   stream first settles the permission, so recognition starts with
   the mic already authorized. Safe on every browser: if it fails or
   is unavailable we simply proceed — recognition still works when
   permission is already granted. */
let micWarmed = false;
export async function warmMic(): Promise<void> {
  if (micWarmed) return;
  try {
    const md = navigator.mediaDevices;
    if (md && typeof md.getUserMedia === "function") {
      const stream = await md.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      micWarmed = true;
    } else {
      micWarmed = true; // nothing to warm — don't retry forever
    }
  } catch {
    /* blocked/unavailable — let recognition surface its own error */
  }
}

// One active recognition at a time, app-wide.
let activeRec: { stop: () => void } | null = null;

/**
 * Start listening. Returns a handle immediately (before the engine
 * has actually started, so the UI can show "listening" instantly).
 *
 * - interim text streams to onInterim
 * - the final transcript + average confidence go to onFinal
 * - failures go to onError with a human message
 */
export async function listen(
  onInterim: (text: string) => void,
  onFinal: (final: ListenFinal) => void,
  onError: (err: string) => void,
  lang = preferredSttLang()
): Promise<ListenHandle | null> {
  const W = window as unknown as Record<string, any>;
  const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!SR) { onError("Speech recognition is not supported in this browser."); return null; }

  await warmMic();
  // Stop any previous session (user hammered the mic button, etc.)
  if (activeRec) { try { activeRec.stop(); } catch { /* noop */ } activeRec = null; }

  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 3;

  const SILENCE_MS = 1800;
  let collected = "";          // joined final segments
  let lastInterim = "";        // freshest interim text (mobile fallback)
  let confSum = 0;
  let confCount = 0;
  let restarts = 0;            // engine self-end restarts (Android quirk)
  let started = false;         // engine confirmed start
  let finished = false;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const startedAt = Date.now();

  const clearTimers = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (watchdog) clearTimeout(watchdog);
    silenceTimer = null; watchdog = null;
  };

  const confidence = () => (confCount ? Math.round((confSum / confCount) * 100) / 100 : 0);

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimers();
    activeRec = null; // release the single-active guard
    try { rec.stop(); } catch { /* noop */ }
    const text = (collected.trim() || lastInterim.trim()).replace(/\s+/g, " ").trim();
    if (text) {
      learnSttLang(text);
      onFinal({ text, confidence: confidence() });
    }
  };

  const armSilence = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(finish, SILENCE_MS);
  };

  rec.onstart = () => {
    started = true;
    if (watchdog) clearTimeout(watchdog);
  };

  rec.onresult = (e: any) => {
    // Rebuild the COMPLETE transcript from scratch each event.
    // (Android re-reports results cumulatively; incremental appends
    // duplicated segments — the "change change change" bug.)
    let finals = "";
    let interim = "";
    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        let best = res[0];
        for (let a = 1; a < res.length; a++) {
          if ((res[a].confidence ?? 0) > (best.confidence ?? 0)) best = res[a];
        }
        const t = best.transcript.trim();
        finals += (finals && t ? " " : "") + t;
        if (typeof best.confidence === "number" && best.confidence > 0) {
          confSum += best.confidence; confCount++;
        }
      } else if (res[0]?.transcript) {
        interim += res[0].transcript;
      }
    }
    collected = finals;
    const full = (finals + (finals && interim ? " " : "") + interim).trim();
    if (full) lastInterim = full;
    onInterim(full);
    armSilence(); // any speech activity extends the window
  };

  rec.onspeechend = () => armSilence();

  rec.onend = () => {
    // Android quirk: engine can self-end almost immediately, before the
    // user has spoken. Restart silently (up to twice) instead of
    // returning an empty result — this is the "2nd/3rd tap needed" bug.
    if (!finished && !started && restarts < 2 && Date.now() - startedAt < 4000) {
      restarts++;
      armSilence();
      try { rec.start(); return; } catch { /* fall through */ }
    }
    if (!finished) finish(); // engine gave up — deliver whatever we heard
  };

  rec.onerror = (e: any) => {
    if (finished) return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      // Permission prompt may still be settling on the very first tap —
      // one silent retry almost always succeeds.
      if (restarts < 2) {
        restarts++;
        setTimeout(() => {
          if (!finished) { try { rec.start(); } catch { /* noop */ } }
        }, 350);
        return;
      }
      onError("Microphone access was blocked. Allow it in your browser settings.");
    } else if (e.error === "no-speech") {
      if (restarts < 2) {
        restarts++;
        setTimeout(() => {
          if (!finished) { try { rec.start(); } catch { /* noop */ } }
        }, 300);
        return;
      }
      onError("Didn't catch that — tap the mic, wait for the pulse, then speak closer to the phone.");
    } else if (e.error === "aborted") {
      /* user stopped / superseded — silence, finish below */
      if (!finished) finish();
    } else if (e.error === "network") {
      onError("Voice needs a network connection — check your internet and try again.");
    } else {
      onError("Voice input error — please try again.");
    }
  };

  // Watchdog: if the engine never confirms start and hears nothing,
  // bounce it once instead of hanging forever.
  watchdog = setTimeout(() => {
    if (!finished && !started && restarts < 2) {
      restarts++;
      try { rec.start(); } catch { /* noop */ }
    }
  }, 1800);

  try {
    rec.start();
  } catch {
    // start() throws when the engine is mid-transition (mobile).
    // One immediate retry after the transition window.
    if (restarts < 1) {
      restarts++;
      setTimeout(() => {
        if (!finished) { try { rec.start(); } catch { /* noop */ } }
      }, 250);
    } else {
      onError("Could not start the microphone. Tap the mic once more.");
      return null;
    }
  }

  const handle: ListenHandle = { stop: finish };
  activeRec = handle;
  return handle;
}
