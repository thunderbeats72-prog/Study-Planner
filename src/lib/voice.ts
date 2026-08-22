"use client";

import { detectLanguage, shortLang } from "./language";
import { mergeTranscriptSegments } from "./transcript";
import {
  EDGE_VOICES,
  synthesiseEdgeSpeech,
} from "./edgeTts";

// ============================================================
// SHIGUN VOICE — keyless neural speech, one speaker everywhere
// - DEFAULT ENGINE: Microsoft Edge multilingual neural (NO API key):
//   Ava (f1) · Emma (f2) · Andrew (m1). The same neural person speaks
//   every language (Hindi, Hinglish, English, Tamil, …) — only the
//   SSML xml:lang changes, never the voice name.
// - Order: /api/voice (Edge, optional Gemini/Chirp when keys exist) →
//   direct browser connection to the same Edge service (for networks
//   the server cannot reach) → pinned device speechSynthesis, LAST
//   resort only, same speaker for every language.
// - Recognition is single-utterance and overlap-deduplicated.
// - Every listen/playback has a generation token so late mobile callbacks
//   cannot restart audio or submit an old transcript.
// ============================================================

export type VoiceOption = { id: string; label: string; gender: "female" | "male"; hint: string };

export const VOICE_OPTIONS: VoiceOption[] = Object.values(EDGE_VOICES).map((voice) => ({
  id: voice.id as string,
  label: voice.label,
  gender: voice.gender,
  hint: voice.hint,
}));

export function resolveVoiceId(id: string | null | undefined): string {
  if (id && VOICE_OPTIONS.some((voice) => voice.id === id)) return id;
  return "f1";
}

export const SPEECH_RATE_OPTIONS = [
  { value: 1, label: "1×" },
  { value: 1.15, label: "1.15×" },
  { value: 1.3, label: "1.3×" },
  { value: 1.45, label: "1.45×" },
] as const;

export { LANGS } from "./language";

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

/** Pinned last-resort device voices. Same speaker for every language —
 *  the neural Edge voices above are the normal path; this robotic
 *  device fallback only speaks when every neural route is down. */
const PINNED_NATIVE: Record<string, string[]> = {
  f1: ["Ava Online", "Microsoft Ava", "Google UK English Female", "Microsoft Sonia", "Samantha", "Google US English", "Karen", "Victoria", "female"],
  f2: ["Emma Online", "Microsoft Emma", "Google US English", "Microsoft Aria", "Samantha", "Victoria", "Karen", "female"],
  m1: ["Andrew Online", "Microsoft Andrew", "Google UK English Male", "Microsoft Ryan", "Daniel", "Alex", "Google US English", "male"],
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

function pickPinnedNativeVoice(optionId: string): SpeechSynthesisVoice | null {
  const prefs = PINNED_NATIVE[resolveVoiceId(optionId)] || PINNED_NATIVE.f1;
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis?.getVoices() || [];
  for (const preference of prefs) {
    const key = preference.toLowerCase();
    const hit = voices.find((voice) =>
      voice.name.toLowerCase().includes(key) || (key.length > 4 && voice.lang.toLowerCase().includes(key)));
    if (hit) return hit;
  }
  const wantsFemale = optionId !== "m1";
  const gendered = voices.find((voice) => wantsFemale
    ? /female|woman|samantha|sonia|aria|karen|victoria/i.test(voice.name)
    : /male|man|daniel|ryan|alex|david/i.test(voice.name));
  return gendered || voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) || voices[0] || null;
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
    // Long answers stay intact here; speakLong() splits them into
    // voice-sized chunks so nothing is silently dropped mid-lesson.
    .slice(0, MAX_SPOKEN_CHARS);
}

