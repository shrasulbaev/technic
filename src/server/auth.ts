import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, smsCodes, users, vehicles } from "@/db/schema";
import { adminPhones, env } from "@/lib/env";
import { normalizePhone } from "@/lib/rules";
import type { Session } from "@/lib/session-token";

const CODE_TTL_MS = 5 * 60_000;
const RESEND_MS = 30_000;
const MAX_ATTEMPTS = 5;

function hash(phone: string, code: string) {
  return createHmac("sha256", env().SESSION_SECRET).update(`${phone}:${code}`).digest("hex");
}

// SMS provider stub: nothing is sent, the code is returned so the sign-in
// screen can show it. Swap for a real gateway (Nikita.kg, etc.) later.
async function sendSms(phone: string, text: string) {
  console.log(`[sms stub] ${phone}: ${text}`);
}

export type RequestCodeResult = { ok: true; phone: string; testCode?: string } | { ok: false; error: string };

export async function requestCode(raw: string, now = new Date()): Promise<RequestCodeResult> {
  const phone = normalizePhone(raw);
  if (!phone) return { ok: false, error: "Введите номер в формате 0555 123 456" };
  const [prev] = await db().select().from(smsCodes).where(eq(smsCodes.phone, phone));
  if (prev && now.getTime() - prev.sentAt.getTime() < RESEND_MS) {
    return { ok: false, error: "Код уже отправлен. Повторить можно через 30 секунд." };
  }
  const code = String(randomInt(0, 10000)).padStart(4, "0");
  const row = { phone, codeHash: hash(phone, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS), attempts: 0, sentAt: now };
  await db().insert(smsCodes).values(row).onConflictDoUpdate({ target: smsCodes.phone, set: row });
  await sendSms(phone, `Код для входа в Technic: ${code}`);
  return { ok: true, phone, testCode: env().SMS_PROVIDER === "stub" ? code : undefined };
}

export async function verifyCode(phone: string, code: string, now = new Date()): Promise<Session | { error: string }> {
  const [row] = await db().select().from(smsCodes).where(eq(smsCodes.phone, phone));
  if (!row || row.expiresAt < now) return { error: "Код устарел, запросите новый" };
  if (row.attempts >= MAX_ATTEMPTS) return { error: "Слишком много попыток, запросите новый код" };
  const a = Buffer.from(hash(phone, code.trim()));
  const b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db().update(smsCodes).set({ attempts: sql`${smsCodes.attempts} + 1` }).where(eq(smsCodes.phone, phone));
    return { error: "Неверный код" };
  }
  await db().delete(smsCodes).where(eq(smsCodes.phone, phone));
  return signIn(phone);
}

// Finds or creates the user. Phones listed in ADMIN_PHONES are admins.
export async function signIn(phone: string): Promise<Session | { error: string }> {
  const isAdmin = adminPhones().includes(phone);
  let [user] = await db().select().from(users).where(eq(users.phone, phone));
  if (!user) {
    [user] = await db().insert(users).values({ phone, role: isAdmin ? "admin" : null, name: isAdmin ? "Администратор" : null }).returning();
  } else if (isAdmin && user.role !== "admin") {
    [user] = await db().update(users).set({ role: "admin" }).where(eq(users.id, user.id)).returning();
  }
  if (user.blocked) return { error: "Аккаунт заблокирован. Напишите в поддержку." };
  return { userId: user.id, role: user.role };
}

export type OnboardingInput =
  | { role: "client"; name: string }
  | { role: "driver"; name: string; typeId: number; plate: string; model: string };

export async function completeOnboarding(userId: string, input: OnboardingInput): Promise<Session> {
  return db().transaction(async (tx) => {
    const [u] = await tx.update(users).set({ name: input.name, role: input.role }).where(eq(users.id, userId)).returning();
    if (input.role === "driver") {
      await tx.insert(drivers).values({ userId }).onConflictDoNothing();
      await tx.insert(vehicles).values({ driverId: userId, typeId: input.typeId, plate: input.plate.toUpperCase(), model: input.model || null });
    }
    return { userId: u.id, role: u.role };
  });
}

// Small in-memory limiter; per key, sliding window.
const attempts = new Map<string, number[]>();

export function allowAttempt(key: string, limit = 5, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}
