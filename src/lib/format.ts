export const STATUS_LABEL: Record<string, string> = {
  searching: "Ищем исполнителя",
  assigned: "Исполнитель найден",
  confirmed: "Выезд подтверждён",
  en_route: "Едет к точке подачи",
  arrived: "На месте",
  in_progress: "Выполняется",
  completed: "Выполнен",
  cancelled: "Отменён",
};

const TZ = "Asia/Bishkek";

export function fmtDateTime(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("ru-RU", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export function fmtTime(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleTimeString("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

// Day key and heading in Bishkek time, for grouping scheduled orders.
export function dayKey(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

export function dayTitle(d: Date, now = new Date()) {
  const k = dayKey(d);
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000));
  const label = d.toLocaleDateString("ru-RU", { timeZone: TZ, weekday: "short", day: "numeric", month: "long" });
  if (k === today) return `Сегодня, ${label}`;
  if (k === tomorrow) return `Завтра, ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function km(n: number | null | undefined) {
  if (n == null) return "";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`;
}

export function hours(n: number | null | undefined) {
  if (n == null) return "";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
}

export function rating(sum: number, count: number) {
  return count ? (sum / count).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "новый";
}
