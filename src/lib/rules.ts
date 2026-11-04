// Business rules kept pure so they are easy to test and to tune from the admin.

export type VehicleTypeLike = {
  kind: "cargo" | "equipment";
  unit: "trip" | "hour";
  basePrice: number;
  perKm: number;
  minHours: number | null;
  commissionPct: number;
};

export function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

// Recommended price: cargo = base + km × rate (+ loaders); equipment by hour = hourly rate.
export function recommendPrice(t: VehicleTypeLike, km: number | null, loaders = 0): { price: number; low: number; high: number } {
  let price: number;
  if (t.unit === "hour") price = t.basePrice;
  else price = t.basePrice + Math.max(0, km ?? 0) * t.perKm + loaders * 300;
  price = roundTo(price, 50);
  return { price, low: roundTo(price * 0.9, 50), high: roundTo(price * 1.1, 50) };
}

export function commissionFor(price: number, pct: number) {
  return Math.round((price * pct) / 100);
}

// Equipment: billed hours are at least the minimum, rounded up to half an hour.
export function billedHours(workedMinutes: number, minHours: number | null) {
  const worked = Math.ceil(workedMinutes / 30) / 2;
  return Math.max(minHours ?? 0, worked);
}

export function totalFor(unit: "trip" | "hour", price: number, hours: number | null) {
  return unit === "hour" ? Math.round(price * (hours ?? 0)) : price;
}

export type PenaltySettings = {
  freeHours: number; // раньше — отмена бесплатная, комиссия возвращается
  lateHours: number; // от freeHours до lateHours — комиссия не возвращается
  fineFixed: number; // позже lateHours / неявка — плюс штраф (грузы)
  equipmentFinePct: number; // штраф для спецтехники: % от стоимости минималки
  strikesLimit: number; // столько поздних отмен…
  strikesWindowDays: number; // …за столько дней
  blockDays: number; // → блок на запланированные заказы
  confirmHours: number; // подтвердить выезд нужно не позже чем за N часов
};

export const DEFAULT_PENALTIES: PenaltySettings = {
  freeHours: 24,
  lateHours: 2,
  fineFixed: 200,
  equipmentFinePct: 50,
  strikesLimit: 3,
  strikesWindowDays: 30,
  blockDays: 7,
  confirmHours: 2,
};

export type CancelOutcome = {
  tier: "free" | "late" | "very_late" | "no_confirm";
  refundCommission: boolean;
  fine: number;
  strike: boolean; // counts toward the block
};

// What a driver loses when cancelling an order they took.
// `hoursBefore`: time until the scheduled start (now orders: 0).
export function driverCancelOutcome(
  o: { mode: "now" | "scheduled"; kind: "cargo" | "equipment"; finalPrice: number; minHours: number | null; unit: "trip" | "hour" },
  hoursBefore: number,
  s: PenaltySettings,
  noConfirm = false,
): CancelOutcome {
  const fine = o.kind === "equipment"
    ? Math.round(totalFor(o.unit, o.finalPrice, o.unit === "hour" ? (o.minHours ?? 1) : null) * (s.equipmentFinePct / 100))
    : s.fineFixed;
  if (noConfirm) return { tier: "no_confirm", refundCommission: false, fine, strike: true };
  if (o.mode === "now") return { tier: "late", refundCommission: false, fine: 0, strike: true };
  if (hoursBefore >= s.freeHours) return { tier: "free", refundCommission: true, fine: 0, strike: false };
  if (hoursBefore >= s.lateHours) return { tier: "late", refundCommission: false, fine: 0, strike: true };
  return { tier: "very_late", refundCommission: false, fine, strike: true };
}

export const TIER_LABEL: Record<CancelOutcome["tier"], string> = {
  free: "Бесплатная отмена",
  late: "Поздняя отмена",
  very_late: "Отмена в день выезда",
  no_confirm: "Не подтвердил выезд",
};

// Kyrgyz mobile numbers: +996 and 9 digits. Accepts 0555 123 456, 555123456, +996 555…
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  let local: string;
  if (d.length === 12 && d.startsWith("996")) local = d.slice(3);
  else if (d.length === 10 && d.startsWith("0")) local = d.slice(1);
  else if (d.length === 9) local = d;
  else return null;
  if (!/^[2-9]\d{8}$/.test(local)) return null;
  return `+996${local}`;
}

export function formatPhone(p: string) {
  const m = p.match(/^\+996(\d{3})(\d{3})(\d{3})$/);
  return m ? `+996 ${m[1]} ${m[2]} ${m[3]}` : p;
}

export function som(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n.toLocaleString("ru-RU").replace(/,/g, " ")} с`;
}
