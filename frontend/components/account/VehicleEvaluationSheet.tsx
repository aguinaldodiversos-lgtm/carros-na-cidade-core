"use client";

import {
  NOT_INFORMED,
  formatMoneyValue,
  readBodyPaintIssue,
  readBodyPaintStatus,
  readCautionReport,
  readIpvaStatus,
  readLicensingStatus,
  readMechanicalCondition,
  readTireCondition,
  readYesNoUnknown,
  type BodyPaintIssue,
  type BodyPaintStatus,
  type CautionReportStatus,
  type IpvaStatus,
  type LicensingStatus,
  type MechanicalCondition,
  type TireCondition,
  type YesNoUnknown,
} from "@/lib/sale-requests/api";

/**
 * A ficha de avaliação do veículo — a MESMA para o dono e para o lojista.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE COMPARTILHAR ESTE COMPONENTE, E SÓ ELE
 * ────────────────────────────────────────────────────────────────────────────
 * Quem publica precisa poder confiar que a loja lê EXATAMENTE o que ele
 * declarou. Duas implementações da mesma ficha divergem na primeira correção de
 * rótulo — e o sintoma seria a tela do dono dizendo "Quitado" e a do lojista
 * dizendo outra coisa para a mesma linha do banco. Não há como um usuário
 * descobrir isso; os dois veem só a própria tela.
 *
 * O que NÃO foi compartilhado, de propósito: a tela do dono inteira. Ela carrega
 * o cancelamento, o status da solicitação e a contagem de fotos — ações e
 * rótulos que só fazem sentido para quem publicou. Compartilhar o domínio
 * inteiro por acidente levaria um botão "Cancelar solicitação" para a área do
 * lojista.
 *
 * Aqui só existe LEITURA: nenhum callback, nenhum estado, nenhuma ação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "NÃO INFORMADO" NUNCA VIRA "NÃO"
 * ────────────────────────────────────────────────────────────────────────────
 * Solicitações publicadas antes desta ficha existir têm NULL em todas as
 * colunas. NULL significa "a versão anterior do formulário não perguntou", e é
 * exibido como "Não informado" em cinza claro — visualmente distinto de um valor
 * real, para que a ausência não se pareça com resposta.
 *
 * `'unknown'` é OUTRA coisa: a pessoa foi perguntada e respondeu "não sei
 * informar". Os dois chegam aqui separados e saem daqui separados.
 */

export type VehicleEvaluationFields = {
  tire_condition: TireCondition | null;

  financing_status: YesNoUnknown | null;
  financing_balance: string | null;
  fines_status: YesNoUnknown | null;
  fines_amount: string | null;
  ipva_status: IpvaStatus | null;
  ipva_amount_due: string | null;
  licensing_status: LicensingStatus | null;

  caution_report_status: CautionReportStatus | null;
  auction_history: YesNoUnknown | null;
  collision_history: YesNoUnknown | null;

  engine_condition: MechanicalCondition | null;
  engine_notes: string | null;
  gearbox_condition: MechanicalCondition | null;
  gearbox_notes: string | null;
  suspension_condition: MechanicalCondition | null;
  suspension_notes: string | null;

  body_paint_status: BodyPaintStatus | null;
  body_paint_issues: BodyPaintIssue[] | null;
  body_paint_notes: string | null;
};

/**
 * Uma linha de dado.
 *
 * `value` nulo vira "Não informado" em cinza claro — visualmente distinto de um
 * valor real, para que a ausência não se pareça com resposta.
 */
