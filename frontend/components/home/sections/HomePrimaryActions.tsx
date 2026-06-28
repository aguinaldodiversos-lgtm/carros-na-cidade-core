// frontend/components/home/sections/HomePrimaryActions.tsx

import { QuickActionTile } from "@/components/ui/QuickActionTile";
import { IconCalculator, IconPlus, IconTable } from "@/components/home/icons";

/**
 * 3 cards quick-action lado a lado (1 col mobile, 3 col >= sm) abaixo do
 * banner herói da Home, conforme contrato visual `atualização-home.png`
 * (revisão 2026-05-19):
 *   - Anuncie seu carro grátis  → /anunciar  (landing comercial indexável;
 *                                 antes apontava p/ /anunciar/novo, agora
 *                                 `noindex` — SEO 2026-06-27)
 *   - Tabela FIPE               → /tabela-fipe
 *   - Simulador financiamento   → /simulador-financiamento
 *
 * Diferente do mockup anterior (azul/verde/roxo), nesta revisão TODOS os
 * cards usam o mesmo acento azul primário — proposta minimalista
 * solicitada pelo PO em 2026-05-19. Ver QuickActionTile["accent"].
 *
 * Server Component — apenas composição.
 */

const ACTIONS = [
  {
    href: "/anunciar",
    title: "Anuncie seu carro grátis",
    subtitle: "Publique em poucos minutos",
    icon: <IconPlus className="h-full w-full" />,
    accent: "primary" as const,
  },
  {
    href: "/tabela-fipe",
    title: "Tabela FIPE",
    subtitle: "Consulte agora",
    icon: <IconTable className="h-full w-full" />,
    accent: "primary" as const,
  },
  {
    href: "/simulador-financiamento",
    title: "Simulador de financiamento",
    subtitle: "Veja parcelas",
    icon: <IconCalculator className="h-full w-full" />,
    accent: "primary" as const,
  },
];

export function HomePrimaryActions() {
  return (
    <section
      aria-label="Ações rápidas"
      className="mx-auto w-full max-w-8xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {ACTIONS.map((a) => (
          <QuickActionTile
            key={a.href}
            href={a.href}
            title={a.title}
            subtitle={a.subtitle}
            icon={a.icon}
            accent={a.accent}
          />
        ))}
      </div>
    </section>
  );
}
