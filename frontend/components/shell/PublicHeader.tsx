"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  { label: "Comprar", href: "/anuncios" },
  { label: "Planos", href: "/planos" },
  { label: "Tabela FIPE", href: "/tabela-fipe" },
  { label: "Financiamento", href: "/simulador-financiamento" },
  { label: "Conteúdo", href: "/blog" },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const rightCtas = useMemo(
    () => [
      {
        label: "Entrar",
        href: "/login",
        className:
          "inline-flex h-11 items-center rounded-xl border border-[#dfe4ef] bg-white px-4 text-sm font-semibold text-[#2f3a54] transition hover:bg-[#f7f9fd]",
      },
      {
        label: "Sou lojista",
        href: "/dashboard-loja",
        className:
          "hidden h-11 items-center rounded-xl bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#0b1220] md:inline-flex",
      },
      {
        label: "Anunciar",
        href: "/planos",
        className:
          "inline-flex h-11 items-center rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.22)] transition hover:bg-[#0c4fb0]",
      },
    ],
    []
  );

  return (
    <header className="sticky top-0 z-50 border-b border-[#e4e8f1] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex h-[76px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/"
              className="relative block h-10 w-[170px] shrink-0 md:h-11 md:w-[190px]"
              aria-label="Carros na Cidade"
            >
              <Image
                src="/images/logo.png"
                alt="Carros na Cidade"
                fill
                priority
                className="object-contain object-left"
              />
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {navItems.map((item) => {
                const active = isNavActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold transition ${
                      active
                        ? "bg-[#edf4ff] text-[#0e62d8]"
                        : "text-[#334155] hover:bg-[#f7f9fc] hover:text-[#0e62d8]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {rightCtas.map((item) => (
              <Link key={item.href} href={item.href} className={item.className}>
                {item.label}
              </Link>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((state) => !state)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#dfe4ef] text-[#334155] md:hidden"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              {mobileOpen ? (
                <path d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" />
              )}
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#edf1f6] py-4 md:hidden">
            <div className="grid gap-2">
              {navItems.map((item) => {
                const active = isNavActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold transition ${
                      active
                        ? "bg-[#edf4ff] text-[#0e62d8]"
                        : "text-[#334155] hover:bg-[#f7f9fc]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <div className="mt-2 grid gap-2">
                {rightCtas.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={
                      item.className
                        .replace("hidden ", "")
                        .replace(" md:inline-flex", "")
                    }
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
