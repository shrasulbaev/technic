import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { vehicleTypes } from "@/db/schema";
import { getPenaltySettings } from "@/server/settings";
import { savePenaltiesAction, saveTypeAction } from "@/app/actions/admin";
import { Flash } from "@/components/flash";
import { btnPrimary, btnSmall, input, label } from "@/lib/ui";

const PEN_FIELDS = [
  { name: "freeHours", label: "Бесплатная отмена, если до подачи больше, ч" },
  { name: "lateHours", label: "Отмена в день выезда: меньше чем за, ч" },
  { name: "fineFixed", label: "Штраф за отмену в день выезда / неявку (грузы), сом" },
  { name: "equipmentFinePct", label: "Штраф спецтехники, % от стоимости минималки" },
  { name: "strikesLimit", label: "Поздних отмен до блокировки" },
  { name: "strikesWindowDays", label: "За сколько дней считать отмены" },
  { name: "blockDays", label: "Блок на запланированные заказы, дней" },
  { name: "confirmHours", label: "Подтвердить выезд не позже чем за, ч" },
] as const;

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const [types, ps] = await Promise.all([db().select().from(vehicleTypes).orderBy(asc(vehicleTypes.sort)), getPenaltySettings()]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Тарифы и комиссии</h1>
      <Flash err={err} />
      <div className="grid gap-3 lg:grid-cols-2">
        {types.map((t) => (
          <form key={t.id} action={saveTypeAction} className="grid grid-cols-2 gap-3 rounded-2xl bg-surface p-4">
            <input type="hidden" name="id" value={t.id} />
            <label className={`${label} col-span-2`}>
              {t.kind === "cargo" ? "Грузоперевозка" : "Спецтехника"} · {t.unit === "hour" ? "почасовая" : "за рейс"}
              <input name="name" defaultValue={t.name} className={input} />
            </label>
            <label className={label}>{t.unit === "hour" ? "Ставка за час" : "Подача"}, сом<input name="basePrice" type="number" defaultValue={t.basePrice} className={input} /></label>
            {t.unit === "trip" ? (
              <label className={label}>За км, сом<input name="perKm" type="number" defaultValue={t.perKm} className={input} /></label>
            ) : (
              <label className={label}>Минималка, ч<input name="minHours" type="number" step="0.5" defaultValue={t.minHours ?? ""} className={input} /><input type="hidden" name="perKm" value={t.perKm} /></label>
            )}
            <label className={label}>Комиссия, %<input name="commissionPct" type="number" step="0.5" defaultValue={t.commissionPct} className={input} /></label>
            <label className="flex items-center gap-2 self-end pb-3 text-sm font-bold">
              <input name="active" type="checkbox" defaultChecked={t.active} className="h-5 w-5" /> Активен
            </label>
            <button className={`${btnSmall} col-span-2`}>Сохранить</button>
          </form>
        ))}
      </div>

      <h2 className="pt-4 text-2xl font-extrabold">Штрафы за отмену водителем</h2>
      <form action={savePenaltiesAction} className="grid gap-3 rounded-2xl bg-surface p-4 sm:grid-cols-2">
        {PEN_FIELDS.map((f) => (
          <label key={f.name} className={label}>
            {f.label}
            <input name={f.name} type="number" step="0.5" defaultValue={ps[f.name]} className={input} />
          </label>
        ))}
        <button className={`${btnPrimary} sm:col-span-2`}>Сохранить правила</button>
      </form>
    </>
  );
}
