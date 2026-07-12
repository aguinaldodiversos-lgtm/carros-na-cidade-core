// frontend/components/home/sections/HomeProfileSearch.tsx

import Link from "next/link";

import { SectionHeader as DSSectionHeader } from "@/components/ui/SectionHeader";
import { IconStar } from "@/components/home/icons";
import type { HomeProfileChip } from "@/lib/home/home-discovery";

/**
 * Seção "Busca por perfil" (reestruturação 2026-07-11).
 *
 * Chips temáticos que levam a listagens filtradas (Primeiro carro, Para
 * família, Uber / 99, Econômicos, Abaixo da FIPE). Os itens são RESOLVIDOS
 * em runtime por `fetchHomeDiscovery` — cada chip que aparece aqui já foi
 * validado como tendo ao menos 1 anúncio ativo no estado em foco. Portanto
 * este componente é puramente de apresentação: se `profiles` vem vazio, a
 * seção inteira desaparece (nada de link para página vazia).
 *
 * Server Component.
 */

export function HomeProfileSearch({ profiles }: { profiles: HomeProfileChip[] }) {
  if (!profiles || profiles.length === 0) return null;

  return (
    <section
      aria-label="Busca por perfil"
      className="mx-auto w-full max-w-8xl px-4 pt-6 sm:px-6 sm:pt-9 lg:px-8"
    >
      <DSSectionHeader
        as="h2"
        title="Busca por perfil"
        description="Atalhos para encontrar o carro certo para o seu momento."
        variant="with-icon"
        icon={<IconStar className="h-5 w-5" />}
        className="mb-4 sm:mb-5"
      />

      <ul className="flex flex-wrap gap-2.5 sm:gap-3">
        {profiles.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              className="inline-flex items-center rounded-full border border-cnc-line bg-cnc-surface px-4 py-2.5 text-[13.5px] font-semibold text-cnc-text-strong shadow-card transition hover:-translate-y-0.5 hover:border-primary hover:text-primary hover:shadow-premium sm:text-sm"
            >
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
