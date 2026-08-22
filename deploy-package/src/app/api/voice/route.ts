import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { detectLanguage, type LangTag } from "@/lib/language";
import {
  resolveEdgeVoice,
  synthesiseEdgeSpeech,
} from "@/lib/edgeTts";
import { connectEdgeSocketNode } from "@/lib/edgeTtsNode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

/* ============================================================
   VOICE ENGINE ORDER — keyless neural by default
   ------------------------------------------------------------
   1. Microsoft Edge multilingual neural (NO API key):
      Ava / Emma / Andrew — the SAME neural person for every
      language; only the SSML xml:lang follows the reply language.
   2. OPTIONAL Gemini TTS / Chirp 3 HD — only if a key happens to
      exist in the environment. Never required, never the default.
   3. The client's last resort is the device speechSynthesis, pinned
      to one speaker per persona (see src/lib/voice.ts).
============================================================ */

type CloudVoiceProfile = { name: "Kore" | "Aoede" | "Charon"; gender: "FEMALE" | "MALE"; rate: number };
const CLOUD_PERSONAS: Record<string, CloudVoiceProfile> = {
  f1: { name: "Kore", gender: "FEMALE", rate: 0.97 },
  f2: { name: "Aoede", gender: "FEMALE", rate: 0.99 },
  m1: { name: "Charon", gender: "MALE", rate: 0.96 },
};

/** One human identity. Language never changes the speaker — only the words. */
const HUMAN_STYLE =
  "the same close-mic human tutor every time: warm, slightly breathy, natural conversational cadence, tiny smile in the voice, unhurried, crisp on names and numbers, never robotic, never theatrical, never a different person when the language changes";

const DEFAULT_GEMINI_TTS_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-flash-tts",
  "gemini-2.5-pro-preview-tts",
  "gemini-2.5-pro-tts",
  "gemini-3.1-flash-tts-preview",
];

type CachedAudio = {
  bytes: Buffer;
  contentType: "audio/mpeg" | "audio/wav";
  provider: string;
  voice: string;
  createdAt: number;
};
type VoiceGlobal = typeof globalThis & { __shigunVoiceCache?: Map<string, CachedAudio> };
const voiceGlobal = globalThis as VoiceGlobal;
const audioCache = voiceGlobal.__shigunVoiceCache ?? new Map<string, CachedAudio>();
voiceGlobal.__shigunVoiceCache = audioCache;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 16;

/** How long a "the server cannot reach Edge" verdict stays fresh. The
 *  client uses this to prefer its own direct browser connection. */
type ReachGlobal = typeof globalThis & { __shigunEdgeDownUntil?: number };
const reachGlobal = globalThis as ReachGlobal;
const EDGE_OUTAGE_BACKOFF_MS = 60_000;

function geminiKey(): string {
  return process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.NEXT_PUBLIC_GEMINI_API_KEY
    || process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    || "";
}

function cloudTtsKey(): string {
  return process.env.GOOGLE_CLOUD_TTS_API_KEY || "";
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, mid), "utf8") <= maxBytes) low = mid;
    else high = mid - 1;
  }
  const clipped = text.slice(0, low);
  const sentenceEnd = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("? "), clipped.lastIndexOf("! "));
  return (sentenceEnd > clipped.length * 0.65 ? clipped.slice(0, sentenceEnd + 1) : clipped).trim();
}

function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function readGeminiAudio(json: any): { bytes: Buffer; sampleRate: number } | null {
  const inline = json?.candidates?.[0]?.content?.parts?.find(
    (part: any) => part?.inlineData?.data
  )?.inlineData;
  if (!inline?.data) return null;
  const bytes = Buffer.from(String(inline.data), "base64");
  const rate = Number(String(inline.mimeType || "").match(/rate=(\d+)/i)?.[1]) || 24000;
  return { bytes, sampleRate: rate };
}

function cacheKey(provider: string, voice: string, language: string, text: string): string {
  return createHash("sha256").update(`${provider}\0${voice}\0${language}\0${text}`).digest("hex");
}

