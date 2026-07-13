// frontend/components/fipe/BelowFipeBanner.tsx
import Image from "next/image";
import Link from "next/link";

/**
 * Banner "Ver carros abaixo da FIPE em [cidade]" — substitui o antigo card de
 * texto no fim da /tabela-fipe/[cidade].
 *
 * DUAS camadas (a arte é SÓ fundo — não tem texto nem botão embutidos):
 *   - Arte via dual-<Image> com toggle por breakpoint (padrão HomeHero /
 *     HomeAnnounceBanner, sem <picture>/srcset).
 *       · Desktop (md+): 2508×627, carro à direita → espaço livre à ESQUERDA.
 *       · Mobile (< md): 1122×1402 (retrato), carro embaixo → livre no TOPO.
 *   - Texto REAL em HTML por cima, posicionado na zona livre de cada arte
 *     (esquerda no desktop, topo no mobile) — nunca sobre o carro.
 *
 * A imagem é decorativa (`alt=""`); o nome acessível do <Link> vem do texto
 * real, sem leitura duplicada. Banner inteiro clicável → `href`.
 */

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function CtaPill() {
  return (
    <span className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 text-[14px] font-bold text-white shadow-card transition group-hover:bg-primary-strong">
      Ver ofertas
      <ArrowRightIcon />
    </span>
  );
}

export function BelowFipeBanner({ cityName, href }: { cityName: string; href: string }) {
  const title = `Ver carros abaixo da FIPE em ${cityName}`;
  const subtitle = "Encontre ofertas imperdíveis perto de você.";

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-2xl shadow-card outline-none transition hover:shadow-premium focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {/* Desktop (md+): arte horizontal, texto à ESQUERDA. */}
      <div className="relative hidden aspect-[2508/627] w-full md:block">
        <Image
          src="/images/banner-abaixo-da-fipe-desktop.png"
          alt=""
          fill
          sizes="(min-width: 1024px) 1024px, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-[52%] pl-6 lg:pl-10">
            <h3 className="text-[19px] font-extrabold leading-tight tracking-tight text-cnc-text-strong lg:text-[24px]">
              {title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-snug text-cnc-muted lg:text-[15px]">
              {subtitle}
            </p>
            <CtaPill />
          </div>
        </div>
      </div>

      {/* Mobile (< md): arte retrato, texto no TOPO. */}
      <div className="relative block aspect-[1122/1402] w-full md:hidden">
        <Image
          src="/images/banner-abaixo-da-fipe-mobile.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-x-0 top-0 flex flex-col items-start p-5">
          <h3 className="max-w-[88%] text-[20px] font-extrabold leading-tight tracking-tight text-cnc-text-strong">
            {title}
          </h3>
          <p className="mt-1.5 max-w-[82%] text-[13.5px] leading-snug text-cnc-muted">{subtitle}</p>
          <CtaPill />
        </div>
      </div>
    </Link>
  );
}
