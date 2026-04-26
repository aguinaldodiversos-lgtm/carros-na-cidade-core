// frontend/components/home/sections/ExploreByState.tsx

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { SectionHeader as DSSectionHeader } from "@/components/ui/SectionHeader";
import { IconPin } from "@/components/home/icons";
import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";

/**
 * PR G — ExploreByState refatorado.
 *
 * Mantém função (atalhos por estado linkando para /comprar/estado/[uf])
 * mas substitui hex hardcoded por tokens do DS e usa <Card> + <DSSectionHeader>.
 *
 * Server Component.
 */

type StateItem = {
  uf: string;
  name: string;
  offers: number;
};

const FALLBACK_STATES: StateItem[] = [
  { uf: "SP", name: "São Paulo", offers: 0 },
  { uf: "RJ", name: "Rio de Janeiro", offers: 0 },
  { uf: "MG", name: "Minas Gerais", offers: 0 },
  { uf: "PR", name: "Paraná", offers: 0 },
  { uf: "SC", name: "Santa Catarina", offers: 0 },
  { uf: "RS", name: "Rio Grande do Sul", offers: 0 },
];

function MiniMapIcon({ uf }: { uf: string }) {
  return (
    <svg
      viewBox="0 0 48 40"
      className="h-8 w-10 text-cnc-line-strong"
      fill="currentColor"
      aria-hidden
    >
      <path d="M5 10c3-4 7-6 12-6 4 0 7 2 10 3 4 1 8-1 12 1s4 6 3 10-4 6-5 10c-1 3-3 6-7 7-5 1-9-1-14-2s-9 0-12-4c-2-3-2-8-1-12 0-3 1-5 2-7Z" />
      <text
        x="24"
        y="25"
        textAnchor="middle"
        fontSize="10"
        fontWeight="800"
        className="fill-primary-strong"
        fontFamily="system-ui, sans-serif"
      >
        {uf}
      </text>
    </svg>
  );
}

type RawStateAggregation = { uf: string; offers: number | string };

function normalizeItems(raw: RawStateAggregation[] | undefined): StateItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return FALLBACK_STATES;

  const normalized: StateItem[] = [];
  for (const entry of raw) {
    const uf = String(entry?.uf || "")
      .toUpperCase()
      .trim();
    if (!/^[A-Z]{2}$/.test(uf)) continue;
    const match = BRAZIL_UFS.find((item) => item.value === uf);
    if (!match) continue;
    const offersRaw = Number(entry?.offers || 0);
    const offers = Number.isFinite(offersRaw) ? offersRaw : 0;
    normalized.push({ uf, name: String(match.label), offers });
  }

  return normalized.length > 0 ? normalized.slice(0, 6) : FALLBACK_STATES;
}

export function ExploreByState({ items }: { items?: RawStateAggregation[] }) {
  const rows = normalizeItems(items);

  return (
    <section className="mx-auto w-full max-w-8xl px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8 lg:pt-12">
      <DSSectionHeader
        as="h2"
        title="Explore por estado"
        description="Encontre veículos com o preço abaixo da tabela FIPE."
        variant="with-icon"
        icon={<IconPin className="h-5 w-5" />}
        seeAllHref="/comprar"
        seeAllLabel="Ver todos"
        className="mb-4 sm:mb-6"
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-5 md:gap-4">
        {rows.map((state) => (
          <Link
            key={state.uf}
            href={`/comprar/estado/${state.uf.toLowerCase()}`}
            className="group block"
          >
            <Card
              variant="default"
              padding="sm"
              className="flex h-full items-center gap-2.5 transition group-hover:-translate-y-0.5 group-hover:border-primary group-hover:shadow-premium sm:gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft sm:h-10 sm:w-10">
                <MiniMapIcon uf={state.uf} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold leading-tight text-cnc-text-strong sm:text-sm">
                  {state.name}
                </p>
                <p className="mt-0.5 text-[11px] text-primary sm:text-xs">
                  {state.offers > 0
                    ? `${state.offers.toLocaleString("pt-BR")} ofertas`
                    : "Ver ofertas"}
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
