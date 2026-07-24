// frontend/components/home/sections/HomeAnnounceBanner.tsx

import Image from "next/image";
import Link from "next/link";

/**
 * Banner "Anuncie Grátis".
 *
 * DOIS modos por breakpoint — mesmo padrão de toggle do HomeHero
 * (`md:hidden` mobile / `hidden md:block` desktop), sem <picture>/srcset:
 * cada breakpoint tem sua ARTE PRÓPRIA, com headline, subtítulo e CTA
 * "Cadastrar anúncio" já embutidos na imagem (texto rasterizado, nada em HTML).
 *
 *   - Desktop (md+): `/images/banner-anuncio-gratis-home-desktop.png` (horizontal 4:1).
 *   - Mobile (< md): `/images/banner-anuncio-gratis-home-mobile.png` (vertical ~0.8:1).
 *
 * Ambas carregam o mesmo `alt` descritivo. O banner inteiro é UM único <Link>
 * para /anunciar (clicável por completo). O <Link> NÃO tem aria-label próprio:
 * o nome acessível vem do `alt` da imagem visível; o bloco do outro breakpoint
 * fica `display:none` e some da árvore de acessibilidade.
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
        className="block overflow-hidden rounded-2xl shadow-premium outline-none transition hover:shadow-card focus-visible:ring-2 focus-visible:ring-primary/50 md:rounded-3xl"
      >
        {/* Mobile (< md): arte vertical dedicada com texto assado — alt descritivo. */}
        <div className="md:hidden">
          <Image
            src="/images/banner-anuncio-gratis-home-mobile.png"
            alt={ANNOUNCE_BANNER_ALT}
            width={1122}
            height={1402}
            sizes="100vw"
            className="h-auto w-full"
          />
        </div>

        {/* Desktop (md+): arte horizontal dedicada com texto assado — alt descritivo. */}
        <div className="hidden md:block">
          <Image
            src="/images/banner-anuncio-gratis-home-desktop.png"
            alt={ANNOUNCE_BANNER_ALT}
            width={2048}
            height={512}
            sizes="(min-width: 1280px) 1440px, 100vw"
            className="h-auto w-full"
          />
        </div>
      </Link>
    </section>
  );
}
