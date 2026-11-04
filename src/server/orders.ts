import { and, asc, desc, eq, gte, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Db } from "@/db/client";
import { drivers, offers, orders, penalties, reviews, trackPoints, users, vehicleTypes, vehicles, walletTx } from "@/db/schema";
import { detourKm, haversineKm, roadKm, type Point } from "@/lib/geo";
import { billedHours, commissionFor, driverCancelOutcome, totalFor } from "@/lib/rules";
import { publish } from "./events";
import { getPenaltySettings } from "./settings";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class AppError extends Error {}

const HOUR = 3600_000;
export const ACTIVE: (typeof orders.$inferSelect.status)[] = ["assigned", "confirmed", "en_route", "arrived", "in_progress"];

// ---------- Создание заказа ----------

export const orderInput = z
  .object({
    kind: z.enum(["cargo", "equipment"]),
    mode: z.enum(["now", "scheduled"]),
    typeId: z.coerce.number().int().positive(),
    pickupAddress: z.string().trim().min(2, "Укажите адрес подачи").max(200),
    pickupLat: z.coerce.number().min(-90).max(90),
    pickupLng: z.coerce.number().min(-180).max(180),
    dropoffAddress: z.string().trim().max(200).optional().or(z.literal("")),
    dropoffLat: z.coerce.number().optional(),
    dropoffLng: z.coerce.number().optional(),
    scheduledAt: z.coerce.date().optional(),
    durationHours: z.coerce.number().min(0.5).max(24).optional(),
    cargoDesc: z.string().trim().max(300).optional(),
    loaders: z.coerce.number().int().min(0).max(10).default(0),
    comment: z.string().trim().max(500).optional(),
    clientPrice: z.coerce.number().int().min(100, "Цена слишком маленькая").max(10_000_000),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "scheduled") {
      if (!v.scheduledAt || isNaN(v.scheduledAt.getTime())) ctx.addIssue({ code: "custom", message: "Укажите дату и время", path: ["scheduledAt"] });
      else if (v.scheduledAt.getTime() < Date.now() + 30 * 60_000) ctx.addIssue({ code: "custom", message: "Запланировать можно минимум за 30 минут", path: ["scheduledAt"] });
    }
    if (v.kind === "cargo" && (v.dropoffLat == null || v.dropoffLng == null || !v.dropoffAddress)) {
      ctx.addIssue({ code: "custom", message: "Укажите точку выгрузки", path: ["dropoffAddress"] });
    }
  });

export type OrderInput = z.infer<typeof orderInput>;

export async function createOrder(clientId: string, input: OrderInput) {
  const [type] = await db().select().from(vehicleTypes).where(eq(vehicleTypes.id, input.typeId));
  if (!type || !type.active || type.kind !== input.kind) throw new AppError("Выберите тип техники");
  const hasDrop = input.kind === "cargo" && input.dropoffLat != null && input.dropoffLng != null;
  const distanceKm = hasDrop ? roadKm({ lat: input.pickupLat, lng: input.pickupLng }, { lat: input.dropoffLat!, lng: input.dropoffLng! }) : null;
  const [o] = await db()
    .insert(orders)
    .values({
      clientId,
      kind: input.kind,
      mode: input.mode,
      typeId: type.id,
      unit: type.unit,
      pickupAddress: input.pickupAddress,
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      dropoffAddress: hasDrop ? input.dropoffAddress || null : null,
      dropoffLat: hasDrop ? input.dropoffLat : null,
      dropoffLng: hasDrop ? input.dropoffLng : null,
      distanceKm,
      scheduledAt: input.mode === "scheduled" ? input.scheduledAt : null,
      durationHours: input.kind === "equipment" ? (input.durationHours ?? type.minHours ?? null) : null,
      cargoDesc: input.cargoDesc || null,
      loaders: input.kind === "cargo" ? input.loaders : 0,
      comment: input.comment || null,
      clientPrice: input.clientPrice,
    })
    .returning();
  await publish({ type: "feed", orderId: o.id, drivers: true });
  return o;
}

