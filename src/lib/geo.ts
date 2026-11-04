export type Point = { lat: number; lng: number };

const R = 6371; // km

// Straight-line distance in km.
export function haversineKm(a: Point, b: Point): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Road distance estimate until real routing (2GIS) is connected.
export const ROAD_FACTOR = 1.3;
export function roadKm(a: Point, b: Point): number {
  return Math.round(haversineKm(a, b) * ROAD_FACTOR * 10) / 10;
}

// Minutes to drive `km` at an average city speed.
export function etaMinutes(km: number, kmh = 30): number {
  return Math.max(1, Math.round((km / kmh) * 60));
}

// Distance in km from point p to segment a–b (local flat projection, fine for a city).
export function distanceToSegmentKm(p: Point, a: Point, b: Point): number {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110.57;
  const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky;
  const bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

// "Домой" mode: extra km the driver drives to do the order instead of going
// straight home (from → pickup → dropoff → home, minus from → home).
export function detourKm(from: Point, home: Point, pickup: Point, dropoff: Point | null): number {
  const direct = haversineKm(from, home);
  const via = dropoff
    ? haversineKm(from, pickup) + haversineKm(pickup, dropoff) + haversineKm(dropoff, home)
    : haversineKm(from, pickup) + haversineKm(pickup, home);
  return Math.max(0, Math.round((via - direct) * ROAD_FACTOR * 10) / 10);
}

// Moves `from` toward `to` by at most `stepKm` (driving simulation).
export function stepToward(from: Point, to: Point, stepKm: number): Point {
  const d = haversineKm(from, to);
  if (d <= stepKm || d === 0) return { ...to };
  const t = stepKm / d;
  return { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t };
}

// Bishkek centre and quick-pick places for testing without a geocoder.
export const BISHKEK: Point = { lat: 42.8746, lng: 74.6122 };

export const PLACES: { name: string; lat: number; lng: number }[] = [
  { name: "Дордой базар", lat: 42.9395, lng: 74.6185 },
  { name: "Ошский рынок", lat: 42.8746, lng: 74.5698 },
  { name: "Аламединский рынок", lat: 42.8865, lng: 74.6283 },
  { name: "Площадь Ала-Тоо", lat: 42.8766, lng: 74.6037 },
  { name: "ТЦ Бишкек Парк", lat: 42.8755, lng: 74.5905 },
  { name: "мкр. Асанбай", lat: 42.8205, lng: 74.6253 },
  { name: "мкр. Джал", lat: 42.8333, lng: 74.56 },
  { name: "Кок-Жар", lat: 42.827, lng: 74.642 },
  { name: "мкр. Восток-5", lat: 42.8605, lng: 74.6705 },
  { name: "ж/м Ак-Орго", lat: 42.902, lng: 74.548 },
  { name: "Рынок «Кудайберген»", lat: 42.8985, lng: 74.5405 },
  { name: "с. Кой-Таш", lat: 42.7135, lng: 74.665 },
];
