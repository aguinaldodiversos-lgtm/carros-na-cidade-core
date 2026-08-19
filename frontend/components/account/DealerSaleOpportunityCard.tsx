"use client";

import Link from "next/link";
import {
  DECLARED_CONDITION_LABEL,
  FUEL_LABEL,
  TRANSMISSION_LABEL,
  describeVehicle,
  formatCity,
  formatMileage,
  formatMoneyValue,
  formatPublishedAt,
  readCautionReport,
  readYesNoUnknown,
  type DealerSaleOpportunitySummary,
} from "@/lib/sale-requests/dealer-api";

/**
 * Card de um veículo disponível para avaliação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A FOTO É A PROTAGONISTA
 * ────────────────────────────────────────────────────────────────────────────
 * A versão anterior deste card dava à foto a mesma importância que a seis
 * etiquetas de texto, e o resultado parecia uma linha de tabela administrativa
 * com uma imagem em cima. Num catálogo de veículos, a foto é o primeiro filtro
 * que o comprador aplica — antes de ler qualquer especificação, ele decide se
 * vale olhar.
 *
 * Por isso a imagem ocupa o topo inteiro em 4:3, sem margem, e o bloco de texto
 * abaixo foi comprimido para o que se lê em três segundos: o veículo, a linha de
 * especificação, a condição, dois sinais de risco e a disputa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE SAIU, E POR QUÊ
 * ────────────────────────────────────────────────────────────────────────────
 * A referência visual traz coração de favoritar, selos "Urgente"/"Bom potencial"
 * e dois CTAs ("Avaliar agora" + "Ver detalhes"). Nenhum dos três entrou:
 *
 *   • favoritar não tem entidade de persistência — o coração seria um botão que
 *     esquece o clique ao recarregar;
 *   • "Urgente" e "Bom potencial" não têm algoritmo por trás. Um selo desses faz
 *     o lojista priorizar por um sinal que o sistema não possui;
 *   • dois CTAs para a mesma página custam um momento de decisão por card e não
 *     mudam nada no destino.
 *
 * O único sinal temporal é "há N dias", derivado de `created_at`.
 */

/**
 * Ponto colorido + texto — a leitura de estado do card.
 *
 * A cor acompanha, mas nunca carrega sozinha: quem não distingue verde de âmbar
 * lê o mesmo texto que todo mundo.
 */
