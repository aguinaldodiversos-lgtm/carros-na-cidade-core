"use client";

import { useState } from "react";
import {
  ADJUSTMENT_REASON_LABEL,
  formatDifference,
  formatKm,
  formatMoneyValue,
  formatSlot,
  formatStoreLocation,
  readBodyPaintIssue,
  readBodyPaintStatus,
  readMechanicalCondition,
  readTireCondition,
  type OwnerInspection,
  type PostInspectionDecision,
} from "@/lib/sale-requests/inspection";
import {
  DECLARED_CONDITION_OPTIONS,
  confirmInspectionSlot,
  requestNewInspectionSlots,
  type SaleRequest,
} from "@/lib/sale-requests/api";

/**
 * A AVALIAÇÃO PRESENCIAL na tela do proprietário (Fase 4.5).
 *
 * Quatro momentos, um de cada vez: escolher o horário, esperar a visita, esperar
 * a proposta, e ver o resultado. A tela mostra só o que está acontecendo agora —
 * uma linha do tempo com quatro etapas visíveis faria a pessoa procurar em qual
 * delas está.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE NENHUM ESTADO DESTA TELA MOSTRA
 * ────────────────────────────────────────────────────────────────────────────
 * Telefone, WhatsApp, e-mail, CNPJ ou nome de operador da loja. A API não
 * devolve nenhum deles.
 *
 * O ENDEREÇO COMERCIAL aparece — e é a única informação da loja que atravessa a
 * fronteira. Ele existe por uma finalidade única: a pessoa precisa saber onde
 * comparecer. Não é canal de contato, e não vem acompanhado de nenhum.
 */

const CARD = "rounded-2xl border border-[#E5E9F2] bg-white p-4 sm:p-5";

function DataLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-[#F2F4F7] py-2 last:border-0">
      <span className="text-[12.5px] text-[#667085]">{label}</span>
      <span className="text-[13.5px] font-semibold text-[#1D2440]">{value}</span>
    </div>
  );
}

