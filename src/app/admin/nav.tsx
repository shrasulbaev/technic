"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pill } from "@/lib/ui";

const NAV = [
  { href: "/admin", label: "Сводка" },
  { href: "/admin/drivers", label: "Водители" },
  { href: "/admin/orders", label: "Заказы" },
  { href: "/admin/clients", label: "Клиенты" },
  { href: "/admin/settings", label: "Тарифы и штрафы" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={pill(n.href === "/admin" ? path === "/admin" : path.startsWith(n.href))}>{n.label}</Link>
      ))}
    </nav>
  );
}
