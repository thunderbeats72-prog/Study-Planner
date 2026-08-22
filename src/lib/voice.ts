"use client";

import { mergeTranscriptSegments } from "./transcript";
import { userKey } from "./client";

// ============================================================
// SHIGUN VOICE
// - Recognition is single-utterance and overlap-deduplicated, which avoids
//   cumulative WebKit/Android results being appended more than once.
// - Replies use a pinned server voice (deterministic Chirp 3 HD when
//   configured, otherwise a compatible Gemini TTS model). When cloud speech
//   cannot start promptly, the closest available device voice continues the
//   answer instead of leaving the learner with an unavailable-model error.
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

export const SPEECH_RATE_OPTIONS = [
  { value: 1, label: "1×" },
  { value: 1.15, label: "1.15×" },
  { value: 1.3, label: "1.3×" },
  { value: 1.45, label: "1.45×" },
] as const;

/** Supported recognition languages: script ranges + BCP-47 tags. */
export const LANGS: { code: string; bcp: string; range: RegExp }[] = [
  { code: "hi", bcp: "hi-IN", range: /[\u0900-\u097F]/ },
  { code: "bn", bcp: "bn-IN", range: /[\u0980-\u09FF]/ },
  { code: "ta", bcp: "ta-IN", range: /[\u0B80-\u0BFF]/ },
  { code: "te", bcp: "te-IN", range: /[\u0C00-\u0C7F]/ },
  { code: "kn", bcp: "kn-IN", range: /[\u0C80-\u0CFF]/ },
  { code: "gu", bcp: "gu-IN", range: /[\u0A80-\u0AFF]/ },
  { code: "pa", bcp: "pa-IN", range: /[\u0A00-\u0A7F]/ },
  { code: "ml", bcp: "ml-IN", range: /[\u0D00-\u0D7F]/ },
  { code: "or", bcp: "or-IN", range: /[\u0B00-\u0B7F]/ },
  { code: "ar", bcp: "ar-SA", range: /[\u0600-\u06FF]/ },
  { code: "ru", bcp: "ru-RU", range: /[\u0400-\u04FF]/ },
  { code: "zh", bcp: "zh-CN", range: /[\u4E00-\u9FFF]/ },
  { code: "ja", bcp: "ja-JP", range: /[\u3040-\u30FF]/ },
  { code: "ko", bcp: "ko-KR", range: /[\uAC00-\uD7AF]/ },
  { code: "th", bcp: "th-TH", range: /[\u0E00-\u0E7F]/ },
];

