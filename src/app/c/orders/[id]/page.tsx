import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, offers, reviews, users, vehicleTypes, vehicles } from "@/db/schema";
import { requireUser } from "@/server/me";
import { acceptOfferAction, cancelOrderAction, raisePriceAction, rejectOfferAction, reviewAction } from "@/app/actions/client";
import { LiveMap } from "@/components/live-map";
import { WorkTimer } from "@/components/work-timer";
import { Flash } from "@/components/flash";
import { STATUS_LABEL, fmtDateTime, hours, km, rating } from "@/lib/format";
import { formatPhone, som } from "@/lib/rules";
import { btnDanger, btnPrimary, btnSecondary, btnSmall, input } from "@/lib/ui";

const STEPS = [
  { key: "assigned", label: "Принят" },
  { key: "en_route", label: "Едет к А" },
  { key: "arrived", label: "На месте" },
  { key: "in_progress", label: "Выполняется" },
  { key: "completed", label: "Готово" },
];
const ORDER = ["assigned", "confirmed", "en_route", "arrived", "in_progress", "completed"];

export default async function ClientOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const me = await requireUser("client");
  const { id } = await params;
  const { err } = await searchParams;
  const [row] = await db()
    .select({ o: orders, type: vehicleTypes })
    .from(orders)
    .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
    .where(and(eq(orders.id, id), eq(orders.clientId, me.id)));
  if (!row) notFound();
  const { o, type } = row;

  const offerRows =
    o.status === "searching"
      ? await db()
          .select({ offer: offers, name: users.name, ratingSum: users.ratingSum, ratingCount: users.ratingCount, plate: vehicles.plate, model: vehicles.model })
          .from(offers)
          .innerJoin(users, eq(users.id, offers.driverId))
          .innerJoin(vehicles, eq(vehicles.id, offers.vehicleId))
          .where(and(eq(offers.orderId, o.id), eq(offers.status, "pending")))
          .orderBy(asc(offers.price))
      : [];

  const [driver] = o.driverId
    ? await db()
        .select({ name: users.name, phone: users.phone, ratingSum: users.ratingSum, ratingCount: users.ratingCount, plate: vehicles.plate, model: vehicles.model })
        .from(users)
        .innerJoin(vehicles, eq(vehicles.driverId, users.id))
        .where(eq(users.id, o.driverId))
        .limit(1)
    : [];
  const [myReview] = o.status === "completed" ? await db().select().from(reviews).where(and(eq(reviews.orderId, o.id), eq(reviews.authorId, me.id))) : [];

  const pickup = { lat: o.pickupLat, lng: o.pickupLng };
  const dropoff = o.dropoffLat != null && o.dropoffLng != null ? { lat: o.dropoffLat, lng: o.dropoffLng } : null;
  const perHour = o.unit === "hour";
  const stepIdx = ORDER.indexOf(o.status);
  const canCancel = ["searching", "assigned", "confirmed", "en_route", "arrived"].includes(o.status);

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">Заказ №{o.number} · {type.name}</span>
          <h1 className="text-2xl font-extrabold">{STATUS_LABEL[o.status]}</h1>
        </div>
      </div>
      <Flash err={err} />

      {stepIdx >= 0 && o.status !== "completed" && (
        <ol className="flex gap-1.5">
          {STEPS.map((s) => {
            const i = ORDER.indexOf(s.key);
            const cur = stepIdx >= i;
            return (
              <li key={s.key} className="flex flex-1 flex-col gap-1.5">
                <span className={`h-1 rounded-full ${cur ? "bg-ink" : "bg-line"}`} />
                <span className={`text-xs ${cur ? "font-bold" : "text-muted"}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {o.status === "searching" && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Ваша цена{perHour ? " за час" : ""}</span>
              <span className="text-xl font-extrabold">{som(o.clientPrice)}</span>
            </div>
            <div className="flex gap-2">
              {[100, 200].map((plus) => (
                <form key={plus} action={raisePriceAction} className="flex-1">
                  <input type="hidden" name="orderId" value={o.id} />
                  <input type="hidden" name="price" value={o.clientPrice + plus} />
                  <button className={`${btnSecondary} w-full text-sm`}>Поднять до {som(o.clientPrice + plus)}</button>
                </form>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 px-1 text-sm font-semibold text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-ok" />
            {offerRows.length ? `Откликнулись: ${offerRows.length}. Поиск продолжается` : o.mode === "now" ? "Ищем водителей рядом…" : "Заказ опубликован, водители увидят его в ленте запланированных"}
          </div>
          {offerRows.map(({ offer, name, ratingSum, ratingCount, plate, model }) => (
            <article key={offer.id} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-extrabold">{(name ?? "?").slice(0, 1)}</div>
                <div className="flex flex-1 flex-col">
                  <span className="font-bold">{name ?? "Водитель"} · ★ {rating(ratingSum, ratingCount)}</span>
                  <span className="text-sm text-muted">{model ?? ""} · {plate}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xl font-extrabold">{som(offer.price)}</span>
                  <span className={`text-xs font-bold ${offer.price > o.clientPrice ? "text-warn" : "text-ok"}`}>
                    {offer.price === o.clientPrice ? "ваша цена" : offer.price > o.clientPrice ? "встречная" : "дешевле"}
                  </span>
                </div>
              </div>
              {offer.etaMin != null && <span className="text-sm text-muted">Приедет примерно через {offer.etaMin} мин</span>}
              <div className="flex gap-2">
                <form action={rejectOfferAction} className="flex-1">
                  <input type="hidden" name="offerId" value={offer.id} />
                  <button className={`${btnSecondary} w-full`}>Отклонить</button>
                </form>
                <form action={acceptOfferAction} className="flex-[2]">
                  <input type="hidden" name="offerId" value={offer.id} />
                  <button className={`${btnPrimary} w-full`}>Принять за {som(offer.price)}</button>
                </form>
              </div>
            </article>
          ))}
        </section>
      )}

      {o.status !== "searching" && o.status !== "cancelled" && o.status !== "completed" && <LiveMap orderId={o.id} pickup={pickup} dropoff={dropoff} />}

      {o.status === "in_progress" && perHour && o.startedAt && <WorkTimer startedAt={o.startedAt.toISOString()} rate={o.finalPrice ?? o.clientPrice} minHours={type.minHours} />}

      {driver && o.status !== "cancelled" && (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-extrabold">{(driver.name ?? "?").slice(0, 1)}</div>
            <div className="flex flex-1 flex-col">
              <span className="font-bold">{driver.name} · ★ {rating(driver.ratingSum, driver.ratingCount)}</span>
              <span className="text-sm text-muted">{driver.model}</span>
            </div>
            <span className="rounded-lg border-2 border-ink px-2 py-1 text-sm font-extrabold tracking-wide">{driver.plate}</span>
          </div>
          {o.status !== "completed" && (
            <a href={`tel:${driver.phone}`} className={btnPrimary}>Позвонить · {formatPhone(driver.phone)}</a>
          )}
          <div className="flex justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">Оплата водителю наличными</span>
            <strong>{o.totalPrice != null ? som(o.totalPrice) : `${som(o.finalPrice)}${perHour ? "/ч" : ""}`}</strong>
          </div>
        </section>
      )}

      {o.status === "completed" && (
        <section className="flex flex-col gap-3 rounded-2xl bg-ok-bg p-4">
          <h2 className="text-lg font-extrabold text-ok">Заказ выполнен</h2>
          <p className="text-sm">
            Итого {som(o.totalPrice)}
            {o.billedHours != null ? ` · ${hours(o.billedHours)} по ${som(o.finalPrice)}` : ""}
          </p>
          {!myReview ? (
            <form action={reviewAction} className="flex flex-col gap-3">
              <input type="hidden" name="orderId" value={o.id} />
              <fieldset className="flex gap-2">
                <legend className="mb-2 text-sm font-bold">Оцените водителя</legend>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex-1">
                    <input type="radio" name="stars" value={n} defaultChecked={n === 5} className="peer sr-only" />
                    <span className={`${btnSmall} w-full peer-checked:border-ink peer-checked:bg-accent`}>★ {n}</span>
                  </label>
                ))}
              </fieldset>
              <input name="text" placeholder="Комментарий (необязательно)" className={input} />
              <button className={btnPrimary}>Отправить оценку</button>
            </form>
          ) : (
            <p className="text-sm font-bold">Спасибо за оценку: ★ {myReview.stars}</p>
          )}
        </section>
      )}

      {o.status === "cancelled" && (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          Заказ отменён{o.cancelledBy === "client" ? " вами" : o.cancelledBy === "admin" ? " администратором" : ""}. {o.cancelReason ?? ""}
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 text-sm">
        <Row k={o.kind === "cargo" ? "Точка А" : "Объект"} v={o.pickupAddress} />
        {o.dropoffAddress && <Row k="Точка Б" v={`${o.dropoffAddress}${o.distanceKm ? ` · ${km(o.distanceKm)}` : ""}`} />}
        <Row k="Когда" v={o.mode === "now" ? "Сейчас" : fmtDateTime(o.scheduledAt)} />
        {o.durationHours != null && <Row k="Нужно часов" v={hours(o.durationHours)} />}
        {o.cargoDesc && <Row k="Груз" v={o.cargoDesc} />}
        {o.loaders > 0 && <Row k="Грузчики" v={String(o.loaders)} />}
        {o.comment && <Row k="Комментарий" v={o.comment} />}
      </section>

      {canCancel && (
        <form action={cancelOrderAction}>
          <input type="hidden" name="orderId" value={o.id} />
          <button className={`${btnDanger} w-full`}>{o.driverId ? "Отменить заказ (водитель уже назначен)" : "Отменить заказ"}</button>
        </form>
      )}
      <Link href="/c" className="text-center text-sm font-bold text-muted underline">На главную</Link>
    </>
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
