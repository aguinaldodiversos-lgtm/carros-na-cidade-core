import Link from "next/link";

/**
 * Um dos DOIS caminhos do hub.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O CARTÃO EXISTE PARA RESPONDER UMA PERGUNTA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 * "Eu quero VENDER do meu estoque ou COMPRAR para repor?"
 *
 * Tudo aqui serve a essa distinção: a cor da ilustração, o verbo do título, os
 * três itens da lista e o texto do botão. O lojista precisa bater o olho e
 * saber para qual lado ir — se ele tiver de ler os dois cartões inteiros para
 * decidir, o hub falhou.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * "COMO FUNCIONA" APONTA PARA UM LUGAR QUE EXISTE
 * ════════════════════════════════════════════════════════════════════════════
 * A âncora leva à seção didática da própria página, logo abaixo. Não é um vídeo,
 * não é um modal e não é uma página futura: é o conteúdo que já está a uma
 * rolagem de distância. Um link que promete explicação e não entrega nenhuma é
 * pior que a ausência do link.
 *
 * `scroll-mt` no destino compensa o cabeçalho fixo — sem ele a âncora encosta o
 * título embaixo da barra.
 */

export type ChoiceTone = "blue" | "teal";

const TONE = {
  blue: {
    card: "border-[#DBE7FB] bg-[linear-gradient(160deg,#F7FAFF_0%,#FFFFFF_58%)]",
    check: "text-[#0e62d8]",
    button:
      "bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] shadow-[0_8px_24px_rgba(14,98,216,0.25)]",
    link: "text-[#0e62d8]",
  },
  teal: {
    card: "border-[#CDEEE4] bg-[linear-gradient(160deg,#F5FCFA_0%,#FFFFFF_58%)]",
    check: "text-[#0E9384]",
    button:
      "bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] shadow-[0_8px_24px_rgba(14,98,216,0.25)]",
    link: "text-[#0e62d8]",
  },
} as const;

export default function OpportunityHubChoiceCard({
  tone,
  art,
  title,
  description,
  benefits,
  ctaLabel,
  ctaHref,
  howItWorksHref,
  testId,
  ctaTestId,
}: {
  tone: ChoiceTone;
  art: React.ReactNode;
  title: string;
  description: string;
  benefits: readonly string[];
  ctaLabel: string;
  ctaHref: string;
  howItWorksHref: string;
  testId: string;
  ctaTestId: string;
}) {
  const style = TONE[tone];

  return (
    <article
      className={`flex flex-col rounded-2xl border p-5 sm:p-6 ${style.card}`}
      data-testid={testId}
    >
      {/*
        A ilustração e o texto dividem a linha a partir de `sm`, e empilham
        abaixo disso. `items-center` alinha o bloco de texto pelo centro da
        figura — encostá-lo no topo deixaria um vão sob o texto sempre que a
        figura fosse mais alta, que é o caso nas duas.
      */}
      <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="mx-auto w-[62%] shrink-0 sm:mx-0 sm:w-[42%]">{art}</div>

        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-bold leading-tight text-[#161f34] sm:text-[21px]">
            {title}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#667085]">{description}</p>

          <ul className="mt-3.5 space-y-2">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 ${style.check}`} aria-hidden="true">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.7a1 1 0 0 0-1.4-1.4L9 10.2 7.7 8.9a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span className="text-[13px] leading-snug text-[#475467]">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/*
        As AÇÕES ficam no rodapé do cartão, na largura inteira. `mt-auto` é o que
        alinha os dois botões dos dois cartões na mesma altura mesmo quando um
        texto é uma linha mais longo que o outro — sem ele, o par fica
        visivelmente torto no desktop.
      */}
      <div className="mt-5 sm:mt-6">
        <Link
          href={ctaHref}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-2 ${style.button}`}
          data-testid={ctaTestId}
        >
          {ctaLabel}
          <span aria-hidden="true">→</span>
        </Link>

        <a
          href={howItWorksHref}
          className={`mt-3 flex items-center justify-center gap-1.5 text-[13px] font-bold hover:underline ${style.link}`}
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.6 6.8a.8.8 0 0 0-1.2.7v5a.8.8 0 0 0 1.2.7l4.2-2.5a.8.8 0 0 0 0-1.4L8.6 6.8Z"
              clipRule="evenodd"
            />
          </svg>
          Como funciona
        </a>
      </div>
    </article>
  );
}