export async function raisePrice(clientId: string, orderId: string, price: number) {
  const [o] = await db()
    .update(orders)
    .set({ clientPrice: price })
    .where(and(eq(orders.id, orderId), eq(orders.clientId, clientId), eq(orders.status, "searching"), lt(orders.clientPrice, price)))
    .returning();
  if (!o) throw new AppError("Цену можно только поднять, пока идёт поиск");
  await publish({ type: "feed", orderId, drivers: true });
}

// ---------- Водитель: допуск к заказам ----------

export type DriverCtx = { driver: typeof drivers.$inferSelect; vehicle: typeof vehicles.$inferSelect | null };

async function driverCtx(driverId: string, tx: Db | Tx = db()): Promise<DriverCtx> {
  const [d] = await tx.select().from(drivers).where(eq(drivers.userId, driverId));
  if (!d) throw new AppError("Профиль водителя не найден");
  const [v] = await tx.select().from(vehicles).where(eq(vehicles.driverId, driverId)).orderBy(asc(vehicles.createdAt)).limit(1);
  return { driver: d, vehicle: v ?? null };
}

export function driverBlockReason(c: DriverCtx, mode: "now" | "scheduled", now = new Date()): string | null {
  if (c.driver.verification !== "approved") return "Профиль ещё на проверке";
  if (!c.vehicle) return "Добавьте машину в профиле";
  if (c.driver.balance < 0) return "Пополните баланс, чтобы брать заказы";
  if (mode === "scheduled" && c.driver.scheduledBlockedUntil && c.driver.scheduledBlockedUntil > now) {
    return `Запланированные заказы закрыты до ${c.driver.scheduledBlockedUntil.toLocaleDateString("ru-RU")} из-за отмен`;
  }
  return null;
}

// ---------- Отклик и назначение ----------

// Driver answers an order: at the client's price or with their own.
// A scheduled order at the client's price is taken at once (first come, first served).
export async function driverRespond(driverId: string, orderId: string, ownPrice: number | null) {
  const [o] = await db().select().from(orders).where(eq(orders.id, orderId));
  if (!o || o.status !== "searching") throw new AppError("Заказ уже взяли");
  const c = await driverCtx(driverId);
  const block = driverBlockReason(c, o.mode);
  if (block) throw new AppError(block);
  if (c.vehicle!.typeId !== o.typeId) throw new AppError("Ваша машина не подходит под этот заказ");
  const price = ownPrice ?? o.clientPrice;
  if (o.mode === "scheduled" && price === o.clientPrice) return assign(orderId, driverId, c.vehicle!.id, price, null);

  const eta = c.driver.lat != null && c.driver.lng != null
    ? Math.max(1, Math.round((haversineKm({ lat: c.driver.lat, lng: c.driver.lng }, { lat: o.pickupLat, lng: o.pickupLng }) * 1.3 * 60) / 30))
    : null;
  await db()
    .insert(offers)
    .values({ orderId, driverId, vehicleId: c.vehicle!.id, price, etaMin: eta })
    .onConflictDoUpdate({ target: [offers.orderId, offers.driverId], set: { price, etaMin: eta, status: "pending", createdAt: new Date() } });
  await publish({ type: "offer", orderId, users: [o.clientId] });
  return null;
}

export async function withdrawOffer(driverId: string, orderId: string) {
  await db().update(offers).set({ status: "withdrawn" }).where(and(eq(offers.orderId, orderId), eq(offers.driverId, driverId), eq(offers.status, "pending")));
  const [o] = await db().select({ clientId: orders.clientId }).from(orders).where(eq(orders.id, orderId));
  if (o) await publish({ type: "offer", orderId, users: [o.clientId] });
}

