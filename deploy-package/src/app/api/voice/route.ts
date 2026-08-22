import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { detectLanguage } from "@/lib/language";
import { checkRateLimit } from "@/lib/rateLimit";
import { readJsonObject, validationPayload } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type VoiceProfile = { name: string; direction: string; rate: number };
const VOICES: Record<string, VoiceProfile> = {
  f1: {
    name: "Kore",
    direction: "studio-quality Indian tutor delivery, warm and precise, medium-low pitch, slightly slower than casual conversation, high intelligibility for names, numbers, acronyms, and mixed-language phrases, crisp diction, natural sentence stress, and identical vocal identity for short commands and long explanations",
    rate: 0.99,
  },
  f2: {
    name: "Aoede",
    direction: "studio-quality Indian tutor delivery, clear and bright without sounding sharp, steady measured pace, high intelligibility for technical terms and the learner's exact wording, crisp diction, natural pauses, and identical vocal identity for short commands and long explanations",
    rate: 1,
  },
  m1: {
    name: "Charon",
    direction: "studio-quality Indian tutor delivery, grounded medium-low pitch, steady measured pace, high intelligibility for names, numbers, acronyms, and mixed-language phrases, crisp diction, natural pauses, and identical vocal identity for short commands and long explanations",
    rate: 0.98,
  },
};

// Language-specific voice directions for multilingual support
const LANG_DIRECTIONS: Record<string, { direction: string; accent: string }> = {
  "hi-IN": {
    direction: "warm Hindi tutor voice, medium-low pitch, steady pace, very clear pronunciation of Hindi words, Sanskrit-derived terms, and mixed English technical words",
    accent: "Hindi",
  },
  "bn-IN": {
    direction: "warm Bengali tutor voice, medium pitch, steady pace, very clear pronunciation of Bengali words and borrowed English terms",
    accent: "Bengali",
  },
  "mr-IN": {
    direction: "warm Marathi tutor voice, medium pitch, steady pace, very clear pronunciation of Marathi words and mixed English technical terms",
    accent: "Marathi",
  },
  "ta-IN": {
    direction: "clear Tamil tutor voice, medium pitch, steady pace, crisp pronunciation of Tamil words and borrowed English technical terms",
    accent: "Tamil",
  },
  "te-IN": {
    direction: "clear Telugu tutor voice, medium pitch, steady pace, crisp pronunciation of Telugu words and borrowed English technical terms",
    accent: "Telugu",
  },
  "kn-IN": {
    direction: "clear Kannada tutor voice, medium pitch, steady pace, crisp pronunciation of Kannada words and borrowed English technical terms",
    accent: "Kannada",
  },
  "ml-IN": {
    direction: "clear Malayalam tutor voice, medium pitch, steady pace, crisp pronunciation of Malayalam words and borrowed English technical terms",
    accent: "Malayalam",
  },
  "gu-IN": {
    direction: "warm Gujarati tutor voice, medium pitch, steady pace, clear pronunciation of Gujarati words and mixed English technical terms",
    accent: "Gujarati",
  },
  "pa-IN": {
    direction: "clear Punjabi tutor voice, medium pitch, steady pace, crisp pronunciation of Punjabi words and mixed English technical terms",
    accent: "Punjabi",
  },
  "or-IN": {
    direction: "clear Odia tutor voice, medium pitch, steady pace, crisp pronunciation of Odia words and mixed English technical terms",
    accent: "Odia",
  },
  "ne-NP": {
    direction: "warm Nepali tutor voice, medium pitch, steady pace, clear pronunciation of Nepali words and mixed English technical terms",
    accent: "Nepali",
  },
  "ur-PK": {
    direction: "clear Urdu tutor voice, medium pitch, steady pace, clear pronunciation of Urdu words and mixed English technical terms",
    accent: "Urdu",
  },
  "ar-XA": {
    direction: "clear Arabic tutor voice, medium pitch, steady pace, crisp pronunciation of Arabic words and foreign technical terms",
    accent: "Arabic",
  },
  "es-ES": {
    direction: "clear Spanish tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Spanish",
  },
  "fr-FR": {
    direction: "clear French tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "French",
  },
  "de-DE": {
    direction: "clear German tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "German",
  },
  "pt-BR": {
    direction: "clear Portuguese tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Portuguese",
  },
  "it-IT": {
    direction: "clear Italian tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Italian",
  },
  "ru-RU": {
    direction: "clear Russian tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Russian",
  },
  "zh-CN": {
    direction: "clear Mandarin Chinese tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Chinese",
  },
  "ja-JP": {
    direction: "clear Japanese tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Japanese",
  },
  "ko-KR": {
    direction: "clear Korean tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Korean",
  },
  "th-TH": {
    direction: "clear Thai tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Thai",
  },
  "id-ID": {
    direction: "clear Indonesian tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Indonesian",
  },
  "tr-TR": {
    direction: "clear Turkish tutor voice, medium pitch, steady pace, crisp pronunciation of names, numbers, and technical terms",
    accent: "Turkish",
  },
};

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
const DEFAULT_GEMINI_TTS_MODELS = [
  // Kept as an ordered compatibility list: API projects do not all expose a
  // preview model on the same day. A missing model advances immediately to
  // the next compatible TTS model instead of making the user wait on a 404.
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];

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
  return detectLanguage(text);
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
  // Current Interactions API response (snake_case REST shape).
  const interactionAudio = json?.output_audio || json?.outputAudio;
  if (interactionAudio?.data) {
    const rate = Number(String(interactionAudio.mime_type || interactionAudio.mimeType || "").match(/rate=(\d+)/i)?.[1]) || 24000;
    return { bytes: Buffer.from(String(interactionAudio.data), "base64"), sampleRate: rate };
  }

  // Compatibility shape returned by Gemini 2.5 generateContent TTS models.
  const inline = json?.candidates?.[0]?.content?.parts?.find(
    (part: { inlineData?: { data?: string } }) => part?.inlineData?.data
  )?.inlineData;
  if (!inline?.data) return null;
  const bytes = Buffer.from(String(inline.data), "base64");
  const rate = Number(String(inline.mimeType || "").match(/rate=(\d+)/i)?.[1]) || 24000;
  return { bytes, sampleRate: rate };
}

