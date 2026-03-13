// frontend/components/shell/PublicHeader.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type NavItem = {
  label: string;
  href: string;
  icon?: "heart";
};

const NAV_ITEMS: NavItem[] = [
  { label: "Comprar", href: "/comprar" },
  { label: "Anunciar", href: "/planos" },
  { label: "Favoritos", href: "/favoritos", icon: "heart" },
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
      className="h-4 w-4 shrink-0 text-[#0e62d8]"
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

  const navItems = useMemo(() => NAV_ITEMS, []);

  return (
    <header className="sticky top-0 z-50 border-b border-[#e8edf5] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/88">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex h-[74px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 md:gap-7">
            <Link
              href="/"
              aria-label="Carros na Cidade"
              className="inline-flex shrink-0 items-center"
            >
              <Image
                src="/images/logo.png"
                alt="Carros na Cidade"
                width={170}
                height={42}
                priority
                className="h-auto w-[138px] object-contain md:w-[160px]"
              />
            </Link>

            <button
              type="button"
              className="hidden items-center gap-2 rounded-lg px-2 py-2 text-[14px] font-semibold text-[#2f3a52] transition hover:bg-[#f4f7fb] md:inline-flex"
              aria-label="Selecionar cidade"
            >
              <span>São Paulo</span>
              <ChevronDownIcon />
            </button>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const active = isActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[14px] font-medium transition",
                      active
                        ? "bg-[#eef4ff] text-[#0e62d8]"
                        : "text-[#4e5a73] hover:bg-[#f6f8fc] hover:text-[#0e62d8]"
                    )}
                  >
                    {item.icon === "heart" ? <HeartIcon /> : null}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(14,98,216,0.20)] transition hover:bg-[#0c4fb0]"
            >
              Entrar
            </Link>
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#dfe6f0] text-[#334155]"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileOpen}
            >
              <MenuIcon open={mobileOpen} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#edf2f8] py-4 md:hidden">
            <div className="grid gap-2">
              <button
                type="button"
                className="inline-flex h-11 items-center justify-between rounded-xl border border-[#dfe6f0] bg-white px-4 text-sm font-semibold text-[#2f3a52]"
              >
                <span>São Paulo</span>
                <ChevronDownIcon />
              </button>

              {navItems.map((item) => {
                const active = isActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
                      active
                        ? "bg-[#eef4ff] text-[#0e62d8]"
                        : "text-[#334155] hover:bg-[#f7f9fc]"
                    )}
                  >
                    {item.icon === "heart" ? <HeartIcon /> : null}
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="mt-1 inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-sm font-bold text-white"
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
