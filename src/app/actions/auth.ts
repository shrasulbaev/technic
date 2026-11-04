"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, clearSession, homeFor, setSession } from "@/server/session";
import { allowAttempt, completeOnboarding, requestCode, signIn, verifyCode } from "@/server/auth";
import { isDemo } from "@/lib/env";
import { normalizePhone } from "@/lib/rules";

export type CodeState = { step: "phone" | "code"; phone?: string; testCode?: string; error?: string };

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function sendCode(prev: CodeState, form: FormData): Promise<CodeState> {
  if (!allowAttempt(`sms:${await clientIp()}`, 5)) return { ...prev, error: "Слишком много попыток. Подождите минуту." };
  const res = await requestCode(String(form.get("phone") ?? ""));
  if (!res.ok) return { step: prev.phone ? "code" : "phone", phone: prev.phone, testCode: prev.testCode, error: res.error };
  return { step: "code", phone: res.phone, testCode: res.testCode };
}

export async function checkCode(prev: CodeState, form: FormData): Promise<CodeState> {
  const phone = String(form.get("phone") ?? "");
  if (!allowAttempt(`code:${await clientIp()}`, 10)) return { ...prev, error: "Слишком много попыток. Подождите минуту." };
  const res = await verifyCode(phone, String(form.get("code") ?? ""));
  if ("error" in res) return { ...prev, error: res.error };
  await setSession(res);
  redirect(homeFor(res));
}

// Demo mode only: one tap into a seeded account.
export async function demoLogin(form: FormData) {
  if (!isDemo()) redirect("/login");
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  if (!phone) redirect("/login");
  const res = await signIn(phone);
  if ("error" in res) redirect("/login");
  await setSession(res);
  redirect(homeFor(res));
}

const onboarding = z.discriminatedUnion("role", [
  z.object({ role: z.literal("client"), name: z.string().trim().min(2, "Введите имя").max(60) }),
  z.object({
    role: z.literal("driver"),
    name: z.string().trim().min(2, "Введите имя").max(60),
    typeId: z.coerce.number().int().positive("Выберите тип машины"),
    plate: z.string().trim().min(4, "Введите госномер").max(20),
    model: z.string().trim().max(60).default(""),
  }),
]);

export async function finishOnboarding(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role) redirect(homeFor(s));
  const parsed = onboarding.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const next = await completeOnboarding(s.userId, parsed.data);
  await setSession(next);
  redirect(homeFor(next));
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
