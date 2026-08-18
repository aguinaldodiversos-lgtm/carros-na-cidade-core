"use client";

import SaleRequestChoiceGroup from "@/components/account/SaleRequestChoiceGroup";
import { NotesField } from "@/components/account/SaleRequestFields";
import { EVALUATION_LIMITS, MECHANICAL_CONDITION_OPTIONS } from "@/lib/sale-requests/api";
import type { SaleRequestFormState } from "@/lib/sale-requests/evaluation";

/**
 * Mecânica — motor, câmbio e suspensão, independentes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "SEM PROBLEMAS CONHECIDOS" NÃO É "PERFEITO"
 * ────────────────────────────────────────────────────────────────────────────
 * O rótulo da opção positiva é literalmente "Sem problemas conhecidos", e não
 * "Em ordem" ou "Perfeito". A ficha é a declaração de quem dirige o carro, não
 * o resultado de uma inspeção: o proprietário pode honestamente não saber de um
 * problema que existe, e um rótulo absoluto transformaria esse silêncio numa
 * garantia que ele não tem como dar.
 *
 * Os três conjuntos são perguntas SEPARADAS porque falham separadamente e
 * custam valores muito diferentes de consertar. Uma pergunta única de "estado
 * mecânico" esconderia justamente a informação que decide a oferta.
 *
 * A descrição é EXIGIDA quando há problema — mesma regra do backend, repetida
 * aqui para dar a mensagem no ato — e é APAGADA quando a resposta deixa de ser
 * "possui problema", para que um texto abandonado não sobreviva à mudança de
 * ideia.
 */

const PARTS = [
  {
    key: "engine",
    label: "Motor",
    field: "engine_condition",
    notesField: "engine_notes",
  },
  {
    key: "gearbox",
    label: "Câmbio",
    field: "gearbox_condition",
    notesField: "gearbox_notes",
  },
  {
    key: "suspension",
    label: "Suspensão",
    field: "suspension_condition",
    notesField: "suspension_notes",
  },
] as const;

export default function SaleRequestMechanicsSection({
  state,
  update,
  errorFor,
}: {
  state: SaleRequestFormState;
  update: (patch: Partial<SaleRequestFormState>) => void;
  errorFor: (field: string) => string | null;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {PARTS.map((part) => {
        const condition = state[`${part.key}Condition`] as SaleRequestFormState["engineCondition"];
        const notes = state[`${part.key}Notes`] as string;

        return (
          <div key={part.key} className="min-w-0">
            <SaleRequestChoiceGroup
              field={part.field}
              legend={part.label}
              options={MECHANICAL_CONDITION_OPTIONS}
              value={condition}
              onChange={(value) =>
                update({
                  [`${part.key}Condition`]: value,
                  // Some da tela e some do estado: um texto invisível que ainda
                  // viaja no envio é pior que nenhum texto.
                  [`${part.key}Notes`]: value === "issue" ? notes : "",
                } as Partial<SaleRequestFormState>)
              }
              layout="stack"
              error={errorFor(part.field)}
            />

            {condition === "issue" ? (
              <NotesField
                field={part.notesField}
                label="Descreva o problema"
                value={notes}
                onChange={(value) =>
                  update({ [`${part.key}Notes`]: value } as Partial<SaleRequestFormState>)
                }
                maxLength={EVALUATION_LIMITS.MECHANICAL_NOTES_MAX}
                placeholder="Ex.: trepida ao trocar da 2ª para a 3ª."
                required
                error={errorFor(part.notesField)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
