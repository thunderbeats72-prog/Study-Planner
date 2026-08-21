/* ============================================================
   MICROSOFT EDGE MULTILINGUAL NEURAL TTS — keyless engine core
   ============================================================
   Uses the public Microsoft Edge "Read Aloud" speech service
   (the same endpoint the Edge browser speaks with). It needs NO
   API key, NO subscription, and NO quota — the TrustedClientToken
   below is a public constant shipped with every Edge install.

   One universal speaker in EVERY language: the multilingual neural
   voices (Ava / Emma / Andrew) keep the SAME voice name while only
   the SSML `xml:lang` follows the detected language. Hindi,
   Hinglish, English, Tamil… always the same neural person.

   This module is isomorphic:
   - Node (API route): connects through the `ws` package so the
     Edge-style Origin/User-Agent headers can be sent.
   - Browser: uses the native WebSocket (no headers available, and
     none required) so speech still works even when the *server*
     cannot reach the speech service (e.g. restricted networks).

   Protocol reference: the open msedge-tts / edge-tts projects (MIT).
============================================================ */

import type { LangTag } from "./language";

export const EDGE_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_WSS_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const EDGE_GEC_VERSION = "1-143.0.3650.96";
const EDGE_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const AUDIO_MARKER = "Path:audio\r\n";
const TURN_END_MARKER = "Path:turn.end";
const WIN_EPOCH_SECONDS = 11_644_473_600;
const GEC_BUCKET_SECONDS = 300; // the DRM clock token rotates every 5 minutes

export type EdgeVoiceId = "f1" | "f2" | "m1";

export type EdgeVoice = {
  id: EdgeVoiceId;
  /** Fixed multilingual neural voice name — identical for every locale. */
  name: string;
  label: string;
  gender: "female" | "male";
  hint: string;
  /** Subtle per-persona signature; the person itself never changes. */
  prosody: { rate: string; pitch: string };
};

export const EDGE_VOICES: Record<EdgeVoiceId, EdgeVoice> = {
  f1: {
    id: "f1",
    name: "en-US-AvaMultilingualNeural",
    label: "Ava",
    gender: "female",
    hint: "Warm neural tutor — every language",
    prosody: { rate: "+0%", pitch: "+0Hz" },
  },
  f2: {
    id: "f2",
    name: "en-US-EmmaMultilingualNeural",
    label: "Emma",
    gender: "female",
    hint: "Bright neural tutor — every language",
    prosody: { rate: "+4%", pitch: "+2Hz" },
  },
  m1: {
    id: "m1",
    name: "en-US-AndrewMultilingualNeural",
    label: "Andrew",
    gender: "male",
    hint: "Grounded neural tutor — every language",
    prosody: { rate: "-4%", pitch: "-2Hz" },
  },
};

export function resolveEdgeVoice(personaId: string | null | undefined): EdgeVoice {
  const id = (personaId && personaId in EDGE_VOICES ? personaId : "f1") as EdgeVoiceId;
  return EDGE_VOICES[id];
}

/* ------------------------------------------------------------
   Sec-MS-GEC DRM token (public algorithm; rotates every 5 min)
------------------------------------------------------------ */

async function sha256HexUpper(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("crypto.subtle unavailable (needs HTTPS or localhost)");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function secMsGecToken(nowMs: number = Date.now()): Promise<string> {
  const seconds = Math.floor(nowMs / 1000) + WIN_EPOCH_SECONDS;
  const bucketed = seconds - (seconds % GEC_BUCKET_SECONDS);
  const windowsTicks = bucketed * 10_000_000;
  return sha256HexUpper(`${windowsTicks}${EDGE_TRUSTED_CLIENT_TOKEN}`);
}

export function edgeConnectionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export async function edgeSynthUrl(nowMs: number = Date.now()): Promise<string> {
  const token = await secMsGecToken(nowMs);
  const baseUrl = (typeof process !== "undefined" ? process.env?.SHIGUN_EDGE_TTS_URL : undefined) || EDGE_WSS_URL;
  return (
    `${baseUrl}?TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=${EDGE_GEC_VERSION}` +
    `&ConnectionId=${edgeConnectionId()}`
  );
}

/* ------------------------------------------------------------
   SSML — same voice name in every language; only xml:lang moves
------------------------------------------------------------ */

export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildEdgeSsml(text: string, voice: EdgeVoice, language: LangTag): string {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${language}'>` +
    `<voice name='${voice.name}'>` +
    `<prosody pitch='${voice.prosody.pitch}' rate='${voice.prosody.rate}' volume='+0%'>` +
    `${escapeSsml(text)}` +
    `</prosody></voice></speak>`
  );
}

