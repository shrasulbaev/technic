"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/me";
import { run } from "@/server/flash";
import { AppError, driverCancel, driverRespond, driverStep, leaveReview, withdrawOffer, type DriverStep } from "@/server/orders";
import { saveDriverSettings, setGoingHome, setOnline, topupStub, updateVehicle } from "@/server/drivers";

const done = () => revalidatePath("/d", "layout");

export async function toggleOnlineAction(form: FormData) {
  const me = await requireUser("driver");
  await setOnline(me.id, form.get("online") === "1");
  done();
}

export async function toggleHomeAction(form: FormData) {
  const me = await requireUser("driver");
  await run(() => setGoingHome(me.id, form.get("on") === "1"));
  done();
}

export async function respondAction(form: FormData) {
  const me = await requireUser("driver");
  const own = form.get("price");
  const price = own ? Number(own) : null;
  await run(async () => {
    if (price != null && (!Number.isInteger(price) || price < 100)) throw new AppError("Введите цену в сомах");
    await driverRespond(me.id, String(form.get("orderId")), price);
  });
  done();
}

export async function withdrawAction(form: FormData) {
  const me = await requireUser("driver");
  await withdrawOffer(me.id, String(form.get("orderId")));
  done();
}

export async function stepAction(form: FormData) {
  const me = await requireUser("driver");
  await run(() => driverStep(me.id, String(form.get("orderId")), String(form.get("step")) as DriverStep));
  done();
}

export async function driverCancelAction(form: FormData) {
  const me = await requireUser("driver");
  await run(() => driverCancel(me.id, String(form.get("orderId")), { reason: String(form.get("reason") ?? "") }));
  done();
}

export async function driverReviewAction(form: FormData) {
  const me = await requireUser("driver");
  await run(() => leaveReview(me.id, String(form.get("orderId")), Number(form.get("stars")), null));
  done();
}

export async function topupAction(form: FormData) {
  const me = await requireUser("driver");
  await run(() => topupStub(me.id, Number(form.get("amount")), String(form.get("provider") ?? "")));
  done();
}

const settings = z.object({
  homeAddress: z.string().trim().max(200).optional(),
  homeLat: z.coerce.number().optional(),
  homeLng: z.coerce.number().optional(),
  detourKm: z.coerce.number().min(0.5).max(30),
  radiusKm: z.coerce.number().min(1).max(100),
});

export async function saveSettingsAction(form: FormData) {
  const me = await requireUser("driver");
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ""));
  await run(async () => {
    const p = settings.safeParse(raw);
    if (!p.success) throw new AppError(p.error.issues[0]?.message ?? "Проверьте поля");
    const has = p.data.homeLat != null && p.data.homeLng != null;
    await saveDriverSettings(me.id, {
      homeAddress: has ? p.data.homeAddress || "Дом" : null,
      homeLat: has ? p.data.homeLat! : null,
      homeLng: has ? p.data.homeLng! : null,
      detourKm: p.data.detourKm,
      radiusKm: p.data.radiusKm,
    });
  });
  done();
}

export async function saveVehicleAction(form: FormData) {
  const me = await requireUser("driver");
  await run(async () => {
    const typeId = Number(form.get("typeId"));
    const plate = String(form.get("plate") ?? "").trim();
    if (!typeId || plate.length < 4) throw new AppError("Укажите тип и госномер");
    await updateVehicle(me.id, { typeId, plate, model: String(form.get("model") ?? "").trim() || null });
  });
  done();
}
