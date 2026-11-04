"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { PLACES } from "@/lib/geo";
import { btnSmall, input, label } from "@/lib/ui";

const MapView = dynamic(() => import("@/components/map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[220px] animate-pulse rounded-2xl bg-surface-2" />,
});

export function HomePicker({ initial }: { initial: { address: string; lat: number; lng: number } | null }) {
  const [p, setP] = useState(initial);
  return (
    <div className="flex flex-col gap-3">
      <label className={label}>
        Домашний адрес (для режима «Домой»)
        <input value={p?.address ?? ""} onChange={(e) => setP((x) => (x ? { ...x, address: e.target.value } : x))} placeholder="Нажмите на карту" readOnly={!p} className={input} />
      </label>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
        {PLACES.slice(5).map((pl) => (
          <button type="button" key={pl.name} onClick={() => setP({ address: pl.name, lat: pl.lat, lng: pl.lng })} className={`${btnSmall} shrink-0`}>{pl.name}</button>
        ))}
      </div>
      <MapView
        markers={p ? [{ lat: p.lat, lng: p.lng, kind: "home", label: "Дом" }] : []}
        onPick={(x) => setP((cur) => ({ address: cur?.address && cur.address !== "Дом" ? cur.address : "Дом", lat: x.lat, lng: x.lng }))}
        height={220}
      />
      <input type="hidden" name="homeAddress" value={p?.address ?? ""} />
      <input type="hidden" name="homeLat" value={p?.lat ?? ""} />
      <input type="hidden" name="homeLng" value={p?.lng ?? ""} />
      {p && <button type="button" onClick={() => setP(null)} className="self-start text-sm font-bold text-muted underline">Убрать домашний адрес</button>}
    </div>
  );
}
