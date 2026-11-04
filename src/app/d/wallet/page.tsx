import { requireUser } from "@/server/me";
import { driverCtx } from "@/server/orders";
import { PROVIDERS, walletHistory, driverPenalties } from "@/server/drivers";
import { getPenaltySettings } from "@/server/settings";
import { topupAction } from "@/app/actions/driver";
import { Flash } from "@/components/flash";
import { fmtDateTime } from "@/lib/format";
import { TIER_LABEL, som } from "@/lib/rules";
import { btnPrimary } from "@/lib/ui";

export default async function Wallet({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await requireUser("driver");
  const { err } = await searchParams;
  const [c, tx, pens, ps] = await Promise.all([driverCtx(me.id), walletHistory(me.id), driverPenalties(me.id), getPenaltySettings()]);
  return (
    <>
      <h1 className="pt-4 text-2xl font-extrabold">Баланс</h1>
      <Flash err={err} />
      <section className="flex flex-col gap-3 rounded-3xl bg-ink p-5 text-white">
        <span className="text-sm text-ink-muted">Доступно для комиссий</span>
        <span className={`text-4xl font-extrabold tracking-tight ${c.driver.balance < 0 ? "text-accent" : ""}`}>{som(c.driver.balance)}</span>
        <span className="text-sm text-ink-muted">
          Комиссия списывается, когда вы получаете заказ. При минусе новые заказы не приходят.
        </span>
      </section>

      <form action={topupAction} className="flex flex-col gap-3">
        <h2 className="text-sm font-extrabold">Пополнить</h2>
        <div className="grid grid-cols-3 gap-2">
          {[500, 1000, 2000].map((a, i) => (
            <label key={a}>
              <input type="radio" name="amount" value={a} defaultChecked={i === 0} className="peer sr-only" />
              <span className="flex h-12 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface font-extrabold peer-checked:border-2 peer-checked:border-ink">{a.toLocaleString("ru-RU")}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map((p, i) => (
            <label key={p.id}>
              <input type="radio" name="provider" value={p.id} defaultChecked={i === 0} className="peer sr-only" />
              <span className="flex h-14 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface text-sm font-bold peer-checked:border-2 peer-checked:border-ink">{p.name}</span>
            </label>
          ))}
        </div>
        <button className={btnPrimary}>Пополнить</button>
        <p className="text-center text-xs font-semibold text-muted">Тестовый режим: деньги не списываются, баланс пополняется сразу.</p>
      </form>

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 text-sm">
        <h2 className="font-extrabold">Правила отмены запланированных заказов</h2>
        <p>Больше чем за {ps.freeHours} ч: бесплатно, комиссия возвращается.</p>
        <p>От {ps.freeHours} до {ps.lateHours} ч: комиссия не возвращается.</p>
        <p>Меньше {ps.lateHours} ч, не подтвердили выезд или не приехали: комиссия не возвращается и штраф {som(ps.fineFixed)} (спецтехника: {ps.equipmentFinePct}% от минималки).</p>
        <p>{ps.strikesLimit} поздние отмены за {ps.strikesWindowDays} дней: запланированные заказы закрываются на {ps.blockDays} дней.</p>
      </section>

      {pens.length > 0 && (
        <section className="flex flex-col gap-1 rounded-2xl bg-surface px-4 py-2">
          <h2 className="py-2 text-sm font-extrabold">Отмены и штрафы</h2>
          {pens.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-t border-surface-2 py-3 text-sm">
              <span className="flex flex-col">
                <span className="font-semibold">{TIER_LABEL[p.tier]}{p.waived ? " · снят" : ""}</span>
                <span className="text-xs text-muted">{fmtDateTime(p.createdAt)}</span>
              </span>
              <span className="font-bold text-danger">{p.fine ? `−${som(p.fine)}` : ""}{p.commissionKept ? ` комиссия ${som(p.commissionKept)}` : ""}</span>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-1 rounded-2xl bg-surface px-4 py-2">
        <h2 className="py-2 text-sm font-extrabold">История</h2>
        {tx.length === 0 && <p className="py-3 text-sm text-muted">Операций пока нет</p>}
        {tx.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-t border-surface-2 py-3">
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{t.note}</span>
              <span className="text-xs text-muted">{fmtDateTime(t.createdAt)}</span>
            </span>
            <span className={`font-extrabold ${t.amount < 0 ? "text-danger" : "text-ok"}`}>{t.amount > 0 ? "+" : ""}{som(t.amount)}</span>
          </div>
        ))}
      </section>
    </>
  );
}