const MAX_SPOKEN_CHARS = 24000;
const DEFAULT_SPEECH_CHUNK_BYTES = 4200;
const INITIAL_SPEECH_CHUNK_BYTES = 2200;
const LONG_SPEECH_PREFETCH_COUNT = 3;
const MIN_RETRY_CHUNK_BYTES = 1400;
const BASE_SPEECH_HINTS = [
  "Shigun",
  "Study Planner Pro",
  "study planner",
  "clock in",
  "clock out",
  "start timer",
  "stop timer",
  "pause timer",
  "resume timer",
  "take a break",
  "what should I study today",
  "explain my weakest topic",
  "give me practice questions",
  "replan",
  "dashboard",
  "planner",
  "focus mode",
  "subjects",
  "settings",
  "हिंदी में समझाओ",
  "Explain in simple words",
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
  mr: {
    f1: ["Google मराठी", "Microsoft Aarohi", "mr-IN"],
    f2: ["Microsoft Aarohi", "Google मराठी", "mr-IN"],
    m1: ["Microsoft Manohar", "Google मराठी", "mr-IN"],
  },
  bn: {
    f1: ["Google বাংলা", "Microsoft Bhaswati", "bn-IN"],
    f2: ["Microsoft Bhaswati", "Google বাংলা", "bn-IN"],
    m1: ["Microsoft Basabdutta", "Google বাংলা", "bn-IN"],
  },
  ta: {
    f1: ["Google தமிழ்", "Microsoft Valluvar", "ta-IN"],
    f2: ["Microsoft Valluvar", "Google தமிழ்", "ta-IN"],
    m1: ["Microsoft Kabilan", "Google தமிழ்", "ta-IN"],
  },
  te: {
    f1: ["Google తెలుగు", "Microsoft Shruti", "te-IN"],
    f2: ["Microsoft Shruti", "Google తెలుగు", "te-IN"],
    m1: ["Microsoft Mohan", "Google తెలుగు", "te-IN"],
  },
  kn: {
    f1: ["Google ಕನ್ನಡ", "Microsoft Asha", "kn-IN"],
    f2: ["Microsoft Asha", "Google ಕನ್ನಡ", "kn-IN"],
    m1: ["Microsoft Gagan", "Google ಕನ್ನಡ", "kn-IN"],
  },
  ml: {
    f1: ["Google മലയാളം", "Microsoft Sobhana", "ml-IN"],
    f2: ["Microsoft Sobhana", "Google മലയാളം", "ml-IN"],
    m1: ["Microsoft Midhun", "Google മലയാളം", "ml-IN"],
  },
  gu: {
    f1: ["Google ગુજરાતી", "Microsoft Nisha", "gu-IN"],
    f2: ["Microsoft Nisha", "Google ગુજરાતી", "gu-IN"],
    m1: ["Microsoft Dharmik", "Google ગુજરાતી", "gu-IN"],
  },
  pa: {
    f1: ["Google ਪੰਜਾਬੀ", "Microsoft Aastha", "pa-IN"],
    f2: ["Microsoft Aastha", "Google ਪੰਜਾਬੀ", "pa-IN"],
    m1: ["Microsoft Aastha", "Google ਪੰਜਾਬੀ", "pa-IN"],
  },
  or: {
    f1: ["Google ଓଡ଼ିଆ", "Microsoft Ananya", "or-IN"],
    f2: ["Microsoft Ananya", "Google ଓଡ଼ିଆ", "or-IN"],
    m1: ["Microsoft Ananya", "Google ଓଡ଼ିଆ", "or-IN"],
  },
  ur: {
    f1: ["Google اردو", "Microsoft Salman", "ur-PK"],
    f2: ["Microsoft Salman", "Google اردو", "ur-PK"],
    m1: ["Microsoft Salman", "Google اردو", "ur-PK"],
  },
  ar: {
    f1: ["Google العربية", "Microsoft Naayf", "ar-SA"],
    f2: ["Microsoft Naayf", "Google العربية", "ar-SA"],
    m1: ["Microsoft Naayf", "Google العربية", "ar-SA"],
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
    // A fallback should feel immediate. If a platform has not populated its
    // voice list shortly after the gesture, SpeechSynthesis can still use the
    // requested language/default voice without delaying the whole answer.
    window.setTimeout(finish, 650);
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

export function cleanForSpeech(markdown: string): string {
  return markdown
    .replace(/\[\[action:[^\]]*\]\]/g, "")
    .replace(/^\s*#{1,6}\s+(.+?)\s*$/gm, "$1.")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/^\s*\|(.+)\|\s*$/gm, (_row, cells: string) =>
      cells.split("|").map((cell) => cell.trim()).filter(Boolean).join(", "))
    .replace(/[*_#`>]+/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    // Long answers stay intact here; speakLong() splits them into
    // voice-sized chunks so nothing is silently dropped mid-lesson.
    .slice(0, MAX_SPOKEN_CHARS);
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

function uniqueSpeechHints(hints: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of hints) {
    const phrase = raw.replace(/\s+/g, " ").trim();
    const key = phrase.toLowerCase();
    if (!phrase || phrase.length < 2 || phrase.length > 80 || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= 36) break;
  }
  return out;
}

function grammarSafePhrase(phrase: string): string {
  return phrase
    .replace(/[^\p{L}\p{N}\s'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function applyRecognitionHints(
  recognition: Record<string, any>,
  values: Record<string, any>,
  hints: string[]
): void {
  const phrases = uniqueSpeechHints([...BASE_SPEECH_HINTS, ...hints]);
  if (!phrases.length) return;

  try {
    if ("phrases" in recognition) {
      recognition.phrases = phrases.map((phrase) => ({
        phrase,
        boost: phrase.length > 24 ? 7 : 6,
      }));
    }
  } catch {
    // Phrase hints are optional and browser-specific.
  }

  try {
    const SpeechGrammarListCtor = values.SpeechGrammarList || values.webkitSpeechGrammarList;
    if (!SpeechGrammarListCtor) return;
    const grammarTerms = phrases.map(grammarSafePhrase).filter(Boolean).slice(0, 24);
    if (!grammarTerms.length) return;
    const list = new SpeechGrammarListCtor();
    list.addFromString(
      `#JSGF V1.0; grammar planner; public <term> = ${grammarTerms.map((term) => `(${term})`).join(" | ")} ;`,
      1
    );
    recognition.grammars = list;
  } catch {
    // Grammar biasing is best-effort only.
  }
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
type VoiceFetchResult = { clip: ClientAudioCache | null; errorMessage?: string };
const clientAudioCache = new Map<string, ClientAudioCache>();
const clientAudioInflight = new Map<string, Promise<VoiceFetchResult>>();
const MAX_CLIENT_AUDIO_CACHE = 12;
const VOICE_FETCH_TIMEOUT_MS = 18000;
const DEFAULT_PLAYBACK_RATE = 1.15;
const MIN_PLAYBACK_RATE = 0.85;
const MAX_PLAYBACK_RATE = 1.5;

export type SpeakCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
  /** Cloud audio is still loading/unavailable; delivery continues locally. */
  onFallback?: (message: string) => void;
  onError?: (message: string) => void;
};

export type SpeechPlaybackOptions = {
  /** Playback is client-side, so changing it never causes another TTS request. */
  rate?: number;
  /** Internal long-answer guard: after a cloud outage, continue locally. */
  forceNative?: boolean;
};

function playbackRateFor(options: SpeechPlaybackOptions = {}): number {
  const requested = Number(options.rate);
  if (!Number.isFinite(requested)) return DEFAULT_PLAYBACK_RATE;
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, requested));
}

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

function touchClientAudioCache(cacheKey: string, clip: ClientAudioCache): ClientAudioCache {
  clientAudioCache.delete(cacheKey);
  clientAudioCache.set(cacheKey, clip);
  return clip;
}

function storeClientAudio(cacheKey: string, clip: ClientAudioCache): ClientAudioCache {
  clientAudioCache.set(cacheKey, clip);
  while (clientAudioCache.size > MAX_CLIENT_AUDIO_CACHE) {
    const oldest = clientAudioCache.keys().next().value as string | undefined;
    if (!oldest) break;
    clientAudioCache.delete(oldest);
  }
  return clip;
}

async function playHtmlAudio(
  bytes: ArrayBuffer,
  contentType: string,
  generation: number,
  start: () => void,
  finish: () => void,
  playbackRate: number
): Promise<boolean> {
  if (generation !== speechGeneration) return true;
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType || "audio/wav" }));
  const audio = new Audio(url);
  activeAudio = audio;
  activeObjectUrl = url;
  audio.preload = "auto";
  // Keep the answer concise without changing its pitch or requesting a second
  // cloud rendering. HTMLAudio preserves pitch on modern browsers by default.
  audio.playbackRate = playbackRate;
  audio.onplaying = start;
  audio.onended = finish;
  audio.onerror = () => finish();
  await audio.play();
  start();
  return true;
}

