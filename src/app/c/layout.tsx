import { TopBar } from "@/components/top-bar";
import { LiveRefresh } from "@/components/live-refresh";
import { requireUser } from "@/server/me";

export const dynamic = "force-dynamic";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await requireUser("client");
  return (
    <>
      <TopBar links={[{ href: "/c", label: "Заказать" }, { href: "/c/orders", label: "Мои заказы" }]} />
      <LiveRefresh alertOn={["offer"]} skip={["location"]} />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-16 pt-2">{children}</main>
    </>
  );
}
