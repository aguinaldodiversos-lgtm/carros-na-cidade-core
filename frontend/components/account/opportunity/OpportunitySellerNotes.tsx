"use client";

import {
  buildReviewPoints,
  type OpportunityReviewPoint,
} from "@/lib/sale-requests/opportunity-review-points";
import type { DealerVehicleEvaluation } from "@/lib/sale-requests/dealer-api";

/**
 * "Observações declaradas pelo proprietário" + "Pontos para avaliar" (§18/§19).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O TEXTO É DELE, INTEIRO E SEM TRATAMENTO
 * ════════════════════════════════════════════════════════════════════════════
 * `whitespace-pre-line` preserva as quebras que a pessoa digitou. Não há resumo,
 * não há reescrita, não há geração por IA e não há truncagem com "ver mais": o
 * lojista vai fazer uma oferta com base nisto, e um trecho escondido atrás de um
 * clique é um trecho que metade das pessoas não lê.
 *
 * Vazio não vira silêncio: a ausência de observação é ela própria uma
 * informação, e a frase diz isso em vez de sumir com o bloco.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE OS DOIS BLOCOS DIVIDEM O CARTÃO
 * ════════════════════════════════════════════════════════════════════════════
 * Os dois são a mesma coisa vista de dois ângulos: o que o proprietário ESCREVEU
 * e o que a declaração dele IMPLICA. Separá-los em cartões distantes faria o
 * lojista ler a narrativa numa altura e os alertas em outra, sem perceber que os
 * segundos saem da primeira.
 */
export default function OpportunitySellerNotes({
  knownIssues,
  mileage,
  images,
  evaluation,
}: {
  knownIssues: string | null;
  mileage: number;
  images: string[];
  evaluation: DealerVehicleEvaluation;
}) {
  const points: OpportunityReviewPoint[] = buildReviewPoints({ mileage, images, evaluation });

  return (
    <section
      className="rounded-2xl border border-[#E5E9F2] bg-white p-4 sm:p-5"
      data-testid="dealer-detail-seller-notes"
    >
      <h2 className="flex items-center gap-2 text-[14px] font-bold text-[#161f34]">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF4FF] text-[#0e62d8]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M4 6h16v10H8l-4 4V6Z" />
          </svg>
        </span>
        Observações declaradas pelo proprietário
      </h2>

      {knownIssues ? (
        <p
          className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-[#475467]"
          data-testid="dealer-detail-known-issues"
        >
          {knownIssues}
        </p>
      ) : (
        <p
          className="mt-3 text-[13px] leading-relaxed text-[#98A2B3]"
          data-testid="dealer-detail-known-issues-empty"
        >
          Nenhuma observação adicional informada.
        </p>
      )}

      {points.length > 0 ? (
        <div className="mt-4 border-t border-[#F2F4F7] pt-3.5" data-testid="dealer-detail-review-points">
          <h3 className="text-[12.5px] font-bold text-[#161f34]">Pontos para avaliar</h3>
          {/*
            Etiquetas âmbar — atenção, nunca perigo. Vermelho aqui diria que a
            plataforma reprovou o veículo, e ela não avaliou nada: só releu o que
            o proprietário declarou.

            O ponto (·) antes do texto não é decoração: é o que faz cada etiqueta
            continuar legível em escala de cinza e para quem não distingue âmbar
            de cinza (§44 — não depender apenas de cor).
          */}
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {points.map((point) => (
              <li
                key={point.id}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#FFFAEB] px-2 py-1.5 text-[11.5px] font-semibold leading-none text-[#B54708]"
                data-testid="dealer-detail-review-point"
              >
                <span aria-hidden="true">·</span>
                {point.label}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] leading-relaxed text-[#98A2B3]">
            {/*
              §17 — a origem, dita em voz alta. Sem esta linha, uma lista de
              alertas num cartão do portal pareceria uma análise DO PORTAL.
            */}
            Pontos derivados dos dados declarados pelo proprietário e da quantidade de
            fotos enviadas. A plataforma não vistoria os veículos.
          </p>
        </div>
      ) : null}
    </section>
  );
}