export async function rejectOffer(clientId: string, offerId: string) {
  const [row] = await db()
    .select({ offer: offers, clientId: orders.clientId })
    .from(offers)
    .innerJoin(orders, eq(orders.id, offers.orderId))
    .where(eq(offers.id, offerId));
  if (!row || row.clientId !== clientId) throw new AppError("Предложение не найдено");
  await db().update(offers).set({ status: "rejected" }).where(eq(offers.id, offerId));
  await publish({ type: "offer", orderId: row.offer.orderId, users: [clientId, row.offer.driverId] });
}

export async function acceptOffer(clientId: string, offerId: string) {
  const [row] = await db()
    .select({ offer: offers, clientId: orders.clientId })
    .from(offers)
    .innerJoin(orders, eq(orders.id, offers.orderId))
    .where(eq(offers.id, offerId));
  if (!row || row.clientId !== clientId || row.offer.status !== "pending") throw new AppError("Предложение больше не действует");
  return assign(row.offer.orderId, row.offer.driverId, row.offer.vehicleId, row.offer.price, offerId);
}

// Assigns the driver and charges the commission. The order row is locked,
// so two drivers can never take the same order.
async function assign(orderId: string, driverId: string, vehicleId: string, price: number, offerId: string | null) {
  const ps = await getPenaltySettings();
  const result = await db().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o || o.status !== "searching") throw new AppError("Заказ уже взяли");
    const [d] = await tx.select().from(drivers).where(eq(drivers.userId, driverId)).for("update");
    if (!d || d.verification !== "approved") throw new AppError("Водитель не допущен к заказам");
    if (d.balance < 0) throw new AppError(offerId ? "У водителя нет средств на балансе, выберите другого" : "Пополните баланс, чтобы брать заказы");
    const [t] = await tx.select().from(vehicleTypes).where(eq(vehicleTypes.id, o.typeId));
    const commission = commissionFor(price, t.commissionPct);
    // Taken inside the confirmation window: taking it counts as confirming.
    const now = new Date();
    const autoConfirm = o.mode === "scheduled" && o.scheduledAt != null && o.scheduledAt.getTime() - now.getTime() < ps.confirmHours * HOUR;
    const [updated] = await tx
      .update(orders)
      .set({
        status: o.mode === "now" ? "en_route" : autoConfirm ? "confirmed" : "assigned",
        driverId,
        vehicleId,
        finalPrice: price,
        commission,
        commissionRefunded: false,
        assignedAt: now,
        confirmedAt: autoConfirm ? now : null,
        urgent: false,
      })
      .where(eq(orders.id, orderId))
      .returning();
    await tx
      .update(offers)
      .set({ status: sql`case when ${offers.id} = ${offerId ?? "00000000-0000-0000-0000-000000000000"}::uuid then 'accepted' else 'rejected' end::offer_status` })
      .where(and(eq(offers.orderId, orderId), eq(offers.status, "pending")));
    if (commission > 0) {
      await tx.update(drivers).set({ balance: sql`${drivers.balance} - ${commission}` }).where(eq(drivers.userId, driverId));
      await tx.insert(walletTx).values({ driverId, kind: "commission", amount: -commission, orderId, note: `Комиссия ${t.commissionPct}% · заказ №${o.number}` });
    }
    const losers = await tx.select({ id: offers.driverId }).from(offers).where(and(eq(offers.orderId, orderId), ne(offers.driverId, driverId)));
    return { order: updated, notify: [o.clientId, driverId, ...losers.map((l) => l.id)] };
  });
  await publish({ type: "order", orderId, users: result.notify, drivers: true });
  return result.order;
}

// ---------- Ход выполнения ----------

const NEXT: Record<string, { from: (typeof orders.$inferSelect.status)[]; to: typeof orders.$inferSelect.status }> = {
  confirm: { from: ["assigned"], to: "confirmed" },
  depart: { from: ["assigned", "confirmed"], to: "en_route" },
  arrive: { from: ["en_route"], to: "arrived" },
  start: { from: ["arrived"], to: "in_progress" },
  finish: { from: ["in_progress"], to: "completed" },
};

