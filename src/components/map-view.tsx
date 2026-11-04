"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as L from "leaflet";
import { BISHKEK } from "@/lib/geo";

export type MapMarker = { lat: number; lng: number; kind: "a" | "b" | "driver" | "me" | "home" | "order"; label?: string };
export type MapLine = { points: { lat: number; lng: number }[]; color?: string; dashed?: boolean };

const STYLE: Record<MapMarker["kind"], string> = {
  a: "background:#2463EB;border:3px solid #fff;width:18px;height:18px;border-radius:9px",
  b: "background:#15171C;border:3px solid #fff;width:18px;height:18px;border-radius:4px",
  driver: "background:#F5B700;border:2px solid #15171C;width:30px;height:22px;border-radius:7px",
  me: "background:#2463EB;border:3px solid #fff;width:16px;height:16px;border-radius:8px;box-shadow:0 0 0 8px rgba(36,99,235,.18)",
  home: "background:#1E7A48;border:3px solid #fff;width:18px;height:18px;border-radius:9px",
  order: "background:#15171C;border:2px solid #F5B700;width:16px;height:16px;border-radius:8px",
};

// OpenStreetMap stands in for 2GIS until a key is issued. `onPick` turns a
// click on the map into a chosen point.
export function MapView({
  markers = [],
  lines = [],
  onPick,
  height = 260,
  fit = true,
  className = "",
}: {
  markers?: MapMarker[];
  lines?: MapLine[];
  onPick?: (p: { lat: number; lng: number }) => void;
  height?: number;
  fit?: boolean;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const lib = useRef<typeof L | null>(null);
  const pick = useRef(onPick);
  const fitted = useRef(false);
  pick.current = onPick;

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !el.current || map.current) return;
      lib.current = leaflet;
      const m = leaflet.map(el.current, { zoomControl: false, attributionControl: true, fadeAnimation: false, markerZoomAnimation: false }).setView([BISHKEK.lat, BISHKEK.lng], 12);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);
      leaflet.control.zoom({ position: "bottomright" }).addTo(m);
      m.on("click", (e: L.LeafletMouseEvent) => pick.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      layer.current = leaflet.layerGroup().addTo(m);
      map.current = m;
      // The map may start hidden (closed <details>) or change size.
      ro = new ResizeObserver(() => {
        if (!map.current || !el.current?.offsetWidth) return;
        map.current.invalidateSize();
        if (!fitted.current) draw();
      });
      ro.observe(el.current);
      draw();
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      map.current?.stop();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = JSON.stringify([markers, lines]);
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function draw() {
    const leaflet = lib.current, m = map.current, g = layer.current;
    if (!leaflet || !m || !g) return;
    g.clearLayers();
    for (const l of lines) {
      if (l.points.length < 2) continue;
      leaflet.polyline(l.points.map((p) => [p.lat, p.lng] as [number, number]), {
        color: l.color ?? "#2463EB",
        weight: 5,
        opacity: 0.9,
        dashArray: l.dashed ? "4 10" : undefined,
        lineCap: "round",
      }).addTo(g);
    }
    for (const mk of markers) {
      const icon = leaflet.divIcon({ className: "", html: `<div style="${STYLE[mk.kind]};box-sizing:border-box"></div>`, iconSize: [0, 0] });
      const marker = leaflet.marker([mk.lat, mk.lng], { icon, keyboard: false });
      if (mk.label) marker.bindTooltip(mk.label, { direction: "top", offset: [0, -12] });
      marker.addTo(g);
    }
    const pts = [...markers.map((x) => [x.lat, x.lng] as [number, number]), ...lines.flatMap((l) => l.points.map((p) => [p.lat, p.lng] as [number, number]))];
    if (fit && pts.length && !fitted.current && el.current?.offsetWidth) {
      fitted.current = true;
      try {
        if (pts.length === 1) m.setView(pts[0], 14, { animate: false });
        else m.fitBounds(leaflet.latLngBounds(pts), { padding: [40, 40], maxZoom: 15, animate: false });
      } catch {
        fitted.current = false;
      }
    }
  }

  return <div ref={el} style={{ height }} className={`relative z-0 isolate w-full overflow-hidden rounded-2xl ${className}`} role="application" aria-label="Карта" />;
}
