// frontend/components/shell/PublicHeader.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { CityHeaderSelector } from "@/components/city/CityHeaderSelector";
import { useCity } from "@/lib/city/CityContext";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
import { SITE_ROUTES } from "@/lib/site/site-navigation";

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
  "inline-flex h-10 shrink-0 items-center rounded-lg px-3 text-[14px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-blue-700";

export function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { city, openCityPicker } = useCity();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[64px] items-center gap-3 md:h-[68px] md:gap-4">
          <div className="flex min-w-0 shrink-0 items-center gap-3 sm:gap-4">
            <Link href="/" aria-label="Carros na Cidade" className="inline-flex shrink-0 items-center">
              <Image
                src={SITE_LOGO_SRC}
                alt="Carros na Cidade"
                width={220}
                height={52}
                priority
                className="h-[36px] w-auto max-w-[220px] object-contain object-left sm:h-[40px]"
              />
            </Link>

            <div className="hidden min-w-0 sm:block">
              <CityHeaderSelector />
            </div>
          </div>

          <nav
            className="ml-auto hidden items-center gap-0.5 md:flex lg:gap-1"
            aria-label="Navegação principal"
          >
            <Link href="/anunciar" className={linkNav}>
              Anunciar
            </Link>
            <Link href={SITE_ROUTES.favoritos} className={linkNav}>
              Favoritos
            </Link>
            <Link
              href={SITE_ROUTES.favoritos}
              aria-label="Favoritos"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-50 hover:text-rose-600"
            >
              <HeartIcon />
            </Link>
            <Link
              href={SITE_ROUTES.login}
              className="ml-1 inline-flex h-10 items-center justify-center rounded-lg bg-blue-700 px-5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              Entrar
            </Link>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => openCityPicker()}
              className="inline-flex max-w-[140px] truncate rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700"
            >
              {city.label}
            </button>
            <Link
              href={SITE_ROUTES.login}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white"
            >
              Entrar
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((s) => !s)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileOpen}
            >
              <MenuIcon open={mobileOpen} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-slate-100 py-4 md:hidden">
            <nav className="grid gap-2" aria-label="Menu">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  openCityPicker();
                }}
                className="inline-flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800"
              >
                Cidade: {city.label}
              </button>
              <Link
                href="/anunciar"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Anunciar
              </Link>
              <Link
                href={SITE_ROUTES.favoritos}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <HeartIcon />
                Favoritos
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