export function splitLanguageRuns(text: string): { lang: string; text: string }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return [{ lang: shortLang(detectLanguage(trimmed)), text: trimmed }];
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
const VOICE_FETCH_TIMEOUT_MS = 16000;
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
  /** Long-answer only: if the neural Edge chunks cannot be delivered, fall
   *  back to the pinned device speaker so the rest of the lesson is still
   *  spoken instead of the whole answer turning silent. */
  allowNativeFallback?: boolean;
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

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickPinnedNativeVoice(voiceId);
  // Native speech is a last resort. Pin its actual voice and locale rather than
  // requesting a locale the selected device voice does not own; browsers silently
  // substitute a different speaker when asked to do that.
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "en-IN";
  }
  const profile = voiceId === "m1"
    ? { rate: 0.96, pitch: 0.86 }
    : voiceId === "f2" ? { rate: 1.02, pitch: 1.04 } : { rate: 0.98, pitch: 0.96 };
  utterance.rate = Math.min(1.6, profile.rate * playbackRate);
  utterance.pitch = profile.pitch;
  utterance.onend = () => { if (generation === speechGeneration) finish(); };
  utterance.onerror = () => { if (generation === speechGeneration) finish(); };
  window.speechSynthesis.speak(utterance);
  start();
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

  const personaId = resolveVoiceId(voiceId);
  // Voice identity is a product guarantee. We never switch to a browser/device
  // speaker because it happens to support a different locale; if Ava cannot be
  // reached, leave the answer readable and allow a clean retry instead. The
  // long-answer path can opt in to the pinned device speaker (forceNative)
  // after the neural service is down, so a lesson is never silently dropped.
  if (options.forceNative) {
    const label = VOICE_OPTIONS.find((voice) => voice.id === personaId)?.label || "selected voice";
    const played = await speakNative(text, personaId, generation, start, finish, playbackRate);
    if (played) return;
    fail(`${label} is unavailable. Your reply is still available as text; tap play to retry the selected voice.`);
    return;
  }

  let errorMessage = "The selected neural voice is temporarily unavailable.";
  const requestClip = async (): Promise<VoiceFetchResult> => {
    const controller = new AbortController();
    speechAbort = controller;
    let timedOut = false;
    return new Promise<VoiceFetchResult>((resolve) => {
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
        settle({ clip: null, errorMessage: "The neural voice is taking too long to respond." });
      }, VOICE_FETCH_TIMEOUT_MS);
      controller.signal.addEventListener("abort", () => {
        if (!timedOut) settle({ clip: null });
      }, { once: true });
      void fetchVoiceClip(text, personaId, controller.signal)
        .then(settle)
        .catch(() => settle({ clip: null }));
    });
  };

  try {
    const fetched = await requestClip();
    if (generation !== speechGeneration) return;
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
      errorMessage = "Neural audio could not start on this device.";
    } else if (fetched.errorMessage) {
      errorMessage = fetched.errorMessage;
    }
  } catch {
    if (generation !== speechGeneration) return;
  } finally {
    if (speechAbort?.signal.aborted || generation === speechGeneration) speechAbort = null;
  }

  // Short replies keep the strict identity guarantee. Long answers opt in
  // via allowNativeFallback so that a single unreachable chunk cannot turn
  // the remainder of a lesson silent.
  if (options.allowNativeFallback) {
    callbacks.onFallback?.("The neural voice hit a snag — finishing this part on your device voice.");
    const played = await speakNative(text, personaId, generation, start, finish, playbackRate);
    if (played) return;
    errorMessage = "Neither the neural voice nor the device voice could start.";
  }
  fail(`${errorMessage} The answer remains available as text. Tap play to retry the selected voice.`);
}

export function stopSpeaking(): void {
  speechGeneration++;
  longSpeakToken++;
  if (typeof window !== "undefined") stopAudioNodes();
}

/* ============================================================
   LONG ANSWERS — full spoken delivery, flowing like one turn.
   Neural TTS synthesises ~5000 bytes per request; a detailed
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
  const chunks: string[] = [];
  let current = "";
  let lastBoundary = 0; // safe cut point (right after a sentence ender)
  let lastClauseBoundary = 0; // softer cut point for unusually long sentences

  for (let i = 0; i < text.length; i++) {
    current += text[i];
    const next = text[i + 1] ?? " ";
    const ended = SENTENCE_ENDERS.has(text[i]) && (next === " " || next === "\n" || i === text.length - 1);
    if (ended) lastBoundary = current.length;
    const clauseEnded = CLAUSE_ENDERS.has(text[i])
      && (next === " " || next === "\n")
      && utf8Len(current) >= Math.floor(maxBytes * 0.55);
    if (clauseEnded) lastClauseBoundary = current.length;

    if (utf8Len(current) >= maxBytes) {
      const safeBoundary = lastBoundary || lastClauseBoundary;
      if (safeBoundary > 0) {
        chunks.push(current.slice(0, safeBoundary).trim());
        current = current.slice(safeBoundary).trimStart();
        lastBoundary = 0;
        lastClauseBoundary = 0;
      } else {
        // A single sentence longer than the cap: cut at the last word gap.
        const gap = current.lastIndexOf(" ");
        const cut = gap > 32 ? gap + 1 : current.length;
        chunks.push(current.slice(0, cut).trim());
        current = current.slice(cut).trimStart();
        lastBoundary = 0;
        lastClauseBoundary = 0;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
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
  if (!resolveVoiceId(voiceId)) return false;
  if (/blocked|tap the mic|not configured/i.test(errorMessage)) return false;
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
    let errorMessage = "The selected neural voice is temporarily unavailable.";
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: cleaned, voiceId: resolveVoiceId(voiceId) }),
        signal,
      });
      if (response.ok) {
        const bytes = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "audio/mpeg";
        return { clip: storeClientAudio(cacheKey, { bytes, contentType }) };
      }
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (payload?.error) errorMessage = payload.error;
    } catch {
      // Server unreachable — the direct browser connection below may
      // still reach the keyless Edge neural service on its own.
    }

    // Server route could not deliver (restricted server network, service
    // hiccup). Connect DIRECTLY from the learner's browser to the same
    // keyless Microsoft Edge neural service — still Ava / Emma / Andrew,
    // still no API key, still the same person in every language.
    const direct = await synthesizeEdgeDirect(cleaned, voiceId);
    if (direct) return { clip: storeClientAudio(cacheKey, direct) };

    return { clip: null, errorMessage };
  })();

  clientAudioInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (clientAudioInflight.get(cacheKey) === request) clientAudioInflight.delete(cacheKey);
  }
}

/* Browser-direct Edge synthesis state. After a failure, wait out the
   backoff before burning another connection attempt mid-conversation. */
