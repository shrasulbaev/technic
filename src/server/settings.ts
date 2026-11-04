import { eq } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { DEFAULT_PENALTIES, type PenaltySettings } from "@/lib/rules";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function getPenaltySettings(tx: Db | Tx = db()): Promise<PenaltySettings> {
  const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, "penalties"));
  if (!row) return DEFAULT_PENALTIES;
  try {
    return { ...DEFAULT_PENALTIES, ...(JSON.parse(row.value) as Partial<PenaltySettings>) };
  } catch {
    return DEFAULT_PENALTIES;
  }
}

export async function savePenaltySettings(s: PenaltySettings) {
  const value = JSON.stringify(s);
  await db()
    .insert(appSettings)
    .values({ key: "penalties", value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}
