"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { createOrderAction } from "@/app/actions/client";
import { PLACES, roadKm } from "@/lib/geo";
import { recommendPrice, som } from "@/lib/rules";
import { btnPrimary, btnSmall, input, label } from "@/lib/ui";

const MapView = dynamic(() => import("@/components/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-2xl bg-surface-2" />,
});

type VT = {
  id: number;
  kind: "cargo" | "equipment";
  name: string;
  unit: "trip" | "hour";
  minHours: number | null;
  basePrice: number;
  perKm: number;
  commissionPct: number;
};

type Pt = { address: string; lat: number; lng: number } | null;

export function NewOrderForm({ initialKind, types }: { initialKind: "cargo" | "equipment"; types: VT[] }) {
  const [kind, setKind] = useState(initialKind);
  const kindTypes = types.filter((t) => t.kind === kind);
  const [typeId, setTypeId] = useState<number>(kindTypes[0]?.id ?? 0);
  const type = types.find((t) => t.id === typeId && t.kind === kind) ?? kindTypes[0];
  const [mode, setMode] = useState<"now" | "scheduled">("now");
  const [a, setA] = useState<Pt>(null);
  const [b, setB] = useState<Pt>(null);
  const [placing, setPlacing] = useState<"a" | "b">("a");
  const [loaders, setLoaders] = useState(0);
  const [hoursNeed, setHoursNeed] = useState<number>(type?.minHours ?? 2);
  const [price, setPrice] = useState<number | null>(null);
  const [state, action, pending] = useActionState(createOrderAction, {});

  const isCargo = kind === "cargo";
  const distance = a && b && isCargo ? roadKm(a, b) : null;
  const rec = useMemo(() => (type ? recommendPrice(type, distance, loaders) : null), [type, distance, loaders]);
  const shownPrice = price ?? rec?.price ?? 0;
  const perHour = type?.unit === "hour";

  function pick(p: { lat: number; lng: number }, name?: string) {
    const pt = { address: name ?? `Точка на карте (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`, lat: p.lat, lng: p.lng };
    if (placing === "a" || !isCargo) {
      setA(pt);
      if (isCargo && !b) setPlacing("b");
    } else setB(pt);
  }

  const markers = [
    ...(a ? [{ ...a, kind: "a" as const, label: "А" }] : []),
    ...(b && isCargo ? [{ ...b, kind: "b" as const, label: "Б" }] : []),
  ];

  return (
    <form action={action} className="flex flex-col gap-5 pt-2">
      <div className="flex items-center gap-3">
        <Link href="/c" aria-label="Назад" className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </Link>
        <h1 className="text-2xl font-extrabold">{isCargo ? "Грузоперевозка" : "Спецтехника"}</h1>
      </div>

      <div className="flex rounded-2xl bg-surface-2 p-1">
        {(["cargo", "equipment"] as const).map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => {
              setKind(k);
              const first = types.find((t) => t.kind === k);
              setTypeId(first?.id ?? 0);
              setHoursNeed(first?.minHours ?? 2);
              setPrice(null);
              setPlacing("a");
            }}
            className={`h-11 flex-1 rounded-xl text-sm font-bold ${kind === k ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            {k === "cargo" ? "Грузоперевозка" : "Спецтехника"}
          </button>
        ))}
      </div>

      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="typeId" value={type?.id ?? ""} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0 rounded-2xl bg-surface px-4 py-1">
          <PointRow
            dot="a"
            title={isCargo ? "Точка А · погрузка" : "Адрес объекта"}
            value={a}
            active={placing === "a"}
            onFocus={() => setPlacing("a")}
            onChange={(address) => setA((p) => (p ? { ...p, address } : null))}
            namePrefix="pickup"
          />
          {isCargo && (
            <>
              <div className="ml-6 h-px bg-line" />
              <PointRow
                dot="b"
                title="Точка Б · выгрузка"
                value={b}
                active={placing === "b"}
                onFocus={() => setPlacing("b")}
                onChange={(address) => setB((p) => (p ? { ...p, address } : null))}
                namePrefix="dropoff"
              />
            </>
          )}
        </div>
        <p className="text-sm text-muted">
          Нажмите на карту, чтобы поставить {placing === "a" ? (isCargo ? "точку А" : "адрес объекта") : "точку Б"}, или выберите место из списка. Адрес можно поправить текстом.
        </p>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {PLACES.map((p) => (
            <button type="button" key={p.name} onClick={() => pick(p, p.name)} className={`${btnSmall} shrink-0`}>
              {p.name}
            </button>
          ))}
        </div>
        <MapView markers={markers} lines={a && b && isCargo ? [{ points: [a, b], dashed: true, color: "#15171C" }] : []} onPick={(p) => pick(p)} fit={false} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-extrabold">{isCargo ? "Кузов" : "Техника"}</h2>
        <div className="grid grid-cols-2 gap-2">
          {kindTypes.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => {
                setTypeId(t.id);
                setHoursNeed(t.minHours ?? 2);
                setPrice(null);
              }}
              className={`flex min-h-16 flex-col items-start justify-center rounded-2xl px-3 py-2 text-left ${type?.id === t.id ? "border-2 border-ink bg-warn-bg" : "border border-line bg-surface"}`}
            >
              <span className="text-sm font-extrabold">{t.name}</span>
              <span className="text-xs text-muted">
                {t.unit === "hour" ? `от ${som(t.basePrice)}/ч · мин. ${t.minHours ?? 1} ч` : `подача ${som(t.basePrice)} + ${som(t.perKm)}/км`}
              </span>
            </button>
          ))}
        </div>
      </section>

      {isCargo ? (
        <section className="flex flex-col gap-3">
          <label className={label}>
            Что везём
            <input name="cargoDesc" placeholder="Мешки с товаром, 20 шт" className={input} />
          </label>
          <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
            <span className="font-bold">Грузчики</span>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Меньше грузчиков" onClick={() => setLoaders((n) => Math.max(0, n - 1))} className={btnSmall}>−</button>
              <span className="w-6 text-center text-lg font-extrabold">{loaders}</span>
              <button type="button" aria-label="Больше грузчиков" onClick={() => setLoaders((n) => Math.min(10, n + 1))} className={btnSmall}>+</button>
            </div>
            <input type="hidden" name="loaders" value={loaders} />
          </div>
        </section>
      ) : (
        perHour && (
          <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
            <span className="flex flex-col">
              <span className="font-bold">Сколько часов нужно</span>
              <span className="text-xs text-muted">Минимальный заказ {type?.minHours ?? 1} ч</span>
            </span>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Меньше часов" onClick={() => setHoursNeed((n) => Math.max(type?.minHours ?? 1, n - 1))} className={btnSmall}>−</button>
              <span className="w-8 text-center text-lg font-extrabold">{hoursNeed}</span>
              <button type="button" aria-label="Больше часов" onClick={() => setHoursNeed((n) => Math.min(24, n + 1))} className={btnSmall}>+</button>
            </div>
            <input type="hidden" name="durationHours" value={hoursNeed} />
          </div>
        )
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-extrabold">Когда</h2>
        <div className="flex rounded-2xl bg-surface-2 p-1">
          <button type="button" onClick={() => setMode("now")} className={`h-11 flex-1 rounded-xl text-sm font-bold ${mode === "now" ? "bg-surface shadow-sm" : "text-muted"}`}>Сейчас, рядом</button>
          <button type="button" onClick={() => setMode("scheduled")} className={`h-11 flex-1 rounded-xl text-sm font-bold ${mode === "scheduled" ? "bg-surface shadow-sm" : "text-muted"}`}>Заранее</button>
        </div>
        {mode === "scheduled" && <ScheduledInput />}
      </section>

      <label className={label}>
        Комментарий водителю
        <textarea name="comment" rows={2} className={`${input} h-auto py-3`} placeholder="Этаж, подъезд, как проехать" />
      </label>

      <section className="sticky bottom-0 z-[1000] -mx-4 flex flex-col gap-3 border-t border-line bg-bg/95 px-4 pb-6 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-muted">Ваша цена{perHour ? " за час" : ""}</span>
            <span className="text-3xl font-extrabold tracking-tight">{som(shownPrice)}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" aria-label="Уменьшить цену на 50 сом" onClick={() => setPrice(Math.max(100, shownPrice - 50))} className={`${btnSmall} h-12 w-12 text-xl`}>−</button>
            <button type="button" aria-label="Увеличить цену на 50 сом" onClick={() => setPrice(shownPrice + 50)} className={`${btnSmall} h-12 w-12 text-xl`}>+</button>
          </div>
        </div>
        {rec && (
          <p className="text-sm text-muted">
            Рекомендуем {som(rec.low)}–{som(rec.high)}{perHour ? " за час" : ""}
            {distance != null ? ` · ${distance} км` : ""}
            {perHour ? ` · примерно ${som(shownPrice * hoursNeed)} за ${hoursNeed} ч` : ""}
          </p>
        )}
        <input type="hidden" name="clientPrice" value={shownPrice} />
        {state.error && <p role="alert" className="text-sm font-bold text-danger">{state.error}</p>}
        <button disabled={pending || !a || (isCargo && !b)} className={btnPrimary}>
          {mode === "now" ? "Найти машину" : "Опубликовать заказ"}
        </button>
      </section>
    </form>
  );
}

function PointRow({
  dot,
  title,
  value,
  active,
  onFocus,
  onChange,
  namePrefix,
}: {
  dot: "a" | "b";
  title: string;
  value: Pt;
  active: boolean;
  onFocus: () => void;
  onChange: (address: string) => void;
  namePrefix: "pickup" | "dropoff";
}) {
  return (
    <label className={`flex min-h-14 items-center gap-3 ${active ? "" : "opacity-80"}`} onClick={onFocus}>
      <span className={`h-3 w-3 shrink-0 ${dot === "a" ? "rounded-full bg-info" : "rounded-sm bg-ink"}`} />
      <span className="flex flex-1 flex-col">
        <span className="text-xs font-semibold text-muted">{title}{active ? " · ставим на карте" : ""}</span>
        <input
          value={value?.address ?? ""}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Нажмите на карту"
          readOnly={!value}
          className="bg-transparent text-base font-bold outline-none placeholder:font-semibold placeholder:text-muted/70"
        />
      </span>
      <input type="hidden" name={`${namePrefix}Address`} value={value?.address ?? ""} />
      <input type="hidden" name={`${namePrefix}Lat`} value={value?.lat ?? ""} />
      <input type="hidden" name={`${namePrefix}Lng`} value={value?.lng ?? ""} />
    </label>
  );
}

// Times are Bishkek time (UTC+6) whatever the browser's zone is.
function ScheduledInput() {
  const [v, setV] = useState(() => {
    const d = new Date(Date.now() + 6 * 3600_000 + 24 * 3600_000);
    return `${d.toISOString().slice(0, 10)}T09:00`;
  });
  return (
    <label className={label}>
      Дата и время подачи (Бишкек)
      <input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} required className={input} />
      <input type="hidden" name="scheduledAt" value={v ? `${v}:00+06:00` : ""} />
    </label>
  );
}