async function playWebAudioBuffer(
  bytes: ArrayBuffer,
  generation: number,
  start: () => void,
  finish: () => void,
  playbackRate: number
): Promise<boolean> {
  if (generation !== speechGeneration || !audioContext || audioContext.state !== "running") return false;
  const buffer = await audioContext.decodeAudioData(bytes.slice(0));
  if (generation !== speechGeneration) return true;
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
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

async function playCloudAudio(
  bytes: ArrayBuffer,
  contentType: string,
  generation: number,
  start: () => void,
  finish: () => void,
  playbackRate: number
): Promise<boolean> {
  if (generation !== speechGeneration) return true;
  await prepareVoicePlayback();

  // Blob-backed HTML audio usually begins speaking faster than decoding the
  // whole clip into a Web Audio buffer first, especially for bigger WAV clips.
  try {
    return await playHtmlAudio(bytes, contentType, generation, start, finish, playbackRate);
  } catch {
    // Fall through to Web Audio before surfacing a playback failure.
  }

  try {
    return await playWebAudioBuffer(bytes, generation, start, finish, playbackRate);
  } catch {
    return false;
  }
}

async function speakNative(
  text: string,
  voiceId: string,
  generation: number,
  start: () => void,
  finish: () => void,
  playbackRate: number
): Promise<boolean> {
  if (!("speechSynthesis" in window) || generation !== speechGeneration) return false;
  await loadVoices();
  if (generation !== speechGeneration) return false;

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
    utterance.rate = Math.min(1.8, profile.rate * (run.lang === "en" ? 1.04 : 1) * playbackRate);
    utterance.pitch = profile.pitch;
    utterance.onend = speakNext;
    utterance.onerror = speakNext;
    window.speechSynthesis.speak(utterance);
    if (!playbackStarted) { playbackStarted = true; start(); }
  };
  speakNext();
  return true;
}

