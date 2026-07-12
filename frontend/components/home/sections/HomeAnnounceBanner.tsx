// frontend/components/home/sections/HomeAnnounceBanner.tsx

import Image from "next/image";
import Link from "next/link";

/**
 * Banner "Anuncie Grátis" (reestruturação 2026-07-11).
 *
 * Peça publicitária COMPLETA (arte com headline, bullets e CTA "Cadastrar
 * anúncio" já embutidos na imagem `/images/anuncie-gratis.png`). Por isso
 * NÃO sobrepomos texto/CTA próprios — o banner inteiro é um único <Link>
 * para /anunciar, evitando link aninhado e poluição da arte.
 *
 * Responsividade: a arte é um banner horizontal largo (~5:1). Usamos
 * `h-auto w-full` para escalar proporcionalmente em qualquer viewport —
 * a imagem inteira sempre aparece, então o CTA à direita NUNCA é cortado
 * no mobile (requisito do briefing). Não há crop dedicado de mobile.
 *
 * Server Component.
 */

const ANNOUNCE_BANNER_ALT =
  "Anuncie grátis — publique seu veículo no portal e venda sem custo. Cadastrar anúncio.";

export function HomeAnnounceBanner() {
  return (
    <section
      aria-label="Anuncie grátis"
      className="mx-auto w-full max-w-8xl px-4 pt-6 sm:px-6 sm:pt-9 lg:px-8"
    >
      <Link
        href="/anunciar"
        aria-label="Anuncie grátis — cadastrar anúncio"
        className="block overflow-hidden rounded-2xl shadow-premium outline-none transition hover:shadow-card focus-visible:ring-2 focus-visible:ring-primary/50 md:rounded-3xl"
      >
        <Image
          src="/images/anuncie-gratis.png"
          alt={ANNOUNCE_BANNER_ALT}
          width={2804}
          height={561}
          sizes="(min-width: 1280px) 1440px, 100vw"
          className="h-auto w-full"
        />
      </Link>
    </section>
  );
}
