import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type VoiceProfile = { name: string; direction: string; rate: number };
const VOICES: Record<string, VoiceProfile> = {
  f1: {
    name: "Kore",
    direction: "neutral Indian tutor delivery, warm but restrained, medium-low pitch, steady pace, crisp diction, and identical vocal identity for short commands and long explanations",
    rate: 1.03,
  },
  f2: {
    name: "Aoede",
    direction: "neutral Indian tutor delivery, clear and lightly bright, steady pace, crisp diction, and identical vocal identity for short commands and long explanations",
    rate: 1.04,
  },
  m1: {
    name: "Charon",
    direction: "neutral Indian tutor delivery, grounded medium-low pitch, steady pace, crisp diction, and identical vocal identity for short commands and long explanations",
    rate: 1.02,
  },
};

// Language-specific voice directions for multilingual support
const LANG_DIRECTIONS: Record<string, { direction: string; accent: string }> = {
  "hi-IN": {
    direction: "warm Hindi tutor voice, medium-low pitch, steady pace, clear pronunciation of Hindi words and Sanskrit-derived terms",
    accent: "Hindi",
  },
  "bn-IN": {
    direction: "warm Bengali tutor voice, medium pitch, steady pace, clear pronunciation of Bengali words",
    accent: "Bengali",
  },
  "ta-IN": {
    direction: "clear Tamil tutor voice, medium pitch, steady pace, crisp pronunciation of Tamil words",
    accent: "Tamil",
  },
  "te-IN": {
    direction: "clear Telugu tutor voice, medium pitch, steady pace, crisp pronunciation of Telugu words",
    accent: "Telugu",
  },
  "kn-IN": {
    direction: "clear Kannada tutor voice, medium pitch, steady pace, crisp pronunciation of Kannada words",
    accent: "Kannada",
  },
  "gu-IN": {
    direction: "warm Gujarati tutor voice, medium pitch, steady pace, clear pronunciation of Gujarati words",
    accent: "Gujarati",
  },
  "pa-IN": {
    direction: "clear Punjabi tutor voice, medium pitch, steady pace, crisp pronunciation of Punjabi words",
    accent: "Punjabi",
  },
  "ar-XA": {
    direction: "clear Arabic tutor voice, medium pitch, steady pace, crisp pronunciation of Arabic words",
    accent: "Arabic",
  },
};

const SCRIPT_LANGUAGES: Array<{ tag: string; range: RegExp }> = [
  { tag: "hi-IN", range: /[\u0900-\u097F]/g },
  { tag: "bn-IN", range: /[\u0980-\u09FF]/g },
  { tag: "pa-IN", range: /[\u0A00-\u0A7F]/g },
  { tag: "gu-IN", range: /[\u0A80-\u0AFF]/g },
  { tag: "ta-IN", range: /[\u0B80-\u0BFF]/g },
  { tag: "te-IN", range: /[\u0C00-\u0C7F]/g },
  { tag: "kn-IN", range: /[\u0C80-\u0CFF]/g },
  { tag: "ar-XA", range: /[\u0600-\u06FF]/g },
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
const MAX_CACHE_ENTRIES = 12;

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

function languageFor(text: string): string {
  let best = { tag: "en-IN", count: 0 };
  for (const language of SCRIPT_LANGUAGES) {
    const count = text.match(language.range)?.length || 0;
    if (count > best.count) best = { tag: language.tag, count };
  }
  return best.tag;
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
  // Refresh LRU order.
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

async function synthesiseChirp(
  apiKey: string,
  text: string,
  language: string,
  profile: VoiceProfile
): Promise<CachedAudio | null> {
  const voiceName = `${language}-Chirp3-HD-${profile.name}`;
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text: truncateUtf8(text, 5000) },
        voice: { languageCode: language, name: voiceName },
        audioConfig: { audioEncoding: "MP3", speakingRate: profile.rate },
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!response.ok) return null;
  const json = await response.json();
  if (!json?.audioContent) return null;
  return {
    bytes: Buffer.from(String(json.audioContent), "base64"),
    contentType: "audio/mpeg",
    provider: "google-chirp3-hd",
    voice: voiceName,
    createdAt: Date.now(),
  };
}

