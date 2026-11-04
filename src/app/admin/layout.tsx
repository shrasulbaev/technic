import { TopBar } from "@/components/top-bar";
import { LiveRefresh } from "@/components/live-refresh";
import { requireUser } from "@/server/me";
import { AdminNav } from "./nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Админка — Technic" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUser("admin");
  return (
    <>
      <TopBar links={[]} />
      <LiveRefresh everyMs={30_000} />
      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pb-16 pt-2">
        <AdminNav />
        {children}
      </main>
    </>
  );
}
