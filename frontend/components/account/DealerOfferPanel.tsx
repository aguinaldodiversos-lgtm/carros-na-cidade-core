"use client";

import { useState } from "react";
import {
  DEALER_OFFER_COMMITMENT_NOTICE,
  DEALER_OFFER_INSPECTION_NOTICE,
} from "@/lib/sale-requests/handoff";
import {
  NOT_INFORMED,
  fipeDistance,
  formatMoneyValue,
  offerDigitsToDecimal,
  readRejectedHighest,
  submitSaleOffer,
  type DealerOfferState,
} from "@/lib/sale-requests/dealer-api";
import { moneyDigits } from "@/lib/sale-requests/api";

/**
 * O valor mínimo declarado pertence à RODADA e não muda com uma proposta.
 * O "lance atual" da tela é a maior oferta aceita; antes dela, é o piso da rodada.
 * Os incrementos só produzem uma prévia: nenhum POST acontece até a confirmação.
 */
export const BID_INCREMENTS = [100, 300, 500, 1000] as const;

function toCents(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) return null;
  const result = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

function centsToDecimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function formatAmountDigits(digits: string): string {
  const clean = moneyDigits(digits);
  if (!clean) return "";
  return (Number(clean) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formattedCents(cents: number | null): string | null {
  return cents === null ? null : formatMoneyValue(centsToDecimal(cents));
}

export default function DealerOfferPanel({
  saleRequestId,
  state,
  fipeReferenceValue,
  minimumAcceptedPrice,
  onSubmitted,
  advertiserId = null,
}: {
  saleRequestId: string | number;
  state: DealerOfferState;
  fipeReferenceValue: string | null;
  minimumAcceptedPrice: string | null;
  onSubmitted: (next: DealerOfferState) => void;
  advertiserId?: string | number | null;
}) {
  const [increment, setIncrement] = useState<number | null>(null);
  const [legacyDigits, setLegacyDigits] = useState("");
  const [note, setNote] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  // A fonte do valor é sempre o backend: maior lance, ou piso quando não houve ofertas.
  const leaderCents = toCents(state.current_highest_offer);
  const floorCents = toCents(minimumAcceptedPrice);
  const currentCents = leaderCents ?? floorCents;
  const currentMoney = formattedCents(currentCents);
  const previewCents =
    currentCents !== null && increment !== null ? currentCents + increment * 100 : null;
  const previewMoney = formattedCents(previewCents);
  const legacyMode = currentCents === null;
  const myOfferMoney = formatMoneyValue(state.my_offer);
  const count = state.offers_count;

  // A FIPE continua sendo apenas referência: nunca margem ou lucro.
  const distance = fipeDistance(
    fipeReferenceValue,
    currentCents === null ? null : centsToDecimal(currentCents)
  );
  const fipeMoney = formatMoneyValue(fipeReferenceValue);

  function selectIncrement(next: number) {
    setIncrement(next);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const amount =
      legacyMode ? offerDigitsToDecimal(legacyDigits) : formattedCents(previewCents) && previewCents !== null ? centsToDecimal(previewCents) : null;
    if (!amount) {
      setError(legacyMode ? "Informe o valor da proposta." : "Selecione um incremento para fazer seu lance.");
      return;
    }

    const proposedCents = toCents(amount);
    if (proposedCents === null) {
      setError("Valor inválido. Confira o lance antes de enviar.");
      return;
    }
    if (leaderCents === null && floorCents !== null && proposedCents < floorCents) {
      setError(`A proposta precisa alcançar o valor mínimo do proprietário (${formatMoneyValue(minimumAcceptedPrice)}).`);
      return;
    }
    if (leaderCents !== null && proposedCents <= leaderCents) {
      setError(`A proposta precisa superar a maior proposta atual (${formatMoneyValue(state.current_highest_offer)}).`);
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
      setIncrement(null);
      setLegacyDigits("");
      setNote("");
      setShowNotes(false);
      setSuccess("Lance enviado com sucesso.");
      // Resultado do POST vem da transação protegida por lock; reflete o líder atual.
      onSubmitted({
        current_highest_offer: result.current_highest_offer,
        my_offer: result.my_offer,
        is_leading: result.is_leading,
        offers_count: result.offers_count,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar a proposta.");
      const highest = readRejectedHighest(caught);
      if (highest) {
        // Se outra loja ofertou antes, a nova base aparece sem recarregar.
        onSubmitted({ ...state, current_highest_offer: highest, is_leading: false });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-[#DFE8F5] bg-white shadow-[0_6px_26px_-17px_rgba(20,54,112,0.25)]"
      data-testid="dealer-offer-panel"
      aria-label="Negociação"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[#EDF1F7] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF4FF] text-[#0e62d8]" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h8M6.5 14.5l6-6M4 11l5-5 3.5 3.5-5 5zM14 4l6 6M15.5 9.5l4.5 4.5-2 2-4.5-4.5z" />
            </svg>
          </span>
          <h2 className="text-[15px] font-bold text-[#172443]">Negociação</h2>
        </div>
        <span className="rounded-full bg-[#EBFBF1] px-2.5 py-1 text-[10px] font-semibold text-[#067647]">
          Recebendo propostas
        </span>
      </header>

      <div className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
        <div
          className="rounded-xl border border-[#E2ECFA] bg-gradient-to-b from-[#FFFFFF] to-[#F4F9FF] px-4 py-4"
          data-testid="dealer-detail-minimum"
        >
          <p className="text-[12px] font-bold text-[#1D2440]">
            {leaderCents === null ? "Lance inicial · mínimo do vendedor" : "Lance atual"}
          </p>
          {currentMoney ? (
            <p className="mt-1 text-[clamp(27px,4vw,39px)] font-extrabold leading-tight tracking-[-0.035em] tabular-nums text-[#0E62D8]" data-testid="dealer-offer-current">
              {currentMoney}
            </p>
          ) : (
            <p className="mt-2 text-[15px] font-semibold text-[#667085]" data-testid="dealer-offer-current">
              {NOT_INFORMED}
            </p>
          )}
          {leaderCents === null && floorCents !== null ? (
            <span className="sr-only" data-testid="dealer-offer-minimum">
              {formatMoneyValue(minimumAcceptedPrice)}
            </span>
          ) : null}
          {state.my_offer ? (
            <p
              className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-bold ${
                state.is_leading ? "bg-[#DCFCE7] text-[#067647]" : "bg-[#FFF4ED] text-[#B93815]"
              }`}
              data-testid="dealer-offer-standing"
            >
              <span aria-hidden="true">{state.is_leading ? "✓" : "⚠"}</span>
              {state.is_leading ? "Você está liderando" : "Existe uma proposta maior"}
            </p>
          ) : null}
          {state.my_offer && !state.is_leading && myOfferMoney ? (
            <p className="mt-2 text-center text-[12px] text-[#667085]">
              Seu último lance: <span className="font-bold text-[#1D2440]">{myOfferMoney}</span>
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="min-w-0 rounded-xl border border-[#EBF0F8] bg-[#FAFCFF] px-3 py-2.5">
            <p className="text-[10px] text-[#64748B]">Propostas</p>
            <p className="mt-0.5 text-[12px] font-bold text-[#1D2440]" data-testid="dealer-offer-count">
              {count === 0 ? "Nenhuma proposta recebida ainda." : `${count} ${count === 1 ? "proposta recebida" : "propostas recebidas"}`}
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-[#EBF0F8] bg-[#FAFCFF] px-3 py-2.5">
            <p className="text-[10px] text-[#64748B]">Referência FIPE</p>
            <p className="mt-0.5 text-[12px] font-bold tabular-nums text-[#1D2440]">
              {fipeMoney || NOT_INFORMED}
            </p>
          </div>
          <div className="col-span-2 min-w-0 rounded-xl border border-[#EBF0F8] bg-[#FAFCFF] px-3 py-2.5 sm:col-span-1" data-testid="dealer-offer-fipe-distance">
            <p className="text-[10px] text-[#64748B]">Lance atual x FIPE</p>
            {distance ? (
              <p className="mt-0.5 text-[12px] font-bold text-[#1D2440]">
                {formatMoneyValue(distance.amount)} {distance.belowFipe ? "abaixo" : "acima"}
              </p>
            ) : (
              <p className="mt-0.5 text-[12px] text-[#98A2B3]">{NOT_INFORMED}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="border-t border-[#EDF1F7] pt-3.5">
          <h3 className="text-[14px] font-bold text-[#172443]">Escolha seu incremento</h3>
          <p className="mt-0.5 text-[12px] text-[#667085]">
            Selecione um valor para aumentar o lance atual.
          </p>
          {!legacyMode ? (
            <>
              <div className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2" role="group" aria-label="Incremento do lance">
                {BID_INCREMENTS.map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => selectIncrement(value)}
                    aria-pressed={increment === value}
                    disabled={submitting}
                    className={`h-10 min-w-0 rounded-lg border px-1 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] sm:h-11 sm:text-xs ${
                      increment === value
                        ? "border-[#0e62d8] bg-[#0e62d8] text-white shadow-sm"
                        : "border-[#D9E5F7] bg-white text-[#0E62D8] hover:bg-[#F0F6FF]"
                    }`}
                    data-testid={`dealer-offer-bump-${value}`}
                  >
                    + R$ {value.toLocaleString("pt-BR")}
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-[#EBF4FF] px-3.5 py-3" aria-live="polite">
                <p className="text-[11px] font-semibold text-[#536580]">Próximo lance</p>
                <p className="mt-0.5 text-[23px] font-extrabold leading-tight tabular-nums text-[#0E62D8] sm:text-[26px]" data-testid="dealer-offer-preview">
                  {previewMoney || "Selecione um incremento"}
                </p>
              </div>
            </>
          ) : (
            <div className="mt-3" data-testid="dealer-offer-legacy-entry">
              <p className="mb-1.5 text-[12px] text-[#667085]">
                Esta solicitação antiga não possui mínimo nem lance vigente. Informe seu primeiro valor.
              </p>
              <label htmlFor="dealer-offer-amount" className="block text-[12px] font-semibold text-[#1D2440]">
                Sua oferta em reais
              </label>
              <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-[#D9E5F7] focus-within:ring-2 focus-within:ring-[#0e62d8]/20">
                <span aria-hidden="true" className="border-r border-[#D9E5F7] bg-[#F7F9FC] px-3 py-3 font-bold text-[#667085]">R$</span>
                <input
                  id="dealer-offer-amount"
                  inputMode="numeric"
                  aria-label="Valor da sua nova oferta, em reais"
                  value={formatAmountDigits(legacyDigits)}
                  onChange={(event) => {
                    setLegacyDigits(moneyDigits(event.target.value));
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Ex.: 62.500,00"
                  className="h-12 min-w-0 flex-1 bg-white px-3 font-bold text-[#1D2440] outline-none"
                  data-testid="dealer-offer-amount"
                />
              </div>
            </div>
          )}

          <button
            type="button"
            className="mt-3 text-[12px] font-semibold text-[#0E62D8] hover:underline"
            aria-expanded={showNotes}
            aria-controls="dealer-offer-note-wrapper"
            onClick={() => setShowNotes((open) => !open)}
            data-testid="dealer-offer-note-toggle"
          >
            {showNotes ? "Ocultar observação" : "Adicionar observação (opcional)"}
          </button>
          {showNotes ? (
            <div className="mt-2" id="dealer-offer-note-wrapper">
              <label htmlFor="dealer-offer-note" className="text-[12px] font-semibold text-[#667085]">
                Observações para avaliação (opcional)
              </label>
              <textarea
                id="dealer-offer-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={500}
                className="mt-1 w-full resize-y rounded-xl border border-[#D9E5F7] px-3 py-2 text-[13px] outline-none focus:border-[#0e62d8]"
                data-testid="dealer-offer-note"
                placeholder="Ex.: sujeito à avaliação presencial."
              />
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-lg border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[12px] text-[#B42318]" role="alert" data-testid="dealer-offer-error">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="mt-3 rounded-lg border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2 text-[12px] font-medium text-[#067647]" role="status" data-testid="dealer-offer-success">
              {success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || (!legacyMode && previewCents === null)}
            className="mt-3.5 flex min-h-12 w-full items-center justify-center rounded-xl bg-[linear-gradient(110deg,#0F4DB6,#1381E3)] px-3 py-3 text-center text-[13px] font-bold text-white shadow-[0_8px_20px_-12px_rgba(14,98,216,0.75)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 sm:text-sm"
            data-testid="dealer-offer-submit"
          >
            {submitting
              ? "Enviando…"
              : previewMoney
                ? `Fazer lance de ${previewMoney}`
                : "Fazer lance"}
          </button>
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#667085]" data-testid="dealer-offer-commitment">
            {DEALER_OFFER_COMMITMENT_NOTICE}
          </p>
          <button
            type="button"
            onClick={() => setShowTerms((open) => !open)}
            aria-expanded={showTerms}
            aria-controls="dealer-offer-terms"
            className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-[#0e62d8] hover:underline focus-visible:ring-2 focus-visible:ring-[#0e62d8]"
            data-testid="dealer-offer-terms-toggle"
          >
            {showTerms ? "Ocultar condições" : "Ver condições"}
            <span aria-hidden="true">{showTerms ? "▴" : "▾"}</span>
          </button>
          {showTerms ? (
            <div id="dealer-offer-terms" className="mt-2 space-y-1.5">
              <p className="text-[11.5px] leading-relaxed text-[#98A2B3]" data-testid="dealer-offer-inspection-notice">
                {DEALER_OFFER_INSPECTION_NOTICE}
              </p>
              <p className="text-[11px] leading-relaxed text-[#98A2B3]">
                A oferta precisa superar a maior proposta atual. Se outro lojista ofertar antes, a proposta pode ser recusada e o valor atualizado.
              </p>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
