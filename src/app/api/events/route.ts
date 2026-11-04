import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/server/session";
import { sseResponse } from "@/server/realtime";

export const dynamic = "force-dynamic";

// Each user hears events addressed to them; drivers also hear feed changes.
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response("unauthorized", { status: 401 });
  const [u] = await db().select({ role: users.role }).from(users).where(eq(users.id, s.userId));
  const isDriver = u?.role === "driver";
  const isAdmin = u?.role === "admin";
  return sseResponse(req, (e) => {
    if (isAdmin && e.type !== "location") return { type: e.type, orderId: e.orderId };
    if (e.users?.includes(s.userId)) return { type: e.type, orderId: e.orderId };
    if (isDriver && e.drivers) return { type: "feed", orderId: e.orderId };
    return null;
  });
}
