"use client";

import { useState } from "react";
import {
  ADJUSTMENT_REASON_OPTIONS,
  INSPECTION_LIMITS,
  INSPECTION_SLOTS,
  formatDifference,
  formatKm,
  formatMoneyValue,
  formatSlot,
  localInputToIso,
  nowForInput,
  type AdjustmentReason,
  type DealerInspection,
  type PostInspectionDecision,
} from "@/lib/sale-requests/inspection";
import {
  DEALER_FINAL_DECISION_LABEL,
  type DealerOwnerFinalDecision,
} from "@/lib/sale-requests/final-decision";
import {
  BODY_PAINT_ISSUE_OPTIONS,
  BODY_PAINT_STATUS_OPTIONS,
  DECLARED_CONDITION_OPTIONS,
  MECHANICAL_CONDITION_OPTIONS,
  TIRE_CONDITION_OPTIONS,
} from "@/lib/sale-requests/api";
import {
  completeInspection,
  offerInspectionSlots,
  submitPostInspectionDecision,
} from "@/lib/sale-requests/dealer-api";

/**
 * O painel da loja SELECIONADA — as três ações da Fase 4.5.
 *
 * Substitui o "Aguarde as próximas etapas" da 4.4 por uma sequência de PRÓXIMA
 * AÇÃO: propor horários → registrar a avaliação → apresentar a proposta final.
 *
 * A cada momento existe UMA ação possível, e o painel mostra só ela. Um
 * acordeão com as três etapas visíveis faria a loja procurar qual está ativa;
 * aqui a tela responde "o que eu faço agora?" sem que ninguém precise perguntar.
 *
 * Nenhum estado deste componente exibe contato do proprietário — nome,
 * telefone, e-mail, WhatsApp ou endereço. A API não devolve nenhum deles.
 */

type Props = {
  saleRequestId: string | number;
  advertiserId: string | null;
  inspection: DealerInspection | null;
  decision: PostInspectionDecision | null;
  /** Fase 4.6 — a resposta do proprietário. `null` enquanto ele não respondeu. */
  ownerDecision: DealerOwnerFinalDecision | null;
  selectedAmount: string | null;
  status: string;
  onChanged: () => void;
};

const CARD = "rounded-2xl border border-[#E5E9F2] bg-white p-4 sm:p-5";
const LABEL = "block text-[12px] font-semibold text-[#344054]";
const INPUT =
  "mt-1 h-11 w-full rounded-xl border border-[#D6DEEB] px-3 text-[14px] text-[#1D2440] outline-none focus:border-[#0e62d8]";
const PRIMARY =
  "h-12 w-full rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50";

function ErrorBox({ message }: { message: string }) {
  return (
    <p
      className="mt-3 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] text-[#b42318]"
      role="alert"
      data-testid="dealer-inspection-error"
    >
      {message}
    </p>
  );
}

/** Um `<select>` de vocabulário fechado. */
function Choice({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  testId: string;
}) {
  return (
    <label className={LABEL}>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT}
        data-testid={testId}
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 1. PROPOR HORÁRIOS
// ────────────────────────────────────────────────────────────────────────────

/**
 * O formulário de horários.
 *
 * `datetime-local` e não texto livre: o campo nativo já valida forma e oferece
 * calendário no celular. O valor dele NÃO tem fuso, e a conversão para ISO com
 * offset acontece em `localInputToIso` — usando o offset do próprio navegador,
 * que é o relógio de quem digitou.
 *
 * `min={nowForInput()}` impede o passado já no seletor, mas o servidor revalida:
 * o atributo é conveniência, não barreira.
 */
function SlotForm({
  saleRequestId,
  advertiserId,
  round,
  onChanged,
}: {
  saleRequestId: string | number;
  advertiserId: string | null;
  round: number;
  onChanged: () => void;
}) {
  const [values, setValues] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = values.filter((v) => v.trim() !== "");

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const isoList = filled
        .map((value) => localInputToIso(value))
        .filter((value): value is string => value !== null);

      if (isoList.length === 0) {
        setError("Informe ao menos um horário.");
        return;
      }

      await offerInspectionSlots(saleRequestId, isoList, advertiserId);
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível enviar os horários."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={CARD} data-testid="dealer-inspection-slot-form">
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">
        {round === 0 ? "Sua proposta foi selecionada" : "Envie novos horários"}
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
        {round === 0
          ? "Agora envie opções de horário para a avaliação presencial."
          : "O proprietário não conseguiu comparecer nos horários anteriores."}
      </p>

      <div className="mt-4 space-y-3">
        {values.map((value, index) => (
          <label key={index} className={LABEL}>
            Horário {index + 1}
            <input
              type="datetime-local"
              value={value}
              min={nowForInput()}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                setValues(next);
              }}
              className={INPUT}
              data-testid={`dealer-inspection-slot-${index}`}
            />
          </label>
        ))}
      </div>

      {values.length < INSPECTION_SLOTS.MAX ? (
        <button
          type="button"
          onClick={() => setValues([...values, ""])}
          className="mt-3 text-[13px] font-semibold text-[#0e62d8] hover:underline"
          data-testid="dealer-inspection-add-slot"
        >
          + Adicionar horário
        </button>
      ) : null}

      {error ? <ErrorBox message={error} /> : null}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || filled.length === 0}
        className={`${PRIMARY} mt-4`}
        data-testid="dealer-inspection-submit-slots"
      >
        {submitting ? "Enviando…" : "Enviar horários"}
      </button>

      <p className="mt-2.5 text-[12px] leading-relaxed text-[#98A2B3]">
        A avaliação acontece na sua loja. O proprietário verá o endereço comercial
        cadastrado.
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 2. REGISTRAR A AVALIAÇÃO
// ────────────────────────────────────────────────────────────────────────────

