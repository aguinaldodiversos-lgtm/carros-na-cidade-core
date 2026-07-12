// frontend/components/home/sections/HomeAnnounceBanner.tsx

import Image from "next/image";
import Link from "next/link";

/**
 * Banner "Anuncie Grátis" (reestruturação 2026-07-11).
 *
 * DOIS modos por breakpoint — mesmo padrão de toggle do HomeHero
 * (`md:hidden` mobile / `hidden md:block` desktop), sem <picture>/srcset:
 *
 *   - Desktop (md+): a arte pronta `/images/anuncie-gratis.png` (banner
 *     horizontal ~5:1 com headline, bullets e CTA já embutidos). Como o
 *     texto é rasterizado, a imagem carrega `alt` descritivo.
 *   - Mobile (< md): a arte larga fica ilegível (~69px de altura), então
 *     NÃO usamos texto rasterizado. Compomos o banner em HTML/CSS com texto
 *     REAL: fundo navy da marca, título/subtítulo e um botão "Cadastrar
 *     anúncio" com alvo de toque ≥ 44px. Sem carro: o recorte da ilustração
 *     do asset arrasta texto-fantasma sobreposto ("GRÁTIS"/"sem custo"), e
 *     texto nítido sem carro é melhor que carro com emenda.
 *
 * O banner inteiro é UM único <Link> para /anunciar (clicável por completo).
 * O <Link> NÃO tem aria-label próprio de propósito: assim o nome acessível
 * vem do conteúdo VISÍVEL de cada breakpoint (alt da imagem no desktop, texto
 * real no mobile), sem leitura duplicada — o bloco do outro breakpoint fica
 * `display:none` e some da árvore de acessibilidade.
 *
 * Server Component.
 */

const ANNOUNCE_BANNER_ALT =
  "Anuncie grátis — publique seu veículo no portal e venda sem custo. Cadastrar anúncio.";

/** Ícone de envio (avião de papel) — decorativo, espelha o CTA da arte desktop. */
function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

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
        {/* Mobile (< md): composição HTML/CSS com texto REAL — nada rasterizado. */}
        <div className="bg-gradient-to-br from-[#010E3C] to-[#0A1F5C] px-5 py-6 md:hidden">
          <p className="text-[26px] font-extrabold leading-[1.1] tracking-tight text-white">
            Anuncie <span className="text-[#0EBEFE]">grátis</span>
          </p>
          <p className="mt-2 max-w-[36ch] text-sm leading-snug text-white/80">
            Publique seu veículo no portal e venda sem custo.
          </p>
          <span className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#F79009] px-6 py-2.5 text-[15px] font-extrabold text-[#0C155B] shadow-[0_6px_16px_rgba(247,144,9,0.35)]">
            <SendIcon />
            Cadastrar anúncio
          </span>
        </div>

        {/* Desktop (md+): arte pronta com texto assado — alt descritivo. */}
        <div className="hidden md:block">
          <Image
            src="/images/anuncie-gratis.png"
            alt={ANNOUNCE_BANNER_ALT}
            width={2804}
            height={561}
            sizes="(min-width: 1280px) 1440px, 100vw"
            className="h-auto w-full"
          />
        </div>
      </Link>
    </section>
  );
}
