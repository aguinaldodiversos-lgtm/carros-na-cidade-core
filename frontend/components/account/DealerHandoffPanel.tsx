"use client";

import {
  DEALER_ACCEPTED_NOTICE,
  DEALER_ACCEPTED_SCOPE_NOTICE,
} from "@/lib/sale-requests/handoff";
import { formatMoneyValue, type PostInspectionDecision } from "@/lib/sale-requests/inspection";

/**
 * O que a LOJA vê depois de ter a oferta aceita (Fase 4.7, §16, §37).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE COMPONENTE SUBSTITUIU — E POR QUE ELE É TÃO PEQUENO
 * ════════════════════════════════════════════════════════════════════════════
 * Ele toma o lugar de `DealerInspectionPanel.tsx`, que tinha 771 linhas e três
 * formulários: propor horários, REGISTRAR AVALIAÇÃO (quilometragem lida, estado
 * geral, pneus, motor, câmbio, suspensão, lataria e pintura, observações) e
 * apresentar proposta final.
 *
 * Nada disso existe mais. A avaliação pertence ao lojista e acontece fora da
 * plataforma — ele já tem processo, planilha e olho treinado para isso, e pedir
 * que redigite tudo aqui era trabalho sem contrapartida: o proprietário não
 * decide nada com aqueles dados, e a plataforma não arbitra a negociação.
 *
 * O §8 é explícito de que o card "Registrar avaliação" precisa DESAPARECER, e
 * não apenas ser escondido. Ele foi removido junto com o componente inteiro, e
 * há teste de componente e captura de tela provando a ausência.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SOBROU
 * ════════════════════════════════════════════════════════════════════════════
 * O valor aceito, e a informação de que o proprietário recebeu os dados da loja.
 * Read-only: sem formulário, sem chat, sem contato do proprietário, sem botão de
 * nova proposta.
 *
 * O contato NÃO aparece aqui de propósito: quem abre a conversa é o
 * proprietário, pelo WhatsApp. Ao fazê-lo ele revela o próprio número — como
 * aconteceria em qualquer contato do mundo real —, e a loja responde por lá.
 * Entregar o telefone dele nesta tela inverteria quem escolhe ser procurado.
 */

const CARD = "rounded-2xl border border-[#ABEFC6] bg-[#F6FEF9] p-4 sm:p-5";

export default function DealerHandoffPanel({
  selectedAmount,
  legacyDecision,
}: {
  selectedAmount: string | null;
  /**
   * A proposta final do fluxo APOSENTADO, quando esta oportunidade viveu a 4.5.
   * Somente leitura — o formulário que a produziu não existe mais.
   */
  legacyDecision: PostInspectionDecision | null;
}) {
  return (
    <section className={CARD} data-testid="dealer-handoff-accepted">
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">
        Sua oferta foi aceita
      </h2>

      {selectedAmount ? (
        <>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
            Oferta aceita
          </p>
          <p
            className="mt-1 text-[26px] font-bold leading-none tracking-[-0.01em] text-[#161f34]"
            data-testid="dealer-handoff-amount"
          >
            {formatMoneyValue(selectedAmount)}
          </p>
        </>
      ) : null}

      <p className="mt-4 text-[13px] leading-relaxed text-[#475467]">
        {DEALER_ACCEPTED_NOTICE}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[#475467]">
        {DEALER_ACCEPTED_SCOPE_NOTICE}
      </p>

      {/*
        LEGADO — a proposta final que esta loja registrou no fluxo antigo.
        Aparece para não apagar da tela algo que de fato aconteceu, e não tem
        ação nenhuma: o endpoint que a criava responde 409 desde a 4.7.
      */}
      {legacyDecision?.type === "final_offer" && legacyDecision.final_amount ? (
        <div
          className="mt-4 rounded-xl bg-white px-4 py-3"
          data-testid="dealer-handoff-legacy-decision"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#98a2b3]">
            Histórico — proposta final registrada na plataforma
          </p>
          <p className="mt-1 text-[15px] font-bold text-[#161f34]">
            {formatMoneyValue(legacyDecision.final_amount)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
