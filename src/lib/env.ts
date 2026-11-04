import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // Номера, которые при входе получают роль администратора: +996555000000,+996700000000
  ADMIN_PHONES: z.string().default(""),
  // stub: код не отправляется, а показывается на экране входа (для тестов).
  SMS_PROVIDER: z.enum(["stub"]).default("stub"),
  // 1: на экране входа есть быстрые кнопки демо-аккаунтов.
  DEMO_MODE: z.string().default("0"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Read lazily so `next build` works without a database configured.
export function env(): Env {
  // Render and similar hosts give the public URL in their own variable.
  cached ??= schema.parse({ ...process.env, APP_URL: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || undefined });
  return cached;
}

export function adminPhones(): string[] {
  return env()
    .ADMIN_PHONES.split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export const isDemo = () => env().DEMO_MODE === "1";
