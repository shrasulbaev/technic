import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, penalties, users, vehicleTypes, vehicles } from "@/db/schema";
import { adjustBalanceAction, blockUserAction, verifyAction, waivePenaltyAction } from "@/app/actions/admin";
import { Flash } from "@/components/flash";
import { fmtDateTime, rating } from "@/lib/format";
import { TIER_LABEL, formatPhone, som } from "@/lib/rules";
import { btnSmall, input, pill } from "@/lib/ui";

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "pending", label: "На проверке" },
  { key: "approved", label: "Проверены" },
  { key: "rejected", label: "Отклонены" },
] as const;

export default async function AdminDrivers({ searchParams }: { searchParams: Promise<{ status?: string; err?: string }> }) {
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.key === sp.status) ? sp.status! : "all";
  const rows = await db()
    .select({ d: drivers, u: users, v: vehicles, typeName: vehicleTypes.name })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.userId))
    .leftJoin(vehicles, eq(vehicles.driverId, drivers.userId))
    .leftJoin(vehicleTypes, eq(vehicleTypes.id, vehicles.typeId))
    .where(status === "all" ? undefined : eq(drivers.verification, status as "pending" | "approved" | "rejected"))
    .orderBy(desc(drivers.createdAt))
    .limit(200);
  const ids = rows.map((r) => r.d.userId);
  const pens = ids.length
    ? await db().select().from(penalties).where(and(inArray(penalties.driverId, ids), eq(penalties.waived, false))).orderBy(desc(penalties.createdAt))
    : [];
  return (
    <>
      <h1 className="text-2xl font-extrabold">Водители</h1>
      <Flash err={sp.err} />
      <nav className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => <Link key={f.key} href={`/admin/drivers?status=${f.key}`} className={pill(status === f.key)}>{f.label}</Link>)}
      </nav>
      {rows.length === 0 && <p className="rounded-2xl bg-surface p-6 text-center text-muted">Никого нет</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map(({ d, u, v, typeName }) => {
          const myPens = pens.filter((p) => p.driverId === d.userId);
          return (
            <article key={d.userId} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-extrabold">{u.name ?? "Без имени"}{u.blocked ? " · заблокирован" : ""}</span>
                  <span className="text-sm text-muted">{formatPhone(u.phone)} · ★ {rating(u.ratingSum, u.ratingCount)}</span>
                  <span className="text-sm">{typeName ?? "машина не указана"} · {v?.model ?? ""} {v?.plate ?? ""}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${d.verification === "approved" ? "bg-ok-bg text-ok" : d.verification === "pending" ? "bg-warn-bg text-warn" : "bg-surface-2 text-muted"}`}>
                    {d.verification === "approved" ? "Проверен" : d.verification === "pending" ? "На проверке" : "Отклонён"}
                  </span>
                  <span className={`text-sm font-extrabold ${d.balance < 0 ? "text-danger" : ""}`}>{som(d.balance)}</span>
                  {d.isOnline && <span className="text-xs font-bold text-ok">на линии</span>}
                </div>
              </div>
              {d.scheduledBlockedUntil && d.scheduledBlockedUntil > new Date() && (
                <p className="text-xs font-bold text-danger">Запланированные закрыты до {fmtDateTime(d.scheduledBlockedUntil)}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {d.verification !== "approved" && (
                  <form action={verifyAction}>
                    <input type="hidden" name="driverId" value={d.userId} />
                    <input type="hidden" name="status" value="approved" />
                    <button className={`${btnSmall} border-ink bg-accent`}>Одобрить</button>
                  </form>
                )}
                {d.verification !== "rejected" && (
                  <form action={verifyAction} className="flex gap-2">
                    <input type="hidden" name="driverId" value={d.userId} />
                    <input type="hidden" name="status" value="rejected" />
                    <input name="reason" placeholder="Причина отказа" aria-label="Причина отказа" className={`${input} h-10 w-40 text-sm`} />
                    <button className={btnSmall}>Отклонить</button>
                  </form>
                )}
                <form action={blockUserAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="blocked" value={u.blocked ? "0" : "1"} />
                  <button className={`${btnSmall} text-danger`}>{u.blocked ? "Разблокировать" : "Заблокировать"}</button>
                </form>
              </div>
              <form action={adjustBalanceAction} className="flex gap-2">
                <input type="hidden" name="driverId" value={d.userId} />
                <input name="amount" type="number" placeholder="± сом" aria-label="Сумма" className={`${input} h-10 w-28 text-sm`} />
                <input name="note" placeholder="Комментарий" aria-label="Комментарий" className={`${input} h-10 text-sm`} />
                <button className={btnSmall}>Баланс</button>
              </form>
              {myPens.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-line pt-2">
                  <span className="text-xs font-bold text-muted">Штрафы</span>
                  {myPens.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{TIER_LABEL[p.tier]} · {fmtDateTime(p.createdAt)} · {som(p.fine + p.commissionKept)}</span>
                      {p.tier !== "free" && (
                        <form action={waivePenaltyAction}>
                          <input type="hidden" name="penaltyId" value={p.id} />
                          <button className="text-xs font-bold underline">Снять</button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
