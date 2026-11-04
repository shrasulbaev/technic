import { TopBar } from "@/components/top-bar";
import { LiveRefresh } from "@/components/live-refresh";
import { requireUser } from "@/server/me";

export const dynamic = "force-dynamic";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  await requireUser("driver");
  return (
    <>
      <TopBar dark links={[{ href: "/d", label: "Заказы" }, { href: "/d/wallet", label: "Баланс" }, { href: "/d/profile", label: "Профиль" }]} />
      <LiveRefresh alertOn={["feed", "order"]} skip={["location"]} />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-16">{children}</main>
    </>
  );
}
