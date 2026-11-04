import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { drivers, orders, users, vehicleTypes, vehicles, walletTx } from "@/db/schema";
import { acceptOffer, clientCancel, createOrder, driverCancel, driverRespond, driverStep, sweep } from "@/server/orders";

const H = 3600_000;
let n = 0;

async function porterId() {
  const [t] = await db().select().from(vehicleTypes).where(eq(vehicleTypes.code, "porter"));
  return t.id;
}

async function client() {
  const [u] = await db().insert(users).values({ phone: `+99670000${String(++n).padStart(4, "0")}`, role: "client", name: "C" }).returning();
  return u.id;
}

async function driver(balance = 500) {
  const [u] = await db().insert(users).values({ phone: `+99677000${String(++n).padStart(4, "0")}`, role: "driver", name: "D" }).returning();
  await db().insert(drivers).values({ userId: u.id, verification: "approved", balance, isOnline: true, lat: 42.93, lng: 74.61 });
  await db().insert(vehicles).values({ driverId: u.id, typeId: await porterId(), plate: `01KG${n}` });
  return u.id;
}

async function scheduled(clientId: string, inHours: number) {
  return createOrder(clientId, {
    kind: "cargo",
    mode: "scheduled",
    typeId: await porterId(),
    pickupAddress: "Дордой",
    pickupLat: 42.9395,
    pickupLng: 74.6185,
    dropoffAddress: "Асанбай",
    dropoffLat: 42.8205,
    dropoffLng: 74.6253,
    scheduledAt: new Date(Date.now() + inHours * H),
    loaders: 0,
    clientPrice: 1000,
  });
}

const balance = async (id: string) => (await db().select().from(drivers).where(eq(drivers.userId, id)))[0].balance;
const status = async (id: string) => (await db().select().from(orders).where(eq(orders.id, id)))[0];

beforeEach(async () => {
  await pool().query("truncate penalties, wallet_tx, reviews, track_points, offers, orders, vehicles, drivers, sms_codes, users restart identity cascade");
});

describe("scheduled orders", () => {
  it("first driver to tap takes it and pays the commission", async () => {
    const c = await client();
    const d1 = await driver();
    const d2 = await driver();
    const o = await scheduled(c, 48);
    const results = await Promise.allSettled([driverRespond(d1, o.id, null), driverRespond(d2, o.id, null)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = await status(o.id);
    expect(after.status).toBe("assigned");
    expect(after.commission).toBe(80);
    expect((await balance(after.driverId!))).toBe(420);
  });

  it("free cancel a day ahead returns the commission", async () => {
    const c = await client();
    const d = await driver();
    const o = await scheduled(c, 48);
    await driverRespond(d, o.id, null);
    const r = await driverCancel(d, o.id);
    expect(r.outcome.tier).toBe("free");
    expect(await balance(d)).toBe(500);
    const back = await status(o.id);
    expect(back.status).toBe("searching");
    expect(back.urgent).toBe(true);
  });

  it("cancel on the day keeps the commission and fines", async () => {
    const c = await client();
    const d = await driver();
    const o = await scheduled(c, 1.5);
    await driverRespond(d, o.id, null);
    expect((await status(o.id)).status).toBe("confirmed"); // taken inside the window
    await driverCancel(d, o.id);
    expect(await balance(d)).toBe(500 - 80 - 200);
  });

  it("three late cancels close scheduled orders", async () => {
    const c = await client();
    const d = await driver(5000);
    for (let i = 0; i < 3; i++) {
      const o = await scheduled(c, 5 + i);
      await driverRespond(d, o.id, null);
      await driverCancel(d, o.id);
    }
    const [row] = await db().select().from(drivers).where(eq(drivers.userId, d));
    expect(row.scheduledBlockedUntil!.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * H);
    const o = await scheduled(c, 30);
    await expect(driverRespond(d, o.id, null)).rejects.toThrow(/закрыты/);
  });

  it("an unconfirmed order goes back to the feed with a penalty", async () => {
    const c = await client();
    const d = await driver();
    const o = await scheduled(c, 30);
    await driverRespond(d, o.id, null);
    // Pretend time moved on: start is in one hour, nothing confirmed.
    await db().update(orders).set({ scheduledAt: new Date(Date.now() + H) }).where(eq(orders.id, o.id));
    const r = await sweep();
    expect(r.released).toBe(1);
    expect((await status(o.id)).status).toBe("searching");
    expect(await balance(d)).toBe(500 - 80 - 200);
  });

  it("a client cancel refunds the driver", async () => {
    const c = await client();
    const d = await driver();
    const o = await scheduled(c, 1);
    await driverRespond(d, o.id, null);
    await clientCancel(c, o.id, null);
    expect(await balance(d)).toBe(500);
    const [u] = await db().select().from(users).where(eq(users.id, c));
    expect(u.lateCancels).toBe(1);
  });
});

describe("now orders with haggling", () => {
  it("counter offer, accept, drive, finish", async () => {
    const c = await client();
    const d = await driver();
    const o = await createOrder(c, {
      kind: "cargo",
      mode: "now",
      typeId: await porterId(),
      pickupAddress: "Ош базар",
      pickupLat: 42.8746,
      pickupLng: 74.5698,
      dropoffAddress: "Джал",
      dropoffLat: 42.8333,
      dropoffLng: 74.56,
      loaders: 0,
      clientPrice: 700,
    });
    await driverRespond(d, o.id, 800);
    expect((await status(o.id)).status).toBe("searching");
    const [offer] = await pool().query("select id from offers where order_id = $1", [o.id]).then((r) => r.rows);
    await acceptOffer(c, offer.id);
    expect((await status(o.id)).status).toBe("en_route");
    await driverStep(d, o.id, "arrive");
    await driverStep(d, o.id, "start");
    const done = await driverStep(d, o.id, "finish");
    expect(done.status).toBe("completed");
    expect(done.totalPrice).toBe(800);
    const tx = await db().select().from(walletTx).where(eq(walletTx.driverId, d));
    expect(tx.map((t) => t.amount)).toEqual([-64]);
  });

  it("a driver with a negative balance cannot take orders", async () => {
    const c = await client();
    const d = await driver(-10);
    const o = await scheduled(c, 30);
    await expect(driverRespond(d, o.id, null)).rejects.toThrow(/баланс/);
  });
});
