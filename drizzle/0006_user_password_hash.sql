-- Multi-user login: store bcrypt password hashes on vc_users.
ALTER TABLE "vc_users" ADD COLUMN IF NOT EXISTS "password_hash" text;
