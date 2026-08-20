"use client";

// ============================================================
//  SHIGUN VOICE — browser-native voice conversation layer.
//  Speech-to-text via the Web Speech API (SpeechRecognition) and
//  text-to-speech via SpeechSynthesis. Zero external services,
//  works offline for TTS on most devices.
//
//  Voice options: two female + one male, chosen from the device's
//  installed voices with a quality-ranked preference list.
// ============================================================

export type VoiceOption = { id: string; label: string; gender: "female" | "male" };

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "f1", label: "Asha (Female)", gender: "female" },
  { id: "f2", label: "Meera (Female)", gender: "female" },
  { id: "m1", label: "Arjun (Male)", gender: "male" },
];

/** Quality-ranked name fragments per option (device-dependent). */
const VOICE_PREFS: Record<string, string[]> = {
  f1: ["Google UK English Female", "Microsoft Sonia", "Samantha", "Google हिन्दी", "female"],
  f2: ["Google US English", "Microsoft Aria", "Victoria", "Karen", "female"],
  m1: ["Google UK English Male", "Microsoft Ryan", "Daniel", "Alex", "male"],
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
    // Safety timeout — some browsers never fire the event
    setTimeout(() => resolve(window.speechSynthesis?.getVoices() || []), 1500);
  });
}

function pickVoice(optionId: string): SpeechSynthesisVoice | null {
  const prefs = VOICE_PREFS[optionId] || [];
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis?.getVoices() || [];
  for (const p of prefs) {
    const hit = voices.find((v) => v.name.toLowerCase().includes(p.toLowerCase()));
    if (hit) return hit;
  }
  // fallback: any English voice
  return voices.find((v) => v.lang.startsWith("en")) || voices[0] || null;
}

export function voiceSupported(): { stt: boolean; tts: boolean } {
  if (typeof window === "undefined") return { stt: false, tts: false };
  const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return { stt: !!SR, tts: "speechSynthesis" in window };
}

/** Strip markdown so TTS reads clean prose. */
function cleanForSpeech(md: string): string {
  return md
    .replace(/\[\[action:[^\]]*\]\]/g, "")
    .replace(/[*_#`>]+/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600); // keep spoken replies conversational-length
}

export async function speak(
  text: string,
  voiceId: string,
  onEnd?: () => void
): Promise<void> {
  if (!("speechSynthesis" in window)) { onEnd?.(); return; }
  await loadVoices();
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(cleanForSpeech(text));
  const v = pickVoice(voiceId);
  if (v) utter.voice = v;
  utter.rate = 1.02;
  utter.pitch = voiceId === "m1" ? 0.95 : 1.05;
  utter.onend = () => onEnd?.();
  utter.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utter);
}

export function stopSpeaking(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export type ListenHandle = { stop: () => void };

/**
 * Start listening; resolves interim + final transcripts via callbacks.
 * Auto-stops on final result or silence.
 */
export function listen(
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (err: string) => void
): ListenHandle | null {
  const W = window as unknown as Record<string, any>;
  const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!SR) { onError("Speech recognition is not supported in this browser."); return null; }

  const rec = new SR();
  rec.lang = "en-IN";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e: any) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    if (interim) onInterim(interim);
    if (final) onFinal(final.trim());
  };
  rec.onerror = (e: any) => {
    onError(e.error === "not-allowed"
      ? "Microphone access was blocked. Allow it in your browser settings."
      : e.error === "no-speech"
        ? "Didn't catch that — try again."
        : "Voice input error.");
  };
  try { rec.start(); } catch { onError("Could not start the microphone."); return null; }
  return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
}
