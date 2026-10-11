import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DIRECT_URL / DATABASE_URL in .env");
  process.exit(1);
}

const safe = url.replace(/:[^:@]+@/, ":***@");
console.log("Connecting to", safe);

const sql = postgres(url, {
  prepare: false,
  max: 1,
  connect_timeout: 15,
  ssl: false,
});

try {
  await sql`select 1 as ok`;
  console.log("Connection OK");

  const files = ["drizzle/0000_init.sql", "drizzle/0001_ideas_tone_style.sql"];
  for (const relative of files) {
    const file = resolve(relative);
    const ddl = readFileSync(file, "utf8");
    await sql.unsafe(ddl);
    console.log("Applied", file);
  }

  const tables = await sql`
    select tablename
    from pg_tables
    where schemaname = 'public' and tablename like 'vc_%'
    order by tablename
  `;
  console.log(
    "vc_* tables:",
    tables.map((t) => t.tablename).join(", ") || "(none)",
  );
} catch (err) {
  console.error("\nMigration failed:");
  console.error(" ", err.message);
  if (err.code) console.error("  code:", err.code);
  if (err.cause?.message) console.error("  cause:", err.cause.message);

  console.error(`
Fix connection string in .env, then retry.

Your host uses Supavisor. Username must be:
  postgres.<tenant_id>
and that tenant must exist on the server.

Quick workaround: open Supabase SQL editor and paste drizzle/0000_init.sql
`);
  process.exit(1);
} finally {
  await sql.end({ timeout: 2 }).catch(() => {});
}