function getCached(key: string): CachedAudio | null {
  const hit = audioCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    audioCache.delete(key);
    return null;
  }
  audioCache.delete(key);
  audioCache.set(key, hit);
  return hit;
}

function putCached(key: string, value: CachedAudio): void {
  audioCache.set(key, value);
  while (audioCache.size > MAX_CACHE_ENTRIES) {
    const oldest = audioCache.keys().next().value as string | undefined;
    if (!oldest) break;
    audioCache.delete(oldest);
  }
}

function audioResponse(audio: CachedAudio, cacheStatus: "HIT" | "MISS"): Response {
  const body = audio.bytes.buffer.slice(
    audio.bytes.byteOffset,
    audio.bytes.byteOffset + audio.bytes.byteLength
  ) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": audio.contentType,
      "content-length": String(audio.bytes.length),
      "cache-control": "private, no-store",
      "x-shigun-provider": audio.provider,
      "x-shigun-voice": audio.voice,
      "x-shigun-cache": cacheStatus,
    },
  });
}

/* ------------------------------------------------------------
   1) KEYLESS ENGINE — Microsoft Edge multilingual neural
------------------------------------------------------------ */
async function synthesiseEdge(
  text: string,
  voiceId: string,
  language: LangTag
): Promise<CachedAudio | null> {
  const result = await synthesiseEdgeSpeech(
    { text, voiceId, language, timeoutMs: 12_000 },
    connectEdgeSocketNode
  );
  if (!("bytes" in result) || !result.bytes.length) {
    if (!("bytes" in result) && result.unreachable) {
      reachGlobal.__shigunEdgeDownUntil = Date.now() + EDGE_OUTAGE_BACKOFF_MS;
    }
    return null;
  }
  const persona = resolveEdgeVoice(voiceId);
  return {
    bytes: Buffer.from(result.bytes),
    contentType: "audio/mpeg",
    provider: "edge-multilingual-neural",
    voice: `${persona.label};${persona.name}`,
    createdAt: Date.now(),
  };
}

/* ------------------------------------------------------------
   2) OPTIONAL KEYED ENGINES — used only when keys exist
------------------------------------------------------------ */

/** Chirp 3 HD keeps the mapped persona name in every locale. */
async function synthesiseChirpNamed(
  apiKey: string,
  text: string,
  language: LangTag,
  profile: CloudVoiceProfile
): Promise<CachedAudio | null> {
  const spoken = truncateUtf8(text, 5000);
  const locales = Array.from(new Set([language, "en-US", "en-IN"])) as string[];
  for (const locale of locales) {
    const voiceName = `${locale}-Chirp3-HD-${profile.name}`;
    try {
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            input: { text: spoken },
            voice: { languageCode: locale, name: voiceName },
            audioConfig: {
              audioEncoding: "MP3",
              speakingRate: profile.rate,
              pitch: profile.name === "Kore" ? -1.2 : profile.name === "Charon" ? -2 : 0.4,
              effectsProfileId: ["headphone-class-device"],
            },
          }),
          signal: AbortSignal.timeout(14000),
        }
      );
      if (!response.ok) continue;
      const json = await response.json();
      if (!json?.audioContent) continue;
      return {
        bytes: Buffer.from(String(json.audioContent), "base64"),
        contentType: "audio/mpeg",
        provider: "google-chirp3-hd",
        voice: `${profile.name};${voiceName}`,
        createdAt: Date.now(),
      };
    } catch {
      continue;
    }
  }
  return null;
}

type GeminiSynthesis = { audio: CachedAudio | null; tryNextModel: boolean };