let edgeDirectDownUntil = 0;
const EDGE_DIRECT_BACKOFF_MS = 120_000;
const edgeDirectInflight = new Set<string>();

async function synthesizeEdgeDirect(cleaned: string, voiceId: string): Promise<ClientAudioCache | null> {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return null;
  if (!globalThis.crypto?.subtle) return null; // needs a secure context
  if (Date.now() < edgeDirectDownUntil) return null;
  const dedupe = `${voiceId}\0${cleaned}`;
  if (edgeDirectInflight.has(dedupe)) return null;

  edgeDirectInflight.add(dedupe);
  try {
    const result = await synthesiseEdgeSpeech({
      text: cleaned,
      voiceId,
      language: detectLanguage(cleaned),
      timeoutMs: 9_000,
    });
    if ("bytes" in result && result.bytes.length) {
      edgeDirectDownUntil = 0;
      return {
        bytes: result.bytes.buffer.slice(
          result.bytes.byteOffset,
          result.bytes.byteOffset + result.bytes.byteLength
        ) as ArrayBuffer,
        contentType: "audio/mpeg",
      };
    }
    edgeDirectDownUntil = Date.now() + EDGE_DIRECT_BACKOFF_MS;
    return null;
  } catch {
    edgeDirectDownUntil = Date.now() + EDGE_DIRECT_BACKOFF_MS;
    return null;
  } finally {
    edgeDirectInflight.delete(dedupe);
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
    // A single still-long reply uses the same guarded native safety net as a
    // multi-part lesson so it is not silently skipped when Edge is unreachable.
    const singleLong = utf8Len(text) > INITIAL_SPEECH_CHUNK_BYTES;
    await speak(text, voiceId, callbacks, singleLong ? { ...options, allowNativeFallback: true } : options);
    return;
  }

  let startedOnce = false;
  let completed = 0;
  let continueLocally = false;
  let localNoticeShown = false;
  const personaId = resolveVoiceId(voiceId);
  // Every chunk must use the selected neural persona. If the neural service
  // goes down mid-lesson we switch the REST of the long answer to the pinned
  // device speaker (one audible change) rather than silently dropping it.
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
    if (!continueLocally) {
      for (let offset = 1; offset <= LONG_SPEECH_PREFETCH_COUNT; offset++) {
        const upcoming = queue[index + offset];
        if (!upcoming) break;
        void prefetchVoice(upcoming.text, personaId);
      }
    }
    let settled = false;
    let failed = false;
    let errorMessage = "";
    await new Promise<void>((resolve) => {
      void speak(current.text, personaId, {
        onStart: start,
        onFallback: (message) => {
          localNoticeShown = true;
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
      }, { ...options, forceNative: options.forceNative || continueLocally, allowNativeFallback: true });
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
      // A long answer must not stop after one bad chunk. If the neural chunk
      // could not be delivered even after the native retry, skip that part
      // and keep the rest of the lesson playing instead of turning silent.
      continueLocally = true;
      if (!localNoticeShown) {
        localNoticeShown = true;
        callbacks.onFallback?.("The neural voice hit a snag — continuing with your device voice.");
      }
      completed++;
      callbacks.onProgress?.(completed, queue.length);
      index++;
      continue;
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

const LAST_LANG_KEY = "shigun-stt-lang-v2";

/** English is the safe microphone default. We only retain a non-English STT
 * locale after actual non-Latin script is present; Latin transcripts are too
 * ambiguous to let an accidental recognition result change future turns. */
export function preferredSttLang(): string {
  if (typeof window === "undefined") return "en-IN";
  return localStorage.getItem(LAST_LANG_KEY) || "en-IN";
}

export function learnSttLang(transcript: string): void {
  if (typeof window === "undefined" || !transcript.trim()) return;
  const language = detectLanguage(transcript);
  if (language === "en-IN") {
    localStorage.setItem(LAST_LANG_KEY, "en-IN");
    return;
  }
  // detectLanguage returns a non-English tag only from a strong script signal.
  localStorage.setItem(LAST_LANG_KEY, language);
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
