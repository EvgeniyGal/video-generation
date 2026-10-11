import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __reelsDb?: Db };

function createDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(connectionString, {
    prepare: false,
    max: 10,
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
