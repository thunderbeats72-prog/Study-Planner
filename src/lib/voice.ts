"use client";

import { mergeTranscriptSegments } from "./transcript";

// ============================================================
// SHIGUN VOICE
// - Recognition is single-utterance and overlap-deduplicated, which avoids
//   cumulative WebKit/Android results being appended more than once.
// - Replies use a pinned server voice (deterministic Chirp 3 HD when
//   configured, otherwise one pinned Gemini model). Named profiles never
//   switch silently to an unrelated operating-system voice.
// - Every listen/playback has a generation token. Late mobile callbacks from
//   a cancelled session cannot restart audio or submit an old transcript.
// ============================================================

export type VoiceOption = { id: string; label: string; gender: "female" | "male" };

export const VOICE_OPTIONS: VoiceOption[] = [
  // Labels stay short: they render inside the fixed-width chat header select
  // on phones, where long labels get clipped at larger system font sizes.
  { id: "f1", label: "Kore", gender: "female" },
  { id: "f2", label: "Aoede", gender: "female" },
  { id: "m1", label: "Charon", gender: "male" },
  { id: "device", label: "Device", gender: "female" },
];

/** Supported recognition languages: script ranges + BCP-47 tags. */
export const LANGS: { code: string; bcp: string; range: RegExp }[] = [
  { code: "hi", bcp: "hi-IN", range: /[\u0900-\u097F]/ },
  { code: "bn", bcp: "bn-IN", range: /[\u0980-\u09FF]/ },
  { code: "ta", bcp: "ta-IN", range: /[\u0B80-\u0BFF]/ },
  { code: "te", bcp: "te-IN", range: /[\u0C00-\u0C7F]/ },
  { code: "kn", bcp: "kn-IN", range: /[\u0C80-\u0CFF]/ },
  { code: "gu", bcp: "gu-IN", range: /[\u0A80-\u0AFF]/ },
  { code: "pa", bcp: "pa-IN", range: /[\u0A00-\u0A7F]/ },
  { code: "ar", bcp: "ar-SA", range: /[\u0600-\u06FF]/ },
];

/** Native fallback preferences. Cloud TTS uses the fixed names above. */
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
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (cachedVoices.length) return Promise.resolve(cachedVoices);
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const synth = window.speechSynthesis;
    const finish = () => {
      const voices = synth?.getVoices() || [];
      if (voices.length) cachedVoices = voices;
      resolve(voices);
    };
    const have = synth?.getVoices() || [];
    if (have.length) {
      cachedVoices = have;
      resolve(have);
      return;
    }
    synth?.addEventListener?.("voiceschanged", finish, { once: true });
    window.setTimeout(finish, 1200);
  }).finally(() => { voicesPromise = null; });
  return voicesPromise!;
}

function pickNativeVoice(optionId: string, lang: string): SpeechSynthesisVoice | null {
  const prefs = VOICE_PREFS[lang]?.[optionId] || [];
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis?.getVoices() || [];
  for (const preference of prefs) {
    const key = preference.toLowerCase();
    const hit = voices.find((voice) =>
      voice.name.toLowerCase().includes(key) || voice.lang.toLowerCase().includes(key));
    if (hit) return hit;
  }
  const languageVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(lang));
  if (languageVoices.length) {
    const wantsFemale = optionId !== "m1";
    const genderMatch = languageVoices.find((voice) => wantsFemale
      ? /female|woman|swara|kalpana|lekha|heera/i.test(voice.name)
      : /male|man|hemant|ravi/i.test(voice.name));
    return genderMatch || languageVoices[0];
  }
  if (lang !== "en") return null;
  return voices.find((voice) => voice.lang.startsWith("en")) || voices[0] || null;
}

export function voiceSupported(): { stt: boolean; tts: boolean } {
  if (typeof window === "undefined") return { stt: false, tts: false };
  const values = window as unknown as Record<string, unknown>;
  const recognition = values.SpeechRecognition || values.webkitSpeechRecognition;
  return { stt: !!recognition, tts: "Audio" in window || "speechSynthesis" in window };
}

