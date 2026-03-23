"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Visão geral", icon: "📊" },
  { href: "/dashboard/anuncios", label: "Anúncios", icon: "📢" },
  { href: "/dashboard/leads", label: "Leads", icon: "💬" },
  { href: "/dashboard/favoritos", label: "Favoritos", icon: "❤️" },
  { href: "/dashboard/alertas", label: "Alertas", icon: "🔔" },
  { href: "/dashboard/pagamentos", label: "Pagamentos", icon: "💳" },
  { href: "/dashboard/assinatura", label: "Assinatura", icon: "⭐" },
  { href: "/dashboard/metricas", label: "Métricas", icon: "📈" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex overflow-x-auto gap-1 rounded-2xl border border-[#dfe4ef] bg-white p-2 shadow-sm no-scrollbar">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
              isActive
                ? "bg-[#0e62d8] text-white"
                : "text-[#5f6982] hover:bg-[#f0f3fa] hover:text-[#1d2538]"
            }`}
          >
            <span>{item.icon}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
