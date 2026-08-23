"use client";

import { useEffect, useRef, useState } from "react";
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
  ACCEPT_DIALOG_DISCLAIMER,
  OWNER_ACCEPTED_DISCLAIMER,
  OWNER_FINAL_DECISION_LABEL,
  OWNER_REJECTED_TEXT,
  REJECT_DIALOG_WARNING,
  type OwnerFinalDecision,
  type OwnerFinalDecisionType,
} from "@/lib/sale-requests/final-decision";
import {
  DECLARED_CONDITION_OPTIONS,
  confirmInspectionSlot,
  decideFinalOffer,
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

// ────────────────────────────────────────────────────────────────────────────
// 5. A DECISÃO DO PROPRIETÁRIO (Fase 4.6)
// ────────────────────────────────────────────────────────────────────────────

/**
 * A confirmação, para aceitar e para recusar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O TEXTO
 * ────────────────────────────────────────────────────────────────────────────
 * O do ACEITE carrega a ressalva mais importante desta fase: registrar a
 * decisão comercial não é pagamento nem transferência. Sem ela, "Aceitar
 * proposta" é lido como "vendi o carro" — e quem acredita ter vendido para de
 * considerar outras saídas para um veículo que ainda tem.
 *
 * O da RECUSA diz a consequência real: a solicitação encerra neste fluxo e não
 * volta automaticamente a receber propostas. Omitir isso deixaria a pessoa
 * supor que a disputa recomeça sozinha, e ela não recomeça (§3).
 *
 * Recusar NÃO pede motivo. Nenhum campo, nenhuma pergunta: a pessoa não deve
 * explicação a ninguém por não seguir adiante com o próprio carro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ACESSIBILIDADE — o mesmo padrão do diálogo de seleção da 4.4
 * ────────────────────────────────────────────────────────────────────────────
 * `role="dialog"` + `aria-modal` + `aria-labelledby`/`aria-describedby`: o
 * leitor de tela anuncia título e texto ao abrir, em vez de largar a pessoa num
 * botão solto. O foco inicial vai para "Voltar" — a saída NÃO destrutiva —,
 * `Escape` fecha, o Tab cicla dentro do painel, e ao fechar o foco volta para o
 * botão que abriu.
 *
 * Sem o ciclo de Tab, o teclado sai por trás do overlay e passeia pelos
 * elementos que o diálogo está cobrindo — inclusive pelo outro botão de
 * decisão, que é exatamente o clique que não pode acontecer por engano.
 */
function DecisionDialog({
  decision,
  amount,
  storeName,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  decision: OwnerFinalDecisionType;
  amount: string | null;
  storeName: string | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const isAccept = decision === "accepted";

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Um envio em curso não é cancelável: a transação já está no servidor, e
      // fechar aqui só faria a tela parar de ouvir a resposta de uma decisão que
      // pode ter sido gravada.
      if (!submitting) onCancel();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!submitting) onCancel();
      }}
      onKeyDown={onKeyDown}
      data-testid="owner-final-decision-overlay"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-final-decision-title"
        aria-describedby="owner-final-decision-description"
        // Sem isto, o clique DENTRO do painel borbulharia até o overlay e
        // fecharia o diálogo — inclusive o clique no botão de confirmar.
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[460px] rounded-t-2xl bg-white p-5 shadow-[0_20px_40px_rgba(16,24,40,0.16)] sm:rounded-2xl sm:p-6"
        data-testid="owner-final-decision-dialog"
      >
        <h2
          id="owner-final-decision-title"
          className="text-[17px] font-bold leading-tight text-[#161f34]"
        >
          {isAccept ? "Aceitar a proposta final?" : "Recusar a proposta final?"}
        </h2>

        <div
          id="owner-final-decision-description"
          className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-[#475467]"
        >
          {isAccept ? (
            <>
              <p>
                Você está aceitando a proposta final de{" "}
                <span className="font-semibold text-[#161f34]">{amount ?? "—"}</span>
                {storeName ? (
                  <>
                    {" "}
                    apresentada por{" "}
                    <span className="font-semibold text-[#161f34]">{storeName}</span>
                  </>
                ) : (
                  " apresentada pela loja"
                )}{" "}
                após a avaliação presencial.
              </p>
              <p>{ACCEPT_DIALOG_DISCLAIMER}</p>
            </>
          ) : (
            <>
              <p>
                Você deseja recusar a proposta final de{" "}
                <span className="font-semibold text-[#161f34]">{amount ?? "—"}</span>?
              </p>
              <p>{REJECT_DIALOG_WARNING}</p>
            </>
          )}
        </div>

        {/*
          O valor é repetido em destaque de propósito: entre ver o painel e
          confirmar, o painel sai da tela no celular — e confirmar uma decisão
          irreversível sem ver o número é o erro que o diálogo existe para
          evitar. É a mesma escolha do diálogo de seleção da 4.4.
        */}
        <p
          className="mt-4 rounded-xl bg-[#F9FBFF] px-4 py-3 text-[15px] font-bold text-[#161f34]"
          data-testid="owner-final-decision-dialog-amount"
        >
          {amount ?? "—"}
        </p>

        {error ? (
          <p
            className="mt-4 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] text-[#b42318]"
            role="alert"
            data-testid="owner-final-decision-error"
          >
            {error}
          </p>
        ) : null}

        {/*
          "Voltar" primeiro no DOM (é o foco inicial e a saída segura) e primeiro
          na tela do celular, onde a coluna empilha de cima para baixo e o polegar
          alcança o de baixo primeiro — que é a ação irreversível, e deve exigir
          alcance.
        */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={
              isAccept
                ? "h-12 rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50 sm:min-w-[190px]"
                : "h-12 rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#b42318] transition hover:bg-[#FEF3F2] disabled:opacity-50 sm:min-w-[190px]"
            }
            data-testid="owner-final-decision-confirm"
          >
            {submitting
              ? isAccept
                ? "Registrando…"
                : "Registrando…"
              : isAccept
                ? "Aceitar proposta"
                : "Recusar proposta"}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-12 rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#1D2440] transition hover:bg-[#F9FBFF] disabled:opacity-50 sm:min-w-[120px]"
            data-testid="owner-final-decision-cancel"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Os dois botões, e a hierarquia entre eles (§20).
 *
 * "Aceitar" é a ação PRIMÁRIA (azul cheio) e "Recusar" a secundária (contorno).
 * A recusa NÃO usa botão destrutivo vermelho cheio: recusar não destrói nada —
 * não apaga a inspeção, não apaga a proposta, não desfaz a seleção. Um vermelho
 * de alerta aqui trataria uma escolha comercial legítima como um acidente
 * prestes a acontecer.
 */
function DecisionActions({
  onAccept,
  onReject,
  disabled,
}: {
  onAccept: () => void;
  onReject: () => void;
  disabled: boolean;
}) {
  return (
    <div
      className="mt-5 flex flex-col gap-2 sm:flex-row-reverse"
      data-testid="owner-final-decision-actions"
    >
      <button
        type="button"
        onClick={onAccept}
        disabled={disabled}
        className="h-12 rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50 sm:min-w-[190px]"
        data-testid="owner-final-decision-accept-cta"
      >
        Aceitar proposta
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className="h-12 rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#475467] transition hover:bg-[#F9FBFF] disabled:opacity-50 sm:min-w-[150px]"
        data-testid="owner-final-decision-reject-cta"
      >
        Recusar proposta
      </button>
    </div>
  );
}

/**
 * O bloco read-only DEPOIS da decisão (§23, §24).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE BLOCO NÃO MOSTRA
 * ────────────────────────────────────────────────────────────────────────────
 * Aceitar, Recusar, Cancelar, Reabrir, WhatsApp e telefone. Os dois primeiros
 * porque a decisão já foi tomada e não se altera; os dois seguintes porque não
 * existem transições para eles; os dois últimos porque não existem, ponto — a
 * API não devolve contato nenhum.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * E O QUE ELE NÃO DIZ
 * ────────────────────────────────────────────────────────────────────────────
 * "Venda concluída", "Veículo vendido", "Negócio fechado", "Pagamento
 * realizado". A ressalva do aceite está numa constante compartilhada
 * (`OWNER_ACCEPTED_DISCLAIMER`) porque é exatamente o tipo de frase que alguém
 * "melhora" num lugar só — e a cópia não melhorada continua prometendo o que
 * não existe.
 */
function DecidedBlock({
  ownerDecision,
  storeName,
  amount,
}: {
  ownerDecision: OwnerFinalDecision;
  storeName: string | null;
  amount: string | null;
}) {
  const accepted = ownerDecision.type === "accepted";

  return (
    <div
      className={`mt-4 rounded-xl px-4 py-3 ${
        accepted ? "bg-[#ECFDF3]" : "bg-[#F9FBFF]"
      }`}
      data-testid={`owner-final-decision-${ownerDecision.type}`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          accepted ? "text-[#027A48]" : "text-[#667085]"
        }`}
      >
        {OWNER_FINAL_DECISION_LABEL[ownerDecision.type]}
      </p>

      {storeName ? (
        <p className="mt-1 text-[14px] font-bold text-[#161f34]" data-testid="owner-decided-store">
          {storeName}
        </p>
      ) : null}

      <p className="mt-0.5 text-[18px] font-bold text-[#161f34]" data-testid="owner-decided-amount">
        {amount ?? "—"}
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-[#475467]">
        {accepted ? OWNER_ACCEPTED_DISCLAIMER : OWNER_REJECTED_TEXT}
      </p>

      {accepted ? null : (
        // Diz que uma nova negociação é possível DEPOIS, e não cria botão
        // nenhum para isso: reabertura não existe nesta fase, e um CTA que
        // levasse a lugar nenhum seria pior que a ausência dele.
        <p className="mt-1 text-[13px] leading-relaxed text-[#475467]">
          Uma nova negociação poderá ser iniciada posteriormente.
        </p>
      )}
    </div>
  );
}

/**
 * A proposta final, ao lado da preliminar — e, desde a 4.6, a resposta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TRÊS MOMENTOS NO MESMO CARTÃO
 * ────────────────────────────────────────────────────────────────────────────
 * Proposta apresentada e aguardando resposta (com os dois botões); proposta
 * aceita; proposta recusada. A comparação preliminar × final permanece VISÍVEL
 * nos três — é o histórico que explica o número, e escondê-lo depois da decisão
 * faria a pessoa perder a única prova do que aconteceu.
 *
 * A distinção é feita pela PRESENÇA de `ownerDecision`, e não por comparação de
 * status. São duas fontes para a mesma pergunta, e a que vem numa leitura só do
 * banco é a que não pode divergir — a lição que a 4.5 pagou com uma igualdade
 * de status que envelheceu.
 *
 * O texto diz o que É: uma proposta apresentada, aceita ou recusada. Nunca
 * "venda concluída" nem "negócio fechado".
 */
function FinalDecision({
  saleRequestId,
  decision,
  request,
  observed,
  store,
  ownerDecision,
  onChanged,
}: {
  saleRequestId: string | number;
  decision: PostInspectionDecision;
  request: SaleRequest;
  observed: OwnerInspection["observed"];
  store: OwnerInspection["store"];
  ownerDecision: OwnerFinalDecision | null;
  onChanged: () => void;
}) {
  const isOffer = decision.type === "final_offer";
  const difference = formatDifference(decision.difference);
  const reasonLabel = decision.reason ? ADJUSTMENT_REASON_LABEL[decision.reason] : null;
  const finalAmount = formatMoneyValue(decision.final_amount);
  const storeName = store?.name ?? null;

  const [pending, setPending] = useState<OwnerFinalDecisionType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * O gatilho que abriu o diálogo, para devolver o foco ao fechá-lo.
   *
   * Sem isso, quem navega por teclado é jogado de volta ao topo do documento e
   * perde o lugar na página — que aqui é especialmente ruim, porque a página
   * inteira mudou de estado e a pessoa precisa reencontrar o resultado do que
   * acabou de fazer.
   */
  const openerRef = useRef<HTMLElement | null>(null);

  function open(next: OwnerFinalDecisionType) {
    openerRef.current = document.activeElement as HTMLElement | null;
    setError(null);
    setPending(next);
  }

  function close() {
    setPending(null);
    setError(null);
    openerRef.current?.focus();
  }

  async function confirm() {
    if (!pending) return;
    setSubmitting(true);
    setError(null);
    try {
      await decideFinalOffer(saleRequestId, pending);
      setPending(null);
      // Recarrega a partir do servidor em vez de aplicar a resposta na tela: o
      // aceite muda o status da solicitação, o rótulo do cabeçalho e o bloco do
      // lojista ao mesmo tempo, e remontar tudo isso à mão no cliente é como as
      // duas metades acabam discordando.
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível registrar a sua decisão."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Os botões só existem enquanto há uma proposta final SEM resposta. Depois da
  // decisão eles somem — não ficam desabilitados: um botão cinza sugere que a
  // ação volta a ser possível em algum momento, e ela não volta.
  const canDecide = isOffer && !ownerDecision;

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
        {isOffer
          ? ownerDecision
            ? OWNER_FINAL_DECISION_LABEL[ownerDecision.type]
            : "Proposta final"
          : "Avaliação encerrada sem proposta"}
      </h2>

      {isOffer ? (
        <>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
            {ownerDecision
              ? "Esta foi a proposta final apresentada pela loja após a avaliação presencial."
              : "Esta é a proposta final apresentada pela loja após a avaliação presencial."}
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

      {/*
        A decisão do proprietário (Fase 4.6). O bloco read-only quando já houve
        resposta; os dois botões quando ainda não.
      */}
      {ownerDecision ? (
        <DecidedBlock
          ownerDecision={ownerDecision}
          storeName={storeName}
          amount={formatMoneyValue(ownerDecision.final_amount) ?? finalAmount}
        />
      ) : null}

      {canDecide ? (
        <DecisionActions
          onAccept={() => open("accepted")}
          onReject={() => open("rejected")}
          disabled={submitting}
        />
      ) : null}

      {observed ? <ObservedSheet observed={observed} request={request} /> : null}

      {pending ? (
        <DecisionDialog
          decision={pending}
          amount={finalAmount}
          storeName={storeName}
          submitting={submitting}
          error={error}
          onCancel={close}
          onConfirm={confirm}
        />
      ) : null}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function SaleRequestInspection({
  saleRequestId,
  request,
  inspection,
  decision,
  ownerDecision,
  onChanged,
}: {
  saleRequestId: string | number;
  request: SaleRequest;
  inspection: OwnerInspection | null;
  decision: PostInspectionDecision | null;
  ownerDecision: OwnerFinalDecision | null;
  onChanged: () => void;
}) {
  // A decisão da loja é o último estado e absorve a tela inteira — agora
  // carregando também a resposta do proprietário, quando ela existe.
  if (decision) {
    return (
      <FinalDecision
        saleRequestId={saleRequestId}
        decision={decision}
        request={request}
        observed={inspection?.observed ?? null}
        store={inspection?.store ?? null}
        ownerDecision={ownerDecision}
        onChanged={onChanged}
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