function cleanForSpeech(markdown: string): string {
  return markdown
    .replace(/\[\[action:[^\]]*\]\]/g, "")
    .replace(/[*_#`>]+/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function wordLang(word: string): string {
  for (const language of LANGS) if (language.range.test(word)) return language.code;
  return "en";
}

export function splitLanguageRuns(text: string): { lang: string; text: string }[] {
  const words = text.split(/\s+/);
  const runs: { lang: string; text: string }[] = [];
  for (const word of words) {
    const lang = wordLang(word);
    const last = runs[runs.length - 1];
    if (last && last.lang === lang) last.text += ` ${word}`;
    else runs.push({ lang, text: word });
  }
  return runs.filter((run) => run.text.trim().length > 0);
}

function bcpFor(code: string): string {
  return LANGS.find((language) => language.code === code)?.bcp || "en-IN";
}

/* ============================================================
   PLAYBACK — fixed cloud voice, guarded native fallback
============================================================ */

type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let speechGeneration = 0;
let speechAbort: AbortController | null = null;
let audioContext: AudioContext | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl = "";
type ClientAudioCache = { bytes: ArrayBuffer; contentType: string };
const clientAudioCache = new Map<string, ClientAudioCache>();
const MAX_CLIENT_AUDIO_CACHE = 8;

export type SpeakCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

/** Call from the mic's user gesture so iOS authorises later audio playback. */
export async function prepareVoicePlayback(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const AudioContextCtor = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!audioContext) audioContext = new AudioContextCtor();
    if (audioContext.state === "suspended") await audioContext.resume();
  } catch {
    // Native SpeechSynthesis remains available as the final fallback.
  }
}

function stopAudioNodes(): void {
  speechAbort?.abort();
  speechAbort = null;
  try { activeSource?.stop(); } catch { /* already stopped */ }
  activeSource = null;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
    activeAudio = null;
  }
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = "";
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

async function playCloudAudio(
  bytes: ArrayBuffer,
  contentType: string,
  generation: number,
  start: () => void,
  finish: () => void
): Promise<boolean> {
  if (generation !== speechGeneration) return true;
  try {
    await prepareVoicePlayback();
    if (audioContext && audioContext.state === "running") {
      const buffer = await audioContext.decodeAudioData(bytes.slice(0));
      if (generation !== speechGeneration) return true;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        if (activeSource === source) activeSource = null;
        if (generation === speechGeneration) finish();
      };
      activeSource = source;
      source.start(0);
      start();
      return true;
    }
  } catch {
    // Fall through to an HTMLAudioElement before using native TTS.
  }

  try {
    const url = URL.createObjectURL(new Blob([bytes], { type: contentType || "audio/wav" }));
    const audio = new Audio(url);
    activeAudio = audio;
    activeObjectUrl = url;
    audio.onended = finish;
    audio.onerror = () => finish();
    await audio.play();
    start();
    return true;
  } catch {
    return false;
  }
}

async function speakNative(
  text: string,
  voiceId: string,
  generation: number,
  start: () => void,
  finish: () => void
): Promise<void> {
  if (!("speechSynthesis" in window) || generation !== speechGeneration) {
    finish();
    return;
  }
  await loadVoices();
  if (generation !== speechGeneration) return;

  const runs = splitLanguageRuns(text);
  let index = 0;
  let playbackStarted = false;
  const speakNext = () => {
    // cancel() fires an error event on several mobile engines. The generation
    // check prevents that stale callback from advancing the old utterance.
    if (generation !== speechGeneration) return;
    if (index >= runs.length) {
      finish();
      return;
    }
    const run = runs[index++];
    const utterance = new SpeechSynthesisUtterance(run.text);
    const voice = pickNativeVoice(voiceId, run.lang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = bcpFor(run.lang);
    }
    const profile = voiceId === "m1"
      ? { rate: 0.97, pitch: 0.78 }
      : voiceId === "f2" ? { rate: 1.08, pitch: 1.12 } : { rate: 1, pitch: 1 };
    utterance.rate = profile.rate * (run.lang === "en" ? 1.02 : 0.96);
    utterance.pitch = profile.pitch;
    utterance.onend = speakNext;
    utterance.onerror = speakNext;
    window.speechSynthesis.speak(utterance);
    if (!playbackStarted) { playbackStarted = true; start(); }
  };
  speakNext();
}

