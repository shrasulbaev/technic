import Link from "next/link";
import { STATUS_LABEL, fmtDateTime, km } from "@/lib/format";
import { som } from "@/lib/rules";

type O = {
  id: string;
  number: number;
  kind: "cargo" | "equipment";
  mode: "now" | "scheduled";
  status: string;
  pickupAddress: string;
  dropoffAddress: string | null;
  scheduledAt: Date | null;
  clientPrice: number;
  finalPrice: number | null;
  totalPrice: number | null;
  unit: "trip" | "hour";
  distanceKm: number | null;
  urgent?: boolean;
};

export function OrderCard({ o, typeName, href, extra }: { o: O; typeName: string; href: string; extra?: React.ReactNode }) {
  const price = o.totalPrice ?? o.finalPrice ?? o.clientPrice;
  return (
    <Link href={href} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            №{o.number} · {typeName}{o.mode === "scheduled" ? ` · ${fmtDateTime(o.scheduledAt)}` : " · сейчас"}
          </span>
          <span className="font-bold">{o.pickupAddress}</span>
          {o.dropoffAddress && <span className="text-sm text-muted">→ {o.dropoffAddress}</span>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-lg font-extrabold">{som(price)}{o.unit === "hour" && !o.totalPrice ? "/ч" : ""}</span>
          {o.distanceKm != null && <span className="text-xs text-muted">{km(o.distanceKm)}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={o.status} />
        {o.urgent && o.status === "searching" && <span className="rounded-full bg-warn-bg px-2.5 py-1 text-xs font-bold text-warn">Срочно</span>}
        {extra}
      </div>
    </Link>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed" ? "bg-ok-bg text-ok" : status === "cancelled" ? "bg-surface-2 text-muted" : status === "searching" ? "bg-warn-bg text-warn" : "bg-ink text-white";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}
