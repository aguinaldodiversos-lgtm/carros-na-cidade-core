"use client";

import {
  NOT_INFORMED,
  fipeComparison,
  formatFipeReferenceMonth,
  formatMoneyValue,
} from "@/lib/sale-requests/dealer-api";

/**
 * "Referência de mercado" — o segundo cartão da coluna direita (§32 a §35).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE CARTÃO AFIRMA, E O QUE ELE NÃO AFIRMA
 * ════════════════════════════════════════════════════════════════════════════
 * AFIRMA: quanto a tabela FIPE dizia, na data do snapshot, e a que distância o
 * piso do proprietário está desse número.
 *
 * NÃO AFIRMA — e nenhum texto daqui pode sugerir:
 *
 *   • que a FIPE é preço de venda garantido. É referência, e a data ao lado do
 *     valor existe porque a tabela muda todo mês;
 *   • que a diferença é MARGEM (§34). Preparação, impostos, garantia, tempo de
 *     pátio e revenda não estão calculados em lugar nenhum deste sistema;
 *   • que a oportunidade é boa. Não há score, nota, medidor nem semáforo (§20) —
 *     a página mostra fatos e quem decide é o lojista.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A COMPARAÇÃO É COM O PISO, NÃO COM A PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 * O piso é o que o proprietário aceita receber, e é contra ele que o lojista
 * decide se vale entrar. A distância entre FIPE e a PROPOSTA já existe, tem
 * outro significado (o resultado da própria disputa) e mora no painel de
 * negociação — as duas usam `fipeComparison`, uma conta só.
 */
export default function OpportunityMarketReference({
  fipeReferenceValue,
  fipeReferenceAt,
  minimumAcceptedPrice,
}: {
  fipeReferenceValue: string | null;
  fipeReferenceAt: string | null;
  minimumAcceptedPrice: string | null;
}) {
  const fipeMonth = formatFipeReferenceMonth(fipeReferenceAt);
  const fipeMoney = formatMoneyValue(fipeReferenceValue);
  const comparison = fipeComparison(fipeReferenceValue, minimumAcceptedPrice);

  /**
   * "15,8%" — vírgula decimal, sempre uma casa.
   *
   * O "%" é concatenado à mão em vez de `style: "percent"`: o formatador do
   * Intl insere um ESPAÇO ESTREITO INSEPARÁVEL antes do símbolo em pt-BR, e ele
   * já quebrou asserção de texto neste projeto — um teste que procura "15,8%"
   * não casa "15,8 %" e o motivo não aparece no diff.
   */
  const percentLabel =
    comparison != null
      ? `${comparison.percent.toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}%`
      : null;

  // Empate: a diferença é zero e "abaixo"/"acima" seriam os dois falsos.
  const isEven = comparison != null && comparison.percent === 0;
  const directionWord = comparison?.belowFipe ? "abaixo" : "acima";

  return (
    <section
      className="rounded-2xl border border-[#E5E9F2] bg-white p-4 sm:p-5"
      data-testid="dealer-detail-market-reference"
    >
      <h2 className="text-[14px] font-bold text-[#161f34]">Referência de mercado</h2>

      {fipeMoney ? (
        <>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11.5px] leading-tight text-[#667085]">
                {/* A DATA faz parte do rótulo. Um valor FIPE sem época é pior
                    que valor nenhum para quem vai precificar hoje. */}
                {fipeMonth ? `Referência FIPE (${fipeMonth})` : "Referência FIPE"}
              </p>
              <p
                className="mt-0.5 text-[24px] font-bold leading-tight tabular-nums text-[#1D2440]"
                data-testid="dealer-detail-fipe-value"
              >
                {fipeMoney}
              </p>
            </div>

            {comparison && !isEven ? (
              <span
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-center text-[11.5px] font-bold leading-tight ${
                  comparison.belowFipe
                    ? "bg-[#ECFDF3] text-[#067647]"
                    : "bg-[#FFF4ED] text-[#B93815]"
                }`}
                data-testid="dealer-detail-fipe-badge"
              >
                {percentLabel}
                <span className="block font-semibold">{directionWord} da FIPE</span>
              </span>
            ) : null}
          </div>

          {comparison ? (
            <dl className="mt-4 space-y-2 border-t border-[#F2F4F7] pt-3">
              <div className="flex items-baseline justify-between gap-3">
                {/* "Diferença para a FIPE" — nunca "margem", nunca "lucro". */}
                <dt className="text-[12.5px] text-[#667085]">Diferença para a FIPE</dt>
                <dd
                  className="text-[13.5px] font-bold tabular-nums text-[#1D2440]"
                  data-testid="dealer-detail-fipe-difference"
                >
                  {isEven ? formatMoneyValue("0.00") : formatMoneyValue(comparison.amount)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[12.5px] text-[#667085]">Diferença percentual</dt>
                <dd
                  className="text-[13.5px] font-bold tabular-nums text-[#1D2440]"
                  data-testid="dealer-detail-fipe-percent"
                >
                  {isEven ? "No valor da FIPE" : `${percentLabel} ${directionWord}`}
                </dd>
              </div>
            </dl>
          ) : (
            /*
              FIPE existe, piso não. A comparação fica de fora — e a linha diz
              POR QUE, em vez de mostrar um travessão que o lojista leria como
              "deu zero".
            */
            <p className="mt-3 border-t border-[#F2F4F7] pt-3 text-[12px] leading-relaxed text-[#98A2B3]">
              O proprietário não informou o valor mínimo, então não há como
              calcular a diferença para a FIPE.
            </p>
          )}
        </>
      ) : (
        /*
          §32 — a FIPE só aparece quando existe valor REAL. Sem snapshot
          resolvido, o cartão diz que não há referência em vez de inventar um
          número ou repetir o piso como se fosse a tabela.
        */
        <p
          className="mt-3 text-[13px] leading-relaxed text-[#667085]"
          data-testid="dealer-detail-fipe-missing"
        >
          Referência FIPE: <span className="font-semibold text-[#1D2440]">{NOT_INFORMED}</span>
        </p>
      )}
    </section>
  );
}
