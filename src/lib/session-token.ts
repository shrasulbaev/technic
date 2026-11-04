import { jwtVerify, SignJWT } from "jose";
import { env } from "./env";

// role is null until the new user picks client or driver.
export type Session = { userId: string; role: "client" | "driver" | "admin" | null };

export const SESSION_COOKIE = "technic_session";
export const SESSION_DAYS = 30;

function key() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId, role: (payload.role as Session["role"]) ?? null };
  } catch {
    return null;
  }
}