/** O bloco de local: nome da loja, endereço, cidade. Nada além disso. */
function StoreBlock({ store }: { store: OwnerInspection["store"] }) {
  if (!store) return null;
  const location = formatStoreLocation(store);

  return (
    <div className="mt-3 rounded-xl bg-[#F9FBFF] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">Local</p>
      <p className="mt-1 text-[14px] font-bold text-[#161f34]">{store.name}</p>
      {location ? (
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#475467]">{location}</p>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 1. ESCOLHER O HORÁRIO
// ────────────────────────────────────────────────────────────────────────────

function SlotPicker({
  saleRequestId,
  inspection,
  onChanged,
}: {
  saleRequestId: string | number;
  inspection: OwnerInspection;
  onChanged: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!chosen) return;
    setSubmitting(true);
    setError(null);
    try {
      await confirmInspectionSlot(saleRequestId, chosen);
      onChanged();
    } catch (failure) {
      setConfirming(false);
      setError(
        failure instanceof Error ? failure.message : "Não foi possível confirmar o horário."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestNew() {
    setSubmitting(true);
    setError(null);
    try {
      await requestNewInspectionSlots(saleRequestId);
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível solicitar novos horários."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={CARD} data-testid="owner-inspection-picker">
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">
        Avaliação presencial
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
        A loja enviou opções de horário para avaliar o seu veículo.
      </p>

      <StoreBlock store={inspection.store} />

      <fieldset className="mt-4">
        <legend className="text-[12.5px] font-semibold text-[#344054]">
          Escolha um horário
        </legend>
        <div className="mt-2 space-y-2">
          {inspection.slots.map((slot) => (
            <label
              key={String(slot.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                chosen === String(slot.id)
                  ? "border-[#0e62d8] bg-[#EFF4FF]"
                  : "border-[#E5E9F2] bg-white hover:bg-[#F9FBFF]"
              }`}
              data-testid="owner-inspection-slot"
            >
              <input
                type="radio"
                name="inspection-slot"
                value={String(slot.id)}
                checked={chosen === String(slot.id)}
                onChange={() => setChosen(String(slot.id))}
                className="h-4 w-4"
              />
              <span className="text-[13.5px] font-semibold text-[#1D2440]">
                {formatSlot(slot.starts_at)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p
          className="mt-3 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] text-[#b42318]"
          role="alert"
          data-testid="owner-inspection-error"
        >
          {error}
        </p>
      ) : null}

      {confirming ? (
        <div
          className="mt-4 rounded-[16px] border border-[#E5E9F2] bg-[#F9FBFF] p-4"
          data-testid="owner-inspection-confirm"
        >
          <p className="text-[13.5px] font-semibold text-[#1D2440]">Confirmar este horário?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#475467]">
            Você levará o veículo até a loja no horário escolhido. Depois de confirmado, o
            horário não poderá ser alterado por aqui.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={submitting}
              className="h-11 rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white disabled:opacity-50 sm:min-w-[160px]"
              data-testid="owner-inspection-confirm-submit"
            >
              {submitting ? "Confirmando…" : "Confirmar horário"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={submitting}
              className="h-11 rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#1D2440] disabled:opacity-50"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            disabled={!chosen || submitting}
            className="h-12 w-full rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
            data-testid="owner-inspection-submit"
          >
            Confirmar horário
          </button>

          {/*
            "Não consigo nesses horários" NÃO cancela a seleção da loja e NÃO
            reabre a disputa — só pede opções novas. O texto do botão diz
            exatamente isso, e o secundário abaixo evita a leitura de que a pessoa
            está desistindo do negócio.
          */}
          <button
            type="button"
            onClick={() => void handleRequestNew()}
            disabled={submitting}
            className="h-11 w-full rounded-xl border border-[#E5E9F2] bg-white px-5 text-[13px] font-bold text-[#475467] transition hover:bg-[#F9FBFF] disabled:opacity-50"
            data-testid="owner-inspection-request-new"
          >
            Não consigo nesses horários
          </button>
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 2 e 3. ESTADOS DE ESPERA
// ────────────────────────────────────────────────────────────────────────────

function Waiting({
  title,
  description,
  testId,
  children,
}: {
  title: string;
  description: string;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={CARD} data-testid={testId}>
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">{description}</p>
      {children}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 4. O RESULTADO
// ────────────────────────────────────────────────────────────────────────────

/**
 * O que a loja OBSERVOU, ao lado do que a pessoa DECLAROU.
 *
 * A comparação é o produto inteiro desta fase: sem ela, uma redução de valor é
 * um número menor sem explicação. Cada linha mostra as duas versões, e a
 * divergência fica visível sem que ninguém precise apontá-la.
 *
 * O declarado NUNCA foi sobrescrito — as duas colunas convivem no banco, e é por
 * isso que esta tabela pode existir.
 */
function ObservedSheet({
  observed,
  request,
}: {
  observed: NonNullable<OwnerInspection["observed"]>;
  request: SaleRequest;
}) {
  const declaredCondition =
    DECLARED_CONDITION_OPTIONS.find((o) => o.value === request.declared_condition)?.label ??
    request.declared_condition;
  const observedCondition =
    DECLARED_CONDITION_OPTIONS.find((o) => o.value === observed.condition)?.label ??
    observed.condition;

  const rows: Array<[string, string, string]> = [
    ["Quilometragem", formatKm(request.mileage), formatKm(observed.mileage)],
    ["Estado geral", declaredCondition, observedCondition],
    [
      "Pneus",
      readTireCondition(request.tire_condition) ?? "Não informado",
      readTireCondition(observed.tire_condition) ?? "—",
    ],
    [
      "Motor",
      readMechanicalCondition(request.engine_condition) ?? "Não informado",
      readMechanicalCondition(observed.engine_condition) ?? "—",
    ],
    [
      "Câmbio",
      readMechanicalCondition(request.gearbox_condition) ?? "Não informado",
      readMechanicalCondition(observed.gearbox_condition) ?? "—",
    ],
    [
      "Suspensão",
      readMechanicalCondition(request.suspension_condition) ?? "Não informado",
      readMechanicalCondition(observed.suspension_condition) ?? "—",
    ],
    [
      "Lataria e pintura",
      readBodyPaintStatus(request.body_paint_status) ?? "Não informado",
      readBodyPaintStatus(observed.body_paint_status) ?? "—",
    ],
  ];

  const observedIssues =
    observed.body_paint_issues && observed.body_paint_issues.length > 0
      ? observed.body_paint_issues
          .map((issue) => readBodyPaintIssue(issue))
          .filter(Boolean)
          .join(", ")
      : null;

  return (
    <div className="mt-4" data-testid="owner-inspection-observed">
      <h3 className="text-[13px] font-bold text-[#161f34]">O que a loja encontrou</h3>

      {/* A tabela rola sozinha no celular — a página nunca rola na horizontal. */}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[#98A2B3]">
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 font-semibold">Você informou</th>
              <th className="pb-2 font-semibold">A loja encontrou</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, declared, found]) => {
              const diverges = declared !== found;
              return (
                <tr key={label} className="border-t border-[#F2F4F7]">
                  <td className="py-2 text-[12.5px] text-[#667085]">{label}</td>
                  <td className="py-2 text-[13px] text-[#475467]">{declared}</td>
                  <td
                    className={`py-2 text-[13px] font-semibold ${
                      diverges ? "text-[#b42318]" : "text-[#1D2440]"
                    }`}
                  >
                    {found}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {observedIssues ? (
        <p className="mt-2 text-[12.5px] text-[#475467]">
          <span className="font-semibold">Detalhes de lataria:</span> {observedIssues}
        </p>
      ) : null}

      {observed.notes ? (
        <p className="mt-2 whitespace-pre-line rounded-xl bg-[#F9FBFF] px-4 py-3 text-[13px] leading-relaxed text-[#475467]">
          {observed.notes}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A proposta final, ao lado da preliminar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEM BOTÕES DE ACEITAR OU RECUSAR
 * ────────────────────────────────────────────────────────────────────────────
 * Eles são a Fase 4.6. Renderizá-los desabilitados aqui prometeria uma decisão
 * que o sistema ainda não sabe registrar — e a pessoa ficaria clicando.
 *
 * O texto diz o que É: uma proposta apresentada. Não diz "venda concluída", não
 * diz "negócio fechado", e não pede confirmação de nada.
 */
function FinalDecision({
  decision,
  request,
  observed,
}: {
  decision: PostInspectionDecision;
  request: SaleRequest;
  observed: OwnerInspection["observed"];
}) {
  const isOffer = decision.type === "final_offer";
  const difference = formatDifference(decision.difference);
  const reasonLabel = decision.reason ? ADJUSTMENT_REASON_LABEL[decision.reason] : null;

  return (
    <section
      className={
        isOffer
          ? "rounded-2xl border border-[#E5E9F2] bg-white p-4 sm:p-5"
          : "rounded-2xl border border-[#FEDF89] bg-[#FFFCF5] p-4 sm:p-5"
      }
      data-testid="owner-final-decision"
    >
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">
        {isOffer ? "Proposta final" : "Avaliação encerrada sem proposta"}
      </h2>

      {isOffer ? (
        <>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
            Esta é a proposta final apresentada pela loja após a avaliação presencial.
          </p>

          <div className="mt-4">
            <DataLine
              label="Proposta preliminar"
              value={formatMoneyValue(decision.preliminary_amount) ?? "—"}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[#F2F4F7] py-2">
              <span className="text-[12.5px] text-[#667085]">Proposta final</span>
              <span
                className="text-[20px] font-bold leading-none text-[#161f34]"
                data-testid="owner-final-amount"
              >
                {formatMoneyValue(decision.final_amount) ?? "—"}
              </span>
            </div>
            {difference ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                <span className="text-[12.5px] text-[#667085]">Diferença</span>
                <span
                  className={`text-[14px] font-bold ${
                    decision.difference && Number(decision.difference) < 0
                      ? "text-[#b42318]"
                      : "text-[#027A48]"
                  }`}
                  data-testid="owner-final-difference"
                >
                  {difference}
                </span>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
          A loja encerrou a avaliação sem apresentar proposta final.
        </p>
      )}

      {reasonLabel ? (
        <div className="mt-3 rounded-xl bg-[#F9FBFF] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
            {isOffer ? "Motivo da alteração" : "Motivo"}
          </p>
          <p
            className="mt-1 text-[13.5px] font-semibold text-[#1D2440]"
            data-testid="owner-final-reason"
          >
            {reasonLabel}
          </p>
          {decision.note ? (
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-[#475467]">
              {decision.note}
            </p>
          ) : null}
        </div>
      ) : null}

      {observed ? <ObservedSheet observed={observed} request={request} /> : null}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function SaleRequestInspection({
  saleRequestId,
  request,
  inspection,
  decision,
  onChanged,
}: {
  saleRequestId: string | number;
  request: SaleRequest;
  inspection: OwnerInspection | null;
  decision: PostInspectionDecision | null;
  onChanged: () => void;
}) {
  // A decisão é o último estado e absorve a tela inteira.
  if (decision) {
    return (
      <FinalDecision
        decision={decision}
        request={request}
        observed={inspection?.observed ?? null}
      />
    );
  }

  if (!inspection) {
    // Selecionada, mas a loja ainda não mandou horários. Sem promessa de prazo:
    // não existe cronômetro nesta fase, e anunciar um faria a pessoa cobrar uma
    // data que o sistema não garante.
    return (
      <Waiting
        title="Avaliação presencial"
        description="A loja vai enviar opções de horário para avaliar o seu veículo."
        testId="owner-inspection-pending"
      />
    );
  }

  if (inspection.state === "awaiting_owner" && inspection.slots.length > 0) {
    return (
      <SlotPicker
        saleRequestId={saleRequestId}
        inspection={inspection}
        onChanged={onChanged}
      />
    );
  }

  if (inspection.state === "awaiting_slots") {
    return (
      <Waiting
        title="Avaliação presencial"
        description="Você pediu novos horários. A loja vai enviar outras opções."
        testId="owner-inspection-awaiting-slots"
      >
        <StoreBlock store={inspection.store} />
      </Waiting>
    );
  }

  if (inspection.state === "scheduled") {
    return (
      <Waiting
        title="Avaliação agendada"
        description="Leve o veículo até a loja no horário confirmado."
        testId="owner-inspection-scheduled"
      >
        <div className="mt-3 rounded-xl bg-[#ECFDF3] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#027A48]">
            Horário confirmado
          </p>
          <p
            className="mt-1 text-[15px] font-bold text-[#161f34]"
            data-testid="owner-inspection-scheduled-at"
          >
            {inspection.scheduled_at ? formatSlot(inspection.scheduled_at) : "—"}
          </p>
        </div>
        <StoreBlock store={inspection.store} />
      </Waiting>
    );
  }

  // `completed` sem decisão: a loja avaliou e ainda está definindo o valor.
  return (
    <Waiting
      title="Avaliação concluída"
      description="A loja está preparando a proposta final."
      testId="owner-inspection-completed"
    >
      {inspection.observed ? (
        <ObservedSheet observed={inspection.observed} request={request} />
      ) : null}
    </Waiting>
  );
}
