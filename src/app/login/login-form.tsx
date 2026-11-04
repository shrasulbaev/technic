"use client";

import { useActionState } from "react";
import { checkCode, sendCode, type CodeState } from "@/app/actions/auth";
import { btnPrimary, input, label } from "@/lib/ui";
import { formatPhone } from "@/lib/rules";

export function LoginForm() {
  const [sent, send, sending] = useActionState<CodeState, FormData>(sendCode, { step: "phone" });
  const [checked, check, checking] = useActionState<CodeState, FormData>(checkCode, { step: "code" });

  if (sent.step === "phone") {
    return (
      <form action={send} className="flex flex-col gap-4">
        <label className={label}>
          Номер телефона
          <input name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="0555 123 456" className={`${input} text-lg`} />
        </label>
        {sent.error && <p role="alert" className="text-sm font-semibold text-danger">{sent.error}</p>}
        <button disabled={sending} className={btnPrimary}>Получить код</button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">Код отправлен на <strong className="text-text">{formatPhone(sent.phone!)}</strong></p>
      {sent.testCode && (
        <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm font-bold text-warn">
          Тестовый режим, SMS не отправляется. Ваш код: <span className="text-lg tracking-widest">{sent.testCode}</span>
        </p>
      )}
      <form action={check} className="flex flex-col gap-4">
        <input type="hidden" name="phone" value={sent.phone} />
        <label className={label}>
          Код из SMS
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} required autoFocus className={`${input} text-center text-2xl tracking-[0.5em]`} />
        </label>
        {checked.error && <p role="alert" className="text-sm font-semibold text-danger">{checked.error}</p>}
        <button disabled={checking} className={btnPrimary}>Войти</button>
      </form>
      <form action={send}>
        <input type="hidden" name="phone" value={sent.phone} />
        {sent.error && <p role="alert" className="mb-2 text-sm font-semibold text-danger">{sent.error}</p>}
        <button disabled={sending} className="text-sm font-bold text-muted underline">Отправить код ещё раз</button>
      </form>
    </div>
  );
}
