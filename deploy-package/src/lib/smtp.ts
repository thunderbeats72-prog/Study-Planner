/**
 * RAW SMTP CLIENT - no library, no framework.
 * ───────────────────────────────────────────
 * Dependencies in this repo are frozen at eight, and nodemailer is not one
 * of them. SMTP itself is small: a greeting, EHLO, AUTH LOGIN, MAIL, RCPT,
 * DATA, QUIT - so this module speaks it directly over a TLS socket
 * (submission port 465; 587 via STARTTLS is one extra round trip).
 *
 * Why hand-rolled is safe here:
 *   • ONE recipient per message, always (a digest goes to its own owner);
 *   • the message comes in fully serialized (src/lib/mime.ts);
 *   • every step waits for its documented reply code, so a bad app password
 *     surfaces as "535 authentication failed" rather than a hung function;
 *   • the socket layer is INJECTED, so the test suite scripts the whole
 *     dialogue against a fake server without a single real packet.
 */

import * as net from "node:net";
import * as tls from "node:tls";
import * as os from "node:os";
import { dotStuff } from "./mime";

export type SmtpConfig = {
  host: string;
  port: number;
  /** Gmail address; also the envelope sender. */
  user: string;
  /** Gmail app password (or equivalent). */
  password: string;
  /** implicit TLS (465) when true, STARTTLS (587) when false. Default true. */
  secure?: boolean;
};

/** The minimal socket the dialogue needs - a TLS socket in production, a
 *  scripted fake in the test suite. */
export interface SmtpSocket {
  write(data: string): void;
  end(): void;
  on(event: "data" | "error" | "close", listener: (arg?: unknown) => void): void;
  removeAllDataListeners?(): void;
}

/** Default socket factory: implicit TLS for 465, plain for 587 (upgraded). */
async function openRealSocket(config: SmtpConfig, timeoutMs: number): Promise<SmtpSocket> {
  if (config.secure === false) {
    const plain = net.connect({ host: config.host, port: config.port });
    plain.setTimeout(timeoutMs);
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        plain.off("error", onError);
        reject(error);
      };
      plain.once("error", onError);
      plain.once("connect", () => {
        plain.off("error", onError);
        resolve(plain as unknown as SmtpSocket);
      });
    });
  }
  const socket = tls.connect({
    host: config.host,
    port: config.port,
    servername: config.host,
    timeout: timeoutMs,
  });
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      socket.off("error", onError);
      reject(error);
    };
    socket.once("error", onError);
    socket.once("secureConnect", () => {
      socket.off("error", onError);
      resolve(socket as unknown as SmtpSocket);
    });
  });
}

/** Upgrade an open plain socket to TLS (STARTTLS). Test suites never see this. */
function upgradeToTls(socket: SmtpSocket, host: string, timeoutMs: number): Promise<SmtpSocket> {
  return new Promise((resolve, reject) => {
    const upgraded = tls.connect({
      host,
      servername: host,
      socket: socket as unknown as net.Socket,
      timeout: timeoutMs,
    });
    const onError = (error: Error) => {
      upgraded.off("error", onError);
      reject(error);
    };
    upgraded.once("error", onError);
    upgraded.once("secureConnect", () => {
      upgraded.off("error", onError);
      resolve(upgraded as unknown as SmtpSocket);
    });
  });
}

export class SmtpError extends Error {
  readonly stage: string;
  readonly code: number;
  constructor(stage: string, reply: string, code = 0) {
    super(`SMTP ${stage} failed: ${reply.trim() || "no reply"}`);
    this.name = "SmtpError";
    this.stage = stage;
    this.code = code;
  }
}

type Reply = { code: number; text: string };

