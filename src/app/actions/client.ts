"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/me";
import { run } from "@/server/flash";
import { AppError, acceptOffer, clientCancel, createOrder, leaveReview, orderInput, raisePrice, rejectOffer } from "@/server/orders";

export type ActionState = { error?: string };

export async function createOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireUser("client");
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ""));
  const parsed = orderInput.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  let id: string;
  try {
    id = (await createOrder(me.id, parsed.data)).id;
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect(`/c/orders/${id}`);
}

const done = () => revalidatePath("/c", "layout");

export async function acceptOfferAction(form: FormData) {
  const me = await requireUser("client");
  await run(() => acceptOffer(me.id, String(form.get("offerId"))));
  done();
}

export async function rejectOfferAction(form: FormData) {
  const me = await requireUser("client");
  await run(() => rejectOffer(me.id, String(form.get("offerId"))));
  done();
}

export async function raisePriceAction(form: FormData) {
  const me = await requireUser("client");
  await run(() => raisePrice(me.id, String(form.get("orderId")), Number(form.get("price"))));
  done();
}

export async function cancelOrderAction(form: FormData) {
  const me = await requireUser("client");
  await run(() => clientCancel(me.id, String(form.get("orderId")), String(form.get("reason") ?? "") || null));
  done();
}

export async function reviewAction(form: FormData) {
  const me = await requireUser("client");
  await run(() => leaveReview(me.id, String(form.get("orderId")), Number(form.get("stars")), String(form.get("text") ?? "") || null));
  done();
}
