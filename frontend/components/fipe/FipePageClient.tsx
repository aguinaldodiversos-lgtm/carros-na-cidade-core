// frontend/components/fipe/FipePageClient.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FipeCombobox } from "@/components/fipe/FipeCombobox";
import { FipeVehicleCarousel } from "@/components/fipe/FipeVehicleCarousel";
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
  cityLabel: string;
  highlightAds: VehicleItem[];
  opportunityAds: VehicleItem[];
}

const VEHICLE_TYPE_OPTIONS: Array<{ label: string; value: FipeVehicleType }> = [
  { label: "Carros", value: "carros" },
  { label: "Motos", value: "motos" },
  { label: "Caminhões", value: "caminhoes" },
];

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
  cityLabel,
  highlightAds,
  opportunityAds,
}: FipePageClientProps) {
  const [vehicleType, setVehicleType] = useState<FipeVehicleType>("carros");

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
    () => normalizeAds(highlightAds, cityName),
    [highlightAds, cityName]
  );

  const safeOpportunityAds = useMemo(
    () =>
      normalizeAds(opportunityAds, cityName).map((item) => ({
        ...item,
        below_fipe: true,
      })),
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

    setSelectedBrand(null);
    setSelectedModel(null);
    setSelectedYear(null);
    setModels([]);
    setYears([]);
    setQuote(null);

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
      setError("Selecione montadora, modelo/versão e ano para consultar a FIPE.");
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

  return (
    <main className="bg-[#f2f3f7]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:py-8">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-[#70798d]">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href={`/cidade/${citySlug}`} className="hover:text-[#0e62d8]">
                {cityName}
              </Link>
            </li>
            <li>
              <span>›</span>
            </li>
            <li className="font-semibold text-[#2d3951]">Tabela Fipe</li>
          </ol>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="rounded-[28px] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(239,242,251,0.98)_42%,rgba(236,241,250,0.92)_100%)] px-6 py-6 shadow-[0_20px_60px_rgba(16,28,58,0.08)] md:px-8 md:py-8">
              <h1 className="max-w-4xl text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#1b2436] md:text-[54px]">
                Consulte a Tabela Fipe do seu carro grátis
              </h1>

              <p className="mt-4 max-w-4xl text-[18px] leading-8 text-[#5f6880] md:text-[20px]">
                Descubra o valor de mercado real do seu veículo atualizado pela Tabela Fipe e veja
                por quanto ele está sendo anunciado na sua cidade.
              </p>

              <div className="mt-8 rounded-[22px] border border-[#e1e8f4] bg-[linear-gradient(180deg,#eff4ff_0%,#f7f9fd_100%)] p-5 shadow-[0_12px_28px_rgba(16,28,58,0.06)] md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-[24px] font-extrabold text-[#1f2a41]">
                    Encontre o valor da Tabela Fipe
                  </h2>

                  <div className="flex flex-wrap gap-2">
                    {VEHICLE_TYPE_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setVehicleType(item.value)}
                        className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-bold transition ${
                          vehicleType === item.value
                            ? "bg-[#0e62d8] text-white"
                            : "bg-white text-[#42516d] ring-1 ring-[#d7deeb] hover:bg-[#f4f7fb]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.25fr_1fr]">
                  <FipeCombobox
                    label="Montadora"
                    placeholder="Digite a marca"
                    options={brands}
                    value={selectedBrand}
                    onChange={handleBrandChange}
                    loading={brandsLoading}
                  />

                  <FipeCombobox
                    label="Modelo / versão"
                    placeholder={selectedBrand ? "Digite o modelo" : "Selecione a montadora"}
                    options={models}
                    value={selectedModel}
                    onChange={handleModelChange}
                    disabled={!selectedBrand}
                    loading={modelsLoading}
                  />

                  <FipeCombobox
                    label="Ano"
                    placeholder={selectedModel ? "Selecione o ano" : "Selecione o modelo"}
                    options={years}
                    value={selectedYear}
                    onChange={setSelectedYear}
                    disabled={!selectedModel}
                    loading={yearsLoading}
                  />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="flex h-[54px] items-center gap-3 rounded-[12px] border border-[#dbe3ef] bg-white px-4 text-[#62708a]">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-[#7d8ba3]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M4 14h3l2-6 3 10 2-6h6" />
                    </svg>
                    <span className="text-[15px]">
                      Autocomplete completo de montadoras, modelos e anos
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleQuote}
                    disabled={quoteLoading}
                    className="inline-flex h-[54px] items-center justify-center rounded-[12px] bg-[#f7a400] px-6 text-[18px] font-extrabold text-white shadow-[0_12px_24px_rgba(247,164,0,0.26)] transition hover:bg-[#e79a00] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {quoteLoading ? "Consultando..." : "Consultar valor"}
                  </button>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-[14px] bg-white/70 px-4 py-4 text-[#4f5e7a] ring-1 ring-[#e1e8f4]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 text-[#0e62d8]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M12 8v5l3 2" />
                    <path d="M21 12a9 9 0 1 1-9-9" />
                  </svg>
                  <p className="text-[15px] md:text-[18px]">
                    Consulta 100% gratuita e atualizada pela tabela FIPE.
                  </p>
                </div>
              </div>

              {error ? (
                <div className="mt-5 rounded-[16px] border border-[#ffd3d1] bg-[#fff5f5] px-4 py-4 text-sm text-[#c24141]">
                  {error}
                </div>
              ) : null}

              {quote ? (
                <div className="mt-6 rounded-[24px] border border-[#dbe3f0] bg-white p-5 shadow-[0_18px_40px_rgba(16,28,58,0.08)] md:p-6">
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <span className="inline-flex rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[#0e62d8]">
                        Valor FIPE atualizado
                      </span>

                      <h3 className="mt-4 text-[28px] font-extrabold leading-tight text-[#1f2940] md:text-[34px]">
                        {quote.brand} {quote.model}
                      </h3>

                      <p className="mt-2 text-[16px] text-[#657188]">
                        Ano {quote.modelYear} • {quote.fuel}
                      </p>
                    </div>

                    <div className="rounded-[20px] bg-[linear-gradient(135deg,#0e62d8_0%,#0b4db0_100%)] px-6 py-5 text-white shadow-[0_18px_32px_rgba(14,98,216,0.22)]">
                      <div className="text-sm font-semibold text-white/80">Preço médio FIPE</div>
                      <div className="mt-2 text-[30px] font-extrabold md:text-[36px]">
                        {quote.price}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <div className="rounded-[16px] border border-[#e6ebf3] bg-[#f9fbfe] px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#8390a8]">
                        Código FIPE
                      </div>
                      <div className="mt-2 text-[16px] font-extrabold text-[#24324b]">
                        {quote.fipeCode}
                      </div>
                    </div>

                    <div className="rounded-[16px] border border-[#e6ebf3] bg-[#f9fbfe] px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#8390a8]">
                        Referência
                      </div>
                      <div className="mt-2 text-[16px] font-extrabold text-[#24324b]">
                        {quote.referenceMonth}
                      </div>
                    </div>

                    <div className="rounded-[16px] border border-[#e6ebf3] bg-[#f9fbfe] px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#8390a8]">
                        Tipo
                      </div>
                      <div className="mt-2 text-[16px] font-extrabold text-[#24324b] capitalize">
                        {vehicleType}
                      </div>
                    </div>

                    <div className="rounded-[16px] border border-[#e6ebf3] bg-[#f9fbfe] px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#8390a8]">
                        Cidade analisada
                      </div>
                      <div className="mt-2 text-[16px] font-extrabold text-[#24324b]">
                        {cityLabel}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <FipeVehicleCarousel
                title={`Destaques em ${cityName}`}
                subtitle="Veículos patrocinados com maior visibilidade na sua cidade"
                items={safeHighlightAds}
                variant="highlight"
              />

              <FipeVehicleCarousel
                title="Oportunidades abaixo da FIPE"
                subtitle="Ofertas locais com preço abaixo da referência de mercado"
                items={safeOpportunityAds}
                variant="opportunity"
              />

              <section className="mt-10">
                <h2 className="text-[24px] font-extrabold text-[#1c2538] md:text-[30px]">
                  Agora é hora de anunciar seu carro!
                </h2>

                <div className="mt-4 rounded-[20px] border border-[#e2e8f3] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(16,28,58,0.06)] md:px-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
                      <Link
                        href={`/tabela-fipe/${citySlug}`}
                        className="inline-flex items-center gap-3 text-[18px] font-semibold text-[#41506b]"
                      >
                        <span>Consulte o valor da tabela Fipe</span>
                      </Link>

                      <span className="hidden h-8 w-px bg-[#e4e8f2] md:block" />

                      <Link
                        href={`/simulador-financiamento/${citySlug}`}
                        className="inline-flex items-center gap-3 text-[18px] font-semibold text-[#41506b]"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 text-[#0e62d8]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="M7 9h10M7 13h5" />
                        </svg>
                        <span>Simular financiamento</span>
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 text-[#f7a400]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              </section>

              <section className="mt-8 overflow-hidden rounded-[26px] border border-[#dbe2ee] bg-[#0e1b3b] shadow-[0_18px_40px_rgba(16,28,58,0.12)]">
                <div className="relative min-h-[250px] px-6 py-8 md:min-h-[300px] md:px-8 md:py-10">
                  <Image
                    src="/images/vehicle-placeholder.svg"
                    alt="Anuncie seu carro"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,36,0.74)_0%,rgba(8,17,36,0.55)_32%,rgba(8,17,36,0.2)_100%)]" />

                  <div className="relative z-10 flex h-full flex-col justify-between gap-6 md:flex-row md:items-end">
                    <div className="max-w-[460px]">
                      <p className="text-[24px] font-extrabold text-white md:text-[42px]">
                        Agora é hora de anunciar seu carro grátis!
                      </p>
                      <p className="mt-3 text-[18px] leading-8 text-white/84">
                        Compare com a FIPE, destaque o seu veículo e receba propostas rapidamente na
                        sua cidade.
                      </p>
                    </div>

                    <div className="w-full max-w-[320px] rounded-[20px] bg-white/95 p-4 shadow-[0_18px_36px_rgba(16,28,58,0.18)] backdrop-blur">
                      <Link
                        href="/planos"
                        className="inline-flex h-[52px] w-full items-center justify-center rounded-[12px] bg-[#f7a400] px-5 text-[18px] font-extrabold text-white transition hover:bg-[#e79a00]"
                      >
                        Criar anúncio agora
                      </Link>

                      <Link
                        href="/planos"
                        className="mt-3 inline-flex h-[48px] w-full items-center justify-center rounded-[12px] bg-[#eef4ff] px-5 text-[16px] font-bold text-[#5a6784] transition hover:bg-[#e3ecfb]"
                      >
                        Anunciar grátis seu carro
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-[92px] lg:self-start">
            <div className="overflow-hidden rounded-[22px] border border-[#dfe6f2] bg-white shadow-[0_14px_28px_rgba(16,28,58,0.07)]">
              <div className="relative aspect-[1.14/0.72]">
                <Image
                  src="/images/vehicle-placeholder.svg"
                  alt="Anuncie seu carro"
                  fill
                  className="object-cover"
                />
              </div>

              <div className="p-5">
                <h3 className="text-[22px] font-extrabold leading-tight text-[#1f2940]">
                  Anuncie seu carro grátis
                </h3>

                <p className="mt-3 text-[17px] leading-7 text-[#616b81]">
                  Sabe quanto seu carro vale? Anuncie ele grátis agora e receba propostas
                  rapidamente.
                </p>

                <Link
                  href="/planos"
                  className="mt-5 inline-flex h-[52px] w-full items-center justify-center rounded-[12px] bg-[#f7a400] px-5 text-[18px] font-extrabold text-white transition hover:bg-[#e79a00]"
                >
                  Criar anúncio
                </Link>

                <ul className="mt-5 space-y-3 text-[15px] text-[#5e6a82]">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 text-[#0e62d8]">✓</span>
                    <span>Venda rápido e negocie seguro</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 text-[#0e62d8]">✓</span>
                    <span>Divulgação na sua cidade</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 text-[#0e62d8]">✓</span>
                    <span>Anúncios grátis e ilimitados nos planos compatíveis</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="rounded-[22px] border border-[#dfe6f2] bg-white p-5 shadow-[0_14px_28px_rgba(16,28,58,0.07)]">
              <h3 className="text-[20px] font-extrabold text-[#1f2940]">
                Anuncie seu carro grátis
              </h3>

              <p className="mt-3 text-[16px] leading-7 text-[#616b81]">
                Use o valor FIPE como referência, anuncie com preço competitivo e receba propostas
                mais rápido.
              </p>

              <Link
                href="/planos"
                className="mt-5 inline-flex h-[50px] w-full items-center justify-center rounded-[12px] bg-[#f7a400] px-5 text-[18px] font-extrabold text-white transition hover:bg-[#e79a00]"
              >
                Criar anúncio
              </Link>
            </div>

            <div className="rounded-[22px] border border-[#dfe6f2] bg-white p-5 shadow-[0_14px_28px_rgba(16,28,58,0.07)]">
              <ul className="space-y-3 text-[15px] text-[#5e6a82]">
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-[#f7a400]">↻</span>
                  <span>Compare o valor do mercado local</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-[#f7a400]">⌁</span>
                  <span>Use a FIPE para precificar melhor</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 text-[#f7a400]">▣</span>
                  <span>Veja o contexto da sua cidade</span>
                </li>
              </ul>
            </div>

            <div className="rounded-[22px] border border-[#dfe6f2] bg-white p-5 shadow-[0_14px_28px_rgba(16,28,58,0.07)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[20px] font-extrabold text-[#1f2940]">
                    Simule seu financiamento
                  </h3>
                  <p className="mt-3 text-[16px] leading-7 text-[#616b81]">
                    Veja suas parcelas em poucos minutos e compare com o valor FIPE.
                  </p>
                </div>

                <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-[#eef4ff] text-[#0e62d8]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-7 w-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M7 9h10M7 13h5" />
                  </svg>
                </div>
              </div>

              <Link
                href={`/simulador-financiamento/${citySlug}`}
                className="mt-5 inline-flex h-[50px] w-full items-center justify-center rounded-[12px] bg-[#eef4ff] px-5 text-[17px] font-bold text-[#5a6784] transition hover:bg-[#e3ecfb]"
              >
                Simular financiar
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
