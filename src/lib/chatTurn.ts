/** Shared helper so the chat API and the browser never drop a turn. */

export type ChatMessageRow = {
  id: number;
  userId: number;
  role: string;
  content: string;
  createdAt: string;
};

type IncomingMessage = {
  id: number;
  userId: number;
  role: string;
  content: string;
  createdAt?: string | Date;
};

function asIso(value: string | Date | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return new Date().toISOString();
}

function nextPositiveId(messages: ChatMessageRow[]): number {
  let max = 0;
  for (const message of messages) {
    if (typeof message.id === "number" && message.id > max) max = message.id;
  }
  return max > 0 ? max + 1 : Date.now();
}

/**
 * Guarantee the latest user + assistant messages are in the list the UI
 * renders. Persistence can fail (no DATABASE_URL, a blip, user.id === 0);
 * the spoken/typed turn must still appear.
 */
export function appendChatTurn(
  messages: IncomingMessage[] | null | undefined,
  userText: string,
  assistantText: string,
  userId = 0,
): ChatMessageRow[] {
  const user = userText.trim();
  const assistant = assistantText.trim();
  const list: ChatMessageRow[] = Array.isArray(messages)
    ? messages
      .filter((message) => message && typeof message.content === "string")
      .map((message) => ({
        id: message.id,
        userId: message.userId,
        role: message.role,
        content: message.content,
        createdAt: asIso(message.createdAt),
      }))
    : [];
  if (!user && !assistant) return list;

  const now = new Date().toISOString();
  let nextId = nextPositiveId(list);
  const hasUser = user ? list.some((message) => message.role === "user" && message.content === user) : true;
  const hasAssistant = assistant
    ? list.some((message) => message.role === "assistant" && message.content === assistant)
    : true;

  if (!hasUser) {
    list.push({ id: nextId++, userId, role: "user", content: user, createdAt: now });
  }
  if (!hasAssistant) {
    list.push({ id: nextId++, userId, role: "assistant", content: assistant, createdAt: now });
  }
  return list;
}

/** True when a /api/state-shaped payload is a DB-less or error fallback. */
export function isFallbackUser(user: { id?: number } | null | undefined): boolean {
  return !user || typeof user.id !== "number" || user.id <= 0;
}