export function DataRow({ label, value }: { label: string; value: string | null }) {
  const filled = Boolean(value);
  return (
    <div className="flex flex-col gap-0.5 border-b border-[#F2F4F7] py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-[13px] text-[#64748b]">{label}</dt>
      <dd
        className={`text-[13px] sm:text-right ${
          filled ? "font-semibold text-[#1D2440]" : "text-[#98A2B3]"
        }`}
      >
        {value || NOT_INFORMED}
      </dd>
    </div>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <h2 className="mb-1 text-[13px] font-bold text-[#161f34]">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

/** Condição mecânica + a descrição do problema, quando existe. */
function MechanicalRow({
  label,
  condition,
  notes,
}: {
  label: string;
  condition: MechanicalCondition | null;
  notes: string | null;
}) {
  return (
    <>
      <DataRow label={label} value={readMechanicalCondition(condition)} />
      {notes ? (
        <p className="-mt-1 mb-2 whitespace-pre-line rounded-xl bg-[#F9FBFF] px-3 py-2 text-[12px] leading-relaxed text-[#475467]">
          {notes}
        </p>
      ) : null}
    </>
  );
}

/** Valor com um complemento monetário entre parênteses, quando houver. */
export function withAmount(base: string | null, amount: string | null): string | null {
  if (!base) return null;
  const money = formatMoneyValue(amount);
  return money ? `${base} (${money})` : base;
}

export default function VehicleEvaluationSheet({
  evaluation,
  declaredConditionLabel,
  /** Cards extras da tela chamadora (ex.: "Dados do veículo"), na mesma grade. */
  leading,
}: {
  evaluation: VehicleEvaluationFields;
  declaredConditionLabel: string | null;
  leading?: React.ReactNode;
}) {
  const bodyPaintIssuesLabel =
    Array.isArray(evaluation.body_paint_issues) && evaluation.body_paint_issues.length > 0
      ? evaluation.body_paint_issues.map(readBodyPaintIssue).filter(Boolean).join(", ")
      : null;

  return (
    /*
      Duas colunas a partir de `md`, uma no mobile. Os cartões são independentes,
      então a grade pode reorganizá-los sem quebrar leitura nenhuma — e o detalhe
      não vira um painel único ilegível.
    */
    <div className="grid gap-4 md:grid-cols-2">
      {leading}

      <Card title="Estado geral e pneus">
        <DataRow label="Estado geral" value={declaredConditionLabel} />
        <DataRow label="Pneus" value={readTireCondition(evaluation.tire_condition)} />
      </Card>

      <Card title="Pendências e documentação">
        <DataRow
          label="Financiamento ativo"
          value={withAmount(
            readYesNoUnknown(evaluation.financing_status),
            evaluation.financing_balance
          )}
        />
        <DataRow
          label="Multas pendentes"
          value={withAmount(readYesNoUnknown(evaluation.fines_status), evaluation.fines_amount)}
        />
        <DataRow
          label="IPVA"
          value={withAmount(readIpvaStatus(evaluation.ipva_status), evaluation.ipva_amount_due)}
        />
        <DataRow label="Licenciamento" value={readLicensingStatus(evaluation.licensing_status)} />
      </Card>

      <Card title="Histórico do veículo">
        <DataRow label="Laudo cautelar" value={readCautionReport(evaluation.caution_report_status)} />
        <DataRow label="Passagem por leilão" value={readYesNoUnknown(evaluation.auction_history)} />
        <DataRow
          label="Colisão ou sinistro conhecido"
          value={readYesNoUnknown(evaluation.collision_history)}
        />
      </Card>

      <Card title="Mecânica">
        <MechanicalRow
          label="Motor"
          condition={evaluation.engine_condition}
          notes={evaluation.engine_notes}
        />
        <MechanicalRow
          label="Câmbio"
          condition={evaluation.gearbox_condition}
          notes={evaluation.gearbox_notes}
        />
        <MechanicalRow
          label="Suspensão"
          condition={evaluation.suspension_condition}
          notes={evaluation.suspension_notes}
        />
      </Card>

      <Card title="Lataria e pintura">
        <DataRow label="Situação" value={readBodyPaintStatus(evaluation.body_paint_status)} />
        {/*
          A linha de detalhes só existe quando o estado declarado é "possui
          detalhes". Mostrá-la vazia para quem respondeu "nenhum detalhe"
          sugeriria uma pergunta sem resposta onde a resposta foi dada.
        */}
        {evaluation.body_paint_status === "issues" ? (
          <DataRow label="Detalhes" value={bodyPaintIssuesLabel} />
        ) : null}
        {evaluation.body_paint_notes ? (
          <DataRow label="Onde" value={evaluation.body_paint_notes} />
        ) : null}
      </Card>
    </div>
  );
}
