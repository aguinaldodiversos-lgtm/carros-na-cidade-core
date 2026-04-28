// frontend/components/fipe/FipePageClient.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FipeCombobox } from "@/components/fipe/FipeCombobox";
import { HomeVehicleCard } from "@/components/home/HomeVehicleCard";
import { IconPriceTag } from "@/components/home/icons";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import { QuickActionTile } from "@/components/ui/QuickActionTile";
import {
  fetchFipeQuote,
  listFipeBrands,
  listFipeModels,
  listFipeYears,
} from "@/lib/fipe/fipe-client";
import type { FipeOption, FipeQuote, FipeVehicleType } from "@/lib/fipe/fipe-provider";

type VehicleItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  year?: number | string;
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

function normalizeAds(items: VehicleItem[], cityName: string): VehicleItem[] {
  if (items.length > 0) return items;

  return Array.from({ length: 6 }).map((_, index) => ({
    id: `fallback-${index}`,
    title: `Veículo em destaque ${index + 1}`,
    city: cityName,
    state: "SP",
    price: 0,
    image_url: "/images/vehicle-placeholder.svg",
  }));
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

  const safeHighlightAds = useMemo(
    () => normalizeAds(highlightAds, cityName).slice(0, 3),
    [highlightAds, cityName]
  );

  const safeOpportunityAds = useMemo(
    () => normalizeAds(opportunityAds, cityName).slice(0, 3),
    [opportunityAds, cityName]
  );

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

  const hasResult = Boolean(quote);

  return (
    <>
      <main className="bg-white pb-24 md:pb-16">
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 md:pt-8">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-cnc-muted">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="transition hover:text-primary">
                  Home
                </Link>
              </li>
              <li aria-hidden className="text-cnc-muted-soft">
                ›
              </li>
              <li>
                <Link href="/comprar" className="transition hover:text-primary">
                  Comprar
                </Link>
              </li>
              <li aria-hidden className="text-cnc-muted-soft">
                ›
              </li>
              <li className="font-semibold text-primary">Consulta Fipe</li>
            </ol>
          </nav>

          <section className="relative overflow-hidden">
            <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="relative z-10">
                <h1 className="text-[24px] font-extrabold leading-[1.1] tracking-tight text-cnc-text-strong sm:text-[32px] md:text-[44px]">
                  Consulta <span className="text-primary">Fipe</span>
                </h1>

                <p className="mt-2.5 max-w-[520px] text-[13px] leading-snug text-cnc-muted sm:mt-3 sm:text-[15px] md:text-[17px]">
                  Pesquise o valor de mercado dos veículos na Tabela Fipe de forma prática e rápida.
                </p>
              </div>

              <div className="relative flex h-[220px] items-center justify-end md:h-[280px]">
                <div className="pointer-events-none absolute inset-0 -z-0 opacity-60">
                  <div className="absolute right-[-10%] top-[10%] h-[180px] w-[120%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(14,98,216,0.08)_0%,rgba(255,255,255,0)_70%)]" />
                </div>

                <div className="relative h-full w-full max-w-[560px]">
                  <Image
                    src="/images/gla.avif"
                    alt="Volkswagen Tiguan Allspace 2.0 TSI"
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, 560px"
                    className="object-contain object-right drop-shadow-[0_24px_38px_rgba(14,30,66,0.22)]"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-[20px] border border-cnc-line bg-white p-6 shadow-[0_10px_30px_rgba(14,30,66,0.06)] md:p-8">
              <h2 className="text-[22px] font-extrabold text-cnc-text-strong md:text-[24px]">
                Pesquise o Valor Fipe do seu Veículo
              </h2>

              <div className="mt-5 space-y-4">
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
                className="mt-6 inline-flex h-[54px] w-full items-center justify-center rounded-[12px] bg-primary px-6 text-[17px] font-extrabold text-white shadow-[0_12px_24px_rgba(14,98,216,0.22)] transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-70"
              >
                {quoteLoading ? "Consultando..." : "Consultar Valor Fipe"}
              </button>

              {error ? (
                <div className="mt-4 rounded-[12px] border border-cnc-danger/30 bg-cnc-danger/5 px-4 py-3 text-sm text-cnc-danger">
                  {error}
                </div>
              ) : null}

              <p className="mt-5 text-[13px] leading-6 text-cnc-muted-soft">
                Tabela Fipe atualizada diariamente com as cotações mais recentes.
                <br />
                Veículos até 20 anos atrás.
              </p>
            </div>

            <div className="rounded-[20px] border border-cnc-line bg-white p-6 shadow-[0_10px_30px_rgba(14,30,66,0.06)] md:p-8">
              <h2 className="text-[22px] font-extrabold text-cnc-text-strong md:text-[24px]">
                Valor Fipe do Veículo Consultado
              </h2>

              <div className="mt-4 h-px w-full bg-cnc-line" />

              {hasResult && quote ? (
                <div className="mt-4 sm:mt-5">
                  <h3 className="text-[17px] font-extrabold leading-tight text-cnc-text-strong sm:text-[20px] md:text-[22px]">
                    {quote.brand} {quote.model}
                  </h3>

                  <p className="mt-2 text-[13px] text-cnc-muted sm:text-[14px]">Ano: {quote.modelYear}</p>
                  <p className="mt-0.5 text-[13px] text-cnc-muted sm:text-[14px]">{quote.fuel}</p>

                  <div className="mt-4 rounded-[16px] bg-primary-soft px-5 py-5 text-center sm:mt-5 sm:px-6 sm:py-6">
                    <div className="text-[24px] font-extrabold tracking-tight text-primary sm:text-[30px] md:text-[36px]">
                      {quote.price}
                    </div>
                    <div className="mt-1.5 text-[12px] text-cnc-muted sm:text-[13px]">
                      Valor de mercado na Tabela Fipe
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 sm:mt-5">
                  <h3 className="text-[17px] font-extrabold leading-tight text-cnc-text-strong sm:text-[20px] md:text-[22px]">
                    Selecione um veículo ao lado
                  </h3>

                  <p className="mt-2 text-[13px] text-cnc-muted sm:text-[14px]">Preencha marca, modelo e ano</p>
                  <p className="mt-0.5 text-[13px] text-cnc-muted sm:text-[14px]">para ver o valor da Tabela Fipe</p>

                  <div className="mt-4 rounded-[16px] bg-primary-soft px-5 py-5 text-center sm:mt-5 sm:px-6 sm:py-6">
                    <div className="text-[24px] font-extrabold tracking-tight text-primary sm:text-[30px] md:text-[36px]">
                      R$ ---
                    </div>
                    <div className="mt-1.5 text-[12px] text-cnc-muted sm:text-[13px]">
                      Valor de mercado na Tabela Fipe
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="mt-14">
            <h2 className="text-[18px] font-extrabold leading-tight text-cnc-text-strong sm:text-[22px] md:text-[26px]">
              Destaques em {cityName}
            </h2>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {safeHighlightAds.map((item, index) => (
                  <HomeVehicleCard
                    key={`highlight-${item.id}-${index}`}
                    item={item}
                    variant="highlight"
                  />
                ))}
              </div>

              <aside className="rounded-[20px] border border-cnc-line bg-white p-6 shadow-[0_10px_30px_rgba(14,30,66,0.06)]">
                <div className="flex h-[140px] w-full items-center justify-center rounded-[16px] bg-primary-soft">
                  <svg viewBox="0 0 64 64" className="h-20 w-20" fill="none">
                    <path d="M12 32l18-6v20l-18-6V32z" fill="#0e62d8" />
                    <path d="M30 24l20-8v32l-20-8V24z" fill="#0e62d8" opacity="0.85" />
                    <circle cx="14" cy="44" r="2" fill="#f7a400" />
                    <circle cx="52" cy="14" r="2" fill="#f7a400" />
                    <circle cx="56" cy="34" r="2.5" fill="#f7a400" />
                    <circle cx="10" cy="18" r="1.5" fill="#f7a400" />
                    <path d="M48 10l2 4 4 0-3 3 1 4-4-2-4 2 1-4-3-3 4 0 2-4z" fill="#f7a400" />
                  </svg>
                </div>

                <h3 className="mt-5 text-[22px] font-extrabold leading-tight text-cnc-text-strong">
                  Anuncie seu
                  <br />
                  carro grátis!
                </h3>

                <p className="mt-4 text-[14px] leading-6 text-cnc-muted">
                  Venda o seu carro rapidamente! Anuncie grátis na maior vitrine de veículos usados
                  da sua cidade. Cadastro simples, anúncio rápido e contato direto com compradores
                  em {cityName}.
                </p>

                <Link
                  href="/planos"
                  className="mt-5 inline-flex h-[48px] w-full items-center justify-center rounded-[10px] bg-primary px-5 text-[15px] font-extrabold text-white shadow-[0_10px_20px_rgba(14,98,216,0.22)] transition hover:bg-primary-strong"
                >
                  Anunciar Grátis
                </Link>
              </aside>
            </div>
          </section>

          <section className="mt-14">
            <h2 className="text-[18px] font-extrabold leading-tight text-cnc-text-strong sm:text-[22px] md:text-[26px]">
              Ofertas de carros usados em {cityName}
            </h2>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {safeOpportunityAds.map((item, index) => (
                <HomeVehicleCard
                  key={`opportunity-${item.id}-${index}`}
                  item={{ ...item, below_fipe: true }}
                  variant="opportunity"
                />
              ))}
            </div>
          </section>

          {/* Promo bottom (mockup `fipe.png`): leva a /comprar abaixo da FIPE
              na cidade ativa. QuickActionTile é o mesmo primitivo da Home/
              Catálogo, mantendo o contrato visual. */}
          <section className="mt-14">
            <QuickActionTile
              href={`/comprar/cidade/${encodeURIComponent(citySlug)}?below_fipe=true`}
              title="Ver carros abaixo da FIPE"
              subtitle={`Oportunidades em ${cityName} — preço imperdível`}
              icon={<IconPriceTag className="h-full w-full" />}
            />
          </section>
        </div>
      </main>
      <SiteBottomNav />
    </>
  );
}
