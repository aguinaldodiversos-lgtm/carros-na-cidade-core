"use client";

import Link from "next/link";
import { formatMoneyInput, moneyDigits } from "@/lib/sale-requests/api";
import { fieldDomId, fieldErrorDomId } from "@/lib/sale-requests/evaluation";
import type { SaleRequestFormState } from "@/lib/sale-requests/evaluation";
import {
  DEALER_DISCOUNT,
  formatRecommended,
  isAboveRecommended,
  recommendedMaxPrice,
} from "@/lib/sale-requests/pricing";

/**
 * O VALOR MÍNIMO que o proprietário aceita (Fase 4.3.3).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A TELA ORIENTA; ELA NÃO CALCULA PELO PROPRIETÁRIO
 * ────────────────────────────────────────────────────────────────────────────
 * A faixa recomendada (FIPE − 15%) aparece como REFERÊNCIA ao lado do campo, e
 * o campo começa VAZIO. Preenchê-lo automaticamente com 85% da FIPE pareceria
 * conveniência e seria outra coisa: a pessoa publicaria um piso que ela nunca
 * decidiu, e descobriria o número só quando uma loja o alcançasse.
 *
 * O valor mínimo é a única declaração econômica que o proprietário faz neste
 * produto. Ele precisa ser digitado por quem o assume.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ACIMA DA FAIXA NÃO BLOQUEIA — AVISA E OFERECE O CAMINHO CERTO
 * ────────────────────────────────────────────────────────────────────────────
 * Quem pede um valor colado na FIPE não está errado: está no produto errado. A
 * loja compra para revender, e sobre o valor pago ainda entram preparação,
 * garantia, impostos e margem — por isso o aviso explica o MOTIVO em vez de
 * repetir "está alto", e aponta o anúncio convencional, onde pessoas físicas
 * também veem o veículo.
 *
 * Bloquear aqui empurraria a pessoa para fora do site sem que ela soubesse que
 * existe outro caminho dentro dele.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEM FIPE, SEM FAIXA — E A PUBLICAÇÃO CONTINUA
 * ────────────────────────────────────────────────────────────────────────────
 * O provedor FIPE é externo e cai. Quando não há referência, a seção diz
 * exatamente isso e o campo continua obrigatório. O que ela NÃO faz: inventar
 * faixa, mostrar "R$ 0" ou impedir a publicação por causa da indisponibilidade
 * de um terceiro.
 */
export default function SaleRequestPriceSection({
  state,
  update,
  errorFor,
  fipeValue,
  fipeLoading = false,
}: {
  state: SaleRequestFormState;
  update: (patch: Partial<SaleRequestFormState>) => void;
  errorFor: (field: string) => string | null;
  /** Referência FIPE do veículo escolhido, em reais. `null` quando indisponível. */
  fipeValue: number | null;
  fipeLoading?: boolean;
}) {
  const error = errorFor("minimum_price");
  const recommendedMax = recommendedMaxPrice(fipeValue);

  // Centavos → reais, para comparar com a faixa. `null` enquanto o campo está
  // vazio: sem valor digitado não existe "acima do recomendado".
  const digits = moneyDigits(state.minimumPrice);
  const typedValue = digits === "" ? null : Number(digits) / 100;
  const aboveRecommended = isAboveRecommended(typedValue, fipeValue);

  return (
    <div className="grid gap-4">
      <p className="text-[13px] leading-relaxed text-[#475467]">
        Lojistas compram veículos para revenda e precisam considerar preparação, garantia,
        impostos e margem de revenda. Para aumentar suas chances de receber propostas,
        recomendamos informar um valor pelo menos {Math.round(DEALER_DISCOUNT * 100)}% abaixo
        da referência FIPE.
      </p>

      {/* ── REFERÊNCIAS ────────────────────────────────────────────────────
          Dois números que a pessoa LÊ, e nenhum campo editável: são contexto
          para a decisão, não entrada de dados. */}
      <div
        className="grid gap-3 rounded-xl border border-[#E5E9F2] bg-[#F9FAFC] p-3.5 sm:grid-cols-2"
        data-testid="sale-request-price-reference"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#98A2B3]">
            Referência FIPE
          </p>
          {fipeValue != null ? (
            <p
              className="text-[17px] font-bold leading-tight text-[#1D2440]"
              data-testid="sale-request-fipe-reference"
            >
              {formatRecommended(fipeValue)}
            </p>
          ) : (
            <p
              className="text-[13px] font-medium leading-tight text-[#667085]"
              data-testid="sale-request-fipe-reference"
            >
              {fipeLoading
                ? "Consultando…"
                : "Referência FIPE indisponível no momento."}
            </p>
          )}
        </div>

        {/* A faixa só existe quando há FIPE. Sem ela, nada é mostrado aqui —
            um "Até R$ 0,00" teria aparência de orientação oficial. */}
        {recommendedMax != null ? (
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#98A2B3]">
              Faixa recomendada para venda a lojistas
            </p>
            <p
              className="text-[17px] font-bold leading-tight text-[#067647]"
              data-testid="sale-request-recommended-max"
            >
              Até {formatRecommended(recommendedMax)}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── O CAMPO ────────────────────────────────────────────────────────
          Obrigatório, e sem valor pré-preenchido. */}
      <label className="block min-w-0">
        <span className="mb-2 block text-[13px] font-semibold text-[#33405A]">
          Valor mínimo que você aceita
        </span>
        <input
          id={fieldDomId("minimum_price")}
          className={`h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-[#1D2440] outline-none transition focus:border-[#1F66E5] sm:max-w-[280px] ${
            error ? "border-[#FDA29B]" : "border-[#E5E9F2]"
          }`}
          value={formatMoneyInput(state.minimumPrice)}
          onChange={(event) => update({ minimumPrice: moneyDigits(event.target.value) })}
          inputMode="numeric"
          autoComplete="off"
          placeholder="R$ 0,00"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? fieldErrorDomId("minimum_price") : undefined}
          data-testid="sale-request-minimum-price"
        />
        <span className="mt-1 block text-[11px] text-[#64748b]">
          Nenhuma loja poderá propor abaixo deste valor.
        </span>
        {error ? (
          <span
            id={fieldErrorDomId("minimum_price")}
            className="mt-1 block text-[12px] font-medium text-[#b42318]"
            role="alert"
          >
            {error}
          </span>
        ) : null}
      </label>

      {/* ── O AVISO COMERCIAL ──────────────────────────────────────────────
          Aparece quando o valor passa da faixa, e NÃO impede o envio. */}
      {aboveRecommended ? (
        <div
          className="rounded-xl border border-[#FEDF89] bg-[#FFFCF5] px-4 py-3"
          data-testid="sale-request-price-warning"
        >
          <p className="text-[13px] font-semibold text-[#B54708]">
            Este valor está próximo da referência FIPE.
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#93370D]">
            Veículos enviados para lojas normalmente precisam ter margem para preparação,
            garantia e revenda. Com esse valor, suas chances de receber propostas podem ser
            menores.
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#93370D]">
            Quer buscar um valor próximo ao mercado?{" "}
            <Link
              href="/anunciar/novo"
              className="font-bold underline underline-offset-2 hover:text-[#B54708]"
              data-testid="sale-request-conventional-ad-link"
            >
              Crie um anúncio convencional
            </Link>{" "}
            para que pessoas físicas e lojas encontrem seu veículo.
          </p>
        </div>
      ) : null}
    </div>
  );
}
