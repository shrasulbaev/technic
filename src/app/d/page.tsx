import Link from "next/link";
import { requireUser } from "@/server/me";
import { driverBlockReason, driverCtx, driverOrders, myPendingOffers, nearFeed, plannedFeed, type FeedOrder } from "@/server/orders";
import { respondAction, toggleHomeAction, toggleOnlineAction, withdrawAction } from "@/app/actions/driver";
import { LocationBeacon } from "@/components/driver-location";
import { OrderCard } from "@/components/order-card";
import { Flash } from "@/components/flash";
import { dayKey, dayTitle, fmtTime, km, hours } from "@/lib/format";
import { som } from "@/lib/rules";
import { btnPrimary, btnSecondary, input, pill } from "@/lib/ui";

type Tab = "near" | "planned" | "mine";

export default async function DriverFeed({ searchParams }: { searchParams: Promise<{ tab?: string; day?: string; err?: string }> }) {
  const me = await requireUser("driver");
  const sp = await searchParams;
  const tab: Tab = sp.tab === "planned" || sp.tab === "mine" ? sp.tab : "near";
  const c = await driverCtx(me.id);
  const d = c.driver;
  const block = driverBlockReason(c, "now");
  const plannedBlock = driverBlockReason(c, "scheduled");
  const [near, planned, mine, pending] = await Promise.all([
    d.isOnline && !block ? nearFeed(c) : Promise.resolve([] as FeedOrder[]),
    !plannedBlock ? plannedFeed(c) : Promise.resolve([] as FeedOrder[]),
    driverOrders(me.id),
    myPendingOffers(me.id),
  ]);
  const offered = new Map(pending.map((p) => [p.offer.orderId, p.offer.price]));
  const active = mine.filter(({ o }) => !["completed", "cancelled"].includes(o.status));
  const here = d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null;
  const home = d.homeLat != null && d.homeLng != null ? { lat: d.homeLat, lng: d.homeLng } : null;

  // Planned orders grouped by day (Bishkek time).
  const days = new Map<string, { title: string; items: FeedOrder[] }>();
  for (const o of planned) {
    const k = dayKey(o.scheduledAt!);
    if (!days.has(k)) days.set(k, { title: dayTitle(o.scheduledAt!), items: [] });
    days.get(k)!.items.push(o);
  }
  const dayList = [...days.entries()];
  const selectedDay = sp.day && days.has(sp.day) ? sp.day : null;

  return (
    <>
      <section className="-mx-4 flex flex-col gap-4 bg-ink px-4 pb-5 pt-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm text-ink-muted">{me.name} · {c.vehicle ? `${c.vehicle.model ?? ""} ${c.vehicle.plate}` : "машина не указана"}</span>
            <span className="text-2xl font-extrabold">{d.isOnline ? (d.goingHome ? "Еду домой" : "Вы на линии") : "Не на линии"}</span>
          </div>
          <form action={toggleOnlineAction}>
            <input type="hidden" name="online" value={d.isOnline ? "0" : "1"} />
            <button aria-label={d.isOnline ? "Уйти с линии" : "Выйти на линию"} aria-pressed={d.isOnline} className={`relative h-9 w-16 rounded-full ${d.isOnline ? "bg-ok" : "bg-ink-2"}`}>
              <span className={`absolute top-1 h-7 w-7 rounded-full bg-white transition-all ${d.isOnline ? "left-8" : "left-1"}`} />
            </button>
          </form>
        </div>
        <div className="flex gap-2">
          <Link href="/d/wallet" className="flex h-12 flex-1 items-center justify-between rounded-xl bg-ink-2 px-3">
            <span className="text-sm text-ink-muted">Баланс</span>
            <span className={`font-extrabold ${d.balance < 0 ? "text-accent" : ""}`}>{som(d.balance)} ›</span>
          </Link>
          <form action={toggleHomeAction} className="flex-1">
            <input type="hidden" name="on" value={d.goingHome ? "0" : "1"} />
            <button aria-pressed={d.goingHome} className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl font-extrabold ${d.goingHome ? "bg-accent text-accent-ink" : "bg-ink-2 text-white"}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></svg>
              Домой
            </button>
          </form>
        </div>
      </section>

      {d.goingHome && (
        <div className="-mx-4 -mt-5 flex items-center gap-3 bg-accent px-4 py-3 text-accent-ink">
          <div className="flex flex-1 flex-col">
            <span className="text-sm font-extrabold">Еду домой · {d.homeAddress}</span>
            <span className="text-xs font-semibold">Показываю заказы по пути, крюк до {km(d.detourKm)}</span>
          </div>
        </div>
      )}

      <Flash err={sp.err} />
      {d.verification === "pending" && <Notice>Профиль на проверке у администратора. Заказы появятся после одобрения.</Notice>}
      {d.verification === "rejected" && <Notice>Проверка не пройдена{d.rejectReason ? `: ${d.rejectReason}` : ""}. Исправьте данные в профиле.</Notice>}
      {d.verification === "approved" && d.balance < 0 && <Notice>Баланс отрицательный. Пополните его, чтобы получать заказы.</Notice>}
      {d.scheduledBlockedUntil && d.scheduledBlockedUntil > new Date() && <Notice>{plannedBlock}</Notice>}

      {d.isOnline && <LocationBeacon online={d.isOnline} initial={here} home={d.goingHome ? home : null} orders={near.map((o) => ({ lat: o.pickupLat, lng: o.pickupLng, kind: "order" as const, label: `${som(o.clientPrice)}` }))} />}

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        <Link href="/d" className={pill(tab === "near")}>{d.goingHome ? "По пути" : "Рядом"} · {near.length}</Link>
        <Link href="/d?tab=planned" className={pill(tab === "planned")}>Запланированные · {planned.length}</Link>
        <Link href="/d?tab=mine" className={pill(tab === "mine")}>Мои · {active.length}</Link>
      </nav>

      {tab === "near" && (
        <section className="flex flex-col gap-3">
          {!d.isOnline && <Empty>Вы не на линии. Включите переключатель сверху, чтобы видеть заказы рядом.</Empty>}
          {d.isOnline && !here && <Empty>Поставьте себя на карте или разрешите доступ к GPS.</Empty>}
          {d.isOnline && here && near.length === 0 && !block && <Empty>{d.goingHome ? "По пути домой заказов пока нет" : `В радиусе ${km(d.radiusKm)} заказов пока нет`}. Новые придут со звуком.</Empty>}
          {near.map((o) => <FeedCard key={o.id} o={o} offered={offered.get(o.id)} />)}
        </section>
      )}

      {tab === "planned" && (
        <section className="flex flex-col gap-3">
          {dayList.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              <Link href="/d?tab=planned" className={pill(!selectedDay)}>Все даты</Link>
              {dayList.map(([k, g]) => (
                <Link key={k} href={`/d?tab=planned&day=${k}`} className={pill(selectedDay === k)}>
                  {g.title.replace(/^(Сегодня|Завтра), /, "$1 · ")} · {g.items.length}
                </Link>
              ))}
            </div>
          )}
          {plannedBlock && <Empty>{plannedBlock}</Empty>}
          {!plannedBlock && planned.length === 0 && <Empty>Запланированных заказов на вашу машину пока нет.</Empty>}
          <p className="px-1 text-sm font-semibold text-muted">Кто первый нажал «Взять заказ», того и заказ. Подтвердить выезд нужно не позже чем за 2 часа.</p>
          {dayList
            .filter(([k]) => !selectedDay || k === selectedDay)
            .map(([k, g]) => (
              <div key={k} className="flex flex-col gap-2">
                <h2 className="px-1 text-sm font-extrabold">{g.title}</h2>
                {g.items.map((o) => <FeedCard key={o.id} o={o} offered={offered.get(o.id)} planned />)}
              </div>
            ))}
        </section>
      )}

      {tab === "mine" && (
        <section className="flex flex-col gap-3">
          {pending.length > 0 && (
            <>
              <h2 className="px-1 text-sm font-extrabold">Ждут ответа клиента</h2>
              {pending.map(({ offer, o, typeName }) => (
                <div key={offer.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4">
                  <Link href={`/d/orders/${o.id}`} className="flex flex-col">
                    <span className="text-xs font-bold text-muted">№{o.number} · {typeName}</span>
                    <span className="font-bold">{o.pickupAddress}</span>
                    <span className="text-sm text-muted">Ваше предложение: {som(offer.price)}</span>
                  </Link>
                  <form action={withdrawAction}>
                    <input type="hidden" name="orderId" value={o.id} />
                    <button className="h-10 rounded-xl border border-line px-3 text-sm font-bold">Отозвать</button>
                  </form>
                </div>
              ))}
            </>
          )}
          {mine.length === 0 && pending.length === 0 && <Empty>Взятых заказов пока нет.</Empty>}
          {mine.map(({ o, typeName }) => (
            <OrderCard
              key={o.id}
              o={o}
              typeName={typeName}
              href={`/d/orders/${o.id}`}
              extra={o.status === "assigned" && o.mode === "scheduled" ? <span className="rounded-full bg-warn-bg px-2.5 py-1 text-xs font-bold text-warn">Подтвердите выезд</span> : null}
            />
          ))}
        </section>
      )}
    </>
  );
}

