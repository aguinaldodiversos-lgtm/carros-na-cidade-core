// frontend/components/shell/PublicHeader.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { CityHeaderSelector } from "@/components/city/CityHeaderSelector";
import { useCity } from "@/lib/city/CityContext";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
import { getTerritorialRoutesForCity, SITE_ROUTES } from "@/lib/site/site-navigation";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
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
      {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
    </svg>
  );
}

const linkNav =
  "inline-flex h-10 shrink-0 items-center rounded-lg px-2 text-[13px] font-medium text-[#4E5A73] transition hover:bg-[#F6F8FC] hover:text-[#0e62d8] lg:px-2.5 lg:text-[13px] xl:px-3 xl:text-[14px]";

export function PublicHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { city, openCityPicker } = useCity();
  const territory = getTerritorialRoutesForCity(city.slug);

  return (
    <header className="sticky top-0 z-50 border-b border-[#E6EAF2] bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[64px] items-center gap-3 md:h-[72px] md:gap-4">
          <div className="flex min-w-0 shrink-0 items-center gap-3 sm:gap-4 lg:gap-5">
            <Link
              href="/"
              aria-label="Carros na Cidade"
              className="inline-flex shrink-0 items-center"
            >
              <Image
                src={SITE_LOGO_SRC}
                alt="Carros na Cidade"
                width={220}
                height={48}
                priority
                className="h-[34px] w-auto max-w-[220px] object-contain object-left sm:h-[38px] md:h-[42px]"
              />
            </Link>

            <div className="hidden min-w-0 sm:block">
              <CityHeaderSelector />
            </div>
          </div>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex xl:gap-1"
            aria-label="Navegação principal"
          >
            <Link href={territory.comprar} className={linkNav}>
              Comprar
            </Link>
            <Link href={territory.financing} className={linkNav}>
              <span className="hidden lg:inline">Simulador de Financiamento</span>
              <span className="lg:hidden">Simulador</span>
            </Link>
            <Link href={territory.fipe} className={linkNav}>
              Fipe
            </Link>
            <Link href={territory.blog} className={linkNav}>
              Blog
            </Link>
            <Link href="/anunciar" className={linkNav}>
              Anunciar
            </Link>
            <Link href={SITE_ROUTES.favoritos} className={linkNav}>
              Favoritos
            </Link>
            <Link
              href={SITE_ROUTES.favoritos}
              aria-label="Favoritos"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#6B7488] transition hover:bg-[#F6F8FC] hover:text-[#e11d48]"
            >
              <HeartIcon />
            </Link>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
            <Link
              href={SITE_ROUTES.login}
              className="hidden h-10 items-center justify-center rounded-[10px] bg-[#0e62d8] px-5 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(14,98,216,0.22)] transition hover:bg-[#0c4fb0] lg:inline-flex"
            >
              Entrar
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => openCityPicker()}
              className="inline-flex max-w-[140px] truncate rounded-lg border border-[#DFE6F0] px-2 py-1.5 text-xs font-semibold text-[#2F3A52]"
            >
              {city.label}
            </button>
            <Link
              href={SITE_ROUTES.login}
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#0e62d8] px-4 text-sm font-bold text-white shadow-[0_6px_16px_rgba(14,98,216,0.2)]"
            >
              Entrar
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((s) => !s)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#DFE6F0] text-[#334155]"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileOpen}
            >
              <MenuIcon open={mobileOpen} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#EDF2F8] py-4 lg:hidden">
            <nav className="grid gap-2" aria-label="Menu">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  openCityPicker();
                }}
                className="inline-flex h-11 w-full items-center justify-between rounded-xl border border-[#DFE6F0] bg-white px-4 text-sm font-semibold text-[#2F3A52]"
              >
                Cidade: {city.label}
              </button>
              <Link
                href={territory.comprar}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#334155] hover:bg-[#F7F9FC]"
              >
                Comprar
              </Link>
              <Link
                href={territory.financing}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#334155] hover:bg-[#F7F9FC]"
              >
                Simulador de Financiamento
              </Link>
              <Link
                href={territory.fipe}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#334155] hover:bg-[#F7F9FC]"
              >
                Fipe
              </Link>
              <Link
                href={territory.blog}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#334155] hover:bg-[#F7F9FC]"
              >
                Blog
              </Link>
              <Link
                href="/anunciar"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#334155] hover:bg-[#F7F9FC]"
              >
                Anunciar
              </Link>
              <Link
                href={SITE_ROUTES.favoritos}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#334155] hover:bg-[#F7F9FC]"
              >
                <HeartIcon />
                Favoritos
              </Link>
              <Link
                href={SITE_ROUTES.comoFunciona}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold hover:bg-[#F7F9FC]",
                  pathname === "/como-funciona" ? "text-[#0e62d8]" : "text-[#334155]"
                )}
              >
                Como funciona
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
