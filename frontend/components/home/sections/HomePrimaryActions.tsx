// frontend/components/home/sections/HomePrimaryActions.tsx

import { QuickActionTile } from "@/components/ui/QuickActionTile";
import { IconCalculator, IconTable } from "@/components/home/icons";

/**
 * Cards quick-action "Ações rápidas" abaixo dos carrosséis (1 col mobile,
 * 2 col >= sm):
 *   - Tabela FIPE               → /tabela-fipe
 *   - Simulador financiamento   → /simulador-financiamento
 *
 * O card "Anuncie grátis" foi REMOVIDO na reestruturação 2026-07-11: virou
 * banner dedicado (`HomeAnnounceBanner`, seção 8), e manter os dois criava
 * dois CTAs idênticos competindo lado a lado.
 *
 * Todos os cards usam o mesmo acento azul primário (proposta minimalista
 * do PO em 2026-05-19). Ver QuickActionTile["accent"].
 *
 * Server Component — apenas composição.
 */

const ACTIONS = [
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
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