function ConditionDot({ label, tone }: { label: string; tone: "good" | "warn" | "bad" }) {
  const dot =
    tone === "good" ? "bg-[#12B76A]" : tone === "warn" ? "bg-[#F79009]" : "bg-[#F04438]";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#344054]">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Sinal de risco compacto: ✓ quando não há apontamento, ⚠ quando há.
 *
 * `null` some do card — nunca vira "Não informado". Um card não é lugar de
 * declarar ausência: quem precisa da ficha completa abre o detalhe.
 */
function RiskChip({ label, ok }: { label: string | null; ok: boolean }) {
  if (!label) return null;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium leading-none ${
        ok ? "bg-[#F2F8F5] text-[#067647]" : "bg-[#FFF8F0] text-[#B54708]"
      }`}
    >
      <span aria-hidden="true">{ok ? "✓" : "⚠"}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Placeholder quando a solicitação não tem foto. */
function PhotoPlaceholder() {
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-[#F1F4F9] text-[#C3CDDE]"
      data-testid="dealer-sale-opportunity-no-photo"
    >
      <svg
        viewBox="0 0 40 40"
        className="h-10 w-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 14h4l2.4-3.4h15.2L30 14h4v12H6z" />
        <circle cx="20" cy="20" r="4.6" />
      </svg>
    </div>
  );
}

/** "45.000 km · Flex · Automático" — os três números que o lojista compara. */
function specLine(opportunity: DealerSaleOpportunitySummary): string {
  return [
    formatMileage(opportunity.mileage),
    FUEL_LABEL[opportunity.fuel_type] || opportunity.fuel_type,
    TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission,
  ]
    .filter(Boolean)
    .join(" · ");
}

const CONDITION_TONE: Record<string, "good" | "warn" | "bad"> = {
  excelente: "good",
  bom: "good",
  regular: "warn",
  precisa_reparos: "bad",
};

export default function DealerSaleOpportunityCard({
  opportunity,
  basePath,
  /** Query preservada no link (a loja escolhida, quando há mais de uma). */
  query = "",
}: {
  opportunity: DealerSaleOpportunitySummary;
  basePath: string;
  query?: string;
}) {
  const { evaluation } = opportunity;

  const auction = readYesNoUnknown(evaluation.auction_history);
  const caution = readCautionReport(evaluation.caution_report_status);
  const financing = readYesNoUnknown(evaluation.financing_status);

  // Só o VALOR no card: `formatFipeReference` acrescenta o mês do snapshot
  // ("R$ 72.000,00 (ago de 2026)"), e isso quebra em duas linhas num card de
  // 270px, empurrando a disputa para fora do cartão. A data continua no
  // detalhe, onde há largura para ela e onde a decisão de fato acontece.
  const fipe = formatMoneyValue(opportunity.fipe_reference_value);

  const highest = formatMoneyValue(opportunity.current_highest_offer);
  const mine = formatMoneyValue(opportunity.my_offer);

  return (
    <li
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#E5E9F2] bg-white transition duration-150 hover:border-[#CFE0FB] hover:shadow-[0_10px_28px_-12px_rgba(16,24,40,0.18)] focus-within:border-[#0e62d8] focus-within:ring-1 focus-within:ring-[#0e62d8]"
      data-testid="dealer-sale-opportunity-card"
    >
      {/* FOTO — proporção fixa 4:3, sangrando até as bordas do card. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F1F4F9]">
        {opportunity.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={opportunity.image}
            alt={`Foto de ${describeVehicle(opportunity)}`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <PhotoPlaceholder />
        )}

        {/* Cidade sobre a foto: é o dado que o lojista confere primeiro, e sobre
            a imagem ele não gasta uma linha do bloco de texto. */}
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.4" />
          </svg>
          {formatCity(opportunity.city)}
        </span>
      </div>

      {/* CONTEÚDO */}
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h3 className="truncate text-[15px] font-bold leading-snug text-[#161f34]">
          {describeVehicle(opportunity)}
        </h3>

        {/*
          A VERSÃO FIPE completa, e não uma linha de specs inventada.
          É ela que separa um EX de um LX — quinze mil reais de diferença no
          mesmo modelo e ano. O título traz marca, modelo comercial e ano; esta
          linha traz o que o título não consegue carregar sem estourar.
        */}
        <p className="mt-0.5 truncate text-[12px] text-[#667085]">
          {opportunity.fipe_model_description}
        </p>

        <p className="mt-2 text-[13px] font-semibold text-[#1D2440]">
          {specLine(opportunity)}
        </p>

        <div className="mt-2">
          <ConditionDot
            label={
              DECLARED_CONDITION_LABEL[opportunity.declared_condition] ||
              opportunity.declared_condition
            }
            tone={CONDITION_TONE[opportunity.declared_condition] ?? "warn"}
          />
        </div>

        {/*
          Dois sinais de risco, no máximo — os que mudam uma decisão de compra:
          passagem por leilão e laudo. Financiamento entra no lugar do laudo
          quando o laudo não foi informado, porque um card com uma etiqueta só
          fica visualmente torto e a informação seguinte em relevância é essa.
        */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <RiskChip
            label={auction ? `Leilão: ${auction}` : null}
            ok={evaluation.auction_history === "no"}
          />
          {caution ? (
            <RiskChip
              // "Laudo:" na frente porque o valor sozinho não se explica: "Não
              // possui" e "Aprovado" poderiam ser resposta de qualquer campo da
              // ficha, e no card não há rótulo de seção para dar contexto.
              label={`Laudo: ${caution}`}
              ok={
                evaluation.caution_report_status === "approved" ||
                evaluation.caution_report_status === "not_available"
              }
            />
          ) : (
            <RiskChip
              label={financing ? `Financiado: ${financing}` : null}
              ok={evaluation.financing_status === "no"}
            />
          )}
        </div>

        {/*
          A ÂNCORA DE MERCADO.
          Fica no card, e não só no detalhe, porque é ela que dá sentido ao
          número seguinte: "maior proposta R$ 51.000" não diz nada sozinho — dito
          ao lado de uma referência de R$ 92.000, diz tudo.

          "Referência FIPE", nunca "valor do veículo": a solicitação não tem
          preço pedido, e confundir os dois faria o lojista propor contra um
          número que ninguém pediu.
        */}
        {fipe ? (
          <p className="mt-2.5 text-[11.5px] text-[#98A2B3]">
            Referência FIPE{" "}
            <span className="font-semibold text-[#475467]">{fipe}</span>
          </p>
        ) : null}

        {/*
          DISPUTA — a informação comercial, separada por uma linha do resto.
          Só aparece quando existe: uma solicitação sem proposta nenhuma não
          ganha um bloco vazio dizendo "—".
        */}
        {highest ? (
          <div className="mt-2.5 flex items-end justify-between gap-3 border-t border-[#F2F4F7] pt-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#98A2B3]">
                Maior proposta
              </p>
              <p className="text-[15px] font-bold leading-tight text-[#0e62d8]">{highest}</p>
            </div>
            {mine ? (
              <div className="min-w-0 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#98A2B3]">
                  Sua proposta
                </p>
                <p
                  className={`text-[15px] font-bold leading-tight ${
                    opportunity.is_leading ? "text-[#067647]" : "text-[#1D2440]"
                  }`}
                >
                  {mine}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* RODAPÉ — tempo + a única ação. */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3.5">
          <span className="truncate text-[11px] text-[#98A2B3]">
            {formatPublishedAt(opportunity.created_at)}
          </span>

          <Link
            href={`${basePath}/oportunidades/veiculos/${opportunity.id}${query}`}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-[#DBE7FB] bg-[#F5F9FF] px-3.5 text-[12.5px] font-bold text-[#0e62d8] transition group-hover:bg-[#0e62d8] group-hover:text-white after:absolute after:inset-0 after:content-['']"
            data-testid="dealer-sale-opportunity-link"
          >
            Ver detalhes
          </Link>
        </div>
      </div>
    </li>
  );
}
