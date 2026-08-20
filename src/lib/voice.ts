"use client";

// ============================================================
//  SHIGUN VOICE — browser-native voice conversation layer.
//  STT via the Web Speech API, TTS via SpeechSynthesis.
//
//  v2 improvements:
//  - Language-aware TTS: replies containing Devanagari (or other
//    scripts) are spoken by a matching-language voice, so Hindi is
//    read with a Hindi voice, not an English accent.
//  - Mixed-language replies are split into script runs and each run
//    is spoken with the right voice.
//  - STT quality: multi-alternative scoring picks the transcript
//    with the highest confidence; longer silence tolerance.
//  - Generic voice labels (no human names).
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
  // NATIVE-ACCENT RULE: any voice of the target language beats an
  // accent mismatch. Prefer gender match within the language when
  // discernible from common voice-name conventions.
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  if (langVoices.length) {
    const wantFemale = optionId !== "m1";
    const genderHit = langVoices.find((v) =>
      wantFemale ? /female|woman|swara|kalpana|lekha|heera/i.test(v.name) : /male|man|hemant|ravi/i.test(v.name));
    return genderHit || langVoices[0];
  }
  // NON-ENGLISH run with no matching voice installed: return null and
  // let the utterance carry lang (e.g. hi-IN) — the OS speech engine
  // then uses its own native-language synthesis instead of an English
  // voice mangling the pronunciation.
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
    utter.rate = run.lang === "en" ? 1.02 : 0.98;
    utter.pitch = voiceId === "m1" ? 0.95 : 1.05;
    utter.onend = speakNext;
    utter.onerror = speakNext;
    window.speechSynthesis.speak(utter);
  };
  speakNext();
}

export function stopSpeaking(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export type ListenHandle = { stop: () => void };

/**
 * Start listening with quality options: multiple alternatives scored
 * by confidence, and auto language detection between English and
 * Hindi where the engine supports it.
 */
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
  // Latin transcript: keep en-IN (handles Hinglish naturally)
  localStorage.setItem(LAST_LANG_KEY, "en-IN");
}

export function listen(
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (err: string) => void,
  lang = preferredSttLang()
): ListenHandle | null {
  const W = window as unknown as Record<string, any>;
  const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!SR) { onError("Speech recognition is not supported in this browser."); return null; }

  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  // PATIENT LISTENING: continuous mode + our own silence window. The
  // engine no longer finalizes at the first brief pause — we accumulate
  // segments and only finish after ~1.8s of true silence (or stop()).
  rec.continuous = true;
  rec.maxAlternatives = 5;

  const SILENCE_MS = 1800;
  let collected = "";
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (silenceTimer) clearTimeout(silenceTimer);
    try { rec.stop(); } catch { /* noop */ }
    const text = collected.trim();
    if (text) onFinal(text);
  };
  const armSilence = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(finish, SILENCE_MS);
  };

  rec.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        let best = res[0];
        for (let a = 1; a < res.length; a++) {
          if (res[a].confidence > best.confidence) best = res[a];
        }
        collected += (collected ? " " : "") + best.transcript.trim();
      } else {
        interim += res[0].transcript;
      }
    }
    onInterim((collected + " " + interim).trim());
    armSilence(); // any speech activity extends the window
  };
  rec.onspeechend = () => armSilence();
  rec.onend = () => finish(); // engine gave up (e.g. hard timeout) — use what we have
  rec.onerror = (e: any) => {
    onError(e.error === "not-allowed"
      ? "Microphone access was blocked. Allow it in your browser settings."
      : e.error === "no-speech"
        ? "Didn't catch that — try speaking a bit louder or closer to the mic."
        : "Voice input error — please try again.");
  };
  try { rec.start(); armSilence(); } catch { onError("Could not start the microphone."); return null; }
  return { stop: finish };
}
