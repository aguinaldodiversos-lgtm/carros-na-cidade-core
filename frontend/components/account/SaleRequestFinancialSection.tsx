"use client";

import SaleRequestChoiceGroup from "@/components/account/SaleRequestChoiceGroup";
import { MoneyField } from "@/components/account/SaleRequestFields";
import {
  IPVA_STATUS_OPTIONS,
  LICENSING_STATUS_OPTIONS,
  YES_NO_UNKNOWN_OPTIONS,
} from "@/lib/sale-requests/api";
import type { SaleRequestFormState } from "@/lib/sale-requests/evaluation";

/**
 * Pendências financeiras e documentação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTA SEÇÃO NÃO PERGUNTA
 * ────────────────────────────────────────────────────────────────────────────
 * Banco, número do contrato, agência, conta e órgão autuador. O lojista precisa
 * saber SE existe pendência e QUANTO ela pesa para fazer uma oferta preliminar;
 * com quem é a dívida é assunto do fechamento, e coletar isso agora criaria um
 * dado sensível que o produto não tem como proteger nem por que usar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O CAMPO DE VALOR SOME QUANDO A RESPOSTA MUDA — E O ESTADO SOME JUNTO
 * ────────────────────────────────────────────────────────────────────────────
 * Trocar "sim" por "não" esconde o campo E limpa o que estava digitado. Só
 * esconder deixaria um saldo devedor invisível no estado, pronto para viajar no
 * envio se algum caminho futuro parasse de normalizar. A tela não deve depender
 * de outra camada para não mentir.
 */
export default function SaleRequestFinancialSection({
  state,
  update,
  errorFor,
}: {
  state: SaleRequestFormState;
  update: (patch: Partial<SaleRequestFormState>) => void;
  errorFor: (field: string) => string | null;
}) {
  const ipvaHasDebt = state.ipvaStatus === "installments" || state.ipvaStatus === "open";

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <SaleRequestChoiceGroup
          field="financing_status"
          legend="O veículo possui financiamento ativo?"
          options={YES_NO_UNKNOWN_OPTIONS}
          value={state.financingStatus}
          onChange={(value) =>
            update({
              financingStatus: value,
              financingBalance: value === "yes" ? state.financingBalance : "",
            })
          }
          error={errorFor("financing_status")}
        />

        {state.financingStatus === "yes" ? (
          <MoneyField
            field="financing_balance"
            label="Saldo devedor aproximado"
            value={state.financingBalance}
            onChange={(digits) => update({ financingBalance: digits })}
            hint="Um valor aproximado já ajuda a loja a avaliar."
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SaleRequestChoiceGroup
          field="fines_status"
          legend="Possui multas pendentes?"
          options={YES_NO_UNKNOWN_OPTIONS}
          value={state.finesStatus}
          onChange={(value) =>
            update({
              finesStatus: value,
              finesAmount: value === "yes" ? state.finesAmount : "",
            })
          }
          error={errorFor("fines_status")}
        />

        {state.finesStatus === "yes" ? (
          <MoneyField
            field="fines_amount"
            label="Valor aproximado das multas"
            value={state.finesAmount}
            onChange={(digits) => update({ finesAmount: digits })}
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SaleRequestChoiceGroup
          field="ipva_status"
          legend="Situação do IPVA"
          options={IPVA_STATUS_OPTIONS}
          value={state.ipvaStatus}
          onChange={(value) =>
            update({
              ipvaStatus: value,
              ipvaAmountDue:
                value === "installments" || value === "open" ? state.ipvaAmountDue : "",
            })
          }
          error={errorFor("ipva_status")}
        />

        {ipvaHasDebt ? (
          <MoneyField
            field="ipva_amount_due"
            label="Valor pendente aproximado"
            value={state.ipvaAmountDue}
            onChange={(digits) => update({ ipvaAmountDue: digits })}
          />
        ) : null}
      </div>

      <SaleRequestChoiceGroup
        field="licensing_status"
        legend="Situação do licenciamento"
        options={LICENSING_STATUS_OPTIONS}
        value={state.licensingStatus}
        onChange={(value) => update({ licensingStatus: value })}
        error={errorFor("licensing_status")}
      />
    </div>
  );
}