/** Speak the dialogue over one socket. Returns on the 250 after DATA. */
async function smtpDialogue(
  socketFactory: () => Promise<SmtpSocket>,
  upgrade: boolean,
  host: string,
  auth: { user: string; password: string },
  envelope: { from: string; to: string },
  mime: string,
  timeoutMs: number,
): Promise<string> {
  let socket: SmtpSocket | null = null;
  let buffer = "";
  const waiters: { resolveLine: (reply: Reply) => void; rejectLine: (error: Error) => void }[] = [];
  const replies: Reply[] = [];
  let pendingReply: { code: number; lines: string[] } | null = null;
  let fail: Error | null = null;
  let done = false;

  const pump = () => {
    if (fail) {
      while (waiters.length) waiters.shift()!.rejectLine(fail);
      return;
    }
    while (waiters.length && replies.length) {
      waiters.shift()!.resolveLine(replies.shift()!);
    }
  };

  const attach = (s: SmtpSocket) => {
    s.on("data", (chunk) => {
      buffer += String(chunk);
      for (;;) {
        const nl = buffer.indexOf("\r\n");
        if (nl < 0) break;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        // Multi-line replies: "250-word" belongs to one reply; "250 word"
        // (same code, a space) is its final line.
        const match = /^(\d{3})([ -])(.*)$/.exec(line);
        if (!match) continue;
        const code = Number(match[1]);
        if (!pendingReply || pendingReply.code !== code) {
          if (pendingReply) {
            // A different code closing our pending block: finish it first.
            replies.push({ code: pendingReply.code, text: pendingReply.lines.join("\n") });
          }
          pendingReply = { code, lines: [] };
        }
        pendingReply.lines.push(match[3]);
        if (match[2] === " ") {
          replies.push({ code, text: pendingReply.lines.join("\n") });
          pendingReply = null;
        }
      }
      pump();
    });
    s.on("error", (error) => {
      fail = error instanceof Error ? error : new Error(String(error));
      pump();
    });
    s.on("close", () => {
      if (!done && !fail) {
        fail = new SmtpError("connection", "the server closed the connection mid-dialogue");
        pump();
      }
    });
  };

  const expect = (stage: string, codes: number[]): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      waiters.push({
        resolveLine: (reply) => {
          if (!codes.includes(reply.code)) {
            reject(new SmtpError(stage, reply.text, reply.code));
          } else {
            resolve(reply.text);
          }
        },
        rejectLine: reject,
      });
      pump();
    });

  const command = async (stage: string, line: string, codes: number[]): Promise<string> => {
    const waiting = expect(stage, codes);
    socket!.write(line + "\r\n");
    return waiting;
  };

  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => {
      reject(new SmtpError("timeout", `no reply within ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const run = (async () => {
    socket = await socketFactory();
    attach(socket);
    await expect("greeting", [220]);
    await command("EHLO", `EHLO ${os.hostname() || "localhost"}`, [250]);
    if (upgrade) {
      socket.removeAllDataListeners?.();
      await command("STARTTLS", "STARTTLS", [220]);
      socket = await upgradeToTls(socket, host, timeoutMs);
      // Re-attach after the upgrade: new socket, fresh pipeline.
      attach(socket);
      await command("EHLO", `EHLO ${os.hostname() || "localhost"}`, [250]);
    }
    await command("AUTH", "AUTH LOGIN", [334]);
    await command("AUTH username", Buffer.from(auth.user, "utf8").toString("base64"), [334]);
    await command("AUTH password", Buffer.from(auth.password, "utf8").toString("base64"), [235]);
    await command("MAIL FROM", `MAIL FROM:<${envelope.from}>`, [250]);
    await command("RCPT TO", `RCPT TO:<${envelope.to}>`, [250, 251]);
    await command("DATA", "DATA", [354]);
    const accepted = await command("message body", `${dotStuff(mime)}\r\n.`, [250]);
    try {
      socket.write("QUIT\r\n");
      socket.end();
    } catch {
      /* QUIT is courtesy, not correctness */
    }
    return accepted;
  })();

  try {
    return await Promise.race([run, timeout]);
  } finally {
    done = true;
    if (deadline) clearTimeout(deadline);
    try {
      /* TS narrows `socket` to null here because the assignments live inside
         the async runner above; the union cast puts the real type back. */
      (socket as SmtpSocket | null)?.end();
    } catch {
      /* already gone */
    }
  }
}

export type SmtpSendResult = { accepted: boolean; reply: string };

/**
 * Send one fully-built MIME message to one recipient.
 * `socketFactory` and `upgrade` exist for one reason: the test suite drives
 * the dialogue over a scripted fake socket with the exact same code path.
 */
export async function sendViaSmtp(
  config: SmtpConfig,
  envelope: { from: string; to: string },
  mime: string,
  options: {
    timeoutMs?: number;
    socketFactory?: () => Promise<SmtpSocket>;
  } = {},
): Promise<SmtpSendResult> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const factory = options.socketFactory || (() => openRealSocket(config, timeoutMs));
  const reply = await smtpDialogue(
    factory,
    config.secure === false,
    config.host,
    { user: config.user, password: config.password },
    envelope,
    mime,
    timeoutMs,
  );
  return { accepted: true, reply };
}
