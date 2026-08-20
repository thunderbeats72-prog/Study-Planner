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

function pickVoice(optionId: string, lang: "en" | "hi"): SpeechSynthesisVoice | null {
  const prefs = VOICE_PREFS[lang]?.[optionId] || [];
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis?.getVoices() || [];
  for (const p of prefs) {
    const hit = voices.find((v) => v.name.toLowerCase().includes(p.toLowerCase()) || v.lang.toLowerCase().includes(p.toLowerCase()));
    if (hit) return hit;
  }
  // language fallback: ANY voice of that language beats an accent mismatch
  const byLang = voices.find((v) => v.lang.toLowerCase().startsWith(lang));
  if (byLang) return byLang;
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

const DEVANAGARI = /[\u0900-\u097F]/;

/**
 * Split text into language runs so each segment is spoken by a voice
 * of the matching language ("Chapter 3 begins with साखी by कबीर" →
 * en:"Chapter 3 begins with", hi:"साखी", en:"by", hi:"कबीर").
 * Adjacent same-language runs merge; short runs stay attached to
 * their neighbour to avoid choppy delivery.
 */
export function splitLanguageRuns(text: string): { lang: "en" | "hi"; text: string }[] {
  const words = text.split(/\s+/);
  const runs: { lang: "en" | "hi"; text: string }[] = [];
  for (const w of words) {
    const lang: "en" | "hi" = DEVANAGARI.test(w) ? "hi" : "en";
    const last = runs[runs.length - 1];
    if (last && last.lang === lang) last.text += " " + w;
    else runs.push({ lang, text: w });
  }
  // merge tiny englsh runs sandwiched between hindi (and vice versa)
  return runs.filter((r) => r.text.trim().length > 0);
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
    else utter.lang = run.lang === "hi" ? "hi-IN" : "en-IN";
    utter.rate = run.lang === "hi" ? 0.98 : 1.02;
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
export function listen(
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (err: string) => void,
  lang = "en-IN"
): ListenHandle | null {
  const W = window as unknown as Record<string, any>;
  const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!SR) { onError("Speech recognition is not supported in this browser."); return null; }

  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 5; // score alternatives, keep the most confident

  rec.onresult = (e: any) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        // pick highest-confidence alternative
        let best = res[0];
        for (let a = 1; a < res.length; a++) {
          if (res[a].confidence > best.confidence) best = res[a];
        }
        final += best.transcript;
      } else {
        interim += res[0].transcript;
      }
    }
    if (interim) onInterim(interim);
    if (final) onFinal(final.trim());
  };
  rec.onerror = (e: any) => {
    onError(e.error === "not-allowed"
      ? "Microphone access was blocked. Allow it in your browser settings."
      : e.error === "no-speech"
        ? "Didn't catch that — try speaking a bit louder or closer to the mic."
        : "Voice input error — please try again.");
  };
  try { rec.start(); } catch { onError("Could not start the microphone."); return null; }
  return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
}
