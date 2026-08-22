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

/** A query-builder stand-in that rejects every call with a clear error, so
 *  any code path that touches the DB without a configured DATABASE_URL fails
 *  loudly but never crashes the module graph or the build. */
function unavailableDb(): Db {
  const unavailable = () =>
    Promise.reject(new Error("DATABASE_URL is not configured; the database is unavailable."));
  const handle: unknown = new Proxy(unavailable, {
    get: () => handle,
    apply: () => Promise.reject(new Error("DATABASE_URL is not configured; the database is unavailable.")),
  });
  return handle as Db;
}

export const db: Db = pool ? drizzle(pool) : unavailableDb();