export type DriverStep = keyof typeof NEXT;

export async function driverStep(driverId: string, orderId: string, step: DriverStep, now = new Date()) {
  const rule = NEXT[step];
  const out = await db().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.driverId, driverId))).for("update");
    if (!o) throw new AppError("Заказ не найден");
    if (!rule.from.includes(o.status)) throw new AppError("Это действие сейчас недоступно");
    if (step === "confirm" && o.mode !== "scheduled") throw new AppError("Подтверждать нужно только запланированные");
    const set: Partial<typeof orders.$inferInsert> = { status: rule.to };
    if (step === "confirm") set.confirmedAt = now;
    if (step === "arrive") set.arrivedAt = now;
    if (step === "start") set.startedAt = now;
    if (step === "finish") {
      const [t] = await tx.select().from(vehicleTypes).where(eq(vehicleTypes.id, o.typeId));
      const hours = o.unit === "hour" ? billedHours((now.getTime() - (o.startedAt ?? now).getTime()) / 60_000, t.minHours) : null;
      set.finishedAt = now;
      set.billedHours = hours;
      set.totalPrice = totalFor(o.unit, o.finalPrice ?? o.clientPrice, hours);
    }
    const [u] = await tx.update(orders).set(set).where(eq(orders.id, orderId)).returning();
    return u;
  });
  await publish({ type: "order", orderId, users: [out.clientId, driverId] });
  return out;
}

// ---------- Отмены ----------

export async function previewDriverCancel(driverId: string, orderId: string, now = new Date()) {
  const [row] = await db()
    .select({ o: orders, minHours: vehicleTypes.minHours })
    .from(orders)
    .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
    .where(and(eq(orders.id, orderId), eq(orders.driverId, driverId)));
  if (!row) return null;
  const s = await getPenaltySettings();
  const hoursBefore = row.o.scheduledAt ? (row.o.scheduledAt.getTime() - now.getTime()) / HOUR : 0;
  const outcome = driverCancelOutcome(
    { mode: row.o.mode, kind: row.o.kind, finalPrice: row.o.finalPrice ?? row.o.clientPrice, minHours: row.minHours, unit: row.o.unit },
    hoursBefore,
    s,
  );
  return { outcome, commission: row.o.commission ?? 0, settings: s };
}

