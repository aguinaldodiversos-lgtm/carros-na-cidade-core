import Link from "next/link";

import { IconBook } from "@/components/home/icons";
import { SectionHeader } from "./SectionHeader";

type StateItem = {
  uf: string;
  name: string;
  offers: number;
};

const DEFAULT_STATES: StateItem[] = [
  { uf: "MG", name: "Minas Gerais", offers: 4377 },
  { uf: "RJ", name: "Rio de Janeiro", offers: 6305 },
  { uf: "PR", name: "Paraná", offers: 4977 },
  { uf: "SC", name: "Santa Catarina", offers: 4992 },
  { uf: "RS", name: "Rio Grande do Sul", offers: 6552 },
];

function MiniMapIcon({ uf }: { uf: string }) {
  return (
    <svg viewBox="0 0 48 40" className="h-8 w-10 text-[#a5b0dd]" fill="currentColor" aria-hidden>
      <path d="M5 10c3-4 7-6 12-6 4 0 7 2 10 3 4 1 8-1 12 1s4 6 3 10-4 6-5 10c-1 3-3 6-7 7-5 1-9-1-14-2s-9 0-12-4c-2-3-2-8-1-12 0-3 1-5 2-7Z" />
      <text
        x="24"
        y="25"
        textAnchor="middle"
        fontSize="10"
        fontWeight="800"
        fill="#2d3a9c"
        fontFamily="system-ui, sans-serif"
      >
        {uf}
      </text>
    </svg>
  );
}

export function ExploreByState({ items = DEFAULT_STATES }: { items?: StateItem[] }) {
  return (
    <section className="mx-auto w-full max-w-[1240px] px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8">
      <SectionHeader
        icon={<IconBook className="h-6 w-6" />}
        title="Explore por estado"
        subtitle="Encontre veículos com o preço abaixo da tabela FIPE."
        link={{ label: "Ver todos os estados", href: "/comprar" }}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
        {items.map((state) => (
          <Link
            key={state.uf}
            href={`/comprar?uf=${encodeURIComponent(state.uf)}`}
            className="group flex items-center gap-3 rounded-[14px] border border-[#e7e8f1] bg-white px-4 py-3.5 transition hover:-translate-y-0.5 hover:border-[#a5b0dd] hover:shadow-[0_10px_24px_rgba(45, 58, 156,0.08)]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#eef1f9]">
              <MiniMapIcon uf={state.uf} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-bold leading-tight text-[#1a1f36]">
                {state.name}
              </p>
              <p className="mt-0.5 text-[12px] text-[#2d3a9c]">
                {state.offers.toLocaleString("pt-BR")} ofertas
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
