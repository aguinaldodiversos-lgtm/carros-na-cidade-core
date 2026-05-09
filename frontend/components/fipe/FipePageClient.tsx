// frontend/components/fipe/FipePageClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import AdCard from "@/components/ads/AdCard";
import { FipeCombobox } from "@/components/fipe/FipeCombobox";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import { VehicleImage } from "@/components/ui/VehicleImage";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import {
  fetchFipeQuote,
  listFipeBrands,
  listFipeModels,
  listFipeYears,
} from "@/lib/fipe/fipe-client";
import type { FipeOption, FipeQuote, FipeVehicleType } from "@/lib/fipe/fipe-provider";

/**
 * Página de consulta da Tabela FIPE — mobile-first, contrato visual
 * oficial em `frontend/public/images/Fipe.png`.
 *
 * Estrutura (mobile-first; em sm+ o form abre 3 cols e o card de
 * resultado coloca a ilustração à esquerda):
 *
 *   1. Título "Consultar Tabela FIPE" + sub
 *   2. Card de formulário:
 *        Marca / Modelo / Ano  (3 cols em sm+)
 *        Botão azul "Consultar valor FIPE" — full-width abaixo, com
 *        ícone de lupa
 *   3. Card de resultado (imagem + bloco de info empilhado em mobile,
 *      lado-a-lado em sm+): pill "Valor médio FIPE", título, versão,
 *      pílulas de specs (combustível / câmbio / carroceria / portas
 *      detectados heuristicamente do model string da FIPE), "Valor FIPE"
 *      em destaque, referência. Caption "Referência visual do valor
 *      FIPE" abaixo da ilustração.
 *   4. Card "Por que consultar a FIPE conosco?" — 3 features
 *   5. "Ofertas próximas do modelo" + "Ver todas →" (carrossel mobile,
 *      grid desktop)
 *   6. CTA "Anuncie grátis no portal" — ilustração PNG (phone + carro
 *      + selo "GRÁTIS") + botão
 *   7. CTA "Ver carros abaixo da FIPE em [cidade]"
 *   8. SiteBottomNav (fora do <main>)
 *
 * Imagens estáticas em `public/images/fipe/`:
 *   - result-illustration.png  → ilustração do clipboard FIPE no card
 *                                de resultado (com fundo transparente).
 *   - anuncie-gratis.png       → ilustração do phone + carro com selo
 *                                "GRÁTIS" (fundo transparente) no banner
 *                                "Anuncie grátis no portal".
 *
 * Se o PNG estiver ausente, `<VehicleImage onError>` cai silenciosamente
 * no `VehicleImagePlaceholder` do design system — a página não quebra.
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

const FIPE_RESULT_ILLUSTRATION = "/images/fipe/result-illustration.png";
const FIPE_ANUNCIE_GRATIS_ILLUSTRATION = "/images/fipe/anuncie-gratis.png";

/* ---------------- Icons ---------------- */

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

function InfoIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
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

function BrandFlagIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function SearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CalendarIcon() {
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
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

function FuelIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22V6a3 3 0 0 1 6 0v10a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9l-3-3" />
      <path d="M6 22V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v18" />
      <path d="M3 22h12" />
    </svg>
  );
}

function GearIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4v16M7 12h10M17 4v8M17 16v4" />
      <circle cx="7" cy="4" r="1.5" />
      <circle cx="7" cy="20" r="1.5" />
      <circle cx="17" cy="4" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
    </svg>
  );
}

function CarIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 16h14M4 16l1.5-5.5A2 2 0 0 1 7.4 9h9.2a2 2 0 0 1 1.9 1.5L20 16M4 16v3M20 16v3M3 16h18" />
      <circle cx="7" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PersonIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 20V12M12 20V4M19 20v-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

function PriceTagPromoIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
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

function MapPinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/* ---------------- Page ---------------- */

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
    // Defesa em profundidade: vitrine nunca pode mostrar card com R$ 0.
    // O server já filtra em frontend/app/tabela-fipe/[cidade]/page.tsx mas
    // mantemos o filtro aqui para qualquer chamador futuro do client.
    const list = highlightAds?.length ? highlightAds : opportunityAds;
    return (list || []).filter(hasRealPrice).slice(0, 3);
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
        setError(err instanceof Error ? err.message : "Falha ao carregar marcas");
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
          {/* 1 — Page header */}
          <header>
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[30px] md:text-[34px]">
              Consultar Tabela FIPE
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-cnc-muted sm:text-[14.5px]">
              Veja o valor médio do veículo e compare com ofertas próximas.
            </p>
          </header>

          {/* 2 — Form card */}
          <section
            aria-label="Pesquisar valor FIPE"
            className="mt-5 rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:p-5"
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              <FipeCombobox
                label="Marca"
                placeholder="Selecione a marca"
                options={brands}
                value={selectedBrand}
                onChange={handleBrandChange}
                loading={brandsLoading}
                leftIcon={<BrandFlagIcon />}
              />

              <FipeCombobox
                label="Modelo"
                placeholder={selectedBrand ? "Buscar modelo" : "Selecione a marca"}
                options={models}
                value={selectedModel}
                onChange={handleModelChange}
                disabled={!selectedBrand}
                loading={modelsLoading}
                leftIcon={<SearchIcon className="h-5 w-5" />}
                clearable
              />

              <FipeCombobox
                label="Ano"
                placeholder={selectedModel ? "Selecione o ano" : "Selecione o modelo"}
                options={years}
                value={selectedYear}
                onChange={setSelectedYear}
                disabled={!selectedModel}
                loading={yearsLoading}
                leftIcon={<CalendarIcon />}
              />
            </div>

            <button
              type="button"
              onClick={handleQuote}
              disabled={quoteLoading}
              className="mt-4 inline-flex h-[48px] w-full items-center justify-center gap-2.5 rounded-xl bg-primary text-[14.5px] font-bold text-white shadow-card transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-70 sm:h-[52px] sm:text-[15px]"
            >
              <SearchIcon className="h-[18px] w-[18px]" />
              <span>{quoteLoading ? "Consultando…" : "Consultar valor FIPE"}</span>
            </button>

            {error ? (
              <div
                role="alert"
                className="mt-3.5 rounded-xl border border-cnc-danger/30 bg-cnc-danger/5 px-3 py-2 text-[12.5px] text-cnc-danger"
              >
                {error}
              </div>
            ) : null}
          </section>

          {/* 3 — Result card */}
          {quote ? <FipeResultCard quote={quote} /> : null}

          {/* 4 — Por que consultar a FIPE conosco? */}
          <WhyConsultFipeCard />

          {/* 5 — Ofertas próximas do modelo */}
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

              {/* Mobile: scroll horizontal; Desktop: grid 3 cols */}
              <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
                {compatibleAds.map((item, index) => (
                  <div
                    key={`fipe-near-${item.id ?? item.slug ?? index}`}
                    className="w-[78%] shrink-0 snap-start sm:w-auto"
                  >
                    <AdCard item={item} variant="grid" />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* 6 — CTA Anuncie grátis no portal */}
          <AnunciarFreeBanner />

          {/* 7 — Promo: ver carros abaixo da FIPE em [cidade] */}
          <section className="mt-4">
            <div className="rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="flex flex-wrap items-center gap-3">
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
 * Result card
 * ---------------------------------------------------------------------- */

interface FipeResultCardProps {
  quote: FipeQuote;
}

type Spec = { icon: ReactNode; label: string };

/**
 * A FIPE só devolve combustível como atributo discreto. Câmbio,
 * carroceria e portas, quando presentes, ficam embutidos no campo
 * `model` (ex.: "Civic Sed.Touring 2.0 16V Aut. (Híbrido)").
 *
 * Esta função extrai esses dados via heurística simples para preencher
 * as 4 pílulas do card de resultado conforme o gabarito. Quando a string
 * não tem o sinal, a pílula correspondente é omitida — sem chutar
 * valores incorretos.
 */
function extractSpecsFromQuote(quote: FipeQuote): Spec[] {
  const out: Spec[] = [];
  const model = (quote.model || "").trim();
  const fuel = (quote.fuel || "").trim();

  // Combustível — direto da FIPE
  if (fuel && fuel !== "—") {
    out.push({ icon: <FuelIcon />, label: fuel });
  }

  // Câmbio
  if (/\b(aut\.?|cvt|automátic|automatic|dct|dsg)\b/i.test(model)) {
    out.push({ icon: <GearIcon />, label: "Automático" });
  } else if (/\b(mec\.?|manual)\b/i.test(model)) {
    out.push({ icon: <GearIcon />, label: "Manual" });
  }

  // Carroceria — aceita "Sed", "Sed.", "Sedan", "Sedã"
  if (/\bsed(?:an|\.|ã)?\b/i.test(model)) {
    out.push({ icon: <CarIcon />, label: "Sedã" });
  } else if (/\bhatch\b/i.test(model)) {
    out.push({ icon: <CarIcon />, label: "Hatch" });
  } else if (/\bsuv\b/i.test(model)) {
    out.push({ icon: <CarIcon />, label: "SUV" });
  } else if (/\b(picape|pickup)\b/i.test(model)) {
    out.push({ icon: <CarIcon />, label: "Picape" });
  } else if (/\bcoup[eé]\b/i.test(model)) {
    out.push({ icon: <CarIcon />, label: "Coupé" });
  }

  // Portas — ex.: "4P", "4 portas", "2P"
  const doorMatch = model.match(/(\d)\s*(?:p\b|portas)/i);
  if (doorMatch) {
    out.push({ icon: <PersonIcon />, label: `${doorMatch[1]} portas` });
  }

  return out;
}

function FipeResultCard({ quote }: FipeResultCardProps) {
  const specs = extractSpecsFromQuote(quote);
  const referenceLabel = quote.referenceMonth ? quote.referenceMonth.trim() : null;

  return (
    <section
      aria-label="Resultado da consulta FIPE"
      className="mt-4 rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:mt-5 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        {/* Ilustração do FIPE (clipboard com gráfico) — referência visual */}
        <div className="flex flex-col items-center gap-1.5 sm:w-[44%] sm:shrink-0">
          <div className="flex h-[160px] w-full items-center justify-center overflow-hidden rounded-xl bg-cnc-bg sm:h-[180px]">
            <VehicleImage
              src={FIPE_RESULT_ILLUSTRATION}
              alt="Referência visual do valor FIPE"
              width={260}
              height={160}
              variant="card"
              sizes="(min-width: 640px) 44vw, 90vw"
              className="max-h-full max-w-full object-contain"
              fallbackLabel="Referência FIPE"
            />
          </div>
          <p className="text-center text-[11px] leading-snug text-cnc-muted-soft sm:text-[11.5px]">
            Referência visual do valor FIPE
          </p>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary sm:text-[11.5px]">
            Valor médio FIPE
          </span>

          <h3 className="mt-2 text-[18px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[20px]">
            {quote.brand} {quote.modelYear}
          </h3>

          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-cnc-muted sm:text-[14px]">
            {quote.model}
          </p>

          {specs.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {specs.map((spec) => (
                <span
                  key={spec.label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary sm:text-[12px]"
                >
                  <span className="text-primary">{spec.icon}</span>
                  {spec.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-3 sm:mt-4">
            <p className="text-[12.5px] font-semibold text-cnc-muted">Valor FIPE</p>
            <p className="mt-0.5 text-[26px] font-extrabold leading-none tracking-tight text-primary sm:text-[30px] md:text-[34px]">
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
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------
 * "Por que consultar a FIPE conosco?" — 3 features
 * ---------------------------------------------------------------------- */

type WhyFeature = {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
};

const WHY_FEATURES: WhyFeature[] = [
  {
    icon: <ChartIcon />,
    iconBg: "bg-primary-soft",
    iconColor: "text-primary",
    title: "Compare com anúncios reais",
    desc: "Veja ofertas perto de você.",
  },
  {
    icon: <PriceTagPromoIcon className="h-6 w-6" />,
    iconBg: "bg-[#dcfce7]",
    iconColor: "text-[#16a34a]",
    title: "Veja ofertas abaixo da FIPE",
    desc: "Economize com as melhores opções.",
  },
  {
    icon: <MapPinIcon />,
    iconBg: "bg-[#ede9fe]",
    iconColor: "text-[#7c3aed]",
    title: "Descubra carros na sua cidade",
    desc: "Encontre veículos perto de você.",
  },
];

function WhyConsultFipeCard() {
  return (
    <section aria-label="Por que consultar a FIPE conosco?" className="mt-5">
      <div className="rounded-2xl border border-cnc-line bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-[14.5px] font-extrabold leading-tight text-cnc-text-strong sm:text-[15.5px]">
          Por que consultar a FIPE conosco?
        </h2>

        <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3 sm:gap-4">
          {WHY_FEATURES.map((feature) => (
            <div key={feature.title} className="flex items-start gap-3">
              <span
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${feature.iconBg} ${feature.iconColor}`}
              >
                {feature.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-extrabold leading-tight text-cnc-text-strong sm:text-[13.5px]">
                  {feature.title}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-cnc-muted sm:text-[12.5px]">
                  {feature.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------
 * "Anuncie grátis no portal" — CTA com PNG (phone + carro + selo GRÁTIS)
 * ---------------------------------------------------------------------- */

function AnunciarFreeBanner() {
  return (
    <section className="mt-6">
      <div className="overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#dbe7ff_0%,#eef4ff_55%,#f3edff_100%)] p-4 sm:p-5">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <div className="mx-auto flex h-[120px] w-[160px] shrink-0 items-center justify-center overflow-hidden sm:mx-0 sm:h-[140px] sm:w-[180px]">
            <VehicleImage
              src={FIPE_ANUNCIE_GRATIS_ILLUSTRATION}
              alt="Anuncie seu carro grátis no portal"
              width={180}
              height={140}
              variant="card"
              sizes="(min-width: 640px) 180px, 160px"
              className="max-h-full max-w-full object-contain"
              fallbackLabel="Anuncie"
            />
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h3 className="text-[15px] font-extrabold leading-tight text-cnc-text-strong sm:text-[17px]">
              Anuncie grátis no portal
            </h3>
            <p className="mt-1 text-[12.5px] leading-snug text-cnc-muted sm:text-[13.5px]">
              Cadastre seu veículo sem custo e alcance compradores da sua região.
            </p>
          </div>

          <Link
            href="/anunciar/novo"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13.5px] font-bold text-white shadow-card transition hover:bg-primary-strong sm:h-12 sm:w-auto sm:text-[14px]"
          >
            Criar anúncio grátis
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default FipePageClient;
