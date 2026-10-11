import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

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
        const expectedEmail = (process.env.AUTH_EMAIL ?? "").trim().toLowerCase();
        const expectedHash = process.env.AUTH_PASSWORD_HASH;
        const expectedPlain = process.env.AUTH_PASSWORD;

        if (!email || !password || !expectedEmail) return null;
        if (email !== expectedEmail) return null;

        let valid = false;
        if (expectedHash) {
          valid = await bcrypt.compare(password, expectedHash);
        } else if (expectedPlain) {
          valid = password === expectedPlain;
        }

        if (!valid) return null;
        return { id: "operator", email: expectedEmail, name: "Operator" };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
