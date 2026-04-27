// frontend/components/home/sections/HomePrimaryActions.tsx

import { QuickActionTile } from "@/components/ui/QuickActionTile";
import { IconCalculator, IconMegaphone, IconTable } from "@/components/home/icons";

/**
 * 3 cards quick-action lado a lado (1 col mobile, 3 col >= sm) abaixo dos
 * atalhos circulares da Home, conforme mockup `pagina Home.png`:
 *   - Anunciar grátis  → /anunciar/novo
 *   - Tabela FIPE      → /tabela-fipe
 *   - Simulador        → /simulador-financiamento
 *
 * Substituiu o `PromoCarousel` (carrossel) — mockup pede 3 cards visíveis
 * simultaneamente, sem snap-scroll. Para FIPE/Simulador, este é o ponto
 * canônico de entrada na Home (já que foram tirados da faixa circular para
 * seguir o set do mockup: Comprar/Vender/Blog/Ofertas/Lojas/Favoritos).
 *
 * Server Component — apenas composição.
 */

const ACTIONS = [
  {
    href: "/anunciar/novo",
    title: "Anunciar grátis",
    subtitle: "Publique em minutos",
    icon: <IconMegaphone className="h-full w-full" />,
  },
  {
    href: "/tabela-fipe",
    title: "Tabela FIPE",
    subtitle: "Consulte o valor de mercado",
    icon: <IconTable className="h-full w-full" />,
  },
  {
    href: "/simulador-financiamento",
    title: "Simulador de financiamento",
    subtitle: "Calcule sua parcela",
    icon: <IconCalculator className="h-full w-full" />,
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
          />
        ))}
      </div>
    </section>
  );
}
