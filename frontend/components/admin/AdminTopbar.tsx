"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Dashboard", href: "/admin" },
  { label: "Moderação", href: "/admin/moderation" },
  { label: "Anúncios", href: "/admin/anuncios" },
  { label: "Anunciantes", href: "/admin/anunciantes" },
  { label: "Pagamentos", href: "/admin/pagamentos" },
  { label: "Métricas", href: "/admin/metricas" },
  { label: "Configurações", href: "/admin/configuracoes" },
] as const;

export function AdminTopbar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-[#1a56db] shadow-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-5">
        <Link href="/admin" className="flex items-center gap-2 shrink-0 mr-4">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="currentColor">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
          </svg>
          <span className="text-[15px] font-bold text-white tracking-tight">Carros na Cidade</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                isActive(href)
                  ? "bg-white/20 text-white"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-[13px] font-medium text-white/80">Admin</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
            A
          </div>
        </div>
      </div>
    </header>
  );
}