/**
 * A ficha do que foi OBSERVADO.
 *
 * As sete dimensões são as mesmas que a pessoa declarou — é isso que permite a
 * comparação. A quilometragem é campo próprio e obrigatório: é a divergência
 * mais objetiva que existe, e a que mais frequentemente justifica um ajuste.
 *
 * Nada aqui sobrescreve o que o proprietário declarou. As duas versões convivem.
 */
function InspectionForm({
  saleRequestId,
  advertiserId,
  scheduledAt,
  onChanged,
}: {
  saleRequestId: string | number;
  advertiserId: string | null;
  scheduledAt: string | null;
  onChanged: () => void;
}) {
  const [form, setForm] = useState({
    observed_mileage: "",
    observed_condition: "",
    observed_tire_condition: "",
    observed_engine_condition: "",
    observed_gearbox_condition: "",
    observed_suspension_condition: "",
    observed_body_paint_status: "",
    inspection_notes: "",
  });
  const [issues, setIssues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await completeInspection(
        saleRequestId,
        {
          ...form,
          inspection_notes: form.inspection_notes.trim() || null,
          ...(form.observed_body_paint_status === "issues"
            ? { observed_body_paint_issues: issues }
            : {}),
        },
        advertiserId
      );
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível registrar a avaliação."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={CARD} data-testid="dealer-inspection-form">
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">
        Registrar avaliação
      </h2>
      {scheduledAt ? (
        <p className="mt-1.5 text-[13px] text-[#475467]">
          Avaliação confirmada para{" "}
          <span className="font-semibold text-[#161f34]">{formatSlot(scheduledAt)}</span>.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <label className={LABEL}>
          Quilometragem lida no veículo
          <input
            type="text"
            inputMode="numeric"
            value={form.observed_mileage}
            onChange={(event) =>
              set("observed_mileage")(event.target.value.replace(/\D/g, ""))
            }
            placeholder="Ex.: 64230"
            className={INPUT}
            data-testid="dealer-inspection-mileage"
          />
        </label>

        <Choice
          label="Estado geral observado"
          value={form.observed_condition}
          onChange={set("observed_condition")}
          options={DECLARED_CONDITION_OPTIONS}
          testId="dealer-inspection-condition"
        />

        <Choice
          label="Pneus"
          value={form.observed_tire_condition}
          onChange={set("observed_tire_condition")}
          options={TIRE_CONDITION_OPTIONS}
          testId="dealer-inspection-tires"
        />

        <Choice
          label="Motor"
          value={form.observed_engine_condition}
          onChange={set("observed_engine_condition")}
          options={MECHANICAL_CONDITION_OPTIONS}
          testId="dealer-inspection-engine"
        />

        <Choice
          label="Câmbio"
          value={form.observed_gearbox_condition}
          onChange={set("observed_gearbox_condition")}
          options={MECHANICAL_CONDITION_OPTIONS}
          testId="dealer-inspection-gearbox"
        />

        <Choice
          label="Suspensão"
          value={form.observed_suspension_condition}
          onChange={set("observed_suspension_condition")}
          options={MECHANICAL_CONDITION_OPTIONS}
          testId="dealer-inspection-suspension"
        />

        <Choice
          label="Lataria e pintura"
          value={form.observed_body_paint_status}
          onChange={(value) => {
            set("observed_body_paint_status")(value);
            // Trocar para "nenhum detalhe" tem de limpar a lista: o backend
            // recusa detalhes sem `issues`, e manter a seleção antiga mandaria
            // um corpo que a API rejeita por um motivo que a tela não mostrou.
            if (value !== "issues") setIssues([]);
          }}
          options={BODY_PAINT_STATUS_OPTIONS}
          testId="dealer-inspection-body-paint"
        />

        {form.observed_body_paint_status === "issues" ? (
          <fieldset className="rounded-xl bg-[#F9FBFF] p-3">
            <legend className="px-1 text-[12px] font-semibold text-[#344054]">
              Detalhes encontrados
            </legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {BODY_PAINT_ISSUE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 text-[13px] text-[#475467]"
                >
                  <input
                    type="checkbox"
                    checked={issues.includes(option.value)}
                    onChange={(event) =>
                      setIssues((current) =>
                        event.target.checked
                          ? [...current, option.value]
                          : current.filter((v) => v !== option.value)
                      )
                    }
                    data-testid={`dealer-inspection-issue-${option.value}`}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <label className={LABEL}>
          Observações (opcional)
          <textarea
            value={form.inspection_notes}
            onChange={(event) => set("inspection_notes")(event.target.value)}
            maxLength={INSPECTION_LIMITS.NOTES_MAX}
            rows={3}
            className="mt-1 w-full rounded-xl border border-[#D6DEEB] p-3 text-[14px] text-[#1D2440] outline-none focus:border-[#0e62d8]"
            data-testid="dealer-inspection-notes"
          />
          <span className="mt-1 block text-[11.5px] text-[#98A2B3]">
            Visível ao proprietário. Descreva o veículo — este campo não é canal de
            contato.
          </span>
        </label>
      </div>

      {error ? <ErrorBox message={error} /> : null}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting}
        className={`${PRIMARY} mt-4`}
        data-testid="dealer-inspection-submit"
      >
        {submitting ? "Registrando…" : "Registrar avaliação"}
      </button>

      <p className="mt-2.5 text-[12px] leading-relaxed text-[#98A2B3]">
        Depois de registrada, a avaliação não pode ser editada.
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 3. A DECISÃO COMERCIAL
// ────────────────────────────────────────────────────────────────────────────

/**
 * Proposta final ou desistência.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O VALOR NÃO TEM PISO NESTA TELA
 * ────────────────────────────────────────────────────────────────────────────
 * Nada aqui compara o valor digitado com o mínimo do proprietário, com a
 * proposta selecionada ou com a maior proposta da disputa. Aquelas regras
 * governavam a DISPUTA, e a disputa acabou — a avaliação existe justamente para
 * descobrir que o carro vale menos do que parecia na foto.
 *
 * O que a tela faz, quando o valor cai, é EXIGIR O MOTIVO — e mostrar a
 * diferença em tempo real, para que a loja veja exatamente o que o proprietário
 * vai ver.
 */
function DecisionForm({
  saleRequestId,
  advertiserId,
  selectedAmount,
  onChanged,
}: {
  saleRequestId: string | number;
  advertiserId: string | null;
  selectedAmount: string | null;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"final_offer" | "no_offer">("final_offer");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<AdjustmentReason | "">("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preliminaryCents = selectedAmount ? Math.round(Number(selectedAmount) * 100) : null;
  const finalCents = amount === "" ? null : Number(amount);
  const isReduction =
    preliminaryCents != null && finalCents != null && finalCents < preliminaryCents;

  const previewDifference =
    preliminaryCents != null && finalCents != null
      ? formatDifference(((finalCents - preliminaryCents) / 100).toFixed(2))
      : null;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await submitPostInspectionDecision(
        saleRequestId,
        {
          decision_type: mode,
          ...(mode === "final_offer"
            ? { final_amount: (Number(amount) / 100).toFixed(2) }
            : {}),
          adjustment_reason: reason === "" ? null : reason,
          adjustment_note: note.trim() || null,
        },
        advertiserId
      );
      onChanged();
    } catch (failure) {
      setConfirming(false);
      setError(
        failure instanceof Error ? failure.message : "Não foi possível registrar a decisão."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const needsReason = mode === "no_offer" || isReduction;

  return (
    <section className={CARD} data-testid="dealer-decision-form">
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">Proposta final</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
        Avaliação registrada. Apresente o valor final ou encerre sem proposta.
      </p>

      {selectedAmount ? (
        <p className="mt-3 rounded-xl bg-[#F9FBFF] px-4 py-3 text-[13px] text-[#475467]">
          Proposta preliminar:{" "}
          <span className="font-bold text-[#161f34]">{formatMoneyValue(selectedAmount)}</span>
        </p>
      ) : null}

      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Tipo de decisão">
        {(
          [
            ["final_offer", "Enviar proposta final"],
            ["no_offer", "Não farei proposta"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={`h-11 flex-1 rounded-xl border px-3 text-[13px] font-bold transition ${
              mode === value
                ? "border-[#0e62d8] bg-[#EFF4FF] text-[#0e62d8]"
                : "border-[#E5E9F2] bg-white text-[#475467]"
            }`}
            data-testid={`dealer-decision-mode-${value}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "final_offer" ? (
        <label className={`${LABEL} mt-4`}>
          Valor final
          <input
            type="text"
            inputMode="numeric"
            value={amount === "" ? "" : formatMoneyValue((Number(amount) / 100).toFixed(2)) || ""}
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
            placeholder="R$ 0,00"
            className={INPUT}
            data-testid="dealer-decision-amount"
          />
          {previewDifference ? (
            <span
              className={`mt-1 block text-[12.5px] font-semibold ${
                isReduction ? "text-[#b42318]" : "text-[#027A48]"
              }`}
              data-testid="dealer-decision-difference"
            >
              Diferença: {previewDifference}
            </span>
          ) : null}
        </label>
      ) : null}

      {needsReason ? (
        <>
          <div className="mt-4">
            <Choice
              label={mode === "no_offer" ? "Motivo" : "Motivo da redução"}
              value={reason}
              onChange={(value) => setReason(value as AdjustmentReason | "")}
              options={ADJUSTMENT_REASON_OPTIONS}
              testId="dealer-decision-reason"
            />
          </div>

          <label className={`${LABEL} mt-3`}>
            {reason === "other" ? "Descreva o motivo" : "Detalhe (opcional)"}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={INSPECTION_LIMITS.ADJUSTMENT_NOTE_MAX}
              rows={3}
              className="mt-1 w-full rounded-xl border border-[#D6DEEB] p-3 text-[14px] text-[#1D2440] outline-none focus:border-[#0e62d8]"
              data-testid="dealer-decision-note"
            />
            <span className="mt-1 block text-[11.5px] text-[#98A2B3]">
              O proprietário verá este texto.
            </span>
          </label>
        </>
      ) : null}

      {error ? <ErrorBox message={error} /> : null}

      {confirming ? (
        <div
          className="mt-4 rounded-[16px] border border-[#E5E9F2] bg-[#F9FBFF] p-4"
          data-testid="dealer-decision-confirm"
        >
          <p className="text-[13.5px] font-semibold text-[#1D2440]">
            {mode === "final_offer"
              ? "Enviar esta proposta final?"
              : "Encerrar sem apresentar proposta?"}
          </p>
          <p className="mt-1 text-[13px] text-[#475467]">
            A decisão não poderá ser alterada depois de enviada.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="h-11 rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white disabled:opacity-50 sm:min-w-[160px]"
              data-testid="dealer-decision-confirm-submit"
            >
              {submitting ? "Enviando…" : "Confirmar"}
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
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          disabled={mode === "final_offer" && amount === ""}
          className={`${PRIMARY} mt-4`}
          data-testid="dealer-decision-submit"
        >
          {mode === "final_offer" ? "Enviar proposta final" : "Encerrar sem proposta"}
        </button>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ESTADOS READ-ONLY
// ────────────────────────────────────────────────────────────────────────────

function WaitingOwner({ slots }: { slots: DealerInspection["slots"] }) {
  return (
    <section className={CARD} data-testid="dealer-inspection-waiting">
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">Horários enviados</h2>
      <p className="mt-1.5 text-[13px] text-[#475467]">
        Aguardando o proprietário escolher uma das opções.
      </p>
      <ul className="mt-3 space-y-2">
        {slots.map((slot) => (
          <li
            key={String(slot.id)}
            className="rounded-xl bg-[#F9FBFF] px-4 py-2.5 text-[13.5px] font-semibold text-[#1D2440]"
          >
            {formatSlot(slot.starts_at)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * O que a loja vê depois de enviar a decisão — e, desde a 4.6, depois de o
 * proprietário responder (§25, §26).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * READ-ONLY, NOS TRÊS DESFECHOS
 * ────────────────────────────────────────────────────────────────────────────
 * Nenhum botão de nova proposta, edição, contraproposta, chat, contato ou nova
 * avaliação. Nenhuma dessas transições existe, e um botão que levasse a lugar
 * nenhum seria pior que a ausência dele.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE O TEXTO DO ACEITE NÃO DIZ
 * ────────────────────────────────────────────────────────────────────────────
 * "Você comprou o veículo", "Negócio concluído", "Pagamento pendente". O que a
 * plataforma registrou foi uma DECISÃO COMERCIAL — pagamento, transferência e
 * documentação não existem neste produto, e uma loja que lesse o contrário
 * trataria o carro como estoque próprio antes de qualquer uma dessas coisas
 * acontecer.
 *
 * E nada do proprietário aparece: nem nome, nem telefone, nem e-mail. A API não
 * devolve nenhum deles — a seleção deu à loja o direito de avaliar o carro e de
 * saber o desfecho, não o contato de quem estava do outro lado.
 */
function DecisionSent({
  decision,
  ownerDecision,
}: {
  decision: PostInspectionDecision;
  ownerDecision: DealerOwnerFinalDecision | null;
}) {
  const isOffer = decision.type === "final_offer";
  const accepted = ownerDecision?.type === "accepted";

  // Verde continua sendo o aceite. A recusa é NEUTRA, e não vermelha: a loja
  // não errou nada, e pintar de alerta um desfecho comercial normal trataria a
  // decisão de outra pessoa como uma falha da loja.
  const tone = ownerDecision
    ? accepted
      ? "border-[#ABEFC6] bg-[#F6FEF9]"
      : "border-[#E5E9F2] bg-white"
    : "border-[#ABEFC6] bg-[#F6FEF9]";

  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 ${tone}`}
      data-testid="dealer-decision-sent"
    >
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">
        {ownerDecision
          ? DEALER_FINAL_DECISION_LABEL[ownerDecision.type]
          : isOffer
            ? "Proposta final enviada"
            : "Avaliação encerrada sem proposta"}
      </h2>

      {isOffer && decision.final_amount ? (
        <>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
            Valor
          </p>
          <p
            className="mt-1 text-[26px] font-bold leading-none tracking-[-0.01em] text-[#161f34]"
            data-testid="dealer-decision-sent-amount"
          >
            {formatMoneyValue(decision.final_amount)}
          </p>
        </>
      ) : null}

      <p
        className="mt-4 text-[13px] leading-relaxed text-[#475467]"
        data-testid={
          ownerDecision ? `dealer-owner-decision-${ownerDecision.type}` : "dealer-decision-waiting"
        }
      >
        {ownerDecision
          ? accepted
            ? "A decisão comercial foi registrada pela plataforma."
            : "O proprietário não seguiu adiante com esta proposta."
          : "Aguardando decisão do proprietário."}
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function DealerInspectionPanel({
  saleRequestId,
  advertiserId,
  inspection,
  decision,
  ownerDecision,
  selectedAmount,
  status,
  onChanged,
}: Props) {
  // Decisão tomada: nada mais a fazer, nenhum formulário de edição — e, quando
  // o proprietário já respondeu, o desfecho no lugar do "aguardando".
  if (decision) return <DecisionSent decision={decision} ownerDecision={ownerDecision} />;

  if (status === "inspection_completed") {
    return (
      <DecisionForm
        saleRequestId={saleRequestId}
        advertiserId={advertiserId}
        selectedAmount={selectedAmount}
        onChanged={onChanged}
      />
    );
  }

  if (status === "inspection_scheduled") {
    return (
      <InspectionForm
        saleRequestId={saleRequestId}
        advertiserId={advertiserId}
        scheduledAt={inspection?.scheduled_at ?? null}
        onChanged={onChanged}
      />
    );
  }

  if (inspection?.state === "awaiting_owner") {
    return <WaitingOwner slots={inspection.slots} />;
  }

  return (
    <SlotForm
      saleRequestId={saleRequestId}
      advertiserId={advertiserId}
      round={inspection?.round ?? 0}
      onChanged={onChanged}
    />
  );
}

export { formatKm };
