"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { stepToward, type Point } from "@/lib/geo";
import type { MapMarker } from "./map-view";

const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[200px] animate-pulse rounded-2xl bg-surface-2" />,
});

export async function sendLocation(p: Point) {
  await fetch("/api/driver/location", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
}

// While on the line the phone's GPS is reported; on a desktop without GPS the
// driver taps the map instead.
export function LocationBeacon({ online, initial, home, orders = [] }: { online: boolean; initial: Point | null; home: Point | null; orders?: MapMarker[] }) {
  const router = useRouter();
  const [pos, setPos] = useState<Point | null>(initial);
  const [gps, setGps] = useState<"off" | "on" | "denied">("off");
  const last = useRef<{ p: Point; t: number } | null>(null);

  useEffect(() => {
    if (!online || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (g) => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude };
        setGps("on");
        setPos(p);
        const now = Date.now();
        const l = last.current;
        if (!l || now - l.t > 15_000 || Math.abs(l.p.lat - p.lat) + Math.abs(l.p.lng - p.lng) > 0.0002) {
          last.current = { p, t: now };
          sendLocation(p).catch(() => {});
        }
      },
      () => setGps("denied"),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

  async function pick(p: Point) {
    setPos(p);
    await sendLocation(p);
    router.refresh();
  }

  const markers: MapMarker[] = [...orders, ...(home ? [{ ...home, kind: "home" as const, label: "Дом" }] : []), ...(pos ? [{ ...pos, kind: "me" as const, label: "Вы" }] : [])];
  return (
    <details className="rounded-2xl bg-surface p-3" open={!pos}>
      <summary className="cursor-pointer text-sm font-bold">
        {gps === "on" ? "GPS включён" : pos ? "Ваше местоположение" : "Укажите, где вы сейчас"}
        <span className="font-semibold text-muted"> · {gps === "denied" || gps === "off" ? "нажмите на карту, чтобы поставить себя" : "обновляется автоматически"}</span>
      </summary>
      <div className="mt-3">
        <MapView markers={markers} onPick={pick} height={220} />
      </div>
    </details>
  );
}

// Test helper: drives the car toward the target along a straight line.
export function DriveSimulator({ from, to, label }: { from: Point | null; to: Point; label: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const pos = useRef<Point | null>(from);
  useEffect(() => {
    pos.current = from;
  }, [from]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const cur = pos.current ?? { lat: to.lat + 0.03, lng: to.lng - 0.03 };
      const next = stepToward(cur, to, 0.35);
      pos.current = next;
      await sendLocation(next).catch(() => {});
      if (next.lat === to.lat && next.lng === to.lng) {
        setRunning(false);
        router.refresh();
      }
    }, 1500);
    return () => clearInterval(t);
  }, [running, to, router]);
  return (
    <button type="button" onClick={() => setRunning((r) => !r)} className="h-11 rounded-xl border border-dashed border-ink px-4 text-sm font-bold">
      {running ? "Остановить симуляцию" : `Тест: симулировать поездку ${label}`}
    </button>
  );
}
