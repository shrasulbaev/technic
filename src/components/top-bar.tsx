import Link from "next/link";
import { Logo } from "./logo";

export function TopBar({ links, dark = false }: { links: { href: string; label: string }[]; dark?: boolean }) {
  return (
    <header className={`sticky top-0 z-[1000] ${dark ? "bg-ink" : "bg-bg/95 backdrop-blur"}`}>
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" aria-label="На главную" className="shrink-0"><Logo dark={dark} compact={links.length > 2} /></Link>
        <nav className="flex min-w-0 items-center gap-0.5">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`flex h-10 items-center whitespace-nowrap rounded-xl px-2.5 text-sm font-bold ${dark ? "text-white hover:bg-ink-2" : "text-text hover:bg-surface"}`}>
              {l.label}
            </Link>
          ))}
          <a href="/logout" className={`flex h-10 items-center whitespace-nowrap rounded-xl px-2.5 text-sm font-semibold ${dark ? "text-ink-muted" : "text-muted"}`}>Выйти</a>
        </nav>
      </div>
    </header>
  );
}
