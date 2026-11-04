import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { blockUserAction } from "@/app/actions/admin";
import { fmtDateTime, rating } from "@/lib/format";
import { formatPhone } from "@/lib/rules";

export default async function AdminClients() {
  const rows = await db()
    .select({ u: users, n: sql<number>`count(${orders.id})::int` })
    .from(users)
    .leftJoin(orders, eq(orders.clientId, users.id))
    .where(eq(users.role, "client"))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(300);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Клиенты</h1>
      <div className="overflow-x-auto rounded-2xl bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr className="border-b border-line">
              <th className="p-3">Имя</th>
              <th className="p-3">Телефон</th>
              <th className="p-3">Заказов</th>
              <th className="p-3">Рейтинг</th>
              <th className="p-3">Поздних отмен</th>
              <th className="p-3">С нами с</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ u, n }) => (
              <tr key={u.id} className="border-b border-surface-2">
                <td className="p-3 font-bold">{u.name}{u.blocked ? " · заблокирован" : ""}</td>
                <td className="p-3">{formatPhone(u.phone)}</td>
                <td className="p-3">{n}</td>
                <td className="p-3">★ {rating(u.ratingSum, u.ratingCount)}</td>
                <td className={`p-3 ${u.lateCancels > 2 ? "font-bold text-danger" : ""}`}>{u.lateCancels}</td>
                <td className="p-3">{fmtDateTime(u.createdAt)}</td>
                <td className="p-3">
                  <form action={blockUserAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="blocked" value={u.blocked ? "0" : "1"} />
                    <button className="text-xs font-bold text-danger underline">{u.blocked ? "Разблокировать" : "Заблокировать"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
