"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { MapLine, MapMarker } from "./map-view";
import { etaMinutes, roadKm } from "@/lib/geo";

const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-2xl bg-surface-2" />,
});

type P = { lat: number; lng: number };
type Live = { status: string; driver: P | null; track: P[] };

// Driver → A → B. Polls every 3 s; the straight dashed lines stand in for a
// real route until 2GIS routing is connected.
export function LiveMap({ orderId, pickup, dropoff, height = 320 }: { orderId: string; pickup: P; dropoff: P | null; height?: number }) {
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/orders/${orderId}/live`, { cache: "no-store" });
        if (r.ok && !stop) setLive(await r.json());
      } catch {}
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [orderId]);

  const d = live?.driver ?? null;
  const toPickup = live && ["assigned", "confirmed", "en_route"].includes(live.status);
  const markers: MapMarker[] = [
    { ...pickup, kind: "a", label: "А" },
    ...(dropoff ? [{ ...dropoff, kind: "b" as const, label: "Б" }] : []),
    ...(d ? [{ ...d, kind: "driver" as const, label: "Водитель" }] : []),
  ];
  const lines: MapLine[] = [];
  if (live?.track && live.track.length > 1) lines.push({ points: live.track, color: "#2463EB" });
  if (d && toPickup) lines.push({ points: [d, pickup], color: "#2463EB", dashed: true });
  if (dropoff) lines.push({ points: [pickup, dropoff], color: "#15171C", dashed: true });
  if (d && live?.status === "in_progress" && dropoff) lines.push({ points: [d, dropoff], color: "#2463EB", dashed: true });

  const target = toPickup ? pickup : live?.status === "in_progress" ? dropoff : null;
  const left = d && target ? roadKm(d, target) : null;

  return (
    <div className="flex flex-col gap-2">
      <MapView markers={markers} lines={lines} height={height} />
      {left != null && (
        <p className="text-sm font-bold text-muted">
          {toPickup ? "До точки подачи" : "До точки Б"}: {left.toLocaleString("ru-RU")} км, примерно {etaMinutes(left)} мин
        </p>
      )}
    </div>
  );
}
