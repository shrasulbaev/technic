import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Деньги храним в целых сомах.

export const userRole = pgEnum("user_role", ["client", "driver", "admin"]);
export const serviceKind = pgEnum("service_kind", ["cargo", "equipment"]);
export const orderMode = pgEnum("order_mode", ["now", "scheduled"]);
export const orderStatus = pgEnum("order_status", [
  "searching", // ищем исполнителя, идёт торг
  "assigned", // исполнитель выбран (для запланированного ждём подтверждения)
  "confirmed", // водитель подтвердил выезд (запланированный)
  "en_route", // едет к точке подачи
  "arrived", // на месте
  "in_progress", // везёт груз / техника работает
  "completed",
  "cancelled",
]);
export const pricingUnit = pgEnum("pricing_unit", ["trip", "hour"]);
export const offerStatus = pgEnum("offer_status", ["pending", "accepted", "rejected", "withdrawn"]);
export const verification = pgEnum("verification", ["pending", "approved", "rejected"]);
export const walletKind = pgEnum("wallet_kind", ["topup", "commission", "refund", "fine", "bonus", "adjustment"]);
export const cancelSide = pgEnum("cancel_side", ["client", "driver", "admin", "system"]);
export const penaltyTier = pgEnum("penalty_tier", ["free", "late", "very_late", "no_confirm"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  role: userRole("role"),
  ratingSum: integer("rating_sum").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  lateCancels: integer("late_cancels").notNull().default(0), // поздние отмены клиента
  blocked: boolean("blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const smsCodes = pgTable("sms_codes", {
  phone: text("phone").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: smallint("attempts").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vehicleTypes = pgTable("vehicle_types", {
  id: serial("id").primaryKey(),
  kind: serviceKind("kind").notNull(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  unit: pricingUnit("unit").notNull(),
  minHours: real("min_hours"), // минималка для почасовой техники
  basePrice: integer("base_price").notNull(), // подача (рейс) или ставка за час
  perKm: integer("per_km").notNull().default(0),
  commissionPct: real("commission_pct").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sort: smallint("sort").notNull().default(0),
});

export const drivers = pgTable("drivers", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  verification: verification("verification").notNull().default("pending"),
  rejectReason: text("reject_reason"),
  balance: integer("balance").notNull().default(0),
  isOnline: boolean("is_online").notNull().default(false),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  locationAt: timestamp("location_at", { withTimezone: true }),
  homeAddress: text("home_address"),
  homeLat: doublePrecision("home_lat"),
  homeLng: doublePrecision("home_lng"),
  goingHome: boolean("going_home").notNull().default(false),
  detourKm: real("detour_km").notNull().default(3),
  radiusKm: real("radius_km").notNull().default(10),
  scheduledBlockedUntil: timestamp("scheduled_blocked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => drivers.userId, { onDelete: "cascade" }),
  typeId: integer("type_id").notNull().references(() => vehicleTypes.id),
  plate: text("plate").notNull(),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull(),
    clientId: uuid("client_id").notNull().references(() => users.id),
    kind: serviceKind("kind").notNull(),
    mode: orderMode("mode").notNull(),
    typeId: integer("type_id").notNull().references(() => vehicleTypes.id),
    status: orderStatus("status").notNull().default("searching"),
    pickupAddress: text("pickup_address").notNull(),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLng: doublePrecision("pickup_lng").notNull(),
    dropoffAddress: text("dropoff_address"),
    dropoffLat: doublePrecision("dropoff_lat"),
    dropoffLng: doublePrecision("dropoff_lng"),
    distanceKm: real("distance_km"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    durationHours: real("duration_hours"), // спецтехника: сколько часов нужно
    cargoDesc: text("cargo_desc"),
    loaders: smallint("loaders").notNull().default(0),
    comment: text("comment"),
    unit: pricingUnit("unit").notNull(),
    clientPrice: integer("client_price").notNull(),
    finalPrice: integer("final_price"),
    commission: integer("commission"),
    commissionRefunded: boolean("commission_refunded").notNull().default(false),
    driverId: uuid("driver_id").references(() => drivers.userId),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    urgent: boolean("urgent").notNull().default(false), // вернулся в ленту после отмены водителем
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    billedHours: real("billed_hours"),
    totalPrice: integer("total_price"),
    cancelledBy: cancelSide("cancelled_by"),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_status_idx").on(t.status, t.mode, t.scheduledAt), index("orders_client_idx").on(t.clientId), index("orders_driver_idx").on(t.driverId)],
);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id").notNull().references(() => drivers.userId),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    price: integer("price").notNull(),
    etaMin: integer("eta_min"),
    status: offerStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("offers_order_driver").on(t.orderId, t.driverId)],
);

export const trackPoints = pgTable(
  "track_points",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("track_order_idx").on(t.orderId, t.at)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id),
    targetId: uuid("target_id").notNull().references(() => users.id),
    stars: smallint("stars").notNull(),
    text: text("text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reviews_order_author").on(t.orderId, t.authorId)],
);

export const walletTx = pgTable(
  "wallet_tx",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    driverId: uuid("driver_id").notNull().references(() => drivers.userId),
    kind: walletKind("kind").notNull(),
    amount: integer("amount").notNull(), // + пополнение, − списание
    orderId: uuid("order_id").references(() => orders.id),
    provider: text("provider"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wallet_driver_idx").on(t.driverId, t.createdAt)],
);

export const penalties = pgTable(
  "penalties",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    driverId: uuid("driver_id").notNull().references(() => drivers.userId),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    tier: penaltyTier("tier").notNull(),
    fine: integer("fine").notNull().default(0),
    commissionKept: integer("commission_kept").notNull().default(0),
    waived: boolean("waived").notNull().default(false), // админ простил (поломка, ДТП)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("penalties_driver_idx").on(t.driverId, t.createdAt)],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
