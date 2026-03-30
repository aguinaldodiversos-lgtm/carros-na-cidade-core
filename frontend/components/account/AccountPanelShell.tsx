"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type AccountPanelVariant = "pf" | "lojista";

type NavItem = {
  label: string;
  href: string;
  icon: "home" | "ads" | "user" | "key" | "msg" | "billing" | "users";
};

function NavIcon({ name }: { name: NavItem["icon"] }) {
  const cls = "h-[18px] w-[18px] shrink-0";
  switch (name) {
    case "home":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "ads":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M4 6h16v12H4V6Zm3 3h10M7 15h6" />
        </svg>
      );
    case "user":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 9a8 8 0 0 1 16 0" />
        </svg>
      );
    case "key":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M15.5 7.5a4 4 0 1 0 2.2 2.2L21 12l-2 2-2.5-2.5M10.5 13.5 7 17" />
        </svg>
      );
    case "msg":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M4 6h16v10H8l-4 4V6Z" />
        </svg>
      );
    case "billing":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M4 7h16v10H4V7Zm2 4h12M8 15h4" />
        </svg>
      );
    case "users":
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM8 13a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 6a5 5 0 0 0-10 0M3 19a6 6 0 0 1 11.3-2.2" />
        </svg>
      );
    default:
      return null;
  }
}

function buildNav(basePath: string, variant: AccountPanelVariant): NavItem[] {
  if (variant === "pf") {
    return [
      { label: "Painel", href: basePath, icon: "home" },
      { label: "Meus anúncios", href: `${basePath}/meus-anuncios`, icon: "ads" },
      { label: "Dados pessoais", href: `${basePath}/conta`, icon: "user" },
      { label: "Trocar senha", href: `${basePath}/senha`, icon: "key" },
    ];
  }
  return [
    { label: "Painel", href: basePath, icon: "home" },
    { label: "Meus anúncios", href: `${basePath}/meus-anuncios`, icon: "ads" },
    { label: "Mensagens", href: `${basePath}/mensagens`, icon: "msg" },
    { label: "Plano e cobranças", href: `${basePath}/plano`, icon: "billing" },
  ];
}

type AccountPanelShellProps = {
  basePath: "/dashboard" | "/dashboard-loja";
  variant: AccountPanelVariant;
  userName: string;
  accountLabel: string;
  children: React.ReactNode;
};

export default function AccountPanelShell({
  basePath,
  variant,
  userName,
  accountLabel,
  children,
}: AccountPanelShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = buildNav(basePath, variant);
  const initial = userName.trim().slice(0, 1).toUpperCase() || "U";

  const isActive = (href: string) => {
    if (href === basePath) return pathname === basePath;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f3f4f6]">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-0 lg:flex-row lg:gap-8">
        {/* Mobile top bar */}
        <div className="flex w-full flex-col border-b border-[#e5e7eb] bg-white lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[#dfe4ef] px-3 py-2 text-sm font-semibold text-[#1d2538]"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
            >
              Menu
            </button>
            <Link
              href="/anunciar/novo"
              className="inline-flex h-10 items-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white"
            >
              + Novo anúncio
            </Link>
          </div>
          {mobileOpen && (
            <nav className="border-t border-[#eef1f6] px-2 pb-3 pt-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                    isActive(item.href)
                      ? "bg-[#eef4ff] text-[#0e62d8]"
                      : "text-[#37425d] hover:bg-[#f8fafc]"
                  }`}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
          {/* Sidebar desktop */}
          <aside className="sticky top-0 hidden h-[calc(100vh-4rem)] w-[260px] shrink-0 flex-col border-r border-[#e8ecf4] bg-white px-4 py-8 lg:flex">
            <div className="mb-8 flex items-center gap-3 px-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1d2538] text-lg font-extrabold text-white">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate font-extrabold text-[#1d2538]">{userName}</p>
                <p className="text-xs font-semibold text-[#6b7280]">{accountLabel}</p>
              </div>
            </div>

            <nav className="flex flex-1 flex-col gap-1">
              {nav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? "border-l-[3px] border-[#0e62d8] bg-[#eef4ff] text-[#0e62d8]"
                        : "border-l-[3px] border-transparent text-[#37425d] hover:bg-[#f8fafc]"
                    }`}
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto pt-6">
              <Link
                href="/anunciar/novo"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110"
              >
                <span className="text-lg leading-none">+</span>
                Novo anúncio
              </Link>
              <Link
                href="/"
                className="mt-6 block px-1 text-xs font-bold text-[#6b7280] hover:text-[#0e62d8]"
              >
                ← Voltar ao site
              </Link>
            </div>
          </aside>

          <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-10">{children}</div>
        </div>
      </div>
    </div>
  );
}
