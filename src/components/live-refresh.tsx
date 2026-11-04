"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type Event = { type: string; orderId?: string };

// Re-renders the server page on a relevant event. `alertOn` picks the
// events that should also beep and vibrate (new order nearby, new offer).
export function LiveRefresh({ alertOn = [], everyMs = 20_000, skip = [] }: { alertOn?: string[]; everyMs?: number; skip?: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertKey = alertOn.join(",");
  const skipKey = skip.join(",");

  useEffect(() => {
    const kinds = new Set(alertKey ? alertKey.split(",") : []);
    const skipped = new Set(skipKey ? skipKey.split(",") : []);
    // Coalesce bursts of events into one refresh.
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 150);
    };
    const es = new EventSource("/api/events");
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as Event;
        if (skipped.has(e.type)) return;
        if (kinds.has(e.type)) beep();
      } catch {}
      refresh();
    };
    es.onopen = refresh;
    const poll = setInterval(refresh, everyMs);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      es.close();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, alertKey, skipKey, everyMs]);

  return null;
}

let audio: AudioContext | null = null;

function beep() {
  try {
    navigator.vibrate?.([120, 60, 120]);
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.4);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.4);
  } catch {}
}
