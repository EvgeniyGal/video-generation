import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error("Set DIRECT_URL or DATABASE_URL for drizzle-kit");
}

// Parse URL so we can force ssl:false for self-hosted Supavisor (plain Postgres).
const parsed = new URL(url);
const database = parsed.pathname.replace(/^\//, "") || "postgres";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    ssl: false,
  },
});
