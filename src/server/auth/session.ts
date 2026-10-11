import { getServerSession } from "next-auth";
import { authOptions } from "./options";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function getSession() {
  return getServerSession(authOptions);
}
