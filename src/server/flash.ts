import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "./orders";

// Form actions without client state: a business error goes back to the same
// page as ?err=…, which <Flash> shows. Anything else is a real failure.
export async function failBack(e: unknown): Promise<never> {
  if (!(e instanceof AppError)) throw e;
  const h = await headers();
  const ref = h.get("referer");
  const url = new URL(ref ?? "/", "http://x");
  url.searchParams.set("err", e.message);
  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

export async function run(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AppError) await failBack(e);
    throw e;
  }
}
