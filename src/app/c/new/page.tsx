import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { vehicleTypes } from "@/db/schema";
import { NewOrderForm } from "./form";

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const types = await db().select().from(vehicleTypes).where(eq(vehicleTypes.active, true)).orderBy(asc(vehicleTypes.sort));
  return <NewOrderForm initialKind={kind === "equipment" ? "equipment" : "cargo"} types={types} />;
}
