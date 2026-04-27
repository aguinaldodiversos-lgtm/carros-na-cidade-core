// frontend/components/shell/PublicHeader.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { CityHeaderSelector } from "@/components/city/CityHeaderSelector";
import { useCity } from "@/lib/city/CityContext";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
import {
  getTerritorialRoutesForCity,
  isNavLinkActive,
  SITE_ROUTES,
} from "@/lib/site/site-navigation";
import type { AccountType } from "@/lib/dashboard-types";

function dashboardHrefForAccountType(type: AccountType) {
  if (type === "CNPJ") return "/dashboard-loja";
  return "/dashboard";
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

function UserAvatarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" />
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

function HeaderNavLink({
  href,
  children,
  className = "",
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();

  const active = isNavLinkActive(pathname, searchParams, href);

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`inline-flex h-10 max-w-full items-center rounded-lg px-2.5 text-[13px] font-semibold transition xl:px-3 xl:text-[14px] ${
        active
          ? "bg-slate-100/90 text-blue-800 shadow-sm"
          : "text-slate-600 hover:bg-slate-50 hover:text-blue-700"
      } ${className}`}
    >
      {children}
    </Link>
  );
}

export function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { city, openCityPicker } = useCity();
  const [sessionUser, setSessionUser] = useState<
    { name: string; type: AccountType } | null | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ user: { name: string; type: AccountType } }>;
      })
      .then((data) => {
        if (cancelled) return;
        setSessionUser(data?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setSessionUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const routes = useMemo(() => getTerritorialRoutesForCity(city.slug), [city.slug]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[64px] items-center gap-2 md:h-[68px] md:gap-3">
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-4">
            <Link
              href="/"
              aria-label="Carros na Cidade"
              className="inline-flex shrink-0 flex-col items-start leading-tight"
            >
              <Image
                src={SITE_LOGO_SRC}
                alt="Carros na Cidade"
                width={220}
                height={52}
                priority
                className="h-[28px] w-auto max-w-[180px] object-contain object-left sm:h-[34px]"
              />
              <span className="mt-0.5 hidden text-[10px] font-medium leading-tight text-cnc-muted sm:inline md:text-[11px]">
                Ofertas locais e confiança perto de você
              </span>
            </Link>

            <div className="hidden min-w-0 md:block">
              <CityHeaderSelector />
            </div>
          </div>

          <nav
            className="ml-2 hidden min-w-0 flex-1 items-center justify-center gap-0.5 md:ml-4 md:flex lg:gap-1"
            aria-label="Navegação principal"
          >
            <HeaderNavLink href={routes.comprar}>Comprar</HeaderNavLink>
            <HeaderNavLink href={routes.financing}>
              <span className="hidden md:inline">Simulador de Financiamento</span>
              <span className="md:hidden">Simulador</span>
            </HeaderNavLink>
            <HeaderNavLink href={routes.fipe}>FIPE</HeaderNavLink>
            <HeaderNavLink href={routes.blog}>Blog</HeaderNavLink>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 md:gap-1">
            <nav
              className="hidden items-center gap-0.5 md:flex lg:gap-1"
              aria-label="Ações da conta"
            >
              <Link
                href="/anunciar"
                className="inline-flex h-10 items-center rounded-lg px-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-700 xl:px-3 xl:text-[14px]"
              >
                Anunciar
              </Link>
              <Link href={SITE_ROUTES.favoritos} className="hidden sm:inline-flex">
                <span className="inline-flex h-10 items-center rounded-lg px-2.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-blue-700 xl:px-3 xl:text-[14px]">
                  Favoritos
                </span>
              </Link>
              <Link
                href={SITE_ROUTES.favoritos}
                aria-label="Favoritos"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-50 hover:text-rose-600"
              >
                <HeartIcon />
              </Link>
              {sessionUser ? (
                <Link
                  href={dashboardHrefForAccountType(sessionUser.type)}
                  className="ml-1 inline-flex h-10 max-w-[160px] items-center justify-center truncate rounded-lg bg-blue-700 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-800 xl:max-w-[200px] xl:px-5 xl:text-[14px]"
                >
                  Minha conta
                </Link>
              ) : (
                <Link
                  href={SITE_ROUTES.login}
                  className="ml-1 inline-flex h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-800 xl:px-5 xl:text-[14px]"
                >
                  Entrar
                </Link>
              )}
            </nav>

            <div className="flex items-center gap-1.5 md:hidden">
              <button
                type="button"
                onClick={() => openCityPicker()}
                aria-label={`Cidade selecionada: ${city.label}. Tocar para trocar.`}
                className="inline-flex max-w-[140px] items-center gap-1 truncate rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path
                    d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13Z"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                <span className="truncate">{city.label}</span>
              </button>
              <Link
                href={
                  sessionUser ? dashboardHrefForAccountType(sessionUser.type) : SITE_ROUTES.login
                }
                aria-label={sessionUser ? "Minha conta" : "Entrar"}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-primary hover:text-primary"
              >
                <UserAvatarIcon />
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen((s) => !s)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-primary hover:text-primary"
                aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
                aria-expanded={mobileOpen}
              >
                <MenuIcon open={mobileOpen} />
              </button>
            </div>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-slate-100 py-4 md:hidden">
            <nav className="grid gap-1" aria-label="Menu">
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
              <HeaderNavLink
                href={routes.comprar}
                onClick={() => setMobileOpen(false)}
                className="w-full justify-start px-4"
              >
                Comprar
              </HeaderNavLink>
              <HeaderNavLink
                href={routes.financing}
                onClick={() => setMobileOpen(false)}
                className="w-full justify-start px-4"
              >
                Simulador de Financiamento
              </HeaderNavLink>
              <HeaderNavLink
                href={routes.fipe}
                onClick={() => setMobileOpen(false)}
                className="w-full justify-start px-4"
              >
                FIPE
              </HeaderNavLink>
              <HeaderNavLink
                href={routes.blog}
                onClick={() => setMobileOpen(false)}
                className="w-full justify-start px-4"
              >
                Blog
              </HeaderNavLink>
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
        ) : null}
      </div>
    </header>
  );
}
