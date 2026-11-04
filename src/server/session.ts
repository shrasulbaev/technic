import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type Session } from "@/lib/session-token";

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function setSession(session: Session) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export type RoleSession<R extends NonNullable<Session["role"]>> = Session & { role: R };

export async function requireRole<R extends NonNullable<Session["role"]>>(role: R): Promise<RoleSession<R>> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== role) redirect(homeFor(s));
  return s as RoleSession<R>;
}

export function homeFor(s: Session | null): string {
  if (!s) return "/login";
  if (s.role === "client") return "/c";
  if (s.role === "driver") return "/d";
  if (s.role === "admin") return "/admin";
  return "/onboarding";
}
