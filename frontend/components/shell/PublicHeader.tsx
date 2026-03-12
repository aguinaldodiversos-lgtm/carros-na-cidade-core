"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  { label: "Anunciar", href: "/planos" },
  { label: "Favoritos", href: "/login" },
];

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isHome = pathname === "/";

  const rightButtons = useMemo(
    () => [
      {
        label: "Entrar",
        href: "/login",
        className:
          "inline-flex h-12 items-center justify-center rounded-xl bg-[#0e62d8] px-6 text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.22)] transition hover:bg-[#0c4fb0]",
      },
    ],
    []
  );

  return (
    <header
      className={`z-50 ${
        isHome
          ? "bg-transparent pt-5 md:pt-7"
          : "sticky top-0 border-b border-[#e4e8f1] bg-white/96 shadow-[0_1px_0_rgba(255,255,255,0.55)] backdrop-blur supports-[backdrop-filter]:bg-white/88"
      }`}
    >
      <div
        className={`mx-auto w-full max-w-7xl px-4 sm:px-6 ${
          isHome
            ? "rounded-t-[26px] border border-[#e5e8ef] border-b-0 bg-white/95 shadow-[0_18px_40px_rgba(20,30,60,0.08)] backdrop-blur"
            : ""
        }`}
      >
        <div
          className={`flex items-center justify-between gap-4 ${
            isHome
              ? "h-[74px] border-b border-[#eef2f6] px-4 md:px-6"
              : "h-[76px]"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3 md:gap-6">
            <Link
              href="/"
              className={`relative block shrink-0 ${isHome ? "h-10 w-[150px] md:h-11 md:w-[176px]" : "h-10 w-[160px] md:h-11 md:w-[176px]"}`}
              aria-label="Carros na Cidade"
            >
              <Image
                src="/images/logo.png"
                alt="Carros na Cidade"
                fill
                priority
                sizes="176px"
                className="object-contain object-left"
              />
            </Link>

            <button
              type="button"
              className={`hidden items-center gap-2 rounded-xl px-3 py-2 font-bold text-[#263248] transition md:inline-flex ${
                isHome
                  ? "border border-transparent text-[15px] hover:border-[#e3e8f1] hover:bg-[#f7f9fc]"
                  : "border border-transparent text-[14px] hover:border-[#e3e8f1] hover:bg-[#f7f9fc]"
              }`}
            >
              São Paulo
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#0e62d8]" fill="currentColor">
                <path d="m5 7 5 6 5-6H5Z" />
              </svg>
            </button>
          </div>

          <div className={`hidden items-center md:flex ${isHome ? "gap-5" : "gap-5"}`}>
            <nav
              className={`flex items-center font-semibold text-[#5b667c] ${
                isHome ? "gap-7 text-[15px]" : "gap-6 text-[14px]"
              }`}
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 transition hover:text-[#0e62d8] ${
                    isActive(pathname, item.href) ? "text-[#0e62d8]" : ""
                  }`}
                >
                  {item.label === "Favoritos" ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
                    </svg>
                  ) : null}
                  {item.label}
                </Link>
              ))}
            </nav>

            {rightButtons.map((button) => (
              <Link
                key={button.href}
                href={button.href}
                className={
                  isHome
                    ? "inline-flex h-11 min-w-[136px] items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-[15px] font-bold text-white shadow-[0_10px_28px_rgba(14,98,216,0.2)] transition hover:bg-[#0c4fb0]"
                    : button.className
                }
              >
                {button.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#0e62d8] px-4 text-sm font-bold text-white"
            >
              Entrar
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((state) => !state)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#dfe4ef] text-[#34405a] md:hidden"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileOpen}
            >
              <MenuIcon open={mobileOpen} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#edf1f6] py-4 md:hidden">
            <div className="grid gap-2">
              <button
                type="button"
                className="inline-flex h-11 items-center justify-between rounded-xl border border-[#dfe4ef] bg-white px-4 text-sm font-semibold text-[#263248]"
              >
                São Paulo
                <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#0e62d8]" fill="currentColor">
                  <path d="m5 7 5 6 5-6H5Z" />
                </svg>
              </button>

              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#334155] transition hover:bg-[#f7f9fc]"
                >
                  {item.label}
                </Link>
              ))}

              {rightButtons.map((button) => (
                <Link
                  key={button.href}
                  href={button.href}
                  onClick={() => setMobileOpen(false)}
                  className={button.className}
                >
                  {button.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
