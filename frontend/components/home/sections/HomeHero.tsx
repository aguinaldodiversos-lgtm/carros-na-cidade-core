"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { HOME_HERO_BANNER } from "@/lib/site/brand-assets";
import { IconSearch } from "@/components/home/icons";

type FeaturedCity = {
  id: number;
  name: string;
  slug: string;
  state?: string;
};

interface HomeHeroProps {
  featuredCities: FeaturedCity[];
  defaultCitySlug: string;
}

const STATES: Array<{ uf: string; name: string }> = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];

export function HomeHero({ featuredCities, defaultCitySlug }: HomeHeroProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState("");
  const [citySlug, setCitySlug] = useState("");

  const citiesForUf = useMemo(() => {
    if (!uf) return featuredCities;
    return featuredCities.filter((c) => (c.state || "").toUpperCase() === uf);
  }, [uf, featuredCities]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (citySlug) params.set("city_slug", citySlug);
      else if (defaultCitySlug) params.set("city_slug", defaultCitySlug);
      if (uf) params.set("uf", uf);
      router.push(`/comprar?${params.toString()}`);
    },
    [query, uf, citySlug, defaultCitySlug, router]
  );

  return (
    <section className="relative mx-auto w-full max-w-[1240px] px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8">
      <div className="relative overflow-hidden rounded-[22px] bg-[#0b1020] shadow-[0_24px_60px_-20px_rgba(15,10,40,0.35)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HOME_HERO_BANNER}
          alt="Carros na Cidade — portal automotivo regional"
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="eager"
          decoding="sync"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1020]/85 via-[#0b1020]/55 to-transparent" />

        <div className="relative grid min-h-[420px] items-center px-6 py-10 sm:px-10 md:min-h-[460px] md:py-14 lg:px-14">
          <div className="max-w-xl">
            <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[38px] md:text-[44px]">
              O portal de carros usados
              <br />
              que <span className="text-[#8fa0eb]">entende a sua cidade</span>
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85 sm:text-base">
              Conectamos compradores e vendedores com foco regional.
              <br className="hidden sm:inline" />
              Mais oportunidades, melhores negócios e confiança perto de você.
            </p>
            <Link
              href="/comprar"
              className="mt-7 inline-flex h-12 items-center justify-center rounded-xl bg-[#2d3a9c] px-7 text-[15px] font-bold text-white shadow-[0_12px_28px_rgba(45, 58, 156,0.4)] transition hover:bg-[#1f2b7e]"
            >
              Começar agora
            </Link>
          </div>
        </div>

        <div className="relative z-10 mx-4 -mt-8 sm:mx-6 sm:-mt-10 md:mx-8">
          <p className="mb-2 pl-2 text-[11.5px] text-white/80 sm:text-[12px]">
            Ex.: Honda Civic, Fiat Strada…
          </p>
          <form
            onSubmit={handleSubmit}
            className="rounded-[18px] border border-[#e7e8f1] bg-white p-3 shadow-[0_18px_44px_rgba(15,10,40,0.12)] sm:p-4"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.6fr_1fr_1fr_auto] md:items-end md:gap-3">
              <div>
                <label className="mb-1 block pl-1 text-[11px] font-semibold uppercase tracking-wide text-[#2d3a9c]">
                  Buscar
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[#2d3a9c]">
                    <IconSearch className="h-full w-full" />
                  </span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Busque por marca ou modelo"
                    aria-label="Busque por marca ou modelo"
                    className="h-12 w-full rounded-[12px] border border-[#e7e8f1] bg-white pl-11 pr-3 text-[14px] font-medium text-[#1a1f36] outline-none transition placeholder:text-[#9ea3b8] hover:border-[#d4d7e4] focus:border-[#2d3a9c] focus:shadow-[0_0_0_4px_rgba(45, 58, 156,0.12)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block pl-1 text-[11px] font-semibold uppercase tracking-wide text-[#2d3a9c]">
                  Estado
                </label>
              <select
                value={uf}
                onChange={(e) => {
                  setUf(e.target.value);
                  setCitySlug("");
                }}
                aria-label="Estado"
                className="h-12 w-full appearance-none rounded-[12px] border border-[#e7e8f1] bg-white px-3 text-[14px] font-medium text-[#1a1f36] outline-none transition hover:border-[#d4d7e4] focus:border-[#2d3a9c] focus:shadow-[0_0_0_4px_rgba(45, 58, 156,0.12)]"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg,transparent 50%,#2d3a9c 50%),linear-gradient(135deg,#2d3a9c 50%,transparent 50%)",
                  backgroundPosition:
                    "calc(100% - 18px) calc(50% - 2px), calc(100% - 12px) calc(50% - 2px)",
                  backgroundSize: "6px 6px, 6px 6px",
                  backgroundRepeat: "no-repeat",
                  paddingRight: "2.25rem",
                }}
              >
                <option value="">Selecione</option>
                {STATES.map((s) => (
                  <option key={s.uf} value={s.uf}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block pl-1 text-[11px] font-semibold uppercase tracking-wide text-[#2d3a9c]">
                Cidade
              </label>
              <select
                value={citySlug}
                onChange={(e) => setCitySlug(e.target.value)}
                aria-label="Cidade"
                className="h-12 w-full appearance-none rounded-[12px] border border-[#e7e8f1] bg-white px-3 text-[14px] font-medium text-[#1a1f36] outline-none transition hover:border-[#d4d7e4] focus:border-[#2d3a9c] focus:shadow-[0_0_0_4px_rgba(45, 58, 156,0.12)]"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg,transparent 50%,#2d3a9c 50%),linear-gradient(135deg,#2d3a9c 50%,transparent 50%)",
                  backgroundPosition:
                    "calc(100% - 18px) calc(50% - 2px), calc(100% - 12px) calc(50% - 2px)",
                  backgroundSize: "6px 6px, 6px 6px",
                  backgroundRepeat: "no-repeat",
                  paddingRight: "2.25rem",
                }}
              >
                <option value="">Selecione</option>
                {citiesForUf.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-[12px] bg-[#2d3a9c] px-7 text-[14px] font-bold text-white shadow-[0_10px_26px_rgba(45, 58, 156,0.3)] transition hover:bg-[#1f2b7e] md:self-end"
            >
              Ver ofertas
            </button>
          </div>
        </form>
        </div>
      </div>
    </section>
  );
}