// Driver gives the order up: penalties per the cancellation scale, the order
// goes back to the feed marked urgent.
export async function driverCancel(driverId: string, orderId: string, opts: { noConfirm?: boolean; reason?: string } = {}, now = new Date()) {
  const s = await getPenaltySettings();
  const res = await db().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.driverId, driverId))).for("update");
    if (!o || !["assigned", "confirmed", "en_route", "arrived"].includes(o.status)) throw new AppError("Этот заказ нельзя отменить");
    const [t] = await tx.select().from(vehicleTypes).where(eq(vehicleTypes.id, o.typeId));
    const hoursBefore = o.scheduledAt ? (o.scheduledAt.getTime() - now.getTime()) / HOUR : 0;
    const out = driverCancelOutcome(
      { mode: o.mode, kind: o.kind, finalPrice: o.finalPrice ?? o.clientPrice, minHours: t.minHours, unit: o.unit },
      hoursBefore,
      s,
      opts.noConfirm,
    );
    const commission = o.commission ?? 0;
    let delta = 0;
    if (out.refundCommission && commission > 0) {
      delta += commission;
      await tx.insert(walletTx).values({ driverId, kind: "refund", amount: commission, orderId, note: `Возврат комиссии · заказ №${o.number}` });
    }
    if (out.fine > 0) {
      delta -= out.fine;
      await tx.insert(walletTx).values({ driverId, kind: "fine", amount: -out.fine, orderId, note: `Штраф за отмену · заказ №${o.number}` });
    }
    if (delta !== 0) await tx.update(drivers).set({ balance: sql`${drivers.balance} + ${delta}` }).where(eq(drivers.userId, driverId));
    await tx.insert(penalties).values({ driverId, orderId, tier: out.tier, fine: out.fine, commissionKept: out.refundCommission ? 0 : commission });

    let blockedUntil: Date | null = null;
    if (out.strike) {
      const since = new Date(now.getTime() - s.strikesWindowDays * 24 * HOUR);
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(penalties)
        .where(and(eq(penalties.driverId, driverId), gte(penalties.createdAt, since), ne(penalties.tier, "free"), eq(penalties.waived, false)));
      if (n >= s.strikesLimit) {
        blockedUntil = new Date(now.getTime() + s.blockDays * 24 * HOUR);
        await tx.update(drivers).set({ scheduledBlockedUntil: blockedUntil }).where(eq(drivers.userId, driverId));
      }
    }

    // Back to the feed. A now-order whose time has passed stays a now-order.
    await tx
      .update(orders)
      .set({ status: "searching", driverId: null, vehicleId: null, finalPrice: null, commission: null, assignedAt: null, confirmedAt: null, arrivedAt: null, urgent: true })
      .where(eq(orders.id, orderId));
    await tx.update(offers).set({ status: "withdrawn" }).where(and(eq(offers.orderId, orderId), eq(offers.driverId, driverId)));
    return { order: o, outcome: out, blockedUntil };
  });
  await publish({ type: "order", orderId, users: [res.order.clientId, driverId], drivers: true });
  await publish({ type: "wallet", users: [driverId] });
  return res;
}

// Client cancels. The driver did nothing wrong, so a charged commission is
// returned; a late cancellation is remembered on the client's profile.
export async function clientCancel(clientId: string, orderId: string, reason: string | null, now = new Date()) {
  const s = await getPenaltySettings();
  const res = await db().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.clientId, clientId))).for("update");
    if (!o || o.status === "completed" || o.status === "cancelled" || o.status === "in_progress") throw new AppError("Этот заказ уже нельзя отменить");
    const late = o.driverId != null && (o.mode === "now" || (o.scheduledAt != null && o.scheduledAt.getTime() - now.getTime() < s.lateHours * HOUR));
    await refundIfCharged(tx, o);
    await tx.update(orders).set({ status: "cancelled", cancelledBy: "client", cancelReason: reason }).where(eq(orders.id, orderId));
    await tx.update(offers).set({ status: "rejected" }).where(and(eq(offers.orderId, orderId), eq(offers.status, "pending")));
    if (late) await tx.update(users).set({ lateCancels: sql`${users.lateCancels} + 1` }).where(eq(users.id, clientId));
    return o;
  });
  await publish({ type: "order", orderId, users: [clientId, ...(res.driverId ? [res.driverId] : [])], drivers: true });
  return res;
}

export async function adminCancel(orderId: string, reason: string) {
  const res = await db().transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o || o.status === "completed" || o.status === "cancelled") throw new AppError("Заказ уже закрыт");
    await refundIfCharged(tx, o);
    await tx.update(orders).set({ status: "cancelled", cancelledBy: "admin", cancelReason: reason }).where(eq(orders.id, orderId));
    return o;
  });
  await publish({ type: "order", orderId, users: [res.clientId, ...(res.driverId ? [res.driverId] : [])], drivers: true });
}

async function refundIfCharged(tx: Tx, o: typeof orders.$inferSelect) {
  if (o.driverId && o.commission && o.commission > 0 && !o.commissionRefunded) {
    await tx.update(drivers).set({ balance: sql`${drivers.balance} + ${o.commission}` }).where(eq(drivers.userId, o.driverId));
    await tx.insert(walletTx).values({ driverId: o.driverId, kind: "refund", amount: o.commission, orderId: o.id, note: `Возврат комиссии: заказ №${o.number} отменён` });
    await tx.update(orders).set({ commissionRefunded: true }).where(eq(orders.id, o.id));
  }
}

