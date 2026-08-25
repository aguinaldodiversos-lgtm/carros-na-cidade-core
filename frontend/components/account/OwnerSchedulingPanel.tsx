"use client";

import { useState } from "react";
import {
  confirmInspectionSlot,
  INSPECTION_CODE,
  requestNewInspectionSlots,
  SaleRequestError,
} from "@/lib/sale-requests/api";
import { formatSlot, type OwnerInspection } from "@/lib/sale-requests/inspection";
import {
  OWNER_AWAITING_NEW_SLOTS_NOTICE,
  OWNER_AWAITING_SLOTS_NOTICE,
  OWNER_CHOOSE_SLOT_TITLE,
  OWNER_SCHEDULED_CONTACT_HINT,
  OWNER_SCHEDULED_TITLE,
} from "@/lib/sale-requests/scheduling";

/**
 * O AGENDAMENTO DA AVALIAÇÃO na tela do PROPRIETÁRIO (Fase 4.9B).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE COMPONENTE SÓ SABE AGENDAR (§3)
 * ════════════════════════════════════════════════════════════════════════════
 * Ele NÃO é a restauração de `SaleRequestInspection.tsx`. Aquele componente
 * misturava três assuntos — agenda, ficha de avaliação e proposta final — e é
 * exatamente por isso que ele não volta: recuperá-lo inteiro traria de carona os
 * dois fluxos que a 4.7 aposentou e que a 4.9B mantém aposentados.
 *
 * Aqui há três estados e nada além deles:
 *
 *   esperando a loja  →  escolher entre os horários  →  horário confirmado
 *
 * Não existe neste arquivo — e não pode passar a existir — quilometragem lida,
 * estado observado, pneus, motor, câmbio, suspensão, lataria, observações da
 * avaliação, proposta final ou aceite de proposta final. Os writers que
 * alimentavam essas telas continuam respondendo 409 (`LEGACY_FLOW_RETIRED`).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE COMPONENTE NÃO DECIDE
 * ════════════════════════════════════════════════════════════════════════════
 * Nome da loja, valor aceito, endereço, WhatsApp e "não houve acordo" são do
 * CARD que o envolve (`SaleRequestHandoff`). Repeti-los aqui faria a tela ter
 * dois lugares dizendo a mesma coisa sobre a mesma loja — e a 4.7 já pagou esse
 * preço uma vez, com dois cartões empilhados anunciando o mesmo valor.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * `handoff_failed` NÃO CHEGA AQUI (§15)
 * ════════════════════════════════════════════════════════════════════════════
 * A 4.9A preserva a agenda antiga no banco, e o ponteiro `selected_offer_id`
 * continua apontando para a seleção que falhou — então o DTO de uma solicitação
 * em `handoff_failed` PODE trazer uma inspeção com `state: "scheduled"` e um
 * `scheduled_at` preenchido. É histórico, e não compromisso.
 *
 * Quem barra isso é o componente de cima, que roteia `handoff_failed` para o
 * painel de recuperação antes de montar este aqui. A garantia é de ROTEAMENTO e
 * não de condicional interna: um `if (status !== 'handoff_failed')` no meio deste
 * arquivo protegeria este componente e deixaria o próximo desprotegido.
 */

/** O botão primário. Um só literal — três telas o usam. */
const PRIMARY =
  "h-12 w-full rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50";

const SECONDARY =
  "mt-2 w-full rounded-xl border border-[#E5E9F2] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#667085] transition hover:bg-[#F9FBFF] disabled:opacity-50";

const PANEL = "mt-4 rounded-xl border border-[#E5E9F2] bg-[#F9FBFF] px-4 py-4";

/**
 * A mensagem de erro.
 *
 * `role="alert"` e não `aria-live="polite"`: o erro aparece em resposta a uma
 * ação que a pessoa acabou de tomar, e ela precisa saber IMEDIATAMENTE que o
 * clique não funcionou — esperar a próxima pausa do leitor de tela a deixaria
 * clicando de novo.
 */