export async function speak(
  markdown: string,
  voiceId: string,
  callbacks: SpeakCallbacks = {}
): Promise<void> {
  const text = cleanForSpeech(markdown);
  const generation = ++speechGeneration;
  stopAudioNodes();
  let ended = false;
  let started = false;
  const start = () => {
    if (started || generation !== speechGeneration) return;
    started = true;
    callbacks.onStart?.();
  };
  const finish = () => {
    if (ended || generation !== speechGeneration) return;
    ended = true;
    callbacks.onEnd?.();
  };
  const fail = (message: string) => {
    if (generation !== speechGeneration) return;
    callbacks.onError?.(message);
    finish();
  };
  if (!text) {
    finish();
    return;
  }

  // A device voice is explicitly opt-in. Named Shigun profiles never fall
  // back silently to SpeechSynthesis, because that is exactly what made Kore
  // sound like a different person between commands and long answers.
  if (voiceId === "device") {
    await speakNative(text, "f1", generation, start, finish);
    return;
  }

  const cacheKey = `${voiceId}\0${text}`;
  const cached = clientAudioCache.get(cacheKey);
  if (cached) {
    clientAudioCache.delete(cacheKey);
    clientAudioCache.set(cacheKey, cached);
    const played = await playCloudAudio(cached.bytes, cached.contentType, generation, start, finish);
    if (!played) fail("Audio playback was blocked. Tap the mic once, then try again.");
    return;
  }

  let errorMessage = "The selected Shigun voice is temporarily unavailable. The answer remains available as text.";
  try {
    const controller = new AbortController();
    speechAbort = controller;
    const response = await fetch("/api/voice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, voiceId }),
      signal: controller.signal,
    });
    if (generation !== speechGeneration) return;
    if (response.ok) {
      const bytes = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "audio/wav";
      clientAudioCache.set(cacheKey, { bytes, contentType });
      while (clientAudioCache.size > MAX_CLIENT_AUDIO_CACHE) {
        const oldest = clientAudioCache.keys().next().value as string | undefined;
        if (!oldest) break;
        clientAudioCache.delete(oldest);
      }
      const played = await playCloudAudio(bytes, contentType, generation, start, finish);
      if (played) return;
      errorMessage = "Audio playback was blocked. Tap the mic once, then try again.";
    } else {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (payload?.error) errorMessage = payload.error;
    }
  } catch {
    if (generation !== speechGeneration) return;
  } finally {
    if (speechAbort?.signal.aborted || generation === speechGeneration) speechAbort = null;
  }

  fail(errorMessage);
}

export function stopSpeaking(): void {
  speechGeneration++;
  if (typeof window !== "undefined") stopAudioNodes();
}

/* ============================================================
   LISTENING (STT)
============================================================ */

export type ListenHandle = { stop: () => void };
export type ListenFinal = {
  text: string;
  confidence: number;
  cancelled?: boolean;
};

const LAST_LANG_KEY = "shigun-stt-lang";

export function preferredSttLang(): string {
  if (typeof window === "undefined") return "en-IN";
  return localStorage.getItem(LAST_LANG_KEY) || "en-IN";
}

export function learnSttLang(transcript: string): void {
  for (const language of LANGS) {
    if (language.range.test(transcript)) {
      localStorage.setItem(LAST_LANG_KEY, language.bcp);
      return;
    }
  }
  localStorage.setItem(LAST_LANG_KEY, "en-IN");
}

let micWarmed = false;
export async function warmMic(): Promise<void> {
  if (micWarmed) return;
  try {
    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices && typeof mediaDevices.getUserMedia === "function") {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    }
    micWarmed = true;
  } catch {
    // Recognition reports a useful permission error below.
  }
}

type ActiveRecognition = { id: number; stop: () => void };
let activeRecognition: ActiveRecognition | null = null;
let recognitionSequence = 0;

