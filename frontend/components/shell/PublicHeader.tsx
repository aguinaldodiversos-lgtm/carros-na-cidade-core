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
    <header className="sticky top-0 z-50 border-b border-[#e4e8f1] bg-white/96 shadow-[0_1px_0_rgba(255,255,255,0.55)] backdrop-blur supports-[backdrop-filter]:bg-white/88">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex h-[76px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 md:gap-6">
            <Link
              href="/"
              className="relative block h-10 w-[160px] shrink-0 md:h-11 md:w-[176px]"
              aria-label="Carros na Cidade"
            >
              <Image src="/images/logo.png" alt="Carros na Cidade" fill priority className="object-contain object-left" />
            </Link>

            <button
              type="button"
              className="hidden items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-[14px] font-bold text-[#263248] transition hover:border-[#e3e8f1] hover:bg-[#f7f9fc] md:inline-flex"
            >
              São Paulo
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#0e62d8]" fill="currentColor">
                <path d="m5 7 5 6 5-6H5Z" />
              </svg>
            </button>
          </div>

          <div className="hidden items-center gap-5 md:flex">
            <nav className="flex items-center gap-6 text-[14px] font-semibold text-[#5b667c]">
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
              <Link key={button.href} href={button.href} className={button.className}>
                {button.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-sm font-bold text-white"
            >
              Entrar
            </Link>
            <button
            type="button"
            onClick={() => setMobileOpen((state) => !state)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#dfe4ef] text-[#34405a] md:hidden"
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