// Admin forgives a penalty (breakdown, accident): fine and commission come back.
export async function waivePenalty(penaltyId: number) {
  await db().transaction(async (tx) => {
    const [p] = await tx.select().from(penalties).where(eq(penalties.id, penaltyId)).for("update");
    if (!p || p.waived) throw new AppError("Штраф уже снят");
    const back = p.fine + p.commissionKept;
    if (back > 0) {
      await tx.update(drivers).set({ balance: sql`${drivers.balance} + ${back}` }).where(eq(drivers.userId, p.driverId));
      await tx.insert(walletTx).values({ driverId: p.driverId, kind: "refund", amount: back, orderId: p.orderId, note: "Штраф снят администратором" });
    }
    await tx.update(penalties).set({ waived: true }).where(eq(penalties.id, penaltyId));
  });
}

// ---------- Геопозиция и трек ----------

export async function updateLocation(driverId: string, p: Point, now = new Date()) {
  await db().update(drivers).set({ lat: p.lat, lng: p.lng, locationAt: now }).where(eq(drivers.userId, driverId));
  const active = await db()
    .select({ id: orders.id, clientId: orders.clientId })
    .from(orders)
    .where(and(eq(orders.driverId, driverId), inArray(orders.status, ["en_route", "arrived", "in_progress"])));
  for (const o of active) {
    await db().insert(trackPoints).values({ orderId: o.id, lat: p.lat, lng: p.lng, at: now });
    await publish({ type: "location", orderId: o.id, users: [o.clientId] });
  }
}

// ---------- Отзывы ----------

export async function leaveReview(authorId: string, orderId: string, stars: number, text: string | null) {
  const [o] = await db().select().from(orders).where(eq(orders.id, orderId));
  if (!o || o.status !== "completed") throw new AppError("Оценить можно после выполнения");
  const target = authorId === o.clientId ? o.driverId : authorId === o.driverId ? o.clientId : null;
  if (!target) throw new AppError("Нет доступа");
  const s = Math.max(1, Math.min(5, Math.round(stars)));
  await db().transaction(async (tx) => {
    const ins = await tx.insert(reviews).values({ orderId, authorId, targetId: target, stars: s, text }).onConflictDoNothing().returning();
    if (ins.length) await tx.update(users).set({ ratingSum: sql`${users.ratingSum} + ${s}`, ratingCount: sql`${users.ratingCount} + 1` }).where(eq(users.id, target));
  });
}

// ---------- Ленты водителя ----------

export type FeedOrder = typeof orders.$inferSelect & { typeName: string; distanceToPickupKm: number | null; detour: number | null; clientRating: number | null };

async function searchingOrders(mode: "now" | "scheduled", typeId: number, now: Date) {
  const rows = await db()
    .select({ o: orders, typeName: vehicleTypes.name, ratingSum: users.ratingSum, ratingCount: users.ratingCount })
    .from(orders)
    .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
    .innerJoin(users, eq(users.id, orders.clientId))
    .where(and(eq(orders.status, "searching"), eq(orders.mode, mode), eq(orders.typeId, typeId), ...(mode === "scheduled" ? [gte(orders.scheduledAt, now)] : [])))
    .orderBy(mode === "scheduled" ? asc(orders.scheduledAt) : desc(orders.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...r.o, typeName: r.typeName, clientRating: r.ratingCount ? r.ratingSum / r.ratingCount : null }));
}

