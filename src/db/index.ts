import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// The database is REQUIRED for full functionality, but it must never prevent
// the app from building or booting. A missing DATABASE_URL now yields a
// lazy "unavailable" handle instead of throwing at import time, so `next
// build` succeeds, the UI still loads, and every API call surfaces a clear
// 503 ("database unavailable") until the variable is configured. Routes with
// their own try/catch (chat, health, ...) convert that into friendly JSON.
const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlPoolErrorListener?: boolean;
};

const requestedPoolSize = Number(process.env.DATABASE_POOL_MAX || 5);
const maxPoolSize = Number.isFinite(requestedPoolSize)
  ? Math.max(1, Math.min(20, Math.round(requestedPoolSize)))
  : 5;

function buildPool(connectionString: string): Pool {
  const created = new Pool({
    connectionString,
    max: maxPoolSize,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    allowExitOnIdle: process.env.NODE_ENV !== "production",
  });

  // An idle client error without a listener is an uncaught EventEmitter error
  // and can terminate the whole Node process. Log a credential-free summary
  // and let subsequent requests reconnect through the pool.
  if (!globalForDb.__arenaNextJsPostgresqlPoolErrorListener) {
    created.on("error", (error) => {
      console.error("Unexpected PostgreSQL pool error:", error.message);
    });
    globalForDb.__arenaNextJsPostgresqlPoolErrorListener = true;
  }
  return created;
}

export const pool: Pool | null = databaseUrl
  ? (globalForDb.__arenaNextJsPostgresqlPool ?? buildPool(databaseUrl))
  : null;

if (pool && process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

type Db = ReturnType<typeof drizzle>;

/** The single sentinel thrown by the unavailable-database handle below.
 *  Route guards match on this class (its message also contains "DATABASE_URL",
 *  which the state route's legacy message check relies on). */
export class DatabaseUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not configured; the database is unavailable.");
    this.name = "DatabaseUnavailableError";
  }
}

/** A query-builder stand-in that rejects every call with a clear error, so
 *  any code path that touches the DB without a configured DATABASE_URL fails
 *  loudly but never crashes the module graph or the build.
 *
 *  The handle mimics drizzle's promise-like query builders: every property
 *  access and every call returns another awaitable handle, so a full chain
 *  such as `db.select().from(users).where(...).limit(1)` only rejects once,
 *  at the terminal `await`, with a DatabaseUnavailableError — never with a
 *  confusing `TypeError: … .from is not a function` and never leaving an
 *  orphaned rejected promise behind. */
export function unavailableDb(): Db {
  const rejection = () => Promise.reject(new DatabaseUnavailableError());
  const handle: unknown = new Proxy(function unavailable() {}, {
    get: (_target, prop) => {
      if (prop === "then") {
        return (onFulfilled?: unknown, onRejected?: unknown) =>
          rejection().then(onFulfilled as never, onRejected as never);
      }
      if (prop === "catch") {
        return (onRejected?: unknown) => rejection().catch(onRejected as never);
      }
      if (prop === "finally") {
        return (onFinally?: () => void) => rejection().finally(onFinally);
      }
      return handle;
    },
    apply: () => handle,
  });
  return handle as Db;
}

export const db: Db = pool ? drizzle(pool) : unavailableDb();
