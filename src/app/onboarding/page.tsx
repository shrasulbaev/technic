import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { vehicleTypes } from "@/db/schema";
import { getSession, homeFor } from "@/server/session";
import { OnboardingForm } from "./form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role) redirect(homeFor(s));
  const types = await db().select().from(vehicleTypes).where(eq(vehicleTypes.active, true)).orderBy(asc(vehicleTypes.sort));
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Кто вы?</h1>
      <OnboardingForm types={types.map((t) => ({ id: t.id, name: t.name, kind: t.kind }))} />
    </main>
  );
}
