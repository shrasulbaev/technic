import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, penalties, users, vehicles, walletTx } from "@/db/schema";
import { publish } from "./events";
import { AppError } from "./orders";

export async function setOnline(driverId: string, online: boolean) {
  await db().update(drivers).set({ isOnline: online, ...(online ? {} : { goingHome: false }) }).where(eq(drivers.userId, driverId));
}

export async function setGoingHome(driverId: string, on: boolean) {
  const [d] = await db().select().from(drivers).where(eq(drivers.userId, driverId));
  if (on && (d?.homeLat == null || d?.homeLng == null)) throw new AppError("Сначала укажите домашний адрес в профиле");
  await db().update(drivers).set({ goingHome: on, ...(on ? { isOnline: true } : {}) }).where(eq(drivers.userId, driverId));
}

export async function saveDriverSettings(
  driverId: string,
  v: { homeAddress: string | null; homeLat: number | null; homeLng: number | null; detourKm: number; radiusKm: number },
) {
  await db()
    .update(drivers)
    .set({ ...v, ...(v.homeLat == null ? { goingHome: false } : {}) })
    .where(eq(drivers.userId, driverId));
}

export async function updateVehicle(driverId: string, v: { typeId: number; plate: string; model: string | null }) {
  const [cur] = await db().select().from(vehicles).where(eq(vehicles.driverId, driverId)).limit(1);
  if (cur) await db().update(vehicles).set({ ...v, plate: v.plate.toUpperCase() }).where(eq(vehicles.id, cur.id));
  else await db().insert(vehicles).values({ driverId, ...v, plate: v.plate.toUpperCase() });
  // A changed vehicle has to be checked again.
  if (!cur || cur.typeId !== v.typeId || cur.plate !== v.plate.toUpperCase()) {
    await db().update(drivers).set({ verification: "pending" }).where(eq(drivers.userId, driverId));
  }
}

// Payment stub: any amount succeeds immediately. Replace with MBank / Элсом /
// O!Деньги (or an aggregator) callbacks once the contract is signed.
export const PROVIDERS = [
  { id: "mbank", name: "MBank" },
  { id: "elsom", name: "Элсом" },
  { id: "odengi", name: "O!Деньги" },
] as const;

export async function topupStub(driverId: string, amount: number, provider: string) {
  if (!Number.isInteger(amount) || amount < 50 || amount > 100_000) throw new AppError("Сумма от 50 до 100 000 сом");
  const name = PROVIDERS.find((p) => p.id === provider)?.name;
  if (!name) throw new AppError("Выберите способ оплаты");
  await db().transaction(async (tx) => {
    await tx.update(drivers).set({ balance: sql`${drivers.balance} + ${amount}` }).where(eq(drivers.userId, driverId));
    await tx.insert(walletTx).values({ driverId, kind: "topup", amount, provider, note: `Пополнение · ${name} (тест)` });
  });
  await publish({ type: "wallet", users: [driverId] });
}

export async function adjustBalance(driverId: string, amount: number, note: string) {
  if (!Number.isInteger(amount) || amount === 0) throw new AppError("Укажите сумму");
  await db().transaction(async (tx) => {
    await tx.update(drivers).set({ balance: sql`${drivers.balance} + ${amount}` }).where(eq(drivers.userId, driverId));
    await tx.insert(walletTx).values({ driverId, kind: amount > 0 ? "bonus" : "adjustment", amount, note: note || "Корректировка администратором" });
  });
  await publish({ type: "wallet", users: [driverId] });
}

export async function walletHistory(driverId: string, limit = 50) {
  return db().select().from(walletTx).where(eq(walletTx.driverId, driverId)).orderBy(desc(walletTx.createdAt)).limit(limit);
}

export async function driverPenalties(driverId: string) {
  return db().select().from(penalties).where(eq(penalties.driverId, driverId)).orderBy(desc(penalties.createdAt)).limit(20);
}

export async function setVerification(driverId: string, status: "approved" | "rejected", reason: string | null) {
  await db().update(drivers).set({ verification: status, rejectReason: status === "rejected" ? reason : null }).where(eq(drivers.userId, driverId));
  await publish({ type: "wallet", users: [driverId] });
}

export async function setUserBlocked(userId: string, blocked: boolean) {
  await db().update(users).set({ blocked }).where(and(eq(users.id, userId)));
}
