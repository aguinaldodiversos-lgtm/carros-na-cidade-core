import Link from "next/link";

import { formatTotal } from "@/lib/buy/catalog-helpers";

type BuyHeroProps = {
  cityName: string;
  totalAds: number;
};

export function BuyHero({ cityName, totalAds }: BuyHeroProps) {
  return (
    <div className="relative overflow-hidden border-b border-slate-200/80 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_55%,#eef2f7_100%)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 70% -10%, rgba(37,99,235,0.14), transparent 55%), radial-gradient(ellipse 60% 40% at 10% 100%, rgba(14,165,233,0.08), transparent 50%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid items-stretch gap-8 lg:grid-cols-[1fr_minmax(300px,400px)] lg:gap-12">
          <div className="flex flex-col justify-center">
            <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Catálogo regional
            </p>
            <h1 className="mt-2 max-w-[22ch] text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl lg:text-[2.45rem] lg:leading-[1.12]">
              Carros usados e seminovos em {cityName}
            </h1>
            <p className="mt-4 flex flex-wrap items-baseline gap-2 text-lg text-slate-600 md:text-xl">
              <span className="font-semibold text-slate-800">{formatTotal(totalAds)}</span>
              <span className="text-base font-medium text-slate-500 md:text-lg">
                anúncios no seu território
              </span>
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
              Compare com contexto local, filtros rápidos e oportunidades abaixo da FIPE — sem ruído
              desnecessário.
            </p>
          </div>

          <BuyPromoCard />
        </div>
      </div>
    </div>
  );
}

function BuyPromoCard() {
  return (
    <aside className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] sm:p-7">
      <div
        className="pointer-events-none absolute -right-8 top-0 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 right-12 h-24 w-24 rounded-full bg-sky-400/15 blur-2xl"
        aria-hidden
      />

      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700/90">
          Para vendedores
        </p>
        <h2 className="mt-2 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
          Venda mais rápido com destaque
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          Mais visibilidade no catálogo da sua cidade. Ideal para quem quer negociar com seriedade.
        </p>
      </div>

      <div className="relative mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/planos"
          className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          Patrocinar anúncio
        </Link>
        <span className="text-xs font-medium text-slate-400">Planos flexíveis · Cidade por cidade</span>
      </div>
    </aside>
  );
}
