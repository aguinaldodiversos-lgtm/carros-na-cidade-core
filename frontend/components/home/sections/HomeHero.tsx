// frontend/components/home/sections/HomeHero.tsx
"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SearchBar } from "@/components/ui/SearchBar";
import { HOME_HERO_BANNER } from "@/lib/site/brand-assets";

/**
 * HomeHero — alinhado ao contrato visual `pagina Home.png`.
 *
 * Mobile-first. Banner regional como hero com título "Encontre
 * oportunidades na sua cidade", search bar protagonista com chips
 * de filtro rápido (Abaixo da FIPE, SUV, Automático, Até R$ 50 mil)
 * e CTA único "Ver ofertas" (submit do form). H1 único, contrato
 * funcional (submit para /comprar). Sem hex hardcoded — tokens DS.
 *
 * Decisão anti-duplicação:
 *   - Removido o CTA "Começar agora" sobre o banner; o único CTA
 *     primário aqui é o submit "Ver ofertas" do SearchBar — evita
 *     dois botões com mesma função (busca/explorar). O destino do
 *     "Começar agora" antigo (/comprar) já é coberto pelo atalho
 *     "Comprar" da faixa HomeShortcuts e pelo submit da busca.
 *   - Estado e cidade ficam no header global; busca regional usa o
 *     cookie de cidade resolvido no Server Component pai.
 */

type FeaturedCity = {
  id: number;
  name: string;
  slug: string;
  state?: string;
};

interface HomeHeroProps {
  featuredCities: FeaturedCity[];
  defaultCitySlug: string;
  /** Nome da cidade ativa (para personalizar microtexto). */
  cityName?: string;
}

const QUICK_FILTERS: Array<{ key: string; label: string; query: string }> = [
  { key: "below-fipe", label: "Abaixo da FIPE", query: "below_fipe=true" },
  { key: "suv", label: "SUV", query: "body_type=SUV" },
  { key: "auto", label: "Automático", query: "transmission=automatic" },
  { key: "ate-50", label: "Até R$ 50 mil", query: "price_max=50000" },
];

export function HomeHero({ featuredCities: _f, defaultCitySlug, cityName }: HomeHeroProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const submit = useCallback(
    (value: string) => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      if (defaultCitySlug) params.set("city_slug", defaultCitySlug);
      router.push(`/comprar?${params.toString()}`);
    },
    [defaultCitySlug, router]
  );

  const goWithFilter = useCallback(
    (filterQuery: string) => {
      const params = new URLSearchParams(filterQuery);
      if (defaultCitySlug) params.set("city_slug", defaultCitySlug);
      router.push(`/comprar?${params.toString()}`);
    },
    [defaultCitySlug, router]
  );

  return (
    <section className="mx-auto w-full max-w-8xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
      <div className="relative overflow-hidden rounded-2xl bg-cnc-footer-a shadow-premium md:rounded-3xl">
        <Image
          src={HOME_HERO_BANNER}
          alt={
            cityName
              ? `Carros usados em ${cityName} no Carros na Cidade`
              : "Carros na Cidade — portal automotivo regional"
          }
          fill
          priority
          sizes="(min-width: 1280px) 1440px, 100vw"
          className="object-cover object-center"
        />
        {/* Overlay para legibilidade do texto branco */}
        <div className="absolute inset-0 bg-gradient-to-r from-cnc-footer-a/85 via-cnc-footer-a/55 to-transparent" />

        <div className="relative grid min-h-[220px] items-center px-5 py-7 sm:min-h-[300px] sm:px-8 sm:py-10 md:min-h-[360px] lg:px-12">
          <div className="max-w-xl">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl md:text-4xl">
              Encontre oportunidades
              <br />
              <span className="text-primary-soft">
                {cityName ? `em ${cityName}` : "na sua cidade"}
              </span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
              Carros, lojas e ofertas{cityName ? ` em ${cityName} e região` : " perto de você"}.
              <span className="hidden sm:inline">
                {" "}
                Mais oportunidades, melhores negócios e confiança regional.
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Busca + chips em card flutuante (mobile-first).
          SearchBar do DS já é um <form role="search">; usamos seu onSubmit. */}
      <div className="relative z-10 mt-3 sm:-mt-6 sm:mx-3">
        <div className="rounded-2xl border border-cnc-line bg-cnc-surface p-3 shadow-card sm:p-4">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={submit}
            placeholder="Busque por marca ou modelo"
            ariaLabel="Buscar veículos"
            filterButton={
              <Button
                type="submit"
                variant="primary"
                size="md"
                aria-label="Ver ofertas"
                className="hidden sm:inline-flex"
              >
                Ver ofertas
              </Button>
            }
          />
          {/* Mobile: botão dispara submit programaticamente via clique
              no botão dentro do form do SearchBar acima.
              Como o SearchBar é um <form>, qualquer <button type="submit">
              dentro dele dispara o submit. Aqui usamos um botão fora do
              form, então chamamos submit() direto. */}
          <Button
            type="button"
            onClick={() => submit(query)}
            variant="primary"
            size="md"
            fullWidth
            className="mt-2 sm:hidden"
          >
            Ver ofertas
          </Button>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="sr-only">Filtros rápidos</span>
            {QUICK_FILTERS.map((f) => (
              <Chip key={f.key} variant="filter" onClick={() => goWithFilter(f.query)}>
                {f.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