function FeedCard({ o, offered, planned = false }: { o: FeedOrder; offered?: number; planned?: boolean }) {
  const perHour = o.unit === "hour";
  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <Link href={`/d/orders/${o.id}`} className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          {planned && o.scheduledAt && (
            <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl bg-ink text-lg font-extrabold text-white">{fmtTime(o.scheduledAt)}</span>
          )}
          <div className="flex flex-col gap-0.5">
            <span className={`text-xs font-bold uppercase ${o.detour != null ? "text-ok" : "text-muted"}`}>
              {o.urgent ? "Срочно · " : ""}
              {o.detour != null ? `По пути · крюк +${km(o.detour)}` : o.distanceToPickupKm != null ? `${km(o.distanceToPickupKm)} от вас` : o.typeName}
              {o.loaders ? ` · грузчики: ${o.loaders}` : ""}
            </span>
            <span className="font-bold">{o.pickupAddress}</span>
            {o.dropoffAddress && <span className="text-sm text-muted">→ {o.dropoffAddress}</span>}
            {o.durationHours != null && <span className="text-sm text-muted">Нужно {hours(o.durationHours)}</span>}
            {o.cargoDesc && <span className="text-sm text-muted">{o.cargoDesc}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-xl font-extrabold">{som(o.clientPrice)}{perHour ? "/ч" : ""}</span>
          {o.distanceKm != null && <span className="text-xs text-muted">{km(o.distanceKm)}</span>}
          {o.clientRating != null && <span className="text-xs text-muted">клиент ★ {o.clientRating.toFixed(1)}</span>}
        </div>
      </Link>
      {offered != null ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-bold">Вы предложили {som(offered)}, ждём ответа клиента</p>
      ) : (
        <div className="flex gap-2">
          <details className="flex-1">
            <summary className={`${btnSecondary} w-full cursor-pointer list-none whitespace-nowrap px-3 text-sm`}>Своя цена</summary>
            <form action={respondAction} className="mt-2 flex gap-2">
              <input type="hidden" name="orderId" value={o.id} />
              <input name="price" type="number" inputMode="numeric" min={100} step={50} defaultValue={o.clientPrice + 100} aria-label="Ваша цена" className={input} />
              <button className={btnPrimary}>OK</button>
            </form>
          </details>
          <form action={respondAction} className="flex-[2]">
            <input type="hidden" name="orderId" value={o.id} />
            <button className={`${btnPrimary} w-full`}>{planned ? "Взять заказ" : `Беру за ${som(o.clientPrice)}`}</button>
          </form>
        </div>
      )}
    </article>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-warn-bg px-4 py-3 text-sm font-bold text-warn">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted">{children}</p>;
}