async function synthesiseGemini(
  apiKey: string,
  text: string,
  language: string,
  profile: VoiceProfile,
  model: string
): Promise<CachedAudio | null> {
  const spokenText = truncateUtf8(text, 5000);
  // Use language-specific direction if available, otherwise use default
  const langConfig = LANG_DIRECTIONS[language];
  const direction = langConfig
    ? `${profile.direction}. Speak with ${langConfig.direction} accent.`
    : profile.direction;
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `VOICE IDENTITY LOCK: Always use the same ${profile.name} identity. Delivery must be ${direction}. Do not change character, accent, pitch, speed, or emotion based on message length or whether the text is an app command. Read the text after the divider exactly once. Do not add, omit, paraphrase, or repeat words.\n---\n${spokenText}`,
          }],
        }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.name } },
          },
        },
      }),
      signal: AbortSignal.timeout(25000),
    }
  );
  if (!response.ok) return null;
  const audio = readGeminiAudio(await response.json());
  if (!audio?.bytes.length) return null;
  const isWav = audio.bytes.subarray(0, 4).toString("ascii") === "RIFF";
  const wav = isWav ? audio.bytes : pcmToWav(audio.bytes, audio.sampleRate);
  return {
    bytes: wav,
    contentType: "audio/wav",
    provider: "gemini-tts",
    voice: `${profile.name};${model}`,
    createdAt: Date.now(),
  };
}

export async function GET() {
  return NextResponse.json({
    configured: !!(cloudTtsKey() || geminiKey()),
    provider: cloudTtsKey() ? "google-chirp3-hd" : geminiKey() ? "gemini-tts" : null,
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
  const profile = VOICES[String(body.voiceId || "f1")] || VOICES.f1;
  const language = languageFor(text);
  const chirpKey = cloudTtsKey();
  const gemini = geminiKey();
  const model = process.env.SHIGUN_TTS_MODEL || process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
  const providerId = chirpKey ? "google-chirp3-hd" : `gemini-tts:${model}`;
  const key = cacheKey(providerId, profile.name, language, text);
  const cached = getCached(key);
  if (cached) return audioResponse(cached, "HIT");

  try {
    // Chirp 3 HD is deterministic and low-latency, so it is the production
    // path when its dedicated Cloud TTS key is configured. Gemini remains a
    // pinned-model compatibility path; we never switch models mid-session.
    // For non-English text, prefer Chirp as it has native support for Indian languages.
    let audio = null;
    const isNonEnglish = language !== "en-IN" && SCRIPT_LANGUAGES.some(l => l.tag === language);
    
    if (isNonEnglish && chirpKey) {
      // Use Chirp for Indian languages - it has native voice support
      audio = await synthesiseChirp(chirpKey, text, language, profile);
    } else if (chirpKey) {
      // Use Chirp for English
      audio = await synthesiseChirp(chirpKey, text, language, profile);
    } else if (gemini) {
      // Fall back to Gemini
      audio = await synthesiseGemini(gemini, text, language, profile, model);
    }
    
    if (audio) {
      putCached(key, audio);
      return audioResponse(audio, "MISS");
    }
  } catch {
    // Return text-only rather than silently changing to an unrelated device
    // voice. A selected named profile must always retain its identity.
  }

  return NextResponse.json(
    {
      error: chirpKey || gemini
        ? `${profile.name} is temporarily unavailable. Showing text instead.`
        : "Cloud voice is not configured. Set GOOGLE_CLOUD_TTS_API_KEY or GEMINI_API_KEY.",
    },
    { status: chirpKey || gemini ? 502 : 503 }
  );
}
