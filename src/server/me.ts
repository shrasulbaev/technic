import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession, homeFor } from "./session";

type Role = "client" | "driver" | "admin";

// Reads the user from the database on every request, so a block or a role
// change takes effect at once.
export async function requireUser(role: Role) {
  const s = await getSession();
  if (!s) redirect("/login");
  const [u] = await db().select().from(users).where(eq(users.id, s.userId));
  if (!u || u.blocked) redirect("/logout");
  if (u.role !== role) redirect(u.role ? homeFor({ userId: u.id, role: u.role }) : "/onboarding");
  return u;
}
