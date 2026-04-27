// frontend/components/home/sections/HomePrimaryActions.tsx

import { QuickActionTile } from "@/components/ui/QuickActionTile";
import { IconCalculator, IconMegaphone, IconTable } from "@/components/home/icons";

/**
 * 3 cards quick-action lado a lado (1 col mobile, 3 col >= sm) abaixo do
 * banner herói da Home, conforme mockup `pagina Home.png`:
 *   - Anunciar grátis        → /anunciar/novo  (acento azul)
 *   - Tabela FIPE            → /tabela-fipe    (acento verde)
 *   - Simulador financiamento → /simulador-financiamento (acento roxo)
 *
 * Os tons (azul/verde/roxo) seguem o padrão visual do mockup, no qual cada
 * card tem um ícone circular colorido distinto para diferenciar a ação à
 * primeira vista.
 *
 * Server Component — apenas composição.
 */

const ACTIONS = [
  {
    href: "/anunciar/novo",
    title: "Anunciar grátis",
    subtitle: "É rápido e fácil",
    icon: <IconMegaphone className="h-full w-full" />,
    accent: "primary" as const,
  },
  {
    href: "/tabela-fipe",
    title: "Tabela FIPE",
    subtitle: "Consulte agora",
    icon: <IconTable className="h-full w-full" />,
    accent: "success" as const,
  },
  {
    href: "/simulador-financiamento",
    title: "Simulador de financiamento",
    subtitle: "Veja parcelas",
    icon: <IconCalculator className="h-full w-full" />,
    accent: "violet" as const,
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
