"use client";

import SaleRequestChoiceGroup, {
  SaleRequestCheckboxGroup,
} from "@/components/account/SaleRequestChoiceGroup";
import { NotesField } from "@/components/account/SaleRequestFields";
import {
  BODY_PAINT_ISSUE_OPTIONS,
  BODY_PAINT_STATUS_OPTIONS,
  EVALUATION_LIMITS,
  type BodyPaintIssue,
} from "@/lib/sale-requests/api";
import type { SaleRequestFormState } from "@/lib/sale-requests/evaluation";

/**
 * Lataria e pintura.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AS RESPOSTAS EXCLUSIVAS SÃO EXCLUSIVAS POR CONSTRUÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * "Nenhum detalhe conhecido" e "Não sei informar" não são caixas na mesma lista
 * dos detalhes — são opções de um RADIO anterior a ela. Por isso não existe o
 * estado "Nenhum detalhe + Riscos": não há como marcá-lo, em vez de haver uma
 * regra que o desfaz depois.
 *
 * Fosse uma lista única de checkboxes com "Nenhum desses" no meio, a
 * exclusividade viraria código de desmarcação a cada clique — e a versão que
 * esquecesse um caso gravaria a contradição.
 *
 * Trocar para uma resposta exclusiva limpa os detalhes E a observação, pelo
 * mesmo motivo das outras seções condicionais.
 */
export default function SaleRequestBodyPaintSection({
  state,
  update,
  errorFor,
}: {
  state: SaleRequestFormState;
  update: (patch: Partial<SaleRequestFormState>) => void;
  errorFor: (field: string) => string | null;
}) {
  const hasIssues = state.bodyPaintStatus === "issues";

  function toggleIssue(issue: BodyPaintIssue) {
    const next = state.bodyPaintIssues.includes(issue)
      ? state.bodyPaintIssues.filter((item) => item !== issue)
      : [...state.bodyPaintIssues, issue];
    update({ bodyPaintIssues: next });
  }

  return (
    <div className="grid gap-5">
      <SaleRequestChoiceGroup
        field="body_paint_status"
        legend="Há detalhes conhecidos na lataria ou pintura?"
        options={BODY_PAINT_STATUS_OPTIONS}
        value={state.bodyPaintStatus}
        onChange={(value) =>
          update({
            bodyPaintStatus: value,
            bodyPaintIssues: value === "issues" ? state.bodyPaintIssues : [],
            bodyPaintNotes: value === "issues" ? state.bodyPaintNotes : "",
          })
        }
        error={errorFor("body_paint_status")}
      />

      {hasIssues ? (
        <>
          <SaleRequestCheckboxGroup
            field="body_paint_issues"
            legend="Quais detalhes?"
            hint="Marque quantos precisar."
            options={BODY_PAINT_ISSUE_OPTIONS}
            values={state.bodyPaintIssues}
            onToggle={toggleIssue}
            error={errorFor("body_paint_issues")}
          />

          <NotesField
            field="body_paint_notes"
            label="Onde estão os detalhes?"
            value={state.bodyPaintNotes}
            onChange={(value) => update({ bodyPaintNotes: value })}
            maxLength={EVALUATION_LIMITS.BODY_PAINT_NOTES_MAX}
            placeholder="Ex.: pequeno amassado na porta traseira direita."
          />
        </>
      ) : null}
    </div>
  );
}
