import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/server/session";
import { isDemo } from "@/lib/env";
import { demoLogin } from "@/app/actions/auth";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

const DEMO = [
  { phone: "+996555000101", label: "Клиент (Айгерим)" },
  { phone: "+996555000201", label: "Водитель Портера (Азамат)" },
  { phone: "+996555000301", label: "Экскаватор (Бакыт)" },
  { phone: "+996555000001", label: "Администратор" },
];

export default async function LoginPage() {
  const s = await getSession();
  if (s) redirect(homeFor(s));
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-10">
      <div className="flex flex-col gap-3">
        <Logo />
        <h1 className="text-3xl font-extrabold tracking-tight">Вход по номеру телефона</h1>
        <p className="text-muted">Пришлём код в SMS. Новый номер — новый аккаунт.</p>
      </div>
      <LoginForm />
      {isDemo() && (
        <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-line bg-surface p-4">
          <h2 className="text-sm font-extrabold">Тестовый режим: войти без SMS</h2>
          <div className="grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <form key={d.phone} action={demoLogin}>
                <input type="hidden" name="phone" value={d.phone} />
                <button className="h-14 w-full rounded-xl border border-line bg-bg px-3 text-left text-sm font-bold leading-tight">{d.label}</button>
              </form>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