function speechConfigMessage(): string {
  const config = {
    context: {
      synthesis: {
        audio: {
          metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
          outputFormat: EDGE_OUTPUT_FORMAT,
        },
      },
    },
  };
  return (
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n${JSON.stringify(config)}`
  );
}

function ssmlMessage(ssml: string): string {
  return (
    `X-RequestId:${edgeConnectionId()}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${new Date().toISOString()}Z\r\n` +
    `Path:ssml\r\n\r\n${ssml}`
  );
}

/* ------------------------------------------------------------
   Frame parsing (pure — easy to unit test)
------------------------------------------------------------ */

/** Extract the raw audio payload from a binary websocket frame.
 *  Binary frames look like: [2-byte BE header length][headers][mp3 bytes].
 *  Returns null when the frame is not an audio frame. */
export function parseEdgeAudioFrame(data: Uint8Array): Uint8Array | null {
  const prefix = new TextDecoder("latin1").decode(data.subarray(0, Math.min(data.length, 200)));
  const markerAt = prefix.indexOf(AUDIO_MARKER);
  if (markerAt < 0) return null;
  const audioFrom = markerAt + AUDIO_MARKER.length;
  return data.subarray(audioFrom);
}

export function isTurnEnd(textMessage: string): boolean {
  return textMessage.includes(TURN_END_MARKER);
}

/* ------------------------------------------------------------
   Socket layer — the connector is injected so the client bundle
   never sees Node-only dependencies. The browser connector below
   uses the native WebSocket (no custom headers needed).
------------------------------------------------------------ */

export type EdgeSocket = {
  send(message: string): void;
  close(): void;
};

export type SocketHandlers = {
  onText: (message: string) => void;
  onBinary: (data: Uint8Array) => void;
  onOpen: () => void;
  onFailure: (error: unknown) => void;
  onClosed: () => void;
};

export type EdgeSocketConnector = (handlers: SocketHandlers) => Promise<EdgeSocket>;

export const IS_BROWSER = typeof window !== "undefined" && typeof window.document !== "undefined";

/** Native browser socket. Browsers cannot set Origin/User-Agent headers
 *  on WebSockets — and the keyless Edge service accepts them anyway. */
export const connectEdgeSocketBrowser: EdgeSocketConnector = async (handlers) => {
  const socket = new WebSocket(await edgeSynthUrl());
  socket.binaryType = "arraybuffer";
  socket.onopen = handlers.onOpen;
  socket.onclose = handlers.onClosed;
  socket.onerror = () => handlers.onFailure(new Error("Edge speech socket failed"));
  socket.onmessage = (event: MessageEvent) => {
    if (typeof event.data === "string") handlers.onText(event.data);
    else if (event.data instanceof ArrayBuffer) handlers.onBinary(new Uint8Array(event.data));
    else if (event.data instanceof Blob) void event.data.arrayBuffer()
      .then((buffer) => handlers.onBinary(new Uint8Array(buffer)));
  };
  return { send: (message) => socket.send(message), close: () => socket.close() };
};

/* ------------------------------------------------------------
   Synthesis
------------------------------------------------------------ */

export type EdgeSynthesis =
  | { bytes: Uint8Array; contentType: "audio/mpeg" }
  | { error: string; unreachable?: boolean };

export type EdgeSynthesisOptions = {
  text: string;
  voiceId: string;
  language: LangTag;
  /** Overall guard (connect + synthesis). Default 14s. */
  timeoutMs?: number;
};

/** Synthesize speech through Microsoft Edge's keyless neural service.
 *  The voice NEVER changes with the language — only xml:lang does. */
export async function synthesiseEdgeSpeech(
  options: EdgeSynthesisOptions,
  connect: EdgeSocketConnector = connectEdgeSocketBrowser
): Promise<EdgeSynthesis> {
  const cleaned = options.text.replace(/\s+/g, " ").trim().slice(0, 5000);
  if (!cleaned) return { error: "Text is required." };

  const timeoutMs = options.timeoutMs ?? 14_000;
  return new Promise<EdgeSynthesis>((resolve) => {
    let settled = false;
    let opened = false;
    const chunks: Uint8Array[] = [];
    let socket: EdgeSocket | null = null;
    let guard: ReturnType<typeof setTimeout> | null = null;

    const seal = () => {
      if (guard) clearTimeout(guard);
      try { socket?.close(); } catch { /* already closed */ }
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      seal();
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
      resolve({ bytes: merged, contentType: "audio/mpeg" });
    };

    const fail = (result: Extract<EdgeSynthesis, { error: string }>) => {
      if (settled) return;
      settled = true;
      seal();
      resolve(result);
    };

    guard = setTimeout(() => {
      fail({
        error: opened ? "The neural voice is taking too long to respond." : "The neural voice service is unreachable from here.",
        unreachable: !opened,
      });
    }, timeoutMs);

    void connect({
      onOpen: () => {
        opened = true;
        socket?.send(speechConfigMessage());
        socket?.send(ssmlMessage(buildEdgeSsml(cleaned, resolveEdgeVoice(options.voiceId), options.language)));
      },
      onText: (message) => {
        if (isTurnEnd(message)) {
          if (!chunks.length) fail({ error: "The neural voice returned no audio for this text." });
          else succeed();
        }
      },
      onBinary: (data) => {
        const audio = parseEdgeAudioFrame(data);
        if (audio && audio.length) chunks.push(audio);
      },
      onFailure: (error) => {
        fail({
          error: opened
            ? "The neural voice connection dropped mid-sentence."
            : `The neural voice service is unreachable (${(error as Error)?.message || "connection refused"}).`,
          unreachable: !opened,
        });
      },
      onClosed: () => {
        if (!settled) {
          if (chunks.length) succeed();
          else fail({ error: "The neural voice connection closed before audio arrived.", unreachable: !opened });
        }
      },
    }).then((openedSocket) => {
      socket = openedSocket;
      if (settled) { try { socket.close(); } catch { /* lost the race */ } }
    }).catch((error) => {
      fail({
        error: `The neural voice could not start (${(error as Error)?.message || "socket error"}).`,
        unreachable: true,
      });
    });
  });
}
