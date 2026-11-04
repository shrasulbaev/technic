import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/server/session";
import { updateLocation } from "@/server/orders";

const body = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

// The driver's phone (or the test simulation) reports where it is.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new Response("unauthorized", { status: 401 });
  const [u] = await db().select({ role: users.role }).from(users).where(eq(users.id, s.userId));
  if (u?.role !== "driver") return new Response("forbidden", { status: 403 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response("bad request", { status: 400 });
  await updateLocation(s.userId, p.data);
  return Response.json({ ok: true });
}
