// frontend/components/home/sections/HomeShortcuts.tsx

import { ActionShortcut } from "@/components/ui/ActionShortcut";
import {
  IconBook,
  IconCarFront,
  IconHeart,
  IconKey,
  IconPriceTag,
  IconShield,
} from "@/components/home/icons";

/**
 * Faixa de atalhos circulares — equivalente "stories" mas com ações
 * úteis (sem FOMO, sem badge automática "novo").
 *
 * Set canônico (contrato visual oficial — mockup `pagina Home.png`):
 *   - Comprar    → /comprar
 *   - Vender     → /anunciar
 *   - Blog       → /blog
 *   - Ofertas    → /comprar?below_fipe=true   (oportunidades destacadas)
 *   - Lojas      → /comprar?seller_type=dealer
 *   - Favoritos  → /favoritos
 *
 * FIPE e Simulador NÃO aparecem aqui — ficam nos cards quick-action
 * (HomePrimaryActions) abaixo desta faixa, e também no header desktop.
 * Regra do redesign: 1 só ponto canônico por função, sem duplicar perto
 * da dobra.
 *
 * Server Component — apenas composição.
 */

const SHORTCUTS = [
  {
    href: "/comprar",
    label: "Comprar",
    icon: <IconCarFront className="h-7 w-7" />,
    variant: "default" as const,
  },
  {
    href: "/anunciar",
    label: "Vender",
    icon: <IconKey className="h-7 w-7" />,
    variant: "default" as const,
  },
  {
    href: "/blog",
    label: "Blog",
    icon: <IconBook className="h-7 w-7" />,
    variant: "default" as const,
  },
  {
    href: "/comprar?below_fipe=true",
    label: "Ofertas",
    icon: <IconPriceTag className="h-7 w-7" />,
    variant: "highlight" as const,
  },
  {
    href: "/comprar?seller_type=dealer",
    label: "Lojas",
    icon: <IconShield className="h-7 w-7" />,
    variant: "default" as const,
  },
  {
    href: "/favoritos",
    label: "Favoritos",
    icon: <IconHeart className="h-7 w-7" />,
    variant: "default" as const,
  },
];

export function HomeShortcuts() {
  return (
    <nav
      aria-label="Atalhos rápidos"
      className="mx-auto w-full max-w-8xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8"
    >
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-5 md:justify-center md:overflow-visible [&::-webkit-scrollbar]:hidden">
        {SHORTCUTS.map((s) => (
          <li key={s.href} className="snap-start">
            <ActionShortcut href={s.href} label={s.label} icon={s.icon} variant={s.variant} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
