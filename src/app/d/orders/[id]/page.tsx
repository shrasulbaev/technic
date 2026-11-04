import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { offers, orders, reviews, users, vehicleTypes } from "@/db/schema";
import { requireUser } from "@/server/me";
import { driverCtx, previewDriverCancel } from "@/server/orders";
import { getPenaltySettings } from "@/server/settings";
import { driverCancelAction, driverReviewAction, respondAction, stepAction } from "@/app/actions/driver";
import { LiveMap } from "@/components/live-map";
import { DriveSimulator } from "@/components/driver-location";
import { WorkTimer } from "@/components/work-timer";
import { Flash } from "@/components/flash";
import { STATUS_LABEL, fmtDateTime, fmtTime, hours, km, rating } from "@/lib/format";
import { TIER_LABEL, formatPhone, som } from "@/lib/rules";
import { btnDanger, btnDark, btnPrimary, btnSecondary, btnSmall, input } from "@/lib/ui";

export default async function DriverOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const me = await requireUser("driver");
  const { id } = await params;
  const { err } = await searchParams;
  const [row] = await db()
    .select({ o: orders, type: vehicleTypes, clientName: users.name, clientPhone: users.phone, ratingSum: users.ratingSum, ratingCount: users.ratingCount, lateCancels: users.lateCancels })
    .from(orders)
    .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
    .innerJoin(users, eq(users.id, orders.clientId))
    .where(eq(orders.id, id));
  if (!row) notFound();
  const { o, type } = row;
  const mine = o.driverId === me.id;
  if (!mine && o.status !== "searching") {
    return (
      <>
        <p className="mt-6 rounded-2xl bg-surface p-6 text-center text-muted">Этот заказ уже взял другой водитель.</p>
        <Link href="/d" className={btnSecondary}>К ленте</Link>
      </>
    );
  }
  const c = await driverCtx(me.id);
  const [myOffer] = await db().select().from(offers).where(and(eq(offers.orderId, o.id), eq(offers.driverId, me.id)));
  const preview = mine ? await previewDriverCancel(me.id, o.id) : null;
  const ps = await getPenaltySettings();
  const [myReview] = o.status === "completed" && mine ? await db().select().from(reviews).where(and(eq(reviews.orderId, o.id), eq(reviews.authorId, me.id))) : [];

  const pickup = { lat: o.pickupLat, lng: o.pickupLng };
  const dropoff = o.dropoffLat != null && o.dropoffLng != null ? { lat: o.dropoffLat, lng: o.dropoffLng } : null;
  const here = c.driver.lat != null && c.driver.lng != null ? { lat: c.driver.lat, lng: c.driver.lng } : null;
  const perHour = o.unit === "hour";
  const equipment = o.kind === "equipment";
  const confirmBy = o.scheduledAt ? new Date(o.scheduledAt.getTime() - ps.confirmHours * 3600_000) : null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-4">
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">Заказ №{o.number} · {type.name}</span>
          <h1 className="text-2xl font-extrabold">{mine ? STATUS_LABEL[o.status] : o.mode === "now" ? "Заказ рядом" : `На ${fmtDateTime(o.scheduledAt)}`}</h1>
        </div>
      </div>
      <Flash err={err} />

      {mine && o.status === "assigned" && o.mode === "scheduled" && (
        <div className="flex flex-col gap-3 rounded-2xl bg-warn-bg p-4 text-warn">
          <p className="text-sm font-bold">Подтвердите выезд до {fmtDateTime(confirmBy)}, иначе заказ вернётся в ленту, а комиссия не вернётся.</p>
          <form action={stepAction}>
            <input type="hidden" name="orderId" value={o.id} />
            <input type="hidden" name="step" value="confirm" />
            <button className={`${btnDark} w-full`}>Подтверждаю, еду</button>
          </form>
        </div>
      )}
      {mine && o.status === "confirmed" && <p className="rounded-2xl bg-ok-bg px-4 py-3 text-sm font-bold text-ok">Выезд подтверждён. Нажмите «Выехал», когда отправитесь к клиенту.</p>}

      <LiveMap orderId={o.id} pickup={pickup} dropoff={dropoff} height={280} />

      {mine && ["en_route"].includes(o.status) && <DriveSimulator from={here} to={pickup} label="к точке А" />}
      {mine && o.status === "in_progress" && dropoff && <DriveSimulator from={here} to={dropoff} label="к точке Б" />}

      {mine && o.status === "in_progress" && perHour && o.startedAt && <WorkTimer dark startedAt={o.startedAt.toISOString()} rate={o.finalPrice ?? o.clientPrice} minHours={type.minHours} />}

      {mine && (
        <Step o={o} equipment={equipment} />
      )}

      {!mine && o.status === "searching" && (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Цена клиента{perHour ? " за час" : ""}</span>
            <span className="text-2xl font-extrabold">{som(o.clientPrice)}</span>
          </div>
          {myOffer?.status === "pending" ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-bold">Вы предложили {som(myOffer.price)}, ждём ответа клиента</p>
          ) : (
            <>
              <form action={respondAction}>
                <input type="hidden" name="orderId" value={o.id} />
                <button className={`${btnPrimary} w-full`}>{o.mode === "scheduled" ? "Взять заказ" : `Беру за ${som(o.clientPrice)}`}</button>
              </form>
              <form action={respondAction} className="flex gap-2">
                <input type="hidden" name="orderId" value={o.id} />
                <input name="price" type="number" inputMode="numeric" min={100} step={50} defaultValue={o.clientPrice + 100} aria-label="Своя цена" className={input} />
                <button className={btnSecondary}>Предложить</button>
              </form>
              {o.mode === "scheduled" && <p className="text-xs font-semibold text-muted">Взяли по цене клиента: заказ сразу ваш. Своя цена уходит клиенту на выбор.</p>}
            </>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 text-sm">
        <Row k={o.kind === "cargo" ? "Точка А" : "Объект"} v={o.pickupAddress} />
        {o.dropoffAddress && <Row k="Точка Б" v={`${o.dropoffAddress}${o.distanceKm ? ` · ${km(o.distanceKm)}` : ""}`} />}
        <Row k="Когда" v={o.mode === "now" ? "Сейчас" : fmtDateTime(o.scheduledAt)} />
        {o.durationHours != null && <Row k="Нужно часов" v={`${hours(o.durationHours)} (минимум ${type.minHours ?? 0} ч)`} />}
        {o.cargoDesc && <Row k="Груз" v={o.cargoDesc} />}
        {o.loaders > 0 && <Row k="Грузчики" v={String(o.loaders)} />}
        {o.comment && <Row k="Комментарий" v={o.comment} />}
        <Row k="Клиент" v={`${row.clientName ?? "Клиент"} · ★ ${rating(row.ratingSum, row.ratingCount)}${row.lateCancels ? ` · поздних отмен: ${row.lateCancels}` : ""}`} />
        {mine && o.finalPrice != null && <Row k="Цена" v={`${som(o.finalPrice)}${perHour ? "/ч" : ""}`} />}
        {mine && o.commission != null && <Row k="Комиссия сервиса" v={`${som(o.commission)}${o.commissionRefunded ? " (возвращена)" : ""}`} />}
        {o.totalPrice != null && <Row k="Итого с клиента" v={`${som(o.totalPrice)}${o.billedHours ? ` · ${hours(o.billedHours)}` : ""}`} />}
      </section>

      {mine && !["completed", "cancelled"].includes(o.status) && (
        <a href={`tel:${row.clientPhone}`} className={btnSecondary}>Позвонить клиенту · {formatPhone(row.clientPhone)}</a>
      )}

      {mine && o.status === "completed" && !myReview && (
        <form action={driverReviewAction} className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
          <input type="hidden" name="orderId" value={o.id} />
          <span className="text-sm font-extrabold">Оцените клиента</span>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex-1">
                <input type="radio" name="stars" value={n} defaultChecked={n === 5} className="peer sr-only" />
                <span className={`${btnSmall} w-full peer-checked:border-ink peer-checked:bg-accent`}>★ {n}</span>
              </label>
            ))}
          </div>
          <button className={btnPrimary}>Отправить</button>
        </form>
      )}

      {mine && preview && ["assigned", "confirmed", "en_route", "arrived"].includes(o.status) && (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-bold text-danger">Отказаться от заказа</summary>
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <p className="font-extrabold">{TIER_LABEL[preview.outcome.tier]}</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>{preview.outcome.refundCommission ? `Комиссия ${som(preview.commission)} вернётся на баланс` : `Комиссия ${som(preview.commission)} не вернётся`}</li>
              {preview.outcome.fine > 0 && <li>Штраф {som(preview.outcome.fine)} спишется с баланса</li>}
              {preview.outcome.strike && <li>Отмена засчитается: {ps.strikesLimit} за {ps.strikesWindowDays} дней закрывают запланированные заказы на {ps.blockDays} дней</li>}
              <li>Заказ вернётся в ленту с пометкой «Срочно»</li>
            </ul>
            <p className="text-xs text-muted">Поломка или ДТП? Напишите администратору, он может снять штраф.</p>
            <form action={driverCancelAction} className="flex flex-col gap-2">
              <input type="hidden" name="orderId" value={o.id} />
              <input name="reason" placeholder="Причина (необязательно)" className={input} />
              <button className={btnDanger}>Отказаться{preview.outcome.fine ? ` и заплатить ${som(preview.outcome.fine)}` : ""}</button>
            </form>
          </div>
        </details>
      )}

      <Link href="/d" className="text-center text-sm font-bold text-muted underline">К ленте заказов</Link>
    </>
  );
}

function Step({ o, equipment }: { o: typeof orders.$inferSelect; equipment: boolean }) {
  const map: Record<string, { step: string; label: string; hint?: string } | undefined> = {
    assigned: o.mode === "scheduled" ? undefined : { step: "depart", label: "Выехал" },
    confirmed: { step: "depart", label: `Выехал к клиенту${o.scheduledAt ? ` (подача в ${fmtTime(o.scheduledAt)})` : ""}` },
    en_route: { step: "arrive", label: "Я на месте" },
    arrived: { step: "start", label: equipment ? "Начать работу (запустить таймер)" : "Загрузились, везу" },
    in_progress: { step: "finish", label: equipment ? "Завершить работу" : "Доставил, завершить" },
  };
  const s = map[o.status];
  if (!s) return null;
  return (
    <form action={stepAction}>
      <input type="hidden" name="orderId" value={o.id} />
      <input type="hidden" name="step" value={s.step} />
      <button className={`${btnPrimary} w-full`}>{s.label}</button>
    </form>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  );
}
