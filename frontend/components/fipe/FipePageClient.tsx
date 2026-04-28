// frontend/components/fipe/FipePageClient.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdCard from "@/components/ads/AdCard";
import { FipeCombobox } from "@/components/fipe/FipeCombobox";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import {
  fetchFipeQuote,
  listFipeBrands,
  listFipeModels,
  listFipeYears,
} from "@/lib/fipe/fipe-client";
import type { FipeOption, FipeQuote, FipeVehicleType } from "@/lib/fipe/fipe-provider";

/**
 * Página de consulta da Tabela FIPE — mobile-first, contrato visual
 * oficial em `frontend/public/images/fipe.png`.
 *
 * Estrutura:
 *   1. Page header — h1 "Consultar Tabela FIPE" + sub
 *   2. Card de formulário (single column mobile / desktop):
 *        Marca (FipeCombobox)
 *        Modelo (FipeCombobox)
 *        Ano (FipeCombobox)
 *        Botão azul "Consultar valor FIPE" + arrow
 *   3. Card de resultado (horizontal: imagem do veículo + info):
 *        Imagem ilustrativa
 *        Brand Model Year + versão + pílula de specs
 *        "Valor FIPE:"
 *        R$ XXX (em primary)
 *        Referência (mês/ano)
 *   4. Seção "Ofertas próximas do modelo" + "Ver todas →" + 3 AdCards
 *   5. Promo card "Ver carros abaixo da FIPE em [cidade]"
 *   6. SiteBottomNav (fora do <main>)
 *
 * Removido vs versão anterior (anti-duplicação + simplificação):
 *   - Hero com h1 enorme + imagem dolphin/gla
 *   - 2-col layout desktop (form/result lado a lado)
 *   - Aside "Anuncie seu carro grátis!" (CTA já existe no header e FAB)
 *   - Seção "Destaques em [cidade]" (ofertas próximas do modelo cobre)
 *   - Seção duplicada "Ofertas de carros usados em [cidade]"
 *
 * Mantido:
 *   - Toda a lógica de fetch/estado (brands, models, years, quote, error)
 *   - Props da page.tsx (highlightAds e opportunityAds usados pra
 *     "Ofertas próximas do modelo"; cityName para promo bottom)
 */

type VehicleItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  version?: string;
  year?: number | string;
  yearLabel?: string;
  mileage?: number | string;
  city?: string;
  state?: string;
  price?: number | string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  image_url?: string | null;
  images?: string[] | null;
};

interface FipePageClientProps {
  citySlug: string;
  cityName: string;
  highlightAds: VehicleItem[];
  opportunityAds: VehicleItem[];
}

const FIPE_PLACEHOLDER_IMAGE = "/images/vehicle-placeholder.svg";

function ArrowRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M12 11v5" />
    </svg>
  );
}

function PriceTagPromoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12V4h8l10 10-8 8L3 12Z" />
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  );
}

