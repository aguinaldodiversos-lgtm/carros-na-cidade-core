"use client";

import {
  ADJUSTMENT_REASON_LABEL,
  formatDifference,
  formatKm,
  formatMoneyValue,
  formatSlot,
  type OwnerInspection,
  type PostInspectionDecision,
} from "@/lib/sale-requests/inspection";
import {
  OWNER_FINAL_DECISION_LABEL,
  type OwnerFinalDecision,
} from "@/lib/sale-requests/final-decision";
import type { SaleRequest } from "@/lib/sale-requests/api";

/**
 * O fluxo APOSENTADO, em modo somente-leitura (Fase 4.7, §12).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ISTO EXISTE, SE O FLUXO ACABOU
 * ════════════════════════════════════════════════════════════════════════════
 * Porque as linhas não acabaram. Quem passou pela avaliação presencial dentro do
 * portal — agendou, teve o carro avaliado, recebeu uma proposta final — tem esse
 * histórico gravado, e apagá-lo da tela seria apagar da experiência da pessoa
 * algo que de fato aconteceu com ela.
 *
 * O §11 e o §12 são explícitos: nada é destruído, e o legado continua legível.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ELE SUBSTITUI, E O QUE NÃO TEM
 * ════════════════════════════════════════════════════════════════════════════
 * Substitui `SaleRequestInspection.tsx`, que era INTERATIVO: escolher horário,
 * pedir novos horários, aceitar ou recusar a proposta final.
 *
 * Aqui não há botão nenhum. Nem desabilitado — um botão cinza sugere que a ação
 * volta a ser possível, e ela não volta. Os endpoints correspondentes respondem
 * 409 desde a 4.7, e uma tela que os chamasse produziria um erro que a pessoa
 * não teria como resolver.
 */

const CARD = "rounded-2xl border border-[#E5E9F2] bg-[#FCFCFD] p-4 sm:p-5";

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-[#F2F4F7] py-2 last:border-0">
      <span className="text-[12.5px] text-[#667085]">{label}</span>
      <span className="text-[13.5px] font-semibold text-[#1D2440]">{value}</span>
    </div>
  );
}

export default function SaleRequestLegacyFlow({
  request,
  inspection,
  decision,
  ownerDecision,
}: {
  request: SaleRequest;
  inspection: OwnerInspection | null;
  decision: PostInspectionDecision | null;
  ownerDecision: OwnerFinalDecision | null;
}) {
  if (!inspection && !decision) return null;

  const isOffer = decision?.type === "final_offer";
  const difference = formatDifference(decision?.difference ?? null);
  const reasonLabel = decision?.reason ? ADJUSTMENT_REASON_LABEL[decision.reason] : null;

  return (
    <section className={CARD} data-testid="owner-legacy-flow">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#98a2b3]">
        Histórico
      </p>
      <h2 className="mt-1 text-[16px] font-bold leading-tight text-[#161f34]">
        Avaliação presencial registrada na plataforma
      </h2>

      {/*
        A explicação, em uma frase. Sem ela, a pessoa veria um bloco de dados
        antigos sem entender por que não pode mais interagir com ele.
      */}
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
        Esta solicitação passou pelo fluxo anterior da plataforma. A avaliação
        presencial agora é combinada diretamente entre você e a loja.
      </p>

      {inspection?.scheduled_at ? (
        <div className="mt-4">
          <Line label="Avaliação agendada para" value={formatSlot(inspection.scheduled_at)} />
        </div>
      ) : null}

      {inspection?.observed ? (
        <div className="mt-3 rounded-xl bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
            O que a loja encontrou
          </p>
          <div className="mt-1">
            <Line label="Quilometragem" value={formatKm(inspection.observed.mileage)} />
            {inspection.observed.notes ? (
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[#475467]">
                {inspection.observed.notes}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {decision ? (
        <div className="mt-3 rounded-xl bg-white px-4 py-3" data-testid="owner-legacy-decision">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
            {isOffer ? "Proposta final apresentada" : "Avaliação encerrada sem proposta"}
          </p>

          {isOffer ? (
            <div className="mt-1">
              <Line
                label="Proposta preliminar"
                value={formatMoneyValue(decision.preliminary_amount) ?? "—"}
              />
              <Line
                label="Proposta final"
                value={formatMoneyValue(decision.final_amount) ?? "—"}
              />
              {difference ? <Line label="Diferença" value={difference} /> : null}
            </div>
          ) : null}

          {reasonLabel ? (
            <p className="mt-2 text-[13px] text-[#475467]">
              Motivo: <span className="font-semibold text-[#1D2440]">{reasonLabel}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {ownerDecision ? (
        <p
          className="mt-3 text-[13px] font-semibold text-[#1D2440]"
          data-testid="owner-legacy-owner-decision"
        >
          {OWNER_FINAL_DECISION_LABEL[ownerDecision.type]} —{" "}
          {formatMoneyValue(ownerDecision.final_amount) ?? "—"}
        </p>
      ) : null}
    </section>
  );
}