export async function speak(
  markdown: string,
  voiceId: string,
  callbacks: SpeakCallbacks = {},
  options: SpeechPlaybackOptions = {}
): Promise<void> {
  const text = cleanForSpeech(markdown);
  const playbackRate = playbackRateFor(options);
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

  // A device voice can be selected directly. Named profiles use the studio
  // voice first, then continue with the closest local voice if the service
  // is unavailable rather than abandoning a spoken answer.
  if (voiceId === "device" || options.forceNative) {
    const nativeVoiceId = voiceId === "device" ? "f1" : voiceId;
    if (await speakNative(text, nativeVoiceId, generation, start, finish, playbackRate)) return;
    fail("Speech is not available in this browser. You can still read the answer here.");
    return;
  }

  let errorMessage = "The selected Shigun voice is temporarily unavailable.";
  try {
    const controller = new AbortController();
    speechAbort = controller;
    let timedOut = false;
    const fetched = await new Promise<VoiceFetchResult>((resolve) => {
      let settled = false;
      const settle = (result: VoiceFetchResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(result);
      };
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
        settle({ clip: null, errorMessage: "The studio voice is taking too long to respond." });
      }, VOICE_FETCH_TIMEOUT_MS);
      controller.signal.addEventListener("abort", () => {
        if (!timedOut) settle({ clip: null });
      }, { once: true });
      void fetchVoiceClip(text, voiceId, controller.signal)
        .then(settle)
        .catch(() => settle({ clip: null }));
    });
    if (generation !== speechGeneration) return;
    if (fetched.clip) {
      const played = await playCloudAudio(
        fetched.clip.bytes,
        fetched.clip.contentType,
        generation,
        start,
        finish,
        playbackRate
      );
      if (played) return;
      errorMessage = "Cloud audio could not start on this device.";
    } else if (timedOut) {
      errorMessage = "The studio voice is taking too long to respond.";
    } else if (fetched.errorMessage) {
      errorMessage = fetched.errorMessage;
    }
  } catch {
    if (generation !== speechGeneration) return;
  } finally {
    if (speechAbort?.signal.aborted || generation === speechGeneration) speechAbort = null;
  }

  // A voice outage must not turn a spoken lesson into an error-only state.
  // Preserve the requested gender/language as closely as the browser permits
  // and continue immediately with the local speech engine instead.
  if (generation === speechGeneration
    && await speakNative(text, voiceId, generation, start, finish, playbackRate)) {
    callbacks.onFallback?.("Studio voice is reconnecting — continuing with your device voice.");
    return;
  }

  fail(`${errorMessage} The answer remains available as text.`);
}

