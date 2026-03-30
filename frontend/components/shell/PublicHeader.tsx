// frontend/components/shell/PublicHeader.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";

import { CityHeaderSelector } from "@/components/city/CityHeaderSelector";
import { useCity } from "@/lib/city/CityContext";
import { REGIONAL_BRAND_TAGLINE } from "@/lib/site/public-config";
import { buildHeaderNavSections, SITE_ROUTES, isNavLinkActive } from "@/lib/site/site-navigation";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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

function CityLinkChevronIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[#2F67F6]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7 4 6 6-6 6" />
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

const linkClassDesktop =
  "inline-flex h-10 items-center rounded-lg px-2.5 text-[14px] font-medium transition xl:px-3";
const linkClassMobile =
  "inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold transition";

export function PublicHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { city, openCityPicker } = useCity();
  const headerNavSections = useMemo(() => buildHeaderNavSections(city.slug), [city.slug]);
  const cityHubHref = `/cidade/${encodeURIComponent(city.slug)}`;

  return (
    <header className="sticky top-0 z-50 border-b border-[#E6EAF2] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/88">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex h-[78px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 md:gap-6">
            <Link
              href="/"
              aria-label="Carros na Cidade"
              title={REGIONAL_BRAND_TAGLINE}
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

            <CityHeaderSelector />

            <Link
              href={cityHubHref}
              className="hidden text-[13px] font-medium text-[#5c6888] underline-offset-2 hover:text-[#2F67F6] hover:underline md:inline-flex"
            >
              Hub da cidade
            </Link>

            <Link
              href={SITE_ROUTES.comoFunciona}
              className={cn(
                "hidden items-center rounded-lg px-2 py-2 text-[13px] font-medium text-[#5c6888] transition hover:bg-[#F4F7FB] hover:text-[#2F67F6] md:inline-flex",
                pathname === "/como-funciona" && "text-[#2F67F6]"
              )}
            >
              Como funciona
            </Link>

            <Link
              href={SITE_ROUTES.ajuda}
              className={cn(
                "hidden items-center rounded-lg px-2 py-2 text-[13px] font-medium text-[#5c6888] transition hover:bg-[#F4F7FB] hover:text-[#2F67F6] md:inline-flex",
                pathname === "/ajuda" && "text-[#2F67F6]"
              )}
            >
              Ajuda
            </Link>
          </div>

          <div className="hidden items-center gap-2 xl:flex">
            <nav className="flex items-center gap-1" aria-label="Navegação principal">
              {headerNavSections.map((section, sectionIndex) => (
                <Fragment key={section.id}>
                  {sectionIndex > 0 ? (
                    <span
                      className="mx-0.5 hidden h-5 w-px shrink-0 bg-[#E6EAF2] xl:block"
                      aria-hidden
                    />
                  ) : null}
                  <div role="group" aria-label={section.title} className="flex items-center gap-1">
                    {section.links.map((item) => {
                      const active = isNavLinkActive(pathname, searchParams, item.href);
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          className={cn(
                            linkClassDesktop,
                            active
                              ? "bg-[#EEF4FF] text-[#2F67F6]"
                              : "text-[#4E5A73] hover:bg-[#F6F8FC] hover:text-[#2F67F6]"
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </Fragment>
              ))}

              <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-[#E6EAF2] xl:block" aria-hidden />

              <Link
                href={SITE_ROUTES.favoritos}
                aria-label="Favoritos"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#6B7488] transition hover:bg-[#F6F8FC] hover:text-[#2F67F6]"
              >
                <HeartIcon />
              </Link>
            </nav>

            <Link
              href={SITE_ROUTES.login}
              className="inline-flex h-11 items-center justify-center rounded-[10px] bg-[#2F67F6] px-6 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(47,103,246,0.20)] transition hover:bg-[#2457DC]"
            >
              Entrar
            </Link>
          </div>

          <div className="flex items-center gap-2 xl:hidden">
            <Link
              href={SITE_ROUTES.login}
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
            <nav className="grid gap-3" aria-label="Menu principal">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  openCityPicker();
                }}
                className="inline-flex h-11 w-full items-center justify-between rounded-xl border border-[#DFE6F0] bg-white px-4 text-sm font-semibold text-[#2F3A52] transition hover:bg-[#F7F9FC]"
                aria-label={`Cidade: ${city.label}. Abrir seletor`}
              >
                <span className="truncate">{city.label}</span>
                <CityLinkChevronIcon />
              </button>

              <Link
                href={cityHubHref}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-[#2F67F6] hover:bg-[#EEF4FF]"
              >
                Ver hub da cidade
              </Link>

              <Link
                href={SITE_ROUTES.comoFunciona}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  linkClassMobile,
                  pathname === "/como-funciona"
                    ? "bg-[#EEF4FF] text-[#2F67F6]"
                    : "text-[#334155] hover:bg-[#F7F9FC]"
                )}
              >
                Como funciona
              </Link>

              <Link
                href={SITE_ROUTES.ajuda}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  linkClassMobile,
                  pathname === "/ajuda"
                    ? "bg-[#EEF4FF] text-[#2F67F6]"
                    : "text-[#334155] hover:bg-[#F7F9FC]"
                )}
              >
                Central de ajuda
              </Link>

              <Link
                href={SITE_ROUTES.seguranca}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  linkClassMobile,
                  pathname === "/seguranca"
                    ? "bg-[#EEF4FF] text-[#2F67F6]"
                    : "text-[#334155] hover:bg-[#F7F9FC]"
                )}
              >
                Segurança
              </Link>

              {headerNavSections.map((section) => (
                <div key={section.id} className="space-y-1">
                  <p className="px-4 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#9aa3b8]">
                    {section.title}
                  </p>
                  <div role="group" aria-label={section.title} className="grid gap-1">
                    {section.links.map((item) => {
                      const active = isNavLinkActive(pathname, searchParams, item.href);
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            linkClassMobile,
                            active
                              ? "bg-[#EEF4FF] text-[#2F67F6]"
                              : "text-[#334155] hover:bg-[#F7F9FC]"
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="space-y-1">
                <p className="px-4 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#9aa3b8]">
                  Atalhos
                </p>
                <Link
                  href={SITE_ROUTES.favoritos}
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#334155] transition hover:bg-[#F7F9FC]"
                >
                  <HeartIcon />
                  <span>Favoritos</span>
                </Link>
              </div>

              <Link
                href={SITE_ROUTES.login}
                onClick={() => setMobileOpen(false)}
                className="mt-1 inline-flex h-11 items-center justify-center rounded-xl bg-[#2F67F6] px-4 text-sm font-bold text-white"
              >
                Entrar
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