function boundedSignal(parent: AbortSignal, timeoutMs: number): AbortSignal {
  return AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)]);
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
  profile: VoiceProfile,
  signal: AbortSignal
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
      signal: boundedSignal(signal, 6_000),
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

async function synthesiseCloudCompatible(
  apiKey: string,
  text: string,
  language: string,
  profile: VoiceProfile,
  signal: AbortSignal
): Promise<CachedAudio | null> {
  // A named Chirp voice may not be published for every locale. Let Google
  // choose an available voice in the same locale and gender before asking the
  // browser to take over; this keeps most voice outages entirely cloud-side.
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text: truncateUtf8(text, 5000) },
        voice: {
          languageCode: language,
          ssmlGender: profile.name === "Charon" ? "MALE" : "FEMALE",
        },
        audioConfig: { audioEncoding: "MP3", speakingRate: profile.rate },
      }),
      signal: boundedSignal(signal, 5_000),
    }
  );
  if (!response.ok) return null;
  const json = await response.json();
  if (!json?.audioContent) return null;
  return {
    bytes: Buffer.from(String(json.audioContent), "base64"),
    contentType: "audio/mpeg",
    provider: "google-cloud-compatible",
    voice: `${language};${profile.name === "Charon" ? "male" : "female"}`,
    createdAt: Date.now(),
  };
}

type GeminiSynthesis = { audio: CachedAudio | null; tryNextModel: boolean };

