"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CityHeaderSelector } from "@/components/city/CityHeaderSelector";
import { useCity } from "@/lib/city/CityContext";
import type { AccountType } from "@/lib/dashboard-types";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";

function dashboardHrefForAccountType(type: AccountType) {
  if (type === "CNPJ") return "/dashboard-loja";
  return "/dashboard";
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="m5 7 5 6 5-6" />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden
    >
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
      <path d="M5 20.5c1.2-3.3 4.2-5 7-5s5.8 1.7 7 5" />
    </svg>
  );
}

/**
 * Topo “app” exclusivo da rota /simulador-financiamento — alinhado ao mock mobile (logo, cidade, perfil).
 */
export function FinancingSimulatorAppHeader() {
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

  const cityPillLabel =
    city.name && city.state ? `${city.name} (${city.state})` : city.label;

  const profileHref =
    sessionUser === undefined
      ? "/login"
      : sessionUser
        ? dashboardHrefForAccountType(sessionUser.type)
        : "/login";

  return (
    <header className="sticky top-0 z-50 border-b border-[#e8ecf4] bg-white/98 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-md">
      {/* Barra de status decorativa (somente visual) */}
      <div
        className="flex items-center justify-between px-5 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-[#8b95ad] md:hidden"
        aria-hidden
      >
        <span>09:41</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-2.5 w-4 rounded-sm border border-[#c5cbd8]" />
          <span className="inline-flex h-2.5 w-4 rounded-sm border border-[#c5cbd8]" />
          <span className="inline-flex h-[11px] w-6 rounded-[3px] border border-[#c5cbd8] bg-[#eef1f7]" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-start justify-between gap-3 px-4 pb-4 pt-1 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Link href="/" aria-label="Carros na Cidade" className="inline-flex shrink-0 flex-col gap-0.5">
            <Image
              src={SITE_LOGO_SRC}
              alt="Carros na Cidade"
              width={220}
              height={52}
              priority
              className="h-[32px] w-auto max-w-[200px] object-contain object-left sm:h-[36px]"
            />
            <p className="max-w-[220px] pl-0.5 text-[11px] font-medium leading-tight tracking-tight text-[#7e8aa3] sm:text-[12px]">
              Ofertas locais e confiança perto de você
            </p>
          </Link>

          {/* Desktop / tablet — seletor rico igual ao portal */}
          <div className="hidden min-w-0 sm:mt-2 md:block lg:mt-3">
            <CityHeaderSelector />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => openCityPicker()}
            className="inline-flex max-w-[200px] items-center gap-1.5 truncate rounded-full border border-[#d8e2f5] bg-[#f8fbff] px-3.5 py-2 text-[12px] font-bold text-[#1a2b4c] shadow-[0_2px_8px_rgba(14,98,216,0.07)] transition hover:border-[#c5d6f2] sm:text-[13px] md:hidden"
            aria-label={`Cidade: ${city.label}. Abrir seletor de cidade`}
          >
            <PinIcon className="h-4 w-4 shrink-0 text-[var(--cnc-primary)]" />
            <span className="truncate">{cityPillLabel}</span>
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-[#6b7894]" />
          </button>

          <Link
            href={profileHref}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e4eaf5] bg-white text-[#35507a] shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition hover:border-[#cfe0ff] hover:text-[var(--cnc-primary)]"
            aria-label={sessionUser ? "Minha conta" : "Entrar"}
          >
            <ProfileIcon className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
