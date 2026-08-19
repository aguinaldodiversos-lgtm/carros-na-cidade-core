"use client";

import { useState } from "react";
import {
  fipeDistance,
  formatMoneyValue,
  offerDigitsToDecimal,
  readRejectedHighest,
  submitSaleOffer,
  type DealerOfferState,
} from "@/lib/sale-requests/dealer-api";
import { formatMoneyInput, moneyDigits } from "@/lib/sale-requests/api";

/**
 * O painel de proposta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE APARECE, E O QUE NUNCA VAI APARECER
 * ────────────────────────────────────────────────────────────────────────────
 * Aparece: a sua proposta, a MAIOR proposta atual, quantas propostas existem, e
 * um campo para propor mais.
 *
 * Não aparece — e não é esquecimento:
 *
 *   • nome, id ou qualquer traço da loja concorrente. A API não devolve nenhum;
 *   • a palavra "Confidencial". Ela diria que o VALOR é segredo, que é o oposto
 *     da regra: o valor líder é público entre lojistas, a identidade é que não é;
 *   • cronômetro, prazo ou "faltam X minutos". Não existe prazo neste MVP;
 *   • "Margem potencial". Preparação, impostos, garantia e revenda não estão
 *     calculados em lugar nenhum — o que existe é a DISTÂNCIA para a FIPE, e é
 *     assim que ela é rotulada;
 *   • stepper de fases futuras (avaliação presencial, documentação, negociação).
 *     Nenhuma delas tem estado no banco, e um stepper decorativo prometeria um
 *     fluxo que ninguém escreveu ainda.
 */

/** Um valor monetário grande, com rótulo. */
function Figure({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | null;
  tone?: "default" | "highlight" | "leading";
}) {
  const formatted = formatMoneyValue(value);
  const toneClass =
    tone === "highlight"
      ? "text-[#0e62d8]"
      : tone === "leading"
        ? "text-[#067647]"
        : "text-[#1D2440]";

  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#98A2B3]">
        {label}
      </p>
      <p className={`mt-0.5 text-[19px] font-bold leading-tight tabular-nums ${toneClass}`}>
        {/* Ausência é travessão, nunca "R$ 0,00": zero seria uma proposta de
            nada, e ainda não existe proposta nenhuma. */}
        {formatted || "—"}
      </p>
    </div>
  );
}

