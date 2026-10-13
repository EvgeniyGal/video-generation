import "dotenv/config";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const email = (process.argv[2] || "").trim().toLowerCase();
const password = process.argv[3] || "";
const name = process.argv[4] || "Operator";

if (!email || !password) {
  console.error(
    "Usage: node scripts/upsert-user.mjs <email> <password> [name]",
  );
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const sql = postgres(url, { prepare: false, max: 1, ssl: false });

try {
  await sql`
    INSERT INTO vc_users (email, name, password_hash)
    VALUES (${email}, ${name}, ${hash})
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash
  `;
  console.log("Upserted user", email);
} finally {
  await sql.end();
}