function ErrorNote({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p
      className="mt-3 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] text-[#b42318]"
      role="alert"
      data-testid={testId}
    >
      {children}
    </p>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function OwnerSchedulingPanel({
  saleRequestId,
  inspection,
  scheduled,
  onChanged,
}: {
  saleRequestId: string | number;
  /** `null` enquanto a loja não abriu a primeira rodada de horários. */
  inspection: OwnerInspection | null;
  /**
   * A solicitação está em `inspection_scheduled`.
   *
   * Vem do STATUS da solicitação, e não de `inspection.state`, de propósito: o
   * status é o que a máquina de estados garante, e é ele que o resto da tela usa
   * para decidir o que mostrar. Derivar daqui um segundo critério faria a tela
   * poder discordar de si mesma.
   */
  scheduled: boolean;
  onChanged: () => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────────────────
  // HORÁRIO CONFIRMADO (§13)
  // ──────────────────────────────────────────────────────────────────────
  if (scheduled) {
    const when = inspection?.scheduled_at ? formatSlot(inspection.scheduled_at) : null;

    return (
      <div
        className="mt-4 rounded-xl border border-[#ABEFC6] bg-[#F6FEF9] px-4 py-4"
        data-testid="owner-scheduling-confirmed"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#027A48]">
          {OWNER_SCHEDULED_TITLE}
        </p>

        {when ? (
          <p
            className="mt-1 text-[17px] font-bold leading-tight text-[#161f34] first-letter:uppercase"
            data-testid="owner-scheduling-when"
          >
            {when}
          </p>
        ) : null}

        {/*
          §13 — o WhatsApp continua ao lado. O botão em si é do card de cima;
          esta frase existe para que a pessoa saiba que ele ainda serve para
          alguma coisa depois de o horário estar marcado.
        */}
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#475467]">
          {OWNER_SCHEDULED_CONTACT_HINT}
        </p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // ESCOLHER ENTRE OS HORÁRIOS (§11)
  // ──────────────────────────────────────────────────────────────────────
  const slots = inspection?.state === "awaiting_owner" ? (inspection.slots ?? []) : [];

  if (slots.length > 0) {
    const confirm = async () => {
      if (!choice) return;
      setConfirming(true);
      setError(null);
      try {
        await confirmInspectionSlot(saleRequestId, choice);
        onChanged();
      } catch (failure) {
        // O servidor é a fonte da verdade sobre a rodada vigente: a loja pode ter
        // publicado horários novos entre a renderização e o clique. Nesse caso o
        // backend responde `SLOT_STALE`, e recarregar é a única saída correta —
        // insistir no mesmo id confirmaria um horário que já não está na mesa.
        const stale =
          failure instanceof SaleRequestError &&
          failure.code === INSPECTION_CODE.SLOT_STALE;

        setError(
          failure instanceof Error
            ? failure.message
            : "Não foi possível confirmar o horário."
        );
        if (stale) onChanged();
      } finally {
        setConfirming(false);
      }
    };

    const askNew = async () => {
      setRequesting(true);
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
        setRequesting(false);
      }
    };

    const busy = confirming || requesting;

    return (
      <div className={PANEL} data-testid="owner-scheduling-choose">
        {/*
          `fieldset` + `legend` e não um `div` com um título: são opções
          MUTUAMENTE EXCLUSIVAS de uma mesma pergunta, e é o fieldset que faz o
          leitor de tela anunciar a pergunta antes de cada opção. Sem ele, quem
          navega por teclado ouve três horários soltos sem saber do que se trata.
        */}
        <fieldset disabled={busy} className="min-w-0 border-0 p-0">
          <legend className="text-[13.5px] font-bold text-[#161f34]">
            {OWNER_CHOOSE_SLOT_TITLE}
          </legend>

          <div className="mt-3 space-y-2">
            {slots.map((slot) => {
              const id = String(slot.id);
              const inputId = `slot-${saleRequestId}-${id}`;

              return (
                <label
                  key={id}
                  htmlFor={inputId}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    choice === id
                      ? "border-[#0e62d8] bg-white"
                      : "border-[#E5E9F2] bg-white hover:border-[#B2CCFF]"
                  }`}
                  data-testid="owner-scheduling-slot"
                >
                  <input
                    id={inputId}
                    type="radio"
                    name={`inspection-slot-${saleRequestId}`}
                    value={id}
                    checked={choice === id}
                    onChange={() => setChoice(id)}
                    className="h-4 w-4 shrink-0 accent-[#0e62d8]"
                  />
                  {/*
                    `first-letter:uppercase` porque o formatador devolve o dia da
                    semana em minúscula ("terça-feira, 25/08 às 14:30") — é o que
                    o `toLocaleDateString` do pt-BR produz, e capitalizar no CSS
                    evita reimplementar a formatação só para mudar uma letra.
                  */}
                  <span className="min-w-0 text-[14px] font-semibold text-[#1D2440] first-letter:uppercase">
                    {formatSlot(slot.starts_at)}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {error ? <ErrorNote testId="owner-scheduling-error">{error}</ErrorNote> : null}

        <button
          type="button"
          onClick={confirm}
          // Sem escolha não há o que confirmar. Desabilitar é mais honesto do que
          // aceitar o clique e responder com um erro que a tela já sabia.
          disabled={!choice || busy}
          className={`mt-3 ${PRIMARY}`}
          data-testid="owner-scheduling-confirm"
        >
          {confirming ? "Confirmando…" : "Confirmar horário"}
        </button>

        {/*
          §12 — devolver a bola para a loja. Ação SECUNDÁRIA: o caminho esperado é
          um dos horários servir, e dois botões com o mesmo peso fariam a pessoa
          parar para decidir entre eles.
        */}
        <button
          type="button"
          onClick={askNew}
          disabled={busy}
          className={SECONDARY}
          data-testid="owner-scheduling-request-new"
        >
          {requesting ? "Solicitando…" : "Pedir outros horários"}
        </button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // AGUARDANDO A LOJA (§9, §12)
  // ──────────────────────────────────────────────────────────────────────
  // Dois textos para duas situações que a pessoa vive de forma diferente: ainda
  // não recebi nada × pedi outras opções e estou esperando. `awaiting_slots` com
  // uma inspeção já criada só acontece depois de um "pedir outros horários".
  const askedForNew = inspection?.state === "awaiting_slots";

  return (
    <div className={PANEL} data-testid="owner-scheduling-waiting">
      <p
        className="text-[13.5px] leading-relaxed text-[#475467]"
        data-testid="owner-scheduling-waiting-text"
      >
        {askedForNew ? OWNER_AWAITING_NEW_SLOTS_NOTICE : OWNER_AWAITING_SLOTS_NOTICE}
      </p>

      {/*
        §9 — SEM POLLING. O botão reusa o mesmo `onChanged` que todas as ações
        desta tela já usam para recarregar o detalhe.

        Um `setInterval` bateria no servidor a cada poucos segundos para toda
        solicitação aberta em toda aba — durante horas, já que a loja pode
        demorar — e a esmagadora maioria das respostas seria idêntica à anterior.
        Quem está esperando sabe quando vale a pena olhar de novo.
      */}
      <button
        type="button"
        onClick={onChanged}
        className={SECONDARY}
        data-testid="owner-scheduling-refresh"
      >
        Atualizar
      </button>
    </div>
  );
}