export default function DealerOfferPanel({
  saleRequestId,
  state,
  fipeReferenceValue,
  onSubmitted,
  /** A loja em nome da qual a proposta é feita, quando a conta tem mais de uma. */
  advertiserId = null,
}: {
  saleRequestId: string | number;
  state: DealerOfferState;
  fipeReferenceValue: string | null;
  onSubmitted: (next: DealerOfferState) => void;
  advertiserId?: string | number | null;
}) {
  const [digits, setDigits] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const distance = fipeDistance(fipeReferenceValue, state.my_offer);

  /**
   * Atalhos de incremento.
   *
   * São CONVENIÊNCIA, não regra: não existe incremento mínimo obrigatório. Eles
   * partem da maior proposta atual (ou da própria, se ainda não há disputa) e
   * apenas PREENCHEM o campo — quem envia é o botão, e o valor continua
   * editável à mão.
   */
  const bumpFrom = state.current_highest_offer ?? state.my_offer ?? null;

  const applyBump = (increment: number) => {
    const base = bumpFrom ? Number(bumpFrom) : 0;
    if (!Number.isFinite(base)) return;
    setDigits(String(Math.round((base + increment) * 100)));
    setError(null);
    setSuccess(null);
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const amount = offerDigitsToDecimal(digits);
    if (!amount) {
      setError("Informe o valor da proposta.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await submitSaleOffer(
        saleRequestId,
        { amount, note: note.trim() || null },
        advertiserId
      );
      setDigits("");
      setNote("");
      setSuccess("Proposta enviada.");
      onSubmitted({
        current_highest_offer: result.current_highest_offer,
        my_offer: result.my_offer,
        is_leading: result.is_leading,
        offers_count: result.offers_count,
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Não foi possível enviar a proposta.";
      setError(message);

      // A recusa por não superar carrega o líder ATUALIZADO. Refletir isso no
      // painel é o que evita o "tentei de novo com o mesmo valor e falhou de
      // novo" — o lojista passa a ver o número que precisa bater.
      const highest = readRejectedHighest(caught);

      if (highest) {
        onSubmitted({ ...state, current_highest_offer: highest, is_leading: false });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="rounded-2xl border-2 border-[#DBE7FB] bg-white p-4 shadow-[0_4px_16px_-6px_rgba(14,98,216,0.15)]"
      data-testid="dealer-offer-panel"
    >
      <h2 className="text-[15px] font-bold text-[#0e62d8]">Sua proposta</h2>

      {/*
        O ESTADO DA DISPUTA, num bloco só.
        A versão anterior espalhava valores, badge, distância FIPE e contagem em
        quatro alturas soltas antes do campo — o lojista lia um relatório para
        depois encontrar o formulário. Aqui os dois números dividem uma faixa
        cinza, com a posição logo abaixo, e o formulário começa em seguida.

        A ordem "maior primeiro" também mudou: é o número que decide quanto ele
        precisa oferecer, e vinha em segundo.
      */}
      <div className="mt-3 rounded-xl bg-[#F7F9FC] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Figure
            label="Maior proposta"
            value={state.current_highest_offer}
            tone={state.is_leading ? "default" : "highlight"}
          />
          <Figure
            label="Sua proposta"
            value={state.my_offer}
            tone={state.is_leading ? "leading" : "default"}
          />
        </div>

        {/* Badge de posição — sem nomes, dos dois lados. */}
        {state.my_offer ? (
          <p
            className={`mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-bold leading-none ${
              state.is_leading
                ? "bg-[#ECFDF3] text-[#067647]"
                : "bg-[#FFF4ED] text-[#B93815]"
            }`}
            data-testid="dealer-offer-standing"
          >
            <span aria-hidden="true">{state.is_leading ? "✓" : "⚠"}</span>
            {state.is_leading ? "Você está liderando" : "Existe uma proposta maior"}
          </p>
        ) : null}

        <p className="mt-2 text-[11.5px] text-[#98A2B3]" data-testid="dealer-offer-count">
          {state.offers_count === 0
            ? "Nenhuma proposta recebida ainda."
            : `${state.offers_count} ${state.offers_count === 1 ? "proposta recebida" : "propostas recebidas"}.`}
        </p>
      </div>

      {/*
        Distância para a FIPE — rotulada como distância, e nunca como margem ou
        lucro. Só aparece quando existem os DOIS lados (FIPE resolvida e proposta
        enviada); sem um deles não há diferença a mostrar.
      */}
      {distance ? (
        <p className="mt-2.5 text-[12px] text-[#667085]" data-testid="dealer-offer-fipe-distance">
          Distância para a referência FIPE:{" "}
          <span className="font-semibold text-[#1D2440]">
            {formatMoneyValue(distance.amount)}
          </span>{" "}
          {distance.belowFipe ? "abaixo" : "acima"}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-4">
        <label
          htmlFor="dealer-offer-amount"
          className="text-[11.5px] font-semibold text-[#475467]"
        >
          Nova proposta
        </label>
        <input
          id="dealer-offer-amount"
          inputMode="numeric"
          value={formatMoneyInput(digits)}
          onChange={(event) => {
            setDigits(moneyDigits(event.target.value));
            setError(null);
            setSuccess(null);
          }}
          placeholder="R$ 0,00"
          className="mt-1.5 h-14 w-full rounded-xl border border-[#E5E9F2] bg-white px-3.5 text-[22px] font-bold tabular-nums text-[#1D2440] outline-none transition placeholder:text-[19px] placeholder:font-normal placeholder:text-[#C3CDDE] focus:border-[#0e62d8] focus:ring-2 focus:ring-[#0e62d8]/15"
          data-testid="dealer-offer-amount"
        />

        {bumpFrom ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[500, 1000, 2000].map((increment) => (
              <button
                key={increment}
                type="button"
                onClick={() => applyBump(increment)}
                className="h-9 rounded-lg border border-[#DBE7FB] bg-white text-[12px] font-bold text-[#0e62d8] transition hover:bg-[#F0F6FF]"
                data-testid={`dealer-offer-bump-${increment}`}
              >
                + R$ {increment.toLocaleString("pt-BR")}
              </button>
            ))}
          </div>
        ) : null}

        <label htmlFor="dealer-offer-note" className="mt-4 block text-[11px] font-semibold text-[#64748b]">
          Observações para avaliação (opcional)
        </label>
        {/*
          "Observações para avaliação", e não "Mensagem". O campo NÃO é canal de
          conversa: não existe resposta, não existe histórico de thread, e o
          vendedor não vê este texto nesta fase. Um rótulo de mensagem faria o
          lojista escrever esperando resposta.
        */}
        <textarea
          id="dealer-offer-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Ex.: sujeito a avaliação presencial dos pneus."
          className="mt-1 w-full resize-y rounded-xl border border-[#E5E9F2] bg-white px-3.5 py-2.5 text-[13px] text-[#1D2440] outline-none placeholder:text-[#B6C0D4] focus:border-[#0e62d8]"
          data-testid="dealer-offer-note"
        />

        {error ? (
          <p
            className="mt-3 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-3.5 py-2.5 text-[13px] text-[#b42318]"
            role="alert"
            data-testid="dealer-offer-error"
          >
            {error}
          </p>
        ) : null}

        {success ? (
          <p
            className="mt-3 rounded-[12px] border border-[#ABEFC6] bg-[#ECFDF3] px-3.5 py-2.5 text-[13px] text-[#067647]"
            role="status"
            data-testid="dealer-offer-success"
          >
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-4 h-12 w-full rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="dealer-offer-submit"
        >
          {submitting ? "Enviando…" : "Enviar proposta"}
        </button>

        <p className="mt-2 text-[11px] leading-relaxed text-[#98A2B3]">
          A proposta é preliminar e precisa superar a maior proposta atual.
        </p>
      </form>
    </section>
  );
}