export async function nearFeed(c: DriverCtx, now = new Date()): Promise<FeedOrder[]> {
  if (!c.vehicle) return [];
  const rows = await searchingOrders("now", c.vehicle.typeId, now);
  const here = c.driver.lat != null && c.driver.lng != null ? { lat: c.driver.lat, lng: c.driver.lng } : null;
  const home = c.driver.goingHome && c.driver.homeLat != null && c.driver.homeLng != null ? { lat: c.driver.homeLat, lng: c.driver.homeLng } : null;
  const out: FeedOrder[] = [];
  for (const o of rows) {
    const pickup = { lat: o.pickupLat, lng: o.pickupLng };
    const dist = here ? roadKm(here, pickup) : null;
    const drop = o.dropoffLat != null && o.dropoffLng != null ? { lat: o.dropoffLat, lng: o.dropoffLng } : null;
    const det = here && home ? detourKm(here, home, pickup, drop) : null;
    if (home) {
      if (det == null || det > c.driver.detourKm) continue;
    } else if (dist != null && dist > c.driver.radiusKm) continue;
    out.push({ ...o, distanceToPickupKm: dist, detour: det });
  }
  return home ? out.sort((a, b) => (a.detour ?? 0) - (b.detour ?? 0)) : out.sort((a, b) => (a.distanceToPickupKm ?? 0) - (b.distanceToPickupKm ?? 0));
}

export async function plannedFeed(c: DriverCtx, now = new Date()): Promise<FeedOrder[]> {
  if (!c.vehicle) return [];
  const rows = await searchingOrders("scheduled", c.vehicle.typeId, now);
  const here = c.driver.lat != null && c.driver.lng != null ? { lat: c.driver.lat, lng: c.driver.lng } : null;
  return rows.map((o) => ({ ...o, distanceToPickupKm: here ? roadKm(here, { lat: o.pickupLat, lng: o.pickupLng }) : null, detour: null }));
}

export async function driverOrders(driverId: string) {
  return db()
    .select({ o: orders, typeName: vehicleTypes.name })
    .from(orders)
    .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
    .where(and(eq(orders.driverId, driverId), notInArray(orders.status, ["searching", "cancelled"])))
    .orderBy(desc(orders.createdAt))
    .limit(50);
}

export async function myPendingOffers(driverId: string) {
  return db()
    .select({ offer: offers, o: orders, typeName: vehicleTypes.name })
    .from(offers)
    .innerJoin(orders, eq(orders.id, offers.orderId))
    .innerJoin(vehicleTypes, eq(vehicleTypes.id, orders.typeId))
    .where(and(eq(offers.driverId, driverId), eq(offers.status, "pending"), eq(orders.status, "searching")));
}

export { driverCtx };

// ---------- Фоновая проверка ----------

// Every minute: unconfirmed scheduled orders past the deadline go back to the
// feed with the no-confirm penalty; stale searches are closed.
export async function sweep(now = new Date()) {
  const s = await getPenaltySettings();
  const deadline = new Date(now.getTime() + s.confirmHours * HOUR);
  const late = await db()
    .select({ id: orders.id, driverId: orders.driverId })
    .from(orders)
    .where(and(eq(orders.status, "assigned"), eq(orders.mode, "scheduled"), lt(orders.scheduledAt, deadline)));
  for (const o of late) {
    try {
      await driverCancel(o.driverId!, o.id, { noConfirm: true }, now);
    } catch (e) {
      console.error("sweep: no-confirm failed", o.id, e);
    }
  }
  const stale = await db()
    .update(orders)
    .set({ status: "cancelled", cancelledBy: "system", cancelReason: "Никто не взял заказ" })
    .where(
      and(
        eq(orders.status, "searching"),
        sql`(${orders.mode} = 'now' and ${orders.createdAt} < ${new Date(now.getTime() - 3 * HOUR)}) or (${orders.mode} = 'scheduled' and ${orders.scheduledAt} < ${new Date(now.getTime() - HOUR)})`,
      ),
    )
    .returning({ id: orders.id, clientId: orders.clientId });
  for (const o of stale) await publish({ type: "order", orderId: o.id, users: [o.clientId], drivers: true });
  return { released: late.length, expired: stale.length };
}
