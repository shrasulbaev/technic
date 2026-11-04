import Link from "next/link";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, vehicleTypes } from "@/db/schema";
import { requireUser } from "@/server/me";
import { OrderCard } from "@/components/order-card";

export default async function ClientHome() {
  const me = await requireUser("client");
  const active = await db()
    .select({ o: orders, typeName: vehicleTypes.name })
    .from(orders)
    .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
    .where(and(eq(orders.clientId, me.id), notInArray(orders.status, ["completed", "cancelled"])))
    .orderBy(desc(orders.createdAt));
  return (
    <>
      <section className="flex flex-col gap-1 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Что нужно{me.name ? `, ${me.name}` : ""}?</h1>
        <p className="text-muted">Выберите услугу, цену предложите сами</p>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/c/new?kind=cargo" className="flex h-40 flex-col justify-between rounded-3xl bg-accent p-4 text-accent-ink">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#15171C" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z" /><circle cx="6" cy="17.5" r="2" fill="#F5B700" /><circle cx="17" cy="17.5" r="2" fill="#F5B700" /></svg>
          <span><span className="block text-lg font-extrabold">Грузоперевозка</span><span className="text-sm font-medium">Портер, Газель, 5–10 т</span></span>
        </Link>
        <Link href="/c/new?kind=equipment" className="flex h-40 flex-col justify-between rounded-3xl bg-ink p-4 text-white">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F5B700" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d="M3 18h10v-5H6l-3 3z" /><path d="M13 15l3-8 5 3-2 4" /><circle cx="6" cy="19" r="1.5" /><circle cx="11" cy="19" r="1.5" /></svg>
          <span><span className="block text-lg font-extrabold">Спецтехника</span><span className="text-sm font-medium text-ink-muted">Экскаватор, кран, самосвал</span></span>
        </Link>
      </div>
      {active.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">Текущие заказы</h2>
          {active.map(({ o, typeName }) => <OrderCard key={o.id} o={o} typeName={typeName} href={`/c/orders/${o.id}`} />)}
        </section>
      )}
    </>
  );
}
