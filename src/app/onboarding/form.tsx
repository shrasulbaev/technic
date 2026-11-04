"use client";

import { useActionState, useState } from "react";
import { finishOnboarding } from "@/app/actions/auth";
import { btnPrimary, input, label } from "@/lib/ui";

type T = { id: number; name: string; kind: "cargo" | "equipment" };

export function OnboardingForm({ types }: { types: T[] }) {
  const [role, setRole] = useState<"client" | "driver">("client");
  const [state, action, pending] = useActionState(finishOnboarding, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        {([
          ["client", "Мне нужна машина", "Заказать перевозку или технику"],
          ["driver", "Я перевозчик", "Грузовик или спецтехника"],
        ] as const).map(([v, t, d]) => (
          <label key={v} className={`flex cursor-pointer flex-col gap-1 rounded-2xl p-4 ${role === v ? "bg-ink text-white" : "border border-line bg-surface"}`}>
            <input type="radio" name="role" value={v} checked={role === v} onChange={() => setRole(v)} className="sr-only" />
            <span className="text-base font-extrabold">{t}</span>
            <span className={`text-sm ${role === v ? "text-ink-muted" : "text-muted"}`}>{d}</span>
          </label>
        ))}
      </div>
      <label className={label}>
        Как вас зовут
        <input name="name" required minLength={2} className={input} />
      </label>
      {role === "driver" && (
        <>
          <label className={label}>
            Машина или техника
            <select name="typeId" required className={input} defaultValue="">
              <option value="" disabled>Выберите</option>
              <optgroup label="Грузоперевозки">
                {types.filter((t) => t.kind === "cargo").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
              <optgroup label="Спецтехника">
                {types.filter((t) => t.kind === "equipment").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            </select>
          </label>
          <label className={label}>
            Госномер
            <input name="plate" required placeholder="01 KG 123 ABC" className={input} />
          </label>
          <label className={label}>
            Марка и модель
            <input name="model" placeholder="Hyundai Porter" className={input} />
          </label>
          <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-semibold text-warn">
            После регистрации администратор проверит данные. Фото документов добавим в следующей версии.
          </p>
        </>
      )}
      {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
      <button disabled={pending} className={btnPrimary}>Продолжить</button>
    </form>
  );
}
