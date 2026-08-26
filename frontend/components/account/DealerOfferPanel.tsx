"use client";

import {
  DEALER_OFFER_COMMITMENT_NOTICE,
  DEALER_OFFER_INSPECTION_NOTICE,
} from "@/lib/sale-requests/handoff";

import { useState } from "react";
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
 * Decimal do backend ("62500.00") → CENTAVOS inteiros.
 *
 * A comparação de dinheiro é feita em inteiros, e não em `Number(...)`, pelo
 * mesmo motivo do backend: `62500.10 - 62500.05` em ponto flutuante binário não
 * dá o que o olho espera, e aqui a diferença de um centavo é exatamente o que
 * separa uma proposta aceita de uma recusada.
 *
 * `null` para ausente — que NÃO é zero: "não há piso" e "o piso é zero" levariam
 * a comparações opostas.
 */
function toCents(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(raw).trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number(String(match[2] ?? "").padEnd(2, "0"));
}

/**
 * Dígitos (centavos) → "62.500,00", SEM o "R$".
 *
 * O símbolo virou um prefixo fixo à esquerda do campo (§28), então mantê-lo
 * dentro do valor produziria "R$ R$ 62.500,00". `formatMoneyInput` continua
 * existindo e sendo usada pelo resto do projeto — o que muda aqui é só a
 * apresentação deste campo.
 */
