"use client";

import { useState } from "react";
import { offerInspectionSlots } from "@/lib/sale-requests/dealer-api";
import {
  formatSlot,
  INSPECTION_SLOTS,
  localInputToIso,
  nowForInput,
  type DealerInspection,
} from "@/lib/sale-requests/inspection";
import {
  DEALER_AWAITING_OWNER_NOTICE,
  DEALER_OFFER_SLOTS_NOTICE,
  DEALER_OFFER_SLOTS_TITLE,
  DEALER_SCHEDULED_NOTICE,
  DEALER_SCHEDULED_TITLE,
  DEALER_SLOTS_REQUESTED_NOTICE,
} from "@/lib/sale-requests/scheduling";

/**
 * O AGENDAMENTO DA AVALIAÇÃO na tela do LOJISTA (Fase 4.9B).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE COMPONENTE NÃO É (§3, §4, §23)
 * ════════════════════════════════════════════════════════════════════════════
 * Não é `DealerInspectionPanel.tsx`. Aquele arquivo tinha 771 linhas e TRÊS
 * formulários — propor horários, registrar a avaliação (quilometragem lida,
 * estado geral, pneus, motor, câmbio, suspensão, lataria e pintura, observações)
 * e apresentar proposta final. A 4.9B restaura o PRIMEIRO e apenas ele.
 *
 * Os outros dois não voltam, e não é uma questão de estarem escondidos: os
 * endpoints que os alimentavam (`completeInspection`,
 * `submitPostInspectionDecision`) continuam respondendo 409
 * `LEGACY_FLOW_RETIRED`. Não existe caminho de UI para eles porque não existe
 * caminho de escrita atrás deles.
 *
 * A avaliação continua pertencendo ao lojista e acontecendo fora da plataforma.
 * O que o portal faz é marcar a hora em que o carro chega.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO É O DO BACKEND, E NÃO UMA SEGUNDA OPINIÃO (§10)
 * ════════════════════════════════════════════════════════════════════════════
 * De 1 a 3 horários (`INSPECTION_SLOTS`, espelho de
 * `sale-requests.inspection.constants.js`), instantes distintos e futuros, em
 * ISO 8601 COM offset explícito.
 *
 * A tela antecipa o que consegue — o `min` do input impede escolher o passado
 * com o calendário, e `localInputToIso` anexa o offset do próprio navegador —
 * mas NÃO reimplementa a validação: quem recusa é o servidor, e a mensagem
 * exibida é a dele. Duplicar as regras aqui criaria duas fontes que divergiriam
 * na primeira mudança, e a versão do cliente é a que ninguém lembra de atualizar.
 */

const CARD = "mt-4 rounded-2xl border border-[#E5E9F2] bg-white p-4 sm:p-5";

/** Uma linha vazia do formulário. O primeiro campo já nasce, para não exigir um clique antes de digitar. */
const EMPTY_ROW = "";

