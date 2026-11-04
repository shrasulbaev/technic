import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { vehicleTypes } from "@/db/schema";
import { requireUser } from "@/server/me";
import { driverCtx } from "@/server/orders";
import { saveSettingsAction, saveVehicleAction } from "@/app/actions/driver";
import { Flash } from "@/components/flash";
import { formatPhone } from "@/lib/rules";
import { rating } from "@/lib/format";
import { btnPrimary, btnSecondary, input, label } from "@/lib/ui";
import { HomePicker } from "./home-picker";

const VERIFY = { pending: "На проверке", approved: "Проверен", rejected: "Отклонён" } as const;

export default async function DriverProfile({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await requireUser("driver");
  const { err } = await searchParams;
  const c = await driverCtx(me.id);
  const types = await db().select().from(vehicleTypes).where(eq(vehicleTypes.active, true)).orderBy(asc(vehicleTypes.sort));
  const d = c.driver;
  return (
    <>
      <h1 className="pt-4 text-2xl font-extrabold">Профиль</h1>
      <Flash err={err} />
      <section className="flex flex-col gap-1 rounded-2xl bg-surface p-4">
        <span className="text-lg font-extrabold">{me.name}</span>
        <span className="text-sm text-muted">{formatPhone(me.phone)} · ★ {rating(me.ratingSum, me.ratingCount)}</span>
        <span className={`mt-2 self-start rounded-full px-3 py-1 text-xs font-bold ${d.verification === "approved" ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}>{VERIFY[d.verification]}</span>
      </section>

      <form action={saveVehicleAction} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <h2 className="font-extrabold">Машина</h2>
        <label className={label}>
          Тип
          <select name="typeId" defaultValue={c.vehicle?.typeId ?? ""} className={input}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.kind === "cargo" ? "Груз" : "Техника"} · {t.name}</option>)}
          </select>
        </label>
        <label className={label}>Госномер<input name="plate" defaultValue={c.vehicle?.plate ?? ""} className={input} /></label>
        <label className={label}>Марка и модель<input name="model" defaultValue={c.vehicle?.model ?? ""} className={input} /></label>
        <p className="text-xs text-muted">Смена типа или номера отправит профиль на повторную проверку.</p>
        <button className={btnSecondary}>Сохранить машину</button>
      </form>

      <form action={saveSettingsAction} className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
        <h2 className="font-extrabold">Заказы</h2>
        <label className={label}>
          Радиус заказов «Рядом», км
          <input name="radiusKm" type="number" min={1} max={100} step={1} defaultValue={d.radiusKm} className={input} />
        </label>
        <HomePicker initial={d.homeLat != null && d.homeLng != null ? { address: d.homeAddress ?? "Дом", lat: d.homeLat, lng: d.homeLng } : null} />
        <label className={label}>
          Допустимый крюк по пути домой, км
          <input name="detourKm" type="number" min={0.5} max={30} step={0.5} defaultValue={d.detourKm} className={input} />
        </label>
        <button className={btnPrimary}>Сохранить</button>
      </form>
    </>
  );
}
