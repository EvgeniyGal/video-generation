import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __reelsDb?: Db };

/** Prefer DIRECT_URL for the long-lived Node server; pooled/transaction ports often time out. */
function getConnectionString() {
  return process.env.DIRECT_URL || process.env.DATABASE_URL;
}

function createDb(): Db {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_URL is not set");
  }
  const client = postgres(connectionString, {
    prepare: false,
    max: 10,
    connect_timeout: 15,
    // Self-hosted Supavisor on these ports speaks plain Postgres (not TLS).
    ssl: false,
  });
  return drizzle(client, { schema });
}

function getDb(): Db {
  if (!globalForDb.__reelsDb) {
    globalForDb.__reelsDb = createDb();
  }
  return globalForDb.__reelsDb;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getDb(), prop, receiver);
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
});

export type Database = Db;
