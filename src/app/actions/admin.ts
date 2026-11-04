"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { vehicleTypes } from "@/db/schema";
import { requireUser } from "@/server/me";
import { run } from "@/server/flash";
import { AppError, adminCancel, waivePenalty } from "@/server/orders";
import { adjustBalance, setUserBlocked, setVerification } from "@/server/drivers";
import { savePenaltySettings } from "@/server/settings";

const done = () => revalidatePath("/admin", "layout");

export async function verifyAction(form: FormData) {
  await requireUser("admin");
  const status = form.get("status") === "approved" ? "approved" : "rejected";
  await setVerification(String(form.get("driverId")), status, String(form.get("reason") ?? "") || null);
  done();
}

export async function adjustBalanceAction(form: FormData) {
  await requireUser("admin");
  await run(() => adjustBalance(String(form.get("driverId")), Number(form.get("amount")), String(form.get("note") ?? "")));
  done();
}

export async function waivePenaltyAction(form: FormData) {
  await requireUser("admin");
  await run(() => waivePenalty(Number(form.get("penaltyId"))));
  done();
}

export async function adminCancelAction(form: FormData) {
  await requireUser("admin");
  await run(() => adminCancel(String(form.get("orderId")), String(form.get("reason") ?? "") || "Отменён администратором"));
  done();
}

export async function blockUserAction(form: FormData) {
  await requireUser("admin");
  await setUserBlocked(String(form.get("userId")), form.get("blocked") === "1");
  done();
}

const typeSchema = z.object({
  id: z.coerce.number().int(),
  name: z.string().trim().min(2),
  basePrice: z.coerce.number().int().min(0),
  perKm: z.coerce.number().int().min(0),
  minHours: z.coerce.number().min(0).optional(),
  commissionPct: z.coerce.number().min(0).max(50),
  active: z.string().optional(),
});

export async function saveTypeAction(form: FormData) {
  await requireUser("admin");
  await run(async () => {
    const raw = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ""));
    const p = typeSchema.safeParse(raw);
    if (!p.success) throw new AppError(p.error.issues[0]?.message ?? "Проверьте поля");
    const { id, active, minHours, ...rest } = p.data;
    await db().update(vehicleTypes).set({ ...rest, minHours: minHours ?? null, active: active === "on" }).where(eq(vehicleTypes.id, id));
  });
  done();
}

const penaltySchema = z.object({
  freeHours: z.coerce.number().min(0).max(168),
  lateHours: z.coerce.number().min(0).max(48),
  fineFixed: z.coerce.number().int().min(0),
  equipmentFinePct: z.coerce.number().min(0).max(100),
  strikesLimit: z.coerce.number().int().min(1).max(50),
  strikesWindowDays: z.coerce.number().int().min(1).max(365),
  blockDays: z.coerce.number().int().min(0).max(365),
  confirmHours: z.coerce.number().min(0.5).max(24),
});

export async function savePenaltiesAction(form: FormData) {
  await requireUser("admin");
  await run(async () => {
    const p = penaltySchema.safeParse(Object.fromEntries(form));
    if (!p.success) throw new AppError(p.error.issues[0]?.message ?? "Проверьте поля");
    if (p.data.lateHours > p.data.freeHours) throw new AppError("Порог поздней отмены должен быть меньше порога бесплатной");
    await savePenaltySettings(p.data);
  });
  done();
}
