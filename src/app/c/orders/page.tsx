import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, vehicleTypes } from "@/db/schema";
import { requireUser } from "@/server/me";
import { OrderCard } from "@/components/order-card";

export default async function ClientOrders() {
  const me = await requireUser("client");
  const rows = await db()
    .select({ o: orders, typeName: vehicleTypes.name })
    .from(orders)
    .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
    .where(eq(orders.clientId, me.id))
    .orderBy(desc(orders.createdAt))
    .limit(100);
  return (
    <>
      <h1 className="pt-2 text-2xl font-extrabold">Мои заказы</h1>
      {rows.length === 0 && <p className="rounded-2xl bg-surface p-6 text-center text-muted">Заказов пока нет</p>}
      {rows.map(({ o, typeName }) => <OrderCard key={o.id} o={o} typeName={typeName} href={`/c/orders/${o.id}`} />)}
    </>
  );
}
