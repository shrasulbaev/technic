"use client";

import { useEffect, useState } from "react";
import { billedHours, som, totalFor } from "@/lib/rules";

// Equipment timer: both sides watch the same clock; billing has a minimum.
export function WorkTimer({ startedAt, rate, minHours, dark = false }: { startedAt: string; rate: number; minHours: number | null; dark?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, now - new Date(startedAt).getTime());
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const billed = billedHours(ms / 60_000, minHours);
  return (
    <div className={`flex flex-col items-center gap-2 rounded-3xl p-6 ${dark ? "bg-ink text-white" : "bg-surface"}`}>
      <span className="text-xs font-bold uppercase tracking-wide text-accent">Идёт работа</span>
      <span className="text-5xl font-extrabold tabular-nums tracking-tight">
        {h}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </span>
      <span className={`text-sm ${dark ? "text-ink-muted" : "text-muted"}`}>
        минимум {minHours ?? 0} ч · к оплате сейчас {som(totalFor("hour", rate, billed))} ({billed} ч × {som(rate)})
      </span>
    </div>
  );
}
