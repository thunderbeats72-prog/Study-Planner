import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const VOICES: Record<string, { name: string; direction: string }> = {
  f1: { name: "Kore", direction: "calm, warm, and measured" },
  f2: { name: "Aoede", direction: "bright, friendly, and clear" },
  m1: { name: "Charon", direction: "clear, grounded, and measured" },
};

function geminiKey(): string {
  return process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.NEXT_PUBLIC_GEMINI_API_KEY
    || process.env.NEXT_PUBLIC_GOOGLE_API_KEY
    || "";
}

function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  // Gemini returns mono, signed 16-bit little-endian PCM.
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

function readAudio(json: any): { bytes: Buffer; sampleRate: number } | null {
  const inline = json?.candidates?.[0]?.content?.parts?.find(
    (part: any) => part?.inlineData?.data
  )?.inlineData;
  if (!inline?.data) return null;
  const bytes = Buffer.from(String(inline.data), "base64");
  const rate = Number(String(inline.mimeType || "").match(/rate=(\d+)/i)?.[1]) || 24000;
  return { bytes, sampleRate: rate };
}

export async function POST(req: Request) {
  const key = geminiKey();
  if (!key) {
    return NextResponse.json(
      { error: "Cloud voice is not configured; the client will use its guarded native fallback." },
      { status: 503 }
    );
  }

  let body: { text?: unknown; voiceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });
  const profile = VOICES[String(body.voiceId || "f1")] || VOICES.f1;
  const configuredModel = process.env.SHIGUN_TTS_MODEL || process.env.GEMINI_TTS_MODEL;
  const models = [...new Set([
    configuredModel,
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash-preview-tts",
  ].filter(Boolean))] as string[];

  let lastStatus = 502;
  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Speak the text after the divider exactly once in a ${profile.direction} tutoring voice. Do not add, omit, paraphrase, or repeat words.\n---\n${text}`,
              }],
            }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: profile.name },
                },
              },
            },
          }),
          signal: AbortSignal.timeout(22000),
        }
      );
      lastStatus = response.status;
      if (!response.ok) continue;

      const audio = readAudio(await response.json());
      if (!audio?.bytes.length) continue;
      const isWav = audio.bytes.subarray(0, 4).toString("ascii") === "RIFF";
      const wav = isWav ? audio.bytes : pcmToWav(audio.bytes, audio.sampleRate);
      const responseBody = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
      return new Response(responseBody, {
        status: 200,
        headers: {
          "content-type": "audio/wav",
          "content-length": String(wav.length),
          "cache-control": "private, no-store",
          "x-shigun-voice": `${profile.name};${model}`,
        },
      });
    } catch {
      lastStatus = 504;
    }
  }

  return NextResponse.json(
    { error: "Cloud voice generation is temporarily unavailable; the client will use its guarded native fallback." },
    { status: lastStatus === 429 ? 429 : 502 }
  );
}
