// frontend/components/shell/PublicHeader.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = {
  label: string;
  href: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Comprar", href: "/comprar" },
  { label: "Tabela FIPE", href: "/tabela-fipe/sao-paulo-sp" },
  { label: "Financiamento", href: "/simulador-financiamento/sao-paulo-sp" },
  { label: "Blog", href: "/blog" },
  { label: "Anunciar", href: "/planos" },
  { label: "Favoritos", href: "/favoritos" },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function HeartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[#2F67F6]"
      fill="currentColor"
    >
      <path d="m5 7 5 6 5-6H5Z" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {open ? (
        <path d="M6 6l12 12M18 6 6 18" />
      ) : (
        <path d="M3 6h18M3 12h18M3 18h18" />
      )}
    </svg>
  );
}

export function PublicHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#E6EAF2] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/88">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex h-[78px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 md:gap-7">
            <Link
              href="/"
              aria-label="Carros na Cidade"
              className="inline-flex shrink-0 items-center"
            >
              <Image
                src="/images/logo.png"
                alt="Carros na Cidade"
                width={176}
                height={44}
                priority
                className="h-auto w-[144px] object-contain md:w-[172px]"
              />
            </Link>

            <button
              type="button"
              className="hidden items-center gap-2 rounded-lg px-2 py-2 text-[14px] font-semibold text-[#2F3A52] transition hover:bg-[#F4F7FB] md:inline-flex"
              aria-label="Selecionar cidade"
            >
              <span>São Paulo</span>
              <ChevronDownIcon />
            </button>
          </div>

          <div className="hidden items-center gap-3 xl:flex">
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex h-10 items-center rounded-lg px-3 text-[14px] font-medium transition",
                      active
                        ? "bg-[#EEF4FF] text-[#2F67F6]"
                        : "text-[#4E5A73] hover:bg-[#F6F8FC] hover:text-[#2F67F6]"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <Link
                href="/favoritos"
                aria-label="Favoritos"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#6B7488] transition hover:bg-[#F6F8FC] hover:text-[#2F67F6]"
              >
                <HeartIcon />
              </Link>
            </nav>

            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[#2F67F6] px-6 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(47,103,246,0.20)] transition hover:bg-[#2457DC]"
            >
              Entrar
            </Link>
          </div>

          <div className="flex items-center gap-2 xl:hidden">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#2F67F6] px-4 text-sm font-bold text-white"
            >
              Entrar
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen((state) => !state)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#DFE6F0] text-[#334155]"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileOpen}
            >
              <MenuIcon open={mobileOpen} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#EDF2F8] py-4 xl:hidden">
            <div className="grid gap-2">
              <button
                type="button"
                className="inline-flex h-11 items-center justify-between rounded-xl border border-[#DFE6F0] bg-white px-4 text-sm font-semibold text-[#2F3A52]"
              >
                <span>São Paulo</span>
                <ChevronDownIcon />
              </button>

              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold transition",
                      active
                        ? "bg-[#EEF4FF] text-[#2F67F6]"
                        : "text-[#334155] hover:bg-[#F7F9FC]"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <Link
                href="/favoritos"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#334155] transition hover:bg-[#F7F9FC]"
              >
                <HeartIcon />
                <span>Favoritos</span>
              </Link>

              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="mt-1 inline-flex h-11 items-center justify-center rounded-xl bg-[#2F67F6] px-4 text-sm font-bold text-white"
              >
                Entrar
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