async function synthesiseGemini(
  apiKey: string,
  text: string,
  language: LangTag,
  profile: CloudVoiceProfile,
  model: string
): Promise<GeminiSynthesis> {
  const spokenText = truncateUtf8(text, 5000);
  const voicePrompt =
    `Locked prebuilt voice ${profile.name}. Style: ${HUMAN_STYLE}. ` +
    `Speak the learner's language naturally. Read the text after the divider exactly once. ` +
    `Do not add, omit, paraphrase, or repeat words.\n---\n${spokenText}`;

  const speechConfigWithLang = {
    languageCode: language,
    voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.name } },
  };
  const speechConfigPlain = {
    voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.name } },
  };

  const attempt = async (speechConfig: unknown) => {
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: voicePrompt }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig },
        }),
        signal: AbortSignal.timeout(22000),
      }
    );
  };

  let response: Response;
  try {
    response = await attempt(speechConfigWithLang);
    if (response.status === 400) response = await attempt(speechConfigPlain);
  } catch {
    return { audio: null, tryNextModel: true };
  }

  if (!response.ok) {
    return { audio: null, tryNextModel: response.status === 400 || response.status === 404 };
  }
  const audio = readGeminiAudio(await response.json());
  if (!audio?.bytes.length) return { audio: null, tryNextModel: true };
  const isWav = audio.bytes.subarray(0, 4).toString("ascii") === "RIFF";
  const wav = isWav ? audio.bytes : pcmToWav(audio.bytes, audio.sampleRate);
  return {
    audio: {
      bytes: wav,
      contentType: "audio/wav",
      provider: "gemini-tts",
      voice: `${profile.name};${model}`,
      createdAt: Date.now(),
    },
    tryNextModel: false,
  };
}

function geminiTtsModels(): string[] {
  return [...new Set([
    process.env.SHIGUN_TTS_MODEL,
    process.env.GEMINI_TTS_MODEL,
    ...DEFAULT_GEMINI_TTS_MODELS,
  ].filter((model): model is string => Boolean(model?.trim())))];
}

async function synthesiseGeminiCompatible(
  apiKey: string,
  text: string,
  language: LangTag,
  profile: CloudVoiceProfile
): Promise<CachedAudio | null> {
  for (const model of geminiTtsModels()) {
    try {
      const result = await synthesiseGemini(apiKey, text, language, profile, model);
      if (result.audio) return result.audio;
      if (!result.tryNextModel) continue;
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET() {
  return NextResponse.json({
    configured: true, // the keyless Edge neural engine is ALWAYS configured
    keyless: true,
    provider: "edge-multilingual-neural",
    optionalKeyProviders: { geminiTts: false, chirp3Hd: false },
    voiceLock: "edge-multilingual-persona-only",
    voices: ["Ava", "Emma", "Andrew"],
  });
}

export async function POST(req: Request) {
  let body: { text?: unknown; voiceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 5000);
  if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });
  const requested = String(body.voiceId || "f1");
  const persona = resolveEdgeVoice(requested);
  const language = detectLanguage(text);
  // A voice selection is an identity lock, not a preference. Do not switch to
  // Gemini or Chirp on an Edge outage: those providers have different people.
  const providerId = `edge:${persona.id}`;
  const key = cacheKey(providerId, persona.name, language, text);
  const cached = getCached(key);
  if (cached) return audioResponse(cached, "HIT");

  // 1) DEFAULT — keyless Microsoft Edge multilingual neural.
  //    Ava stays Ava in Hindi, Hinglish, English, Tamil, … (only
  //    xml:lang changes; the voice name never does).
  const edgeDown = (reachGlobal.__shigunEdgeDownUntil || 0) > Date.now();
  if (!edgeDown) {
    try {
      const audio = await synthesiseEdge(text, persona.id, language);
      if (audio) {
        putCached(key, audio);
        return audioResponse(audio, "MISS");
      }
    } catch {
      // client will try the same selected Edge persona directly
    }
  }

  // No alternate provider is allowed here. The browser will try the same
  // Edge persona directly before it reports a retryable text-only failure.

  return NextResponse.json(
    {
      error: "The neural voice service is not reachable from this server right now.",
      engine: "edge-multilingual-neural",
      voice: persona.label,
      // The client should now try its own direct browser connection to
      // the same keyless Edge service; device voices are deliberately not used.
      clientFallback: "edge-direct",
      retryable: true,
    },
    { status: 503 }
  );
}
