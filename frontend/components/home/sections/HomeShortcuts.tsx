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
 *   - Planos     → /planos                    (CTA premium adicionado em 2026-05-08)
 *
 * FIPE e Simulador NÃO aparecem aqui — ficam nos cards quick-action
 * (HomePrimaryActions) abaixo desta faixa, e também no header desktop.
 *
 * Os badges são PNGs extraídos diretamente do sprite oficial
 * (`banner e icones.png`) — preservam o anel com gradiente colorido
 * e o glifo dark navy idênticos ao mockup `pagina Home.png`.
 *
 * O ícone "Planos" usa SVG (anel gradient violeta→rosa + glifo de
 * estrela navy) — mantém o mesmo formato circular, espessura de anel
 * e cor de glifo dos PNGs irmãos. Next/Image renderiza com
 * `unoptimized` para SVG (transformação por extensão da string src).
 *
 * Layout:
 *   • Mobile (< md): carrossel horizontal scroll-snap (preservado).
 *   • Desktop (md+): centralizado, sem scroll, gap maior.
 *
 * Server Component — apenas composição.
 */

const SHORTCUTS = [
  { href: "/comprar", label: "Comprar", iconSrc: "/images/comprar.png" },
  { href: "/anunciar", label: "Vender", iconSrc: "/images/vender.png" },
  { href: "/blog", label: "Blog", iconSrc: "/images/blog.png" },
  {
    href: "/comprar?below_fipe=true",
    label: "Ofertas",
    iconSrc: "/images/ofertas.png",
  },
  {
    href: "/comprar?seller_type=dealer",
    label: "Lojas",
    iconSrc: "/images/lojas.png",
  },
  { href: "/favoritos", label: "Favoritos", iconSrc: "/images/favoritos.png" },
  { href: "/planos", label: "Planos", iconSrc: "/images/planos.svg" },
];

function isSvgSrc(src: string): boolean {
  return src.toLowerCase().endsWith(".svg");
}

export function HomeShortcuts() {
  return (
    <nav
      aria-label="Atalhos rápidos"
      className="mx-auto w-full max-w-8xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8"
    >
      <ul
        className={[
          // Mobile: carrossel scrollável com snap (mantém comportamento anterior).
          "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "sm:gap-4",
          // Desktop (md+): centraliza horizontalmente, remove scroll, espaça mais.
          "md:justify-center md:gap-6 md:overflow-visible md:snap-none",
        ].join(" ")}
      >
        {SHORTCUTS.map((s) => (
          <li key={s.href} className="snap-start shrink-0">
            <Link
              href={s.href}
              aria-label={s.label}
              className="flex shrink-0 items-center justify-center"
            >
              <Image
                src={s.iconSrc}
                alt={s.label}
                width={240}
                height={240}
                // SVG é tratado como já-otimizado (sem pipeline raster do Next).
                unoptimized={isSvgSrc(s.iconSrc)}
                className="h-28 w-28 object-contain mix-blend-multiply md:h-32 md:w-32"
                style={{ mixBlendMode: "multiply" }}
                priority
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