async function synthesiseGemini(
  apiKey: string,
  text: string,
  language: string,
  profile: VoiceProfile,
  model: string,
  signal: AbortSignal
): Promise<GeminiSynthesis> {
  const spokenText = truncateUtf8(text, 5000);
  const langConfig = LANG_DIRECTIONS[language];
  const direction = langConfig
    ? `${profile.direction}. ${langConfig.direction}.`
    : profile.direction;
  const voicePrompt = `Style: ${direction} Speak clearly and consistently. Read the text after the divider exactly once. Do not add, omit, paraphrase, or repeat words.\n---\n${spokenText}`;
  const usesInteractionsApi = /^gemini-3\./.test(model);
  const endpoint = usesInteractionsApi
    ? "https://generativelanguage.googleapis.com/v1beta/interactions"
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = usesInteractionsApi
    ? {
        model,
        input: voicePrompt,
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: profile.name }] },
      }
    : {
        contents: [{ parts: [{ text: voicePrompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.name } } },
        },
      };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      // The Interactions API negotiates breaking changes through this header;
      // the current TTS examples are pinned to the 2026-05-20 revision.
      ...(usesInteractionsApi ? { "Api-Revision": "2026-05-20" } : {}),
    },
    body: JSON.stringify(body),
    signal: boundedSignal(signal, 9_000),
  });
  // Model-not-found / unsupported-model responses are fast and safe to
  // retry with the next explicit compatibility model. Auth, quota, and
  // service failures fall back locally instead of creating a retry loop.
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const modelError = response.status === 404
      || (response.status === 400 && /model.*(not found|unsupported|unavailable)/i.test(detail));
    return { audio: null, tryNextModel: modelError };
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
  language: string,
  profile: VoiceProfile,
  signal: AbortSignal
): Promise<CachedAudio | null> {
  for (const model of geminiTtsModels()) {
    if (signal.aborted) return null;
    try {
      const result = await synthesiseGemini(apiKey, text, language, profile, model, signal);
      if (result.audio) return result.audio;
      if (!result.tryNextModel) return null;
    } catch {
      // A network or service outage is not a reason to serially hold the
      // lesson hostage while trying every model. The local voice takes over.
      return null;
    }
  }
  return null;
}

export async function GET() {
  return NextResponse.json({
    configured: !!(cloudTtsKey() || geminiKey()),
    provider: cloudTtsKey() ? "google-cloud-tts" : geminiKey() ? "gemini-tts" : null,
  });
}

export async function POST(req: Request) {
  const limit = checkRateLimit(req, "voice", 36, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many voice requests. Continuing with the device voice.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  let body: Record<string, unknown>;
  try { body = await readJsonObject(req, 24_000); }
  catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  if (typeof body.text !== "string") return NextResponse.json({ error: "Text is required." }, { status: 400 });
  const text = body.text.replace(/\0/g, "").replace(/\s+/g, " ").trim();
  if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });
  if (Buffer.byteLength(text, "utf8") > 5_000) {
    return NextResponse.json({ error: "Voice text is too long for one part." }, { status: 413 });
  }
  const profile = VOICES[String(body.voiceId || "f1")] || VOICES.f1;
  const language = languageFor(text);
  const chirpKey = cloudTtsKey();
  const gemini = geminiKey();
  const providerId = chirpKey ? "google-cloud-tts" : `gemini-tts:${geminiTtsModels().join(",")}`;
  const key = cacheKey(providerId, profile.name, language, text);
  const cached = getCached(key);
  if (cached) return audioResponse(cached, "HIT");

  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  if (req.signal.aborted) abortRequest();
  else req.signal.addEventListener("abort", abortRequest, { once: true });
  const deadline = setTimeout(abortRequest, 13_000);

  try {
    // Chirp 3 HD is the fast, identity-stable first choice. If that exact
    // named voice is unavailable for a locale, use Cloud TTS's compatible
    // same-language/gender selection; Gemini is then the final cloud path.
    let audio: CachedAudio | null = null;
    if (chirpKey) {
      audio = await synthesiseChirp(chirpKey, text, language, profile, requestController.signal);
      if (!audio && !requestController.signal.aborted) {
        audio = await synthesiseCloudCompatible(chirpKey, text, language, profile, requestController.signal);
      }
    }
    if (!audio && gemini && !requestController.signal.aborted) {
      audio = await synthesiseGeminiCompatible(gemini, text, language, profile, requestController.signal);
    }

    if (audio) {
      putCached(key, audio);
      return audioResponse(audio, "MISS");
    }
  } catch {
    // The client immediately continues this answer with its closest device
    // voice, rather than showing an opaque model/provider failure.
  } finally {
    clearTimeout(deadline);
    req.signal.removeEventListener("abort", abortRequest);
  }

  return NextResponse.json(
    {
      error: chirpKey || gemini
        ? "Studio voice is temporarily unavailable. Continuing with the device voice."
        : "Studio voice is not configured on this deployment. Continuing with the device voice.",
    },
    { status: chirpKey || gemini ? 502 : 503 }
  );
}
