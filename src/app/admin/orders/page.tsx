import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, users, vehicleTypes } from "@/db/schema";
import { adminCancelAction } from "@/app/actions/admin";
import { StatusBadge } from "@/components/order-card";
import { Flash } from "@/components/flash";
import { STATUS_LABEL, fmtDateTime } from "@/lib/format";
import { formatPhone, som } from "@/lib/rules";
import { btnSmall, input, pill } from "@/lib/ui";

const STATUSES = ["all", "searching", "assigned", "confirmed", "en_route", "arrived", "in_progress", "completed", "cancelled"] as const;
type St = (typeof STATUSES)[number];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; err?: string }> }) {
  const sp = await searchParams;
  const status: St = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as St) : "all";
  const num = sp.q && /^\d+$/.test(sp.q) ? Number(sp.q) : null;
  const driver = alias(users, "driver");
  const rows = await db()
    .select({ o: orders, typeName: vehicleTypes.name, client: users, driverName: driver.name, driverPhone: driver.phone })
    .from(orders)
    .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
    .innerJoin(users, eq(users.id, orders.clientId))
    .leftJoin(driver, eq(driver.id, orders.driverId))
    .where(num != null ? eq(orders.number, num) : status === "all" ? undefined : eq(orders.status, status))
    .orderBy(desc(orders.createdAt))
    .limit(200);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Заказы</h1>
      <Flash err={sp.err} />
      <form className="flex gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Номер заказа" aria-label="Номер заказа" className={`${input} h-10 w-40`} />
        <button className={btnSmall}>Найти</button>
      </form>
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {STATUSES.map((s) => <Link key={s} href={`/admin/orders?status=${s}`} className={pill(status === s && num == null)}>{s === "all" ? "Все" : STATUS_LABEL[s]}</Link>)}
      </nav>
      <div className="overflow-x-auto rounded-2xl bg-surface">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr className="border-b border-line">
              <th className="p-3">№</th>
              <th className="p-3">Когда</th>
              <th className="p-3">Маршрут</th>
              <th className="p-3">Клиент</th>
              <th className="p-3">Исполнитель</th>
              <th className="p-3">Цена / комиссия</th>
              <th className="p-3">Статус</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, typeName, client, driverName, driverPhone }) => (
              <tr key={o.id} className="border-b border-surface-2 align-top">
                <td className="p-3 font-bold">{o.number}<div className="text-xs font-normal text-muted">{typeName}</div></td>
                <td className="p-3">{o.mode === "now" ? `сейчас · ${fmtDateTime(o.createdAt)}` : fmtDateTime(o.scheduledAt)}</td>
                <td className="p-3">{o.pickupAddress}{o.dropoffAddress ? <div className="text-muted">→ {o.dropoffAddress}</div> : null}</td>
                <td className="p-3">{client.name}<div className="text-xs text-muted">{formatPhone(client.phone)}</div></td>
                <td className="p-3">{driverName ?? "—"}{driverPhone ? <div className="text-xs text-muted">{formatPhone(driverPhone)}</div> : null}</td>
                <td className="p-3">{som(o.totalPrice ?? o.finalPrice ?? o.clientPrice)}<div className="text-xs text-muted">{o.commission != null ? `${som(o.commission)}${o.commissionRefunded ? " возвр." : ""}` : ""}</div></td>
                <td className="p-3"><StatusBadge status={o.status} />{o.cancelReason ? <div className="mt-1 text-xs text-muted">{o.cancelReason}</div> : null}</td>
                <td className="p-3">
                  {!["completed", "cancelled"].includes(o.status) && (
                    <form action={adminCancelAction}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <button className="text-xs font-bold text-danger underline">Отменить</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-muted">Заказов нет</p>}
      </div>
    </>
  );
}