export default function DealerSchedulingPanel({
  saleRequestId,
  advertiserId,
  inspection,
  status,
  onChanged,
}: {
  saleRequestId: string | number;
  advertiserId: string | null;
  /** `null` enquanto esta loja não abriu a primeira rodada de horários. */
  inspection: DealerInspection | null;
  status: string;
  /** Recarrega o detalhe. O DTO do POST é parcial; a recarga traz o estado inteiro. */
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<string[]>([EMPTY_ROW]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────────────────
  // O NEGÓCIO ACABOU (§15, §30-D)
  // ──────────────────────────────────────────────────────────────────────
  // `handoff_failed` mantém `is_selected: true` (a seleção continua na trilha),
  // então esta tela É montada depois de um "não houve acordo". A agenda que
  // existiu continua no banco, e não pode continuar EDITÁVEL: publicar uma
  // rodada nova para um match encerrado seria oferecer horário para uma visita
  // que ninguém vai fazer.
  //
  // O backend já recusa (`offerInspectionSlots` exige `offer_selected`). Isto
  // aqui evita mostrar um formulário cujo envio só pode terminar em erro.
  if (status === "handoff_failed") return null;

  // ──────────────────────────────────────────────────────────────────────
  // HORÁRIO CONFIRMADO (§14) — READ-ONLY, E TERMINA AQUI
  // ──────────────────────────────────────────────────────────────────────
  if (status === "inspection_scheduled") {
    const when = inspection?.scheduled_at ? formatSlot(inspection.scheduled_at) : null;

    return (
      <section
        className="mt-4 rounded-2xl border border-[#ABEFC6] bg-[#F6FEF9] p-4 sm:p-5"
        data-testid="dealer-scheduling-confirmed"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#027A48]">
          {DEALER_SCHEDULED_TITLE}
        </p>

        {when ? (
          <p
            className="mt-1 text-[17px] font-bold leading-tight text-[#161f34] first-letter:uppercase"
            data-testid="dealer-scheduling-when"
          >
            {when}
          </p>
        ) : null}

        <p className="mt-2 text-[13px] leading-relaxed text-[#475467]">
          {DEALER_SCHEDULED_NOTICE}
        </p>

        {/*
          Não há botão, formulário nem "próxima etapa" abaixo desta frase. O §14 é
          explícito, e a ausência é o comportamento — não um `display: none`.
        */}
      </section>
    );
  }

  // A partir daqui a solicitação está em `offer_selected`: ou a loja ainda não
  // enviou horários, ou enviou e espera resposta.
  if (status !== "offer_selected") return null;

  // ──────────────────────────────────────────────────────────────────────
  // HORÁRIOS ENVIADOS, AGUARDANDO O PROPRIETÁRIO (§30-B)
  // ──────────────────────────────────────────────────────────────────────
  if (inspection?.state === "awaiting_owner") {
    const slots = inspection.slots ?? [];

    return (
      <section className={CARD} data-testid="dealer-scheduling-sent">
        <h3 className="text-[15px] font-bold leading-tight text-[#161f34]">
          Horários enviados
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
          {DEALER_AWAITING_OWNER_NOTICE}
        </p>

        <ul className="mt-3 space-y-2">
          {slots.map((slot) => (
            <li
              key={String(slot.id)}
              className="rounded-xl bg-[#F9FBFF] px-4 py-2.5 text-[14px] font-semibold text-[#1D2440] first-letter:uppercase"
              data-testid="dealer-scheduling-sent-slot"
            >
              {formatSlot(slot.starts_at)}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // PROPOR HORÁRIOS (§10)
  // ──────────────────────────────────────────────────────────────────────
  // Chega aqui com `inspection === null` (primeira rodada) ou com
  // `state === "awaiting_slots"` (o proprietário pediu outras opções, §12).
  const askedForNew = inspection?.state === "awaiting_slots";

  const setRow = (index: number, value: string) => {
    setRows((current) => current.map((row, i) => (i === index ? value : row)));
  };

  const addRow = () => {
    setRows((current) =>
      current.length < INSPECTION_SLOTS.MAX ? [...current, EMPTY_ROW] : current
    );
  };

  const removeRow = (index: number) => {
    setRows((current) =>
      current.length > INSPECTION_SLOTS.MIN ? current.filter((_, i) => i !== index) : current
    );
  };

  const submit = async () => {
    setError(null);

    // Campos em branco são IGNORADOS, e não recusados: quem abriu uma terceira
    // linha e desistiu de preenchê-la quis enviar dois horários, não cometer um
    // erro. O que o servidor recebe é a lista do que foi de fato preenchido.
    const filled = rows.map((row) => row.trim()).filter((row) => row !== "");

    if (filled.length < INSPECTION_SLOTS.MIN) {
      setError("Informe pelo menos um horário.");
      return;
    }

    const iso = filled.map(localInputToIso);
    if (iso.some((value) => value == null)) {
      setError("Horário inválido. Confira a data e a hora.");
      return;
    }

    setSubmitting(true);
    try {
      await offerInspectionSlots(saleRequestId, iso as string[], advertiserId);
      setRows([EMPTY_ROW]);
      onChanged();
    } catch (failure) {
      // A mensagem é a do SERVIDOR — inclusive a de endereço comercial ausente
      // (`STORE_LOCATION_REQUIRED`), que traz junto o caminho para resolvê-lo.
      // Reescrevê-la aqui perderia a instrução.
      setError(
        failure instanceof Error ? failure.message : "Não foi possível enviar os horários."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const min = nowForInput();

  return (
    <section className={CARD} data-testid="dealer-scheduling-form">
      <h3 className="text-[15px] font-bold leading-tight text-[#161f34]">
        {DEALER_OFFER_SLOTS_TITLE}
      </h3>

      {askedForNew ? (
        <p
          className="mt-2 rounded-xl bg-[#FFFAEB] px-4 py-2.5 text-[13px] leading-relaxed text-[#B54708]"
          data-testid="dealer-scheduling-new-requested"
        >
          {DEALER_SLOTS_REQUESTED_NOTICE}
        </p>
      ) : null}

      <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
        {DEALER_OFFER_SLOTS_NOTICE}
      </p>

      <fieldset disabled={submitting} className="mt-3 min-w-0 border-0 p-0">
        <legend className="sr-only">Horários propostos para a avaliação</legend>

        <div className="space-y-2">
          {rows.map((value, index) => {
            const inputId = `dealer-slot-${saleRequestId}-${index}`;

            return (
              <div key={inputId} className="flex items-end gap-2">
                <label htmlFor={inputId} className="min-w-0 flex-1">
                  <span className="text-[12.5px] font-semibold text-[#1D2440]">
                    {`Opção ${index + 1}`}
                  </span>
                  <input
                    id={inputId}
                    type="datetime-local"
                    value={value}
                    // `min` impede escolher o passado pelo calendário. Não é a
                    // validação — é a conveniência. Quem digitar à mão continua
                    // podendo mandar um horário vencido, e o servidor recusa.
                    min={min}
                    onChange={(event) => setRow(index, event.target.value)}
                    className="mt-1 h-12 w-full rounded-xl border border-[#E5E9F2] px-3 text-[14px] font-semibold text-[#161f34] outline-none focus:border-[#0e62d8] disabled:opacity-50"
                    data-testid="dealer-scheduling-input"
                  />
                </label>

                {rows.length > INSPECTION_SLOTS.MIN ? (
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="h-12 shrink-0 rounded-xl border border-[#E5E9F2] bg-white px-3 text-[13px] font-semibold text-[#667085] transition hover:bg-[#F9FBFF] disabled:opacity-50"
                    // Sem `aria-label` o leitor de tela anunciaria três botões
                    // "Remover" idênticos, e a pessoa não saberia qual horário
                    // cada um apaga.
                    aria-label={`Remover a opção ${index + 1}`}
                    data-testid="dealer-scheduling-remove"
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>

      {rows.length < INSPECTION_SLOTS.MAX ? (
        <button
          type="button"
          onClick={addRow}
          disabled={submitting}
          className="mt-2 w-full rounded-xl border border-dashed border-[#B2CCFF] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0e62d8] transition hover:bg-[#F5F9FF] disabled:opacity-50"
          data-testid="dealer-scheduling-add"
        >
          + Adicionar horário
        </button>
      ) : null}

      {error ? (
        <p
          className="mt-3 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] text-[#b42318]"
          role="alert"
          data-testid="dealer-scheduling-error"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        // §26 — desabilitado durante o envio. Sem isto, o duplo clique publica
        // DUAS rodadas: a segunda incrementa `schedule_round` e invalida os
        // horários da primeira, que é justamente a lista que o proprietário
        // pode estar olhando naquele instante.
        disabled={submitting}
        className="mt-3 h-12 w-full rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        data-testid="dealer-scheduling-submit"
      >
        {submitting ? "Enviando…" : "Enviar horários"}
      </button>
    </section>
  );
}
