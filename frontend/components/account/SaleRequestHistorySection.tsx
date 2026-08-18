"use client";

import SaleRequestChoiceGroup from "@/components/account/SaleRequestChoiceGroup";
import {
  CAUTION_REPORT_RESULT_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
} from "@/lib/sale-requests/api";
import type { SaleRequestFormState } from "@/lib/sale-requests/evaluation";

/**
 * Histórico do veículo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DUAS PERGUNTAS, UMA COLUNA
 * ────────────────────────────────────────────────────────────────────────────
 * "Possui laudo cautelar?" e "Resultado do laudo" são separadas na TELA porque
 * é assim que a pessoa pensa, e uma só no BANCO porque é assim que o dado deixa
 * de admitir contradição. `resolveCautionReportStatus` faz a junção; o resultado
 * só é lido quando a primeira resposta é "sim", então "não possui laudo" nunca
 * pode chegar acompanhado de "aprovado".
 *
 * Trocar a primeira resposta limpa a segunda pelo mesmo motivo que o campo de
 * saldo é limpo na seção anterior: um resultado órfão no estado é uma resposta
 * que ninguém deu.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "CONHECIDO"
 * ────────────────────────────────────────────────────────────────────────────
 * A pergunta de sinistro diz "colisão relevante ou sinistro CONHECIDO". A
 * palavra não é enfeite: sem ela, um "não" viraria a afirmação de que o carro
 * nunca bateu — algo que o proprietário não tem como garantir sobre um veículo
 * que pode ter tido outros donos. Com ela, o "não" declara o que a pessoa sabe,
 * que é tudo o que ela pode honestamente declarar.
 */
export default function SaleRequestHistorySection({
  state,
  update,
  errorFor,
}: {
  state: SaleRequestFormState;
  update: (patch: Partial<SaleRequestFormState>) => void;
  errorFor: (field: string) => string | null;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <SaleRequestChoiceGroup
          field="caution_report_has"
          legend="Possui laudo cautelar?"
          options={YES_NO_UNKNOWN_OPTIONS}
          value={state.cautionReportHas}
          onChange={(value) =>
            update({
              cautionReportHas: value,
              cautionReportResult: value === "yes" ? state.cautionReportResult : "",
            })
          }
          error={errorFor("caution_report_has")}
        />

        {state.cautionReportHas === "yes" ? (
          <SaleRequestChoiceGroup
            field="caution_report_result"
            legend="Resultado do laudo"
            options={CAUTION_REPORT_RESULT_OPTIONS}
            value={state.cautionReportResult}
            onChange={(value) => update({ cautionReportResult: value })}
            layout="stack"
            error={errorFor("caution_report_result")}
          />
        ) : null}
      </div>

      <SaleRequestChoiceGroup
        field="auction_history"
        legend="O veículo passou por leilão?"
        options={YES_NO_UNKNOWN_OPTIONS}
        value={state.auctionHistory}
        onChange={(value) => update({ auctionHistory: value })}
        error={errorFor("auction_history")}
      />

      <SaleRequestChoiceGroup
        field="collision_history"
        legend="O veículo já sofreu colisão relevante ou sinistro conhecido?"
        options={YES_NO_UNKNOWN_OPTIONS}
        value={state.collisionHistory}
        onChange={(value) => update({ collisionHistory: value })}
        error={errorFor("collision_history")}
      />
    </div>
  );
}
