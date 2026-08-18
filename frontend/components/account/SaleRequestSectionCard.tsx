"use client";

import type { ReactNode } from "react";

/**
 * Cartão de uma seção da ficha de avaliação.
 *
 * Primitivo de LAYOUT, sem nenhuma regra de domínio: recebe o número, o título,
 * o estado (completa / com pendência) e o conteúdo. Existe para que as nove
 * seções tenham exatamente o mesmo espaçamento, a mesma tipografia e o mesmo
 * tratamento de erro — nove cabeçalhos escritos à mão divergiriam no primeiro
 * ajuste de padding.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ÍCONES SÃO SVG INLINE, NÃO BIBLIOTECA
 * ────────────────────────────────────────────────────────────────────────────
 * O projeto não tem pacote de ícones instalado, e trazer um (dezenas de
 * kilobytes e uma dependência a manter) para desenhar oito glifos de 16px seria
 * pagar caro por pouco. São traços simples, `currentColor`, sem preenchimento.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * COR NÃO É O ÚNICO SINAL
 * ────────────────────────────────────────────────────────────────────────────
 * Seção concluída tem o selo "Concluída" com um "✓" ao lado do texto, e seção
 * com pendência tem a mensagem escrita. Quem não distingue verde de cinza lê a
 * mesma informação.
 */

export type SectionIcon =
  | "car"
  | "star"
  | "tire"
  | "document"
  | "history"
  | "engine"
  | "paint"
  | "camera"
  | "note";

const ICON_PATHS: Record<SectionIcon, ReactNode> = {
  car: (
    <>
      <path d="M3 11l1.6-4.2A2 2 0 016.5 5.5h7A2 2 0 0115.4 6.8L17 11" />
      <path d="M2.5 11h15v4.5h-15z" />
      <circle cx="6" cy="15.5" r="1.4" />
      <circle cx="14" cy="15.5" r="1.4" />
    </>
  ),
  star: <path d="M10 3l2.2 4.5 5 .7-3.6 3.5.9 4.9L10 14.3 5.5 16.6l.9-4.9L2.8 8.2l5-.7z" />,
  tire: (
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="2.8" />
      <path d="M10 3.2v4M10 13v3.8M3.2 10h4M13 10h3.8" />
    </>
  ),
  document: (
    <>
      <path d="M5 2.8h6.5L15 6.3V17H5z" />
      <path d="M11.2 2.8v3.6H15" />
      <path d="M7.5 10.5h5M7.5 13.3h5" />
    </>
  ),
  history: (
    <>
      <path d="M3.6 10a6.4 6.4 0 106.4-6.4A6.4 6.4 0 005 6" />
      <path d="M3.2 3.2v3.2h3.2" />
      <path d="M10 6.6V10l2.4 1.6" />
    </>
  ),
  engine: (
    <>
      <path d="M3 8.5h2.2l1.6-2h4.4l1.6 2H17v5h-2.4l-1.4 2H7.2l-1.6-2H3z" />
      <path d="M8 4.2h4" />
    </>
  ),
  paint: (
    <>
      <path d="M4 4.5h8.5v4H4z" />
      <path d="M12.5 6.5H16v3.2a1.6 1.6 0 01-1.6 1.6h-2.6" />
      <path d="M10.6 11.3h1.6v5.2h-1.6z" />
    </>
  ),
  camera: (
    <>
      <path d="M2.8 6.8h3l1.2-2h6l1.2 2h3v9.4h-14.4z" />
      <circle cx="10" cy="11.4" r="3" />
    </>
  ),
  note: (
    <>
      <path d="M3.5 4h13v9.5h-8L5 17v-3.5H3.5z" />
      <path d="M6.6 7.6h6.8M6.6 10.3h4.4" />
    </>
  ),
};

function Icon({ name }: { name: SectionIcon }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export default function SaleRequestSectionCard({
  index,
  title,
  icon,
  description,
  complete = false,
  showStatus = false,
  optional = false,
  anchorId,
  children,
}: {
  index: number;
  title: string;
  icon: SectionIcon;
  description?: string;
  /** Derivado de `buildValidationState` — nunca de estado próprio do cartão. */
  complete?: boolean;
  /**
   * O selo só aparece depois da PRIMEIRA tentativa de envio.
   *
   * Antes disso, marcar de vermelho ou de cinza um campo que a pessoa ainda nem
   * chegou a ler transforma um formulário recém-aberto numa lista de falhas.
   */
  showStatus?: boolean;
  optional?: boolean;
  anchorId?: string;
  children: ReactNode;
}) {
  const headingId = `sr-section-${index}`;

  return (
    <section
      id={anchorId}
      aria-labelledby={headingId}
      className="scroll-mt-24 rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5"
      data-testid={anchorId}
      data-complete={complete ? "true" : "false"}
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EEF4FF] text-[#1F66E5]"
          aria-hidden="true"
        >
          <Icon name={icon} />
        </span>

        <h2 id={headingId} className="text-[15px] font-bold text-[#161f34] sm:text-base">
          {index}. {title}
        </h2>

        {optional ? (
          <span className="rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[11px] font-semibold text-[#475467]">
            Opcional
          </span>
        ) : null}

        {showStatus && !optional ? (
          complete ? (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[11px] font-bold text-[#027A48]"
              data-testid={`${anchorId}-status`}
            >
              <span aria-hidden="true">✓</span> Concluída
            </span>
          ) : (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#FEF3F2] px-2.5 py-1 text-[11px] font-bold text-[#b42318]"
              data-testid={`${anchorId}-status`}
            >
              Falta responder
            </span>
          )
        ) : null}
      </header>

      {description ? (
        <p className="mb-4 -mt-1 text-[13px] leading-relaxed text-[#64748b]">{description}</p>
      ) : null}

      {children}
    </section>
  );
}
