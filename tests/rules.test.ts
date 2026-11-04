import { describe, expect, it } from "vitest";
import { DEFAULT_PENALTIES, billedHours, commissionFor, driverCancelOutcome, normalizePhone, recommendPrice } from "@/lib/rules";
import { detourKm, PLACES } from "@/lib/geo";

const cargo = { mode: "scheduled" as const, kind: "cargo" as const, finalPrice: 1000, minHours: null, unit: "trip" as const };

describe("cancellation scale", () => {
  it("is free a day ahead", () => {
    expect(driverCancelOutcome(cargo, 30, DEFAULT_PENALTIES)).toMatchObject({ tier: "free", refundCommission: true, fine: 0, strike: false });
  });
  it("keeps the commission between 24 and 2 hours", () => {
    expect(driverCancelOutcome(cargo, 5, DEFAULT_PENALTIES)).toMatchObject({ tier: "late", refundCommission: false, fine: 0, strike: true });
  });
  it("adds a fine on the day", () => {
    expect(driverCancelOutcome(cargo, 1, DEFAULT_PENALTIES)).toMatchObject({ tier: "very_late", refundCommission: false, fine: 200 });
  });
  it("fines equipment by half the minimum", () => {
    const eq = { mode: "scheduled" as const, kind: "equipment" as const, finalPrice: 2000, minHours: 3, unit: "hour" as const };
    expect(driverCancelOutcome(eq, 1, DEFAULT_PENALTIES).fine).toBe(3000);
  });
  it("treats a missed confirmation as the worst case", () => {
    expect(driverCancelOutcome(cargo, 1.5, DEFAULT_PENALTIES, true)).toMatchObject({ tier: "no_confirm", fine: 200, strike: true });
  });
});

describe("pricing", () => {
  it("bills at least the minimum, in half hours", () => {
    expect(billedHours(30, 3)).toBe(3);
    expect(billedHours(200, 3)).toBe(3.5);
  });
  it("rounds the commission to whole som", () => {
    expect(commissionFor(1250, 8)).toBe(100);
  });
  it("recommends base + km", () => {
    const r = recommendPrice({ kind: "cargo", unit: "trip", basePrice: 500, perKm: 40, minHours: null, commissionPct: 8 }, 14, 1);
    expect(r.price).toBe(1350);
  });
});

describe("phones", () => {
  it("accepts local formats", () => {
    expect(normalizePhone("0555 123 456")).toBe("+996555123456");
    expect(normalizePhone("+996 (700) 12-34-56")).toBe("+996700123456");
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("home mode", () => {
  it("an order on the way has a small detour, one across town a big one", () => {
    const byName = (n: string) => PLACES.find((p) => p.name === n)!;
    const from = byName("Площадь Ала-Тоо");
    const home = byName("мкр. Джал");
    expect(detourKm(from, home, byName("Ошский рынок"), byName("мкр. Джал"))).toBeLessThan(3);
    expect(detourKm(from, home, byName("Дордой базар"), byName("мкр. Восток-5"))).toBeGreaterThan(10);
  });
});
