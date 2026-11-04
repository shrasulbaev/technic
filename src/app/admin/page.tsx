import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, orders, users, vehicleTypes, walletTx } from "@/db/schema";
import { OrderCard } from "@/components/order-card";
import { som } from "@/lib/rules";

export default async function AdminHome() {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [[stats], [pendingDrivers], [online], [revenue], recent] = await Promise.all([
    db()
      .select({
        total: sql<number>`count(*)::int`,
        searching: sql<number>`count(*) filter (where ${orders.status} = 'searching')::int`,
        active: sql<number>`count(*) filter (where ${orders.status} in ('assigned','confirmed','en_route','arrived','in_progress'))::int`,
        completed: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
        gmv: sql<number>`coalesce(sum(${orders.totalPrice}) filter (where ${orders.status} = 'completed'), 0)::int`,
      })
      .from(orders)
      .where(gte(orders.createdAt, since)),
    db().select({ n: sql<number>`count(*)::int` }).from(drivers).where(eq(drivers.verification, "pending")),
    db().select({ n: sql<number>`count(*)::int` }).from(drivers).where(and(eq(drivers.isOnline, true), eq(drivers.verification, "approved"))),
    db()
      .select({ n: sql<number>`(-coalesce(sum(${walletTx.amount}) filter (where ${walletTx.kind} in ('commission','fine')), 0) - coalesce(sum(${walletTx.amount}) filter (where ${walletTx.kind} = 'refund'), 0))::int` })
      .from(walletTx)
      .where(gte(walletTx.createdAt, since)),
    db()
      .select({ o: orders, typeName: vehicleTypes.name })
      .from(orders)
      .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
      .innerJoin(users, eq(users.id, orders.clientId))
      .orderBy(desc(orders.createdAt))
      .limit(8),
  ]);
  const tiles = [
    { label: "Заказов за 7 дней", value: String(stats.total) },
    { label: "Ищут исполнителя", value: String(stats.searching) },
    { label: "В работе", value: String(stats.active) },
    { label: "Выполнено", value: String(stats.completed) },
    { label: "Оборот выполненных", value: som(stats.gmv) },
    { label: "Доход: комиссии и штрафы", value: som(revenue.n) },
    { label: "Водителей на линии", value: String(online.n) },
    { label: "Ждут проверки", value: String(pendingDrivers.n), href: "/admin/drivers?status=pending" },
  ];
  return (
    <>
      <h1 className="text-2xl font-extrabold">Сводка за 7 дней</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => {
          const body = (
            <>
              <span className="text-xs font-semibold text-muted">{t.label}</span>
              <span className="text-2xl font-extrabold tabular-nums">{t.value}</span>
            </>
          );
          return t.href ? (
            <Link key={t.label} href={t.href} className="flex flex-col gap-1 rounded-2xl border-2 border-accent bg-surface p-4">{body}</Link>
          ) : (
            <div key={t.label} className="flex flex-col gap-1 rounded-2xl bg-surface p-4">{body}</div>
          );
        })}
      </div>
      <h2 className="text-lg font-extrabold">Последние заказы</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {recent.map(({ o, typeName }) => <OrderCard key={o.id} o={o} typeName={typeName} href={`/admin/orders?q=${o.number}`} />)}
      </div>
    </>
  );
}