export function stopSpeaking(): void {
  speechGeneration++;
  longSpeakToken++;
  if (typeof window !== "undefined") stopAudioNodes();
}

/* ============================================================
   LONG ANSWERS — full spoken delivery, flowing like one turn.
   Cloud TTS synthesises ~5000 bytes per request; a detailed
   lesson easily exceeds that. speakLong() splits into the fewest
   chunks that fit, prefetches the next chunk while the current
   one plays, and chains them with no fetch gap in between.
   Stopping at any moment cancels the whole queue.
============================================================ */

let longSpeakToken = 0;

const SENTENCE_ENDERS = new Set([".", "?", "!", "।", "॥", "。", "！", "？", "؟", "…"]);
const CLAUSE_ENDERS = new Set([",", ";", ":", "—"]);

function utf8Len(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  // Conservative fallback for multi-byte scripts (UTF-8 ≤ 3 bytes/char).
  return text.length * 3;
}

/**
 * Split a long answer into the FEWEST chunks that stay under the cloud
 * TTS byte limit (~5000 bytes per request). Breaking at every "." made the
 * tutor pause unnaturally between sentences; now periods inside a chunk flow
 * together and a cut only happens when a chunk is genuinely too long — and
 * then at a real sentence boundary, never mid-word.
 */
export function splitSpeechChunks(text: string, maxBytes = DEFAULT_SPEECH_CHUNK_BYTES): string[] {
  const byteLimit = Math.max(64, Math.floor(maxBytes));
  const chunks: string[] = [];
  let remaining = text.trim();

  const maxPrefixLength = (value: string): number => {
    let low = 0;
    let high = value.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (utf8Len(value.slice(0, middle)) <= byteLimit) low = middle;
      else high = middle - 1;
    }
    // Do not split a UTF-16 surrogate pair (emoji/non-BMP character).
    if (low > 0 && low < value.length
      && /[\uD800-\uDBFF]/.test(value[low - 1])
      && /[\uDC00-\uDFFF]/.test(value[low])) return low - 1;
    return low;
  };

  while (remaining && utf8Len(remaining) > byteLimit) {
    const prefixLength = maxPrefixLength(remaining);
    const prefix = remaining.slice(0, Math.max(1, prefixLength));
    const minimumNaturalCut = Math.floor(prefix.length * 0.45);
    let sentenceCut = -1;
    let clauseCut = -1;
    for (let index = minimumNaturalCut; index < prefix.length; index++) {
      const next = prefix[index + 1] ?? " ";
      if ((next === " " || next === "\n") && SENTENCE_ENDERS.has(prefix[index])) sentenceCut = index + 1;
      else if ((next === " " || next === "\n") && CLAUSE_ENDERS.has(prefix[index])) clauseCut = index + 1;
    }
    const wordCut = prefix.lastIndexOf(" ") + 1;
    const cut = sentenceCut > 0
      ? sentenceCut
      : clauseCut > 0
        ? clauseCut
        : wordCut > 32
          ? wordCut
          : prefix.length;
    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function nextSpeechChunkSize(currentMaxBytes: number): number {
  if (currentMaxBytes <= MIN_RETRY_CHUNK_BYTES) return currentMaxBytes;
  return Math.max(MIN_RETRY_CHUNK_BYTES, Math.floor(currentMaxBytes * 0.62));
}

function shouldRetrySpeechChunk(
  errorMessage: string,
  voiceId: string,
  chunkText: string,
  currentMaxBytes: number
): boolean {
  if (voiceId === "device") return false;
  if (/blocked|tap the mic|configured|unavailable|taking too long|reconnecting|network|server/i.test(errorMessage)) return false;
  return currentMaxBytes > MIN_RETRY_CHUNK_BYTES && utf8Len(chunkText) > MIN_RETRY_CHUNK_BYTES;
}

function buildSpeechQueue(text: string): PendingSpeechChunk[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const queue: PendingSpeechChunk[] = [];
  let remaining = normalized;
  if (utf8Len(remaining) > DEFAULT_SPEECH_CHUNK_BYTES) {
    const early = splitSpeechChunks(remaining, INITIAL_SPEECH_CHUNK_BYTES)[0] || "";
    if (early && early.length < remaining.length) {
      queue.push({ text: early, maxBytes: INITIAL_SPEECH_CHUNK_BYTES });
      remaining = remaining.slice(early.length).trimStart();
    }
  }

  for (const chunk of splitSpeechChunks(remaining, DEFAULT_SPEECH_CHUNK_BYTES)) {
    queue.push({ text: chunk, maxBytes: DEFAULT_SPEECH_CHUNK_BYTES });
  }
  return queue;
}

async function fetchVoiceClip(
  text: string,
  voiceId: string,
  signal?: AbortSignal
): Promise<VoiceFetchResult> {
  const cleaned = cleanForSpeech(text);
  if (!cleaned) return { clip: null, errorMessage: "Text is required." };

  const cacheKey = `${voiceId}\0${cleaned}`;
  const cached = clientAudioCache.get(cacheKey);
  if (cached) return { clip: touchClientAudioCache(cacheKey, cached) };

  const existing = clientAudioInflight.get(cacheKey);
  if (existing) return existing;

  const request = (async (): Promise<VoiceFetchResult> => {
    let errorMessage = "The selected Shigun voice is temporarily unavailable.";
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-key": userKey() },
        body: JSON.stringify({ text: cleaned, voiceId }),
        signal,
      });
      if (response.ok) {
        const bytes = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "audio/wav";
        return { clip: storeClientAudio(cacheKey, { bytes, contentType }) };
      }
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (payload?.error) errorMessage = payload.error;
    } catch {
      // Fall through with the default message below.
    }
    return { clip: null, errorMessage };
  })();

  clientAudioInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (clientAudioInflight.get(cacheKey) === request) clientAudioInflight.delete(cacheKey);
  }
}

