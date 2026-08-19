"use client";

import Link from "next/link";
import {
  DECLARED_CONDITION_LABEL,
  FUEL_LABEL,
  TRANSMISSION_LABEL,
  describeVehicle,
  formatCity,
  formatFipeReference,
  formatMileage,
  formatPublishedAt,
  readCautionReport,
  readTireCondition,
  readYesNoUnknown,
  type DealerSaleOpportunitySummary,
} from "@/lib/sale-requests/dealer-api";

/**
 * Card de um veículo disponível para avaliação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SÓ INFORMAÇÃO REAL
 * ────────────────────────────────────────────────────────────────────────────
 * Cada etiqueta deste card sai de uma coluna que a pessoa preencheu. Não existe
 * "Urgente", "Bom potencial", "Margem alta" nem "Nv. oportunidade": nenhum
 * desses tem algoritmo por trás, e um rótulo assim faria o lojista priorizar por
 * um sinal que o sistema não possui.
 *
 * O único sinal temporal é "há N dias", derivado de `created_at`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UMA AÇÃO PRIMÁRIA
 * ────────────────────────────────────────────────────────────────────────────
 * "Ver detalhes", e só ela. Dois CTAs que levam à mesma página ("Avaliar agora"
 * + "Ver detalhes") custariam um momento de decisão a cada card para não mudar
 * nada no destino.
 *
 * O card INTEIRO é o alvo do link (via `absolute inset-0`), então a área de
 * toque no celular é o cartão todo — mas o `<a>` continua sendo um só,
 * com texto próprio, para o leitor de tela.
 */

/** Etiqueta neutra. `null` some — nunca vira "Não informado" no card. */
function Badge({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-[#F4F7FC] px-2 py-1 text-[11px] leading-tight text-[#475467]">
      <span className="text-[#98A2B3]">{label}</span>
      <span className="font-semibold text-[#1D2440]">{value}</span>
    </span>
  );
}

/** Ícone do placeholder quando a solicitação não tem foto. */
function PhotoPlaceholder() {
  return (
    <div
      className="flex aspect-[4/3] w-full items-center justify-center bg-[#F4F7FC] text-[#C3CDDE]"
      data-testid="dealer-sale-opportunity-no-photo"
    >
      <svg
        viewBox="0 0 40 40"
        className="h-9 w-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
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
  const fipe = formatFipeReference(
    opportunity.fipe_reference_value,
    opportunity.fipe_reference_at
  );

  return (
    <li
      className="relative flex flex-col overflow-hidden rounded-2xl border border-[#e8ecf4] bg-white transition hover:border-[#cfe0fb] hover:shadow-[0_6px_20px_rgba(16,24,40,0.06)] focus-within:border-[#0e62d8]"
      data-testid="dealer-sale-opportunity-card"
    >
      {opportunity.image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={opportunity.image}
          alt={`Foto de ${describeVehicle(opportunity)}`}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <PhotoPlaceholder />
      )}

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h3 className="truncate text-[15px] font-bold text-[#161f34]">
          {describeVehicle(opportunity)}
        </h3>

        {/* A versão FIPE completa, em uma linha. É o que separa R$ 15 mil entre
            um EX e um LX — e é por isso que a coluna existe. */}
        <p className="mt-0.5 truncate text-[12px] text-[#64748b]">
          {opportunity.fipe_model_description}
        </p>

        <p className="mt-2 text-[13px] font-semibold text-[#1D2440]">
          {formatMileage(opportunity.mileage)}
          <span className="mx-1.5 text-[#C3CDDE]">·</span>
          {TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission}
          <span className="mx-1.5 text-[#C3CDDE]">·</span>
          {FUEL_LABEL[opportunity.fuel_type] || opportunity.fuel_type}
        </p>

        {/* "Referência FIPE", com a data. Nunca "Valor do veículo": a
            solicitação não tem preço pedido, e confundir os dois faria o
            lojista propor contra um número que ninguém pediu. */}
        {fipe ? (
          <p className="mt-1 text-[12px] text-[#64748b]">
            <span className="text-[#98A2B3]">Referência FIPE </span>
            <span className="font-semibold text-[#1D2440]">{fipe}</span>
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge
            label="Estado"
            value={DECLARED_CONDITION_LABEL[opportunity.declared_condition] || null}
          />
          <Badge label="Pneus" value={readTireCondition(evaluation.tire_condition)} />
          <Badge label="Laudo" value={readCautionReport(evaluation.caution_report_status)} />
          <Badge label="Leilão" value={readYesNoUnknown(evaluation.auction_history)} />
          <Badge
            label="Financiamento"
            value={readYesNoUnknown(evaluation.financing_status)}
          />
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
          <span className="text-[11px] text-[#98A2B3]">
            {formatCity(opportunity.city)}
            <span className="mx-1">·</span>
            {formatPublishedAt(opportunity.created_at)}
          </span>

          <Link
            href={`${basePath}/oportunidades/veiculos/${opportunity.id}${query}`}
            className="text-[13px] font-bold text-[#0e62d8] after:absolute after:inset-0 after:content-[''] hover:underline"
            data-testid="dealer-sale-opportunity-link"
          >
            Ver detalhes
          </Link>
        </div>
      </div>
    </li>
  );
}