export async function listen(
  onInterim: (text: string) => void,
  onFinal: (final: ListenFinal) => void,
  onError: (error: string) => void,
  lang = preferredSttLang()
): Promise<ListenHandle | null> {
  const values = window as unknown as Record<string, any>;
  const SpeechRecognitionCtor = values.SpeechRecognition || values.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    onError("Speech recognition is not supported in this browser.");
    return null;
  }

  await warmMic();
  activeRecognition?.stop();

  const id = ++recognitionSequence;
  const recognition = new SpeechRecognitionCtor();
  recognition.lang = lang;
  recognition.interimResults = true;
  // One mic tap represents one chat message. Continuous mode is the source
  // of cumulative duplicate result batches on Android Chrome/WebView.
  recognition.continuous = false;
  recognition.maxAlternatives = 3;

  let finished = false;
  let started = false;
  let manualStop = false;
  let restartPending = false;
  let restarts = 0;
  let transcript = "";
  let confidenceValue = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (restartTimer) clearTimeout(restartTimer);
    if (watchdog) clearTimeout(watchdog);
    silenceTimer = restartTimer = watchdog = null;
  };

  const release = () => {
    if (activeRecognition?.id === id) activeRecognition = null;
  };

  const finish = (cancelled = false) => {
    if (finished) return;
    finished = true;
    clearTimers();
    release();
    try { recognition.stop(); } catch { /* engine is already idle */ }
    const text = transcript.replace(/\s+/g, " ").trim();
    if (text) learnSttLang(text);
    onFinal({ text, confidence: text ? confidenceValue : 0, cancelled });
  };

  const fail = (message: string) => {
    if (finished) return;
    finished = true;
    clearTimers();
    release();
    try { recognition.abort(); } catch { /* engine is already idle */ }
    onError(message);
  };

  const armSilence = (milliseconds: number) => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => finish(false), milliseconds);
  };

  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (finished || started || restartPending) return;
      if (restarts >= 1) {
        fail("Could not start the microphone. Check browser microphone access and try again.");
        return;
      }
      restarts++;
      restartPending = true;
      try { recognition.abort(); } catch { /* start may not have reached the engine */ }
      restartTimer = setTimeout(() => {
        if (finished) return;
        restartPending = false;
        try { recognition.start(); armWatchdog(); }
        catch { fail("Could not start the microphone. Check browser microphone access and try again."); }
      }, 300);
    }, 1800);
  };

  const retryAfterNoSpeech = (): boolean => {
    if (restarts >= 1 || manualStop) return false;
    restarts++;
    restartPending = true;
    restartTimer = setTimeout(() => {
      if (finished) return;
      restartPending = false;
      started = false;
      try { recognition.start(); armWatchdog(); }
      catch { fail("Could not restart voice input. Tap the mic and try once more."); }
    }, 300);
    return true;
  };

  recognition.onstart = () => {
    if (finished) return;
    started = true;
    if (watchdog) clearTimeout(watchdog);
    // A hard upper bound means mobile can never remain stuck in listening.
    armSilence(10000);
  };

  recognition.onresult = (event: any) => {
    if (finished) return;
    const finalSegments: string[] = [];
    const interimSegments: string[] = [];
    let confidenceSum = 0;
    let confidenceCount = 0;

    // Rebuild from the complete result list on every event. Never append an
    // event payload: Android reports prior results cumulatively.
    for (let index = 0; index < event.results.length; index++) {
      const result = event.results[index];
      if (result.isFinal) {
        let best = result[0];
        for (let alternative = 1; alternative < result.length; alternative++) {
          if ((result[alternative].confidence ?? 0) > (best.confidence ?? 0)) best = result[alternative];
        }
        if (best?.transcript) finalSegments.push(best.transcript);
        if (typeof best?.confidence === "number" && best.confidence > 0) {
          confidenceSum += best.confidence;
          confidenceCount++;
        }
      } else if (result[0]?.transcript) {
        interimSegments.push(result[0].transcript);
      }
    }

    const merged = mergeTranscriptSegments([...finalSegments, ...interimSegments]);
    if (merged) transcript = merged;
    confidenceValue = confidenceCount
      ? Math.round((confidenceSum / confidenceCount) * 100) / 100
      : confidenceValue;
    onInterim(merged);
    armSilence(1600);
  };

  recognition.onspeechend = () => armSilence(900);

  recognition.onend = () => {
    if (finished || restartPending) return;
    if (manualStop) finish(true);
    else finish(false);
  };

  recognition.onerror = (event: any) => {
    if (finished) return;
    const error = String(event.error || "");
    if (error === "aborted") {
      if (restartPending) return;
      finish(manualStop);
    } else if (error === "no-speech") {
      if (!retryAfterNoSpeech()) {
        fail("I didn't hear anything clearly — tap the mic, wait for the pulse, then speak.");
      }
    } else if (error === "not-allowed" || error === "service-not-allowed") {
      fail("Microphone access was blocked. Allow it in your browser settings, then try again.");
    } else if (error === "network") {
      fail("Voice input needs a network connection — check your internet and try again.");
    } else {
      fail("Voice input stopped unexpectedly. Please try again.");
    }
  };

  try {
    recognition.start();
    armWatchdog();
  } catch {
    restartTimer = setTimeout(() => {
      if (finished) return;
      try { recognition.start(); armWatchdog(); }
      catch { fail("Could not start the microphone. Check browser microphone access and try again."); }
    }, 250);
  }

  const handle: ListenHandle = {
    stop: () => {
      if (finished || manualStop) return;
      manualStop = true;
      clearTimers();
      try { recognition.stop(); }
      catch { finish(true); return; }
      // Some WebViews never emit onend after stop().
      silenceTimer = setTimeout(() => finish(true), 500);
    },
  };
  activeRecognition = { id, stop: handle.stop };
  return handle;
}
