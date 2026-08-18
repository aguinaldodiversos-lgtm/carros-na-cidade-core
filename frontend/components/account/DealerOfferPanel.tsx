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
  tone?: "default" | "highlight" | "muted";
}) {
  const formatted = formatMoneyValue(value);
  const toneClass =
    tone === "highlight"
      ? "text-[#0e62d8]"
      : tone === "muted"
        ? "text-[#98A2B3]"
        : "text-[#1D2440]";

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#98A2B3]">{label}</p>
      <p className={`mt-0.5 text-[18px] font-bold leading-tight ${toneClass}`}>
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
}: {
  saleRequestId: string | number;
  state: DealerOfferState;
  fipeReferenceValue: string | null;
  onSubmitted: (next: DealerOfferState) => void;
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
      const result = await submitSaleOffer(saleRequestId, { amount, note: note.trim() || null });
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
      className="rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      data-testid="dealer-offer-panel"
    >
      <h2 className="text-[13px] font-bold text-[#161f34]">Sua proposta</h2>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <Figure label="Sua proposta" value={state.my_offer} />
        <Figure
          label="Maior proposta atual"
          value={state.current_highest_offer}
          tone={state.is_leading ? "default" : "highlight"}
        />
      </div>

      {/* Badge de liderança — sem nomes, dos dois lados. */}
      {state.my_offer ? (
        <p
          className={`mt-3 inline-flex items-center rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${
            state.is_leading
              ? "bg-[#ECFDF3] text-[#067647]"
              : "bg-[#FFF4ED] text-[#B93815]"
          }`}
          data-testid="dealer-offer-standing"
        >
          {state.is_leading ? "Você está liderando" : "Existe uma proposta maior"}
        </p>
      ) : null}

      {/*
        Distância para a FIPE — rotulada como distância, e nunca como margem ou
        lucro. Só aparece quando existem os DOIS lados (FIPE resolvida e proposta
        enviada); sem um deles não há diferença a mostrar.
      */}
      {distance ? (
        <p className="mt-3 text-[12px] text-[#64748b]" data-testid="dealer-offer-fipe-distance">
          Distância para a referência FIPE:{" "}
          <span className="font-semibold text-[#1D2440]">
            {formatMoneyValue(distance.amount)}
          </span>{" "}
          {distance.belowFipe ? "abaixo" : "acima"}
        </p>
      ) : null}

      <p className="mt-3 text-[12px] text-[#98A2B3]" data-testid="dealer-offer-count">
        {state.offers_count === 0
          ? "Nenhuma proposta recebida ainda."
          : `${state.offers_count} ${state.offers_count === 1 ? "proposta recebida" : "propostas recebidas"}.`}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 border-t border-[#F2F4F7] pt-4">
        <label
          htmlFor="dealer-offer-amount"
          className="text-[11px] font-semibold text-[#64748b]"
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
          className="mt-1 h-12 w-full rounded-xl border border-[#E5E9F2] bg-white px-3.5 text-[15px] font-semibold text-[#1D2440] outline-none placeholder:font-normal placeholder:text-[#B6C0D4] focus:border-[#0e62d8]"
          data-testid="dealer-offer-amount"
        />

        {bumpFrom ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {[500, 1000, 2000].map((increment) => (
              <button
                key={increment}
                type="button"
                onClick={() => applyBump(increment)}
                className="h-9 rounded-lg border border-[#dbe7fb] bg-[#eff5ff] px-3 text-[12px] font-bold text-[#0e62d8] transition hover:bg-[#e2edff]"
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
