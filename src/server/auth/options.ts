import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

async function authorizeFromDb(email: string, password: string) {
  const row = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!row?.passwordHash) return null;
  const valid = await bcrypt.compare(password, row.passwordHash);
  if (!valid) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || "Operator",
  };
}

/** Legacy single-operator env fallback (AUTH_EMAIL + hash/plain). */
async function authorizeFromEnv(email: string, password: string) {
  const expectedEmail = (process.env.AUTH_EMAIL ?? "").trim().toLowerCase();
  if (!expectedEmail || email !== expectedEmail) return null;

  const expectedHash = process.env.AUTH_PASSWORD_HASH;
  const expectedPlain = process.env.AUTH_PASSWORD;
  let valid = false;
  if (expectedHash) {
    valid = await bcrypt.compare(password, expectedHash);
  } else if (expectedPlain) {
    valid = password === expectedPlain;
  }
  if (!valid) return null;
  return { id: "operator", email: expectedEmail, name: "Operator" };
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        try {
          const fromDb = await authorizeFromDb(email, password);
          if (fromDb) return fromDb;
        } catch (err) {
          console.error("[auth] DB lookup failed", err);
        }

        return authorizeFromEnv(email, password);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        if (token.sub) session.user.id = token.sub;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