/** Fetch a chunk's audio into the client cache WITHOUT playing it, so the
 *  next chunk is ready before the current one finishes — removing the long
 *  pause that used to sit between parts of a spoken lesson. */
async function prefetchVoice(text: string, voiceId: string): Promise<void> {
  try {
    await fetchVoiceClip(text, voiceId);
  } catch {
    // Playback falls back to an on-demand fetch for this chunk.
  }
}

type PendingSpeechChunk = { text: string; maxBytes: number };

export async function speakLong(
  markdown: string,
  voiceId: string,
  callbacks: SpeakCallbacks & { onProgress?: (done: number, total: number) => void } = {},
  options: SpeechPlaybackOptions = {}
): Promise<void> {
  const text = cleanForSpeech(markdown);
  if (!text) { callbacks.onEnd?.(); return; }
  const queue: PendingSpeechChunk[] = buildSpeechQueue(text);
  const token = ++longSpeakToken;
  const isCurrent = () => token === longSpeakToken;
  if (queue.length <= 1) {
    longSpeakToken++; // speak() path owns cancellation from here
    await speak(text, voiceId, callbacks, options);
    return;
  }

  let startedOnce = false;
  let completed = 0;
  // If the studio provider fails once, do not make every remaining long-text
  // part wait through the same timeout. The rest of this answer stays in the
  // selected profile's closest device voice and keeps flowing.
  let continueLocally = false;
  const start = () => {
    if (startedOnce || !isCurrent()) return;
    startedOnce = true;
    callbacks.onStart?.();
  };

  for (let index = 0; index < queue.length;) {
    if (!isCurrent()) return; // the user stopped playback mid-answer
    const current = queue[index];
    // Warm the next part while this one plays (cloud voices only). The
    // on-demand fetch in speak() then hits the cache and starts instantly,
    // so long lessons flow as one continuous narration instead of pausing
    // after every sentence.
    if (voiceId !== "device" && !continueLocally) {
      // The current part owns the cancellable request. Prime only future
      // parts, so stopping a slow first request can fall back immediately.
      for (let offset = 1; offset <= LONG_SPEECH_PREFETCH_COUNT; offset++) {
        const upcoming = queue[index + offset];
        if (!upcoming) break;
        void prefetchVoice(upcoming.text, voiceId);
      }
    }
    let settled = false;
    let failed = false;
    let errorMessage = "";
    await new Promise<void>((resolve) => {
      void speak(current.text, voiceId, {
        onStart: start,
        onFallback: (message) => {
          continueLocally = true;
          callbacks.onFallback?.(message);
        },
        onEnd: () => {
          if (settled) return;
          settled = true;
          resolve();
        },
        onError: (message) => {
          if (settled) return;
          settled = true;
          failed = true;
          errorMessage = message;
          resolve();
        },
      }, { ...options, forceNative: options.forceNative || continueLocally });
      // Safety poll: a mid-chunk stop bumps the token without speak()'s
      // finish() firing, and no engine is hang-proof — resolve either way.
      const softCap = Math.max(25000, (current.text.length / 11) * 1500);
      const began = Date.now();
      const poll = window.setInterval(() => {
        if (settled || !isCurrent() || Date.now() - began > softCap) {
          window.clearInterval(poll);
          resolve();
        }
      }, 150);
    });
    if (!isCurrent()) return;

    if (failed && shouldRetrySpeechChunk(errorMessage, voiceId, current.text, current.maxBytes)) {
      const nextMaxBytes = nextSpeechChunkSize(current.maxBytes);
      const retryChunks = splitSpeechChunks(current.text, nextMaxBytes);
      if (retryChunks.length > 1) {
        queue.splice(index, 1, ...retryChunks.map((chunk) => ({ text: chunk, maxBytes: nextMaxBytes })));
        callbacks.onProgress?.(completed, queue.length);
        continue;
      }
    }

    if (failed) {
      callbacks.onError?.(errorMessage);
      return; // surface the error once; text remains readable
    }

    completed++;
    callbacks.onProgress?.(completed, queue.length);
    index++;
  }
  if (isCurrent()) callbacks.onEnd?.();
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

/** The recognition language. Shigun assesses the language itself: it starts
 *  from the last script the learner spoke and keeps learning as they talk —
 *  there is no manual picker to get wrong. */
export function preferredSttLang(): string {
  if (typeof window === "undefined") return "en-IN";
  return localStorage.getItem(LAST_LANG_KEY) || "en-IN";
}

/** Learn the language from the learner's own speech so the NEXT listen
 *  already tunes recognition (and the reply script) to match. */
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

type ListenOptions = {
  lang?: string;
  hints?: string[];
};

export async function listen(
  onInterim: (text: string) => void,
  onFinal: (final: ListenFinal) => void,
  onError: (error: string) => void,
  options: string | ListenOptions = preferredSttLang()
): Promise<ListenHandle | null> {
  const values = window as unknown as Record<string, any>;
  const resolved = typeof options === "string" ? { lang: options } : options;
  const lang = resolved.lang || preferredSttLang();
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
  applyRecognitionHints(recognition, values, resolved.hints || []);
  recognition.interimResults = true;
  // One mic tap represents one chat message. Continuous mode is the source
  // of cumulative duplicate result batches on Android Chrome/WebView.
  recognition.continuous = false;
  recognition.maxAlternatives = 5;

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