function formatAmountDigits(digits: string): string {
  const clean = moneyDigits(digits);
  if (clean === "") return "";
  return (Number(clean) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * NEGOCIAÇÃO — a coluna comercial do detalhe (Fase 4.11A, §21 a §31, §36, §39).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A HIERARQUIA MUDOU; A LÓGICA, NÃO
 * ════════════════════════════════════════════════════════════════════════════
 * Validações, atalhos de incremento, envio, tratamento de recusa e propagação de
 * estado são os MESMOS da 4.3. Esta fase mexeu em ordem, tamanho e rótulo — em
 * nada que decida se uma proposta entra ou não.
 *
 * O que mudou de lugar, e por quê:
 *
 *   O PISO virou o número grande do topo. Ele era uma linha de 12px espremida
 *   entre o título e a faixa cinza, e é a primeira pergunta que o lojista faz:
 *   "quanto o dono quer receber?". Dar-lhe o corpo maior da coluna é dizer que a
 *   conversa começa nele.
 *
 *   MAIOR OFERTA e SUA OFERTA dividem uma linha logo abaixo, no mesmo tamanho —
 *   são pares, e um maior que o outro sugeriria que um deles decide mais.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AUSÊNCIA É FRASE, NÃO TRAVESSÃO E MUITO MENOS ZERO (§22)
 * ════════════════════════════════════════════════════════════════════════════
 * "R$ 0,00" seria uma proposta de nada — e não existe proposta nenhuma. O
 * travessão dizia a verdade, mas obrigava o leitor a interpretá-lo. As frases
 * ("Nenhuma oferta recebida ainda.", "Você ainda não fez uma oferta.") dizem
 * qual dos dois estados é.
 *
 * O piso ausente segue a mesma regra e chega ao extremo do §55: o bloco continua
 * na tela dizendo "Valor não informado", porque sumir com ele faria a pergunta
 * mais importante da coluna desaparecer sem explicação.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE NUNCA VAI APARECER AQUI
 * ════════════════════════════════════════════════════════════════════════════
 *   • nome, id ou qualquer traço da loja concorrente. A API não devolve nenhum;
 *   • a palavra "Confidencial". Ela diria que o VALOR é segredo, que é o oposto
 *     da regra: o valor líder é público entre lojistas, a identidade é que não é;
 *   • cronômetro, prazo ou "faltam X minutos". Não existe prazo neste MVP;
 *   • "Margem potencial". O que existe é a DISTÂNCIA para a FIPE, e é assim que
 *     ela é rotulada;
 *   • "Salvar oportunidade". A referência visual desta fase mostra o botão, mas
 *     não existe favorito de oportunidade no backend — nem tabela, nem rota. O
 *     §30 é explícito: não inventar funcionalidade porque ela aparece na imagem.
 */
export default function DealerOfferPanel({
  saleRequestId,
  state,
  fipeReferenceValue,
  minimumAcceptedPrice,
  onSubmitted,
  /** A loja em nome da qual a proposta é feita, quando a conta tem mais de uma. */
  advertiserId = null,
}: {
  saleRequestId: string | number;
  state: DealerOfferState;
  fipeReferenceValue: string | null;
  /** Piso do proprietario (4.3.3). null em solicitacao anterior a regra. */
  minimumAcceptedPrice: string | null;
  onSubmitted: (next: DealerOfferState) => void;
  advertiserId?: string | number | null;
}) {
  const [digits, setDigits] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  const distance = fipeDistance(fipeReferenceValue, state.my_offer);
  const minimumMoney = formatMoneyValue(minimumAcceptedPrice);
  const highestMoney = formatMoneyValue(state.current_highest_offer);
  const myOfferMoney = formatMoneyValue(state.my_offer);

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

    /*
      AS DUAS BARREIRAS, conferidas aqui ANTES do POST.

      Esta checagem NÃO substitui o servidor — lá elas acontecem dentro da
      transação que trava a solicitação, que é o único lugar onde a leitura do
      líder é confiável. Aqui ela existe para transformar um 409 previsível em
      resposta imediata, com o alvo na tela.

      A ordem espelha a do backend: enquanto não há proposta, a barreira é o PISO
      e o operador é `>=`; a partir da primeira, é a maior atual e o operador
      vira `>`. Inverter aqui faria a tela recusar um valor que a API aceita.
    */
    const cents = Number(digits);
    const minimumCents = toCents(minimumAcceptedPrice);
    const highestCents = toCents(state.current_highest_offer);

    if (highestCents == null && minimumCents != null && cents < minimumCents) {
      setError(
        `A proposta precisa alcançar o valor mínimo do proprietário (${formatMoneyValue(
          minimumAcceptedPrice
        )}).`
      );
      return;
    }

    if (highestCents != null && cents <= highestCents) {
      setError(
        `A proposta precisa superar a maior proposta atual (${formatMoneyValue(
          state.current_highest_offer
        )}).`
      );
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
      className="overflow-hidden rounded-2xl border border-[#E5E9F2] bg-white shadow-[0_2px_10px_-4px_rgba(16,32,64,0.10)]"
      data-testid="dealer-offer-panel"
      aria-label="Negociação"
    >
      <header className="flex items-center gap-2 border-b border-[#F2F4F7] px-4 py-3.5 sm:px-5">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF4FF] text-[#0e62d8]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M3 21h8M6.5 14.5l6-6M4 11l5-5 3.5 3.5-5 5zM14 4l6 6M15.5 9.5l4.5 4.5-2 2-4.5-4.5z" />
          </svg>
        </span>
        <h2 className="text-[15px] font-bold text-[#161f34]">Negociação</h2>
      </header>

      <div className="px-4 py-4 sm:px-5">
        {/*
          O PISO — o número grande da coluna (§22/§23/§55).

          Dois `data-testid` aninhados, e não por acaso:
            `dealer-detail-minimum` é o BLOCO, e existe sempre;
            `dealer-offer-minimum`  é o VALOR, e só existe quando há piso real.
          É o que permite a uma tela só responder "o mínimo aparece" e "não há
          número inventado quando ele falta" sem que as duas respostas se
          atrapalhem.
        */}
        <div data-testid="dealer-detail-minimum">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[#98A2B3]">
            Valor mínimo do vendedor
          </p>
          {minimumMoney ? (
            <p
              className="mt-1 text-[30px] font-bold leading-none tabular-nums text-[#0e62d8] sm:text-[32px]"
              data-testid="dealer-offer-minimum"
            >
              {minimumMoney}
            </p>
          ) : (
            /*
              §55 — "Valor não informado", e nunca "R$ 0,00" nem um travessão
              solto. O tamanho cai porque não é mais um número: uma frase em
              corpo 30 gritaria uma ausência.
            */
            <p className="mt-1 text-[15px] font-bold leading-tight text-[#667085]">
              {NOT_INFORMED}
            </p>
          )}
          <p className="mt-1 text-[11px] leading-relaxed text-[#98A2B3]">
            Valor declarado pelo proprietário como mínimo aceito nesta rodada.
          </p>
        </div>

        {/*
          A DISPUTA — os dois valores lado a lado (§26/§27/§39).
          `grid-cols-2` desde 360px: são dois números curtos, e empilhá-los
          gastaria a altura que o formulário precisa acima da dobra.
        */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#F2F4F7] pt-3.5">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#98A2B3]">
              Maior oferta atual
            </p>
            {highestMoney ? (
              <p className="mt-0.5 text-[17px] font-bold leading-tight tabular-nums text-[#1D2440]">
                {highestMoney}
              </p>
            ) : (
              <p className="mt-0.5 text-[12px] leading-snug text-[#98A2B3]">
                Nenhuma oferta recebida ainda.
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#98A2B3]">
              Sua última oferta
            </p>
            {myOfferMoney ? (
              <p
                className={`mt-0.5 text-[17px] font-bold leading-tight tabular-nums ${
                  state.is_leading ? "text-[#067647]" : "text-[#1D2440]"
                }`}
              >
                {myOfferMoney}
              </p>
            ) : (
              <p className="mt-0.5 text-[12px] leading-snug text-[#98A2B3]">
                Você ainda não fez uma oferta.
              </p>
            )}
          </div>
        </div>

        {/* Badge de posição — sem nomes, dos dois lados. */}
        {state.my_offer ? (
          <p
            className={`mt-3 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-bold leading-none ${
              state.is_leading ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#FFF4ED] text-[#B93815]"
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

        {/*
          Distância para a FIPE — rotulada como distância, e nunca como margem ou
          lucro. Só aparece quando existem os DOIS lados (FIPE resolvida e
          proposta enviada); sem um deles não há diferença a mostrar.
        */}
        {distance ? (
          <p className="mt-2 text-[12px] text-[#667085]" data-testid="dealer-offer-fipe-distance">
            Distância da sua oferta para a FIPE:{" "}
            <span className="font-semibold text-[#1D2440]">
              {formatMoneyValue(distance.amount)}
            </span>{" "}
            {distance.belowFipe ? "abaixo" : "acima"}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 border-t border-[#F2F4F7] pt-4">
          <label
            htmlFor="dealer-offer-amount"
            className="text-[12px] font-bold text-[#1D2440]"
          >
            Sua nova oferta
          </label>

          {/*
            Prefixo "R$" FORA do campo (§28): dentro, ele era apagado junto com o
            valor a cada limpeza e reaparecia só depois do primeiro dígito. Fora,
            a moeda é constante e o campo guarda apenas o número.

            `focus-within` no invólucro para que o anel de foco contorne prefixo e
            campo como uma peça só — sem isto o foco desenharia um retângulo no
            meio do controle.
          */}
          <div className="mt-1.5 flex items-stretch overflow-hidden rounded-xl border border-[#E5E9F2] bg-white transition focus-within:border-[#0e62d8] focus-within:ring-2 focus-within:ring-[#0e62d8]/15">
            <span
              className="flex shrink-0 items-center border-r border-[#E5E9F2] bg-[#F7F9FC] px-3 text-[13px] font-bold text-[#667085]"
              aria-hidden="true"
            >
              R$
            </span>
            <input
              id="dealer-offer-amount"
              inputMode="numeric"
              value={formatAmountDigits(digits)}
              onChange={(event) => {
                setDigits(moneyDigits(event.target.value));
                setError(null);
                setSuccess(null);
              }}
              placeholder="Ex.: 62.500,00"
              /* O leitor de tela não recebe o "R$" do prefixo (ele é
                 `aria-hidden`), então o rótulo acessível carrega a moeda. */
              aria-label="Valor da sua nova oferta, em reais"
              className="h-14 w-full min-w-0 bg-transparent px-3 text-[20px] font-bold tabular-nums text-[#1D2440] outline-none placeholder:text-[15px] placeholder:font-normal placeholder:text-[#C3CDDE]"
              data-testid="dealer-offer-amount"
            />
          </div>

          {bumpFrom ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[500, 1000, 2000].map((increment) => (
                <button
                  key={increment}
                  type="button"
                  onClick={() => applyBump(increment)}
                  className="h-9 rounded-lg border border-[#DBE7FB] bg-white text-[12px] font-bold text-[#0e62d8] transition hover:bg-[#F0F6FF] focus-visible:ring-2 focus-visible:ring-[#0e62d8]"
                  data-testid={`dealer-offer-bump-${increment}`}
                >
                  + R$ {increment.toLocaleString("pt-BR")}
                </button>
              ))}
            </div>
          ) : null}

          {/*
            "Observações para avaliação", e não "Mensagem". O campo NÃO é canal de
            conversa: não existe resposta, não existe histórico de thread, e o
            vendedor não vê este texto nesta fase. Um rótulo de mensagem faria o
            lojista escrever esperando resposta.
          */}
          <label
            htmlFor="dealer-offer-note"
            className="mt-3.5 block text-[11px] font-semibold text-[#64748b]"
          >
            Observações para avaliação (opcional)
          </label>
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

          {/*
            "Fazer oferta" (§29). O card do feed já dizia "Fazer oferta" e o
            detalhe dizia "Enviar oferta" — a mesma ação com dois nomes, um em
            cada tela do mesmo fluxo. Alinhar pelo primeiro custa uma string e
            elimina a divergência; alinhar pelo segundo custaria mexer no card,
            no teste do card e no E2E do feed.
          */}
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 h-12 w-full rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="dealer-offer-submit"
          >
            {submitting ? "Enviando…" : "Fazer oferta"}
          </button>

          {/*
            §36 — AS CONDIÇÕES CONTINUAM INTEIRAS, EM UM CLIQUE.

            A versão anterior empilhava três parágrafos de regra sob o botão. Eles
            ocupavam mais altura que o formulário e, por serem sempre iguais,
            passaram a ser mobiliário: quem abre a décima oportunidade não lê a
            décima vez.

            Nada foi removido nem reescrito — `DEALER_OFFER_COMMITMENT_NOTICE` e
            `DEALER_OFFER_INSPECTION_NOTICE` são as mesmas constantes. O que
            mudou é que a regra ESSENCIAL (a oferta é um compromisso) virou uma
            linha visível no caminho do olho, e o detalhamento ficou atrás de "Ver
            condições".

            Botão, e não `<details>`: o resumo precisa herdar o estilo do resto do
            painel, e o marcador nativo do `<summary>` varia entre navegadores.
          */}
          <p
            className="mt-3 text-[11.5px] leading-relaxed text-[#667085]"
            data-testid="dealer-offer-commitment"
          >
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
              <p
                className="text-[11.5px] leading-relaxed text-[#98A2B3]"
                data-testid="dealer-offer-inspection-notice"
              >
                {DEALER_OFFER_INSPECTION_NOTICE}
              </p>
              <p className="text-[11px] leading-relaxed text-[#98A2B3]">
                A oferta precisa superar a maior proposta atual.
              </p>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