export function FipePageClient({
  citySlug,
  cityName,
  highlightAds,
  opportunityAds,
}: FipePageClientProps) {
  const vehicleType: FipeVehicleType = "carros";

  const [brands, setBrands] = useState<FipeOption[]>([]);
  const [models, setModels] = useState<FipeOption[]>([]);
  const [years, setYears] = useState<FipeOption[]>([]);

  const [selectedBrand, setSelectedBrand] = useState<FipeOption | null>(null);
  const [selectedModel, setSelectedModel] = useState<FipeOption | null>(null);
  const [selectedYear, setSelectedYear] = useState<FipeOption | null>(null);

  const [brandsLoading, setBrandsLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [yearsLoading, setYearsLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const [quote, setQuote] = useState<FipeQuote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compatibleAds = useMemo(() => {
    const list = highlightAds?.length ? highlightAds : opportunityAds;
    return (list || []).slice(0, 3);
  }, [highlightAds, opportunityAds]);

  useEffect(() => {
    let mounted = true;

    async function loadBrands() {
      try {
        setBrandsLoading(true);
        setError(null);
        const data = await listFipeBrands(vehicleType);
        if (!mounted) return;
        setBrands(data);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar montadoras");
      } finally {
        if (mounted) setBrandsLoading(false);
      }
    }

    loadBrands();

    return () => {
      mounted = false;
    };
  }, [vehicleType]);

  async function handleBrandChange(option: FipeOption | null) {
    setSelectedBrand(option);
    setSelectedModel(null);
    setSelectedYear(null);
    setModels([]);
    setYears([]);
    setQuote(null);

    if (!option) return;

    try {
      setModelsLoading(true);
      setError(null);
      const data = await listFipeModels(vehicleType, option.code);
      setModels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar modelos");
    } finally {
      setModelsLoading(false);
    }
  }

  async function handleModelChange(option: FipeOption | null) {
    setSelectedModel(option);
    setSelectedYear(null);
    setYears([]);
    setQuote(null);

    if (!option || !selectedBrand) return;

    try {
      setYearsLoading(true);
      setError(null);
      const data = await listFipeYears(vehicleType, selectedBrand.code, option.code);
      setYears(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar anos");
    } finally {
      setYearsLoading(false);
    }
  }

  async function handleQuote() {
    if (!selectedBrand || !selectedModel || !selectedYear) {
      setError("Selecione marca, modelo e ano para consultar a FIPE.");
      return;
    }

    try {
      setQuoteLoading(true);
      setError(null);

      const data = await fetchFipeQuote(
        vehicleType,
        selectedBrand.code,
        selectedModel.code,
        selectedYear.code
      );

      setQuote(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar valor FIPE");
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }

  const offersHref = `/comprar/cidade/${encodeURIComponent(citySlug)}?below_fipe=true`;
  const offersAllHref = selectedModel
    ? `/comprar/cidade/${encodeURIComponent(citySlug)}?model=${encodeURIComponent(selectedModel.name)}`
    : `/comprar/cidade/${encodeURIComponent(citySlug)}`;

  return (
    <>
      <main className="bg-cnc-bg pb-24 text-cnc-text">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-6 lg:max-w-5xl lg:px-8">
          {/* Page header */}
          <header>
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[30px] md:text-[36px]">
              Consultar Tabela FIPE
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-cnc-muted sm:text-[14.5px]">
              Veja o valor médio do veículo e compare com ofertas próximas.
            </p>
          </header>

          {/* Form card */}
          <section
            aria-label="Pesquisar valor FIPE"
            className="mt-5 rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:p-5"
          >
            <div className="space-y-3.5">
              <FipeCombobox
                label="Marca"
                placeholder="Selecione a marca"
                options={brands}
                value={selectedBrand}
                onChange={handleBrandChange}
                loading={brandsLoading}
              />

              <FipeCombobox
                label="Modelo"
                placeholder={selectedBrand ? "Selecione o modelo" : "Selecione a marca primeiro"}
                options={models}
                value={selectedModel}
                onChange={handleModelChange}
                disabled={!selectedBrand}
                loading={modelsLoading}
              />

              <FipeCombobox
                label="Ano"
                placeholder={selectedModel ? "Selecione o ano" : "Selecione o modelo primeiro"}
                options={years}
                value={selectedYear}
                onChange={setSelectedYear}
                disabled={!selectedModel}
                loading={yearsLoading}
              />
            </div>

            <button
              type="button"
              onClick={handleQuote}
              disabled={quoteLoading}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[14.5px] font-bold text-white shadow-card transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-70 sm:h-[52px] sm:text-[15px]"
            >
              <span>{quoteLoading ? "Consultando…" : "Consultar valor FIPE"}</span>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                <ArrowRightIcon />
              </span>
            </button>

            {error ? (
              <div className="mt-3 rounded-xl border border-cnc-danger/30 bg-cnc-danger/5 px-3 py-2 text-[12.5px] text-cnc-danger">
                {error}
              </div>
            ) : null}
          </section>

          {/* Result card — só aparece após consulta bem-sucedida */}
          {quote ? <FipeResultCard quote={quote} /> : null}

          {/* Ofertas próximas do modelo */}
          {compatibleAds.length > 0 ? (
            <section aria-label="Ofertas próximas do modelo" className="mt-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="truncate text-[16px] font-extrabold leading-tight text-cnc-text-strong sm:text-[18px]">
                  Ofertas próximas do modelo
                </h2>
                <Link
                  href={offersAllHref}
                  className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-strong"
                >
                  Ver todas
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {compatibleAds.map((item, index) => (
                  <AdCard
                    key={`fipe-near-${item.id ?? item.slug ?? index}`}
                    item={item}
                    variant="grid"
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* Promo: ver carros abaixo da FIPE em [cidade] */}
          <section className="mt-6">
            <div className="rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                  <PriceTagPromoIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-extrabold leading-tight text-cnc-text-strong sm:text-[15px]">
                    Ver carros abaixo da FIPE em {cityName}
                  </h3>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-cnc-muted sm:text-[13px]">
                    Encontre ofertas imperdíveis perto de você.
                  </p>
                </div>
                <Link
                  href={offersHref}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary bg-white px-3 text-[12.5px] font-bold text-primary transition hover:bg-primary hover:text-white sm:h-10 sm:px-4 sm:text-[13.5px]"
                >
                  Ver ofertas
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>

      <SiteBottomNav />
    </>
  );
}

/* ----------------------------------------------------------------------
 * Card de resultado FIPE
 * ---------------------------------------------------------------------- */

interface FipeResultCardProps {
  quote: FipeQuote;
}

function buildSpecsPill(quote: FipeQuote): string[] {
  const out: string[] = [];
  if (quote.fuel) out.push(quote.fuel);
  // FipeQuote pode ter mais campos como transmission/bodyType futuramente.
  // Por ora exibimos apenas o que temos disponível na resposta.
  return out;
}

function FipeResultCard({ quote }: FipeResultCardProps) {
  const specs = buildSpecsPill(quote);
  // FipeQuote.referenceMonth já vem como "maio/2024" — usamos cru.
  const referenceLabel = quote.referenceMonth ? quote.referenceMonth.trim() : null;

  return (
    <section
      aria-label="Resultado da consulta FIPE"
      className="mt-4 rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:mt-5 sm:p-5"
    >
      <div className="flex gap-3 sm:gap-4">
        {/* Imagem ilustrativa do veículo */}
        <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-[#f4f5f7] sm:h-28 sm:w-40">
          <Image
            src={FIPE_PLACEHOLDER_IMAGE}
            alt={`${quote.brand} ${quote.model}`}
            fill
            sizes="(min-width: 640px) 160px, 128px"
            className="object-contain p-1.5"
          />
        </div>

        {/* Info do veículo */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-extrabold leading-tight text-cnc-text-strong sm:text-[17px]">
            {quote.brand} {quote.model} {quote.modelYear}
          </h3>
          {quote.fipeCode ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-cnc-muted sm:text-[12.5px]">
              Código FIPE: {quote.fipeCode}
            </p>
          ) : null}

          {specs.length > 0 ? (
            <p className="mt-2 inline-flex max-w-full flex-wrap gap-x-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary sm:text-[12px]">
              {specs.map((s, i) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  {i > 0 ? <span className="text-primary/50">•</span> : null}
                  {s}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      {/* Valor + referência */}
      <div className="mt-3 border-t border-cnc-line pt-3 sm:mt-4 sm:pt-4">
        <p className="text-[12.5px] font-semibold text-cnc-muted">Valor FIPE:</p>
        <p className="mt-1 text-[26px] font-extrabold leading-none tracking-tight text-primary sm:text-[32px] md:text-[36px]">
          {quote.price}
        </p>
        {referenceLabel ? (
          <p className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-cnc-muted-soft sm:text-[12px]">
            Referência: {referenceLabel}
            <span aria-hidden="true">
              <InfoIcon />
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default FipePageClient;
