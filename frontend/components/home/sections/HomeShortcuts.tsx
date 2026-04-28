// frontend/components/home/sections/HomeShortcuts.tsx

import Image from "next/image";
import Link from "next/link";

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
 *
 * Os badges são PNGs extraídos diretamente do sprite oficial
 * (`banner e icones.png`) — preservam o anel com gradiente colorido
 * e o glifo dark navy idênticos ao mockup `pagina Home.png`.
 *
 * Server Component — apenas composição.
 */

const SHORTCUTS = [
  { href: "/comprar", label: "Comprar", iconSrc: "/images/home-icons/comprar.png" },
  { href: "/anunciar", label: "Vender", iconSrc: "/images/home-icons/vender.png" },
  { href: "/blog", label: "Blog", iconSrc: "/images/home-icons/blog.png" },
  {
    href: "/comprar?below_fipe=true",
    label: "Ofertas",
    iconSrc: "/images/home-icons/ofertas.png",
  },
  {
    href: "/comprar?seller_type=dealer",
    label: "Lojas",
    iconSrc: "/images/home-icons/lojas.png",
  },
  { href: "/favoritos", label: "Favoritos", iconSrc: "/images/home-icons/favoritos.png" },
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
            <Link
              href={s.href}
              aria-label={s.label}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center md:w-20"
            >
              <Image
                src={s.iconSrc}
                alt=""
                width={80}
                height={80}
                className="h-16 w-16 object-contain md:h-20 md:w-20"
              />
              <span className="block w-full text-[11px] font-semibold leading-tight text-cnc-text md:text-xs">
                {s.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
