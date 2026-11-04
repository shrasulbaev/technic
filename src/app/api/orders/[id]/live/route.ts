import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, orders, trackPoints, users } from "@/db/schema";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

// Polled by the tracking map: driver position, the trip's track and status.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const [o] = await db().select().from(orders).where(eq(orders.id, id));
  if (!o) return new Response("not found", { status: 404 });
  const [u] = await db().select({ role: users.role }).from(users).where(eq(users.id, s.userId));
  if (o.clientId !== s.userId && o.driverId !== s.userId && u?.role !== "admin") return new Response("forbidden", { status: 403 });
  const [d] = o.driverId ? await db().select({ lat: drivers.lat, lng: drivers.lng, at: drivers.locationAt }).from(drivers).where(eq(drivers.userId, o.driverId)) : [];
  const track = await db().select({ lat: trackPoints.lat, lng: trackPoints.lng }).from(trackPoints).where(eq(trackPoints.orderId, id)).orderBy(asc(trackPoints.at)).limit(2000);
  return Response.json({
    status: o.status,
    driver: d && d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng, at: d.at } : null,
    track,
  });
}
