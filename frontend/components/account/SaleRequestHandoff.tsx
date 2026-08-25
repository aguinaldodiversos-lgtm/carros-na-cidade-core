"use client";

import { useEffect, useRef, useState } from "react";
import {
  HANDOFF_CODE,
  HANDOFF_CONTACT_INSTRUCTION,
  HANDOFF_SCOPE_NOTICE,
  NEW_ROUND_DIALOG_NOTICE,
  NO_AGREEMENT_DIALOG_NOTICE,
  type SaleRequestRound,
  type SelectionHistoryEntry,
} from "@/lib/sale-requests/handoff";
import {
  fetchHandoffWhatsapp,
  openNewRound,
  reportNoAgreement,
} from "@/lib/sale-requests/handoff-api";
import {
  HANDOFF_TWO_PATHS_NOTICE,
  WHATSAPP_UNAVAILABLE_NOTICE,
} from "@/lib/sale-requests/scheduling";
import { formatMoneyValue, type OwnerInspection } from "@/lib/sale-requests/inspection";
import OwnerSchedulingPanel from "./OwnerSchedulingPanel";
import {
  SaleRequestError,
  type SaleRequest,
  type SaleRequestSelectedOffer,
} from "@/lib/sale-requests/api";

/**
 * O HANDOFF DIRETO na tela do proprietário (Fase 4.7).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTA TELA SUBSTITUIU
 * ════════════════════════════════════════════════════════════════════════════
 * Escolher horário, ver a agenda, acompanhar a inspeção, comparar
 * "declarado × observado", receber proposta final e aceitá-la. Seis momentos que
 * a plataforma tentava orquestrar e que agora acontecem entre duas pessoas, no
 * WhatsApp, como sempre aconteceram na vida real.
 *
 * O que ficou: o nome da loja, o valor aceito, o endereço, um botão para falar
 * com ela — e uma saída para quando não der certo.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE NENHUM TEXTO DAQUI DIZ
 * ════════════════════════════════════════════════════════════════════════════
 * "Venda concluída", "Veículo vendido", "Negócio fechado". Aceitar uma oferta é
 * o começo de uma conversa, não o fim de uma transação — e a plataforma não
 * sabe, nem pergunta, como ela terminou.
 */

const CARD = "rounded-2xl border border-[#E5E9F2] bg-white p-4 sm:p-5";

// ────────────────────────────────────────────────────────────────────────────
// DIÁLOGO GENÉRICO
// ────────────────────────────────────────────────────────────────────────────

/**
 * O mesmo contrato de acessibilidade do diálogo de seleção da 4.4.
 *
 * `role="dialog"` + `aria-modal` + `aria-labelledby`/`aria-describedby`, foco
 * inicial na saída NÃO destrutiva, `Escape` fecha, Tab cicla dentro do painel, e
 * o foco volta ao gatilho ao fechar.
 *
 * Um componente, e não uma cópia por diálogo: são dois nesta tela (não houve
 * acordo, nova rodada) e a segunda cópia é sempre onde o focus trap fica de fora.
 */
function Dialog({
  titleId,
  descriptionId,
  title,
  children,
  confirmLabel,
  confirmingLabel,
  submitting,
  error,
  onCancel,
  onConfirm,
  testId,
  tone = "primary",
}: {
  titleId: string;
  descriptionId: string;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  confirmingLabel: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  testId: string;
  tone?: "primary" | "neutral";
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Um envio em curso não é cancelável: a transação já está no servidor.
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
      data-testid={`${testId}-overlay`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        // Sem isto, o clique DENTRO do painel borbulha até o overlay e fecha o
        // diálogo — inclusive o clique em confirmar.
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[460px] rounded-t-2xl bg-white p-5 shadow-[0_20px_40px_rgba(16,24,40,0.16)] sm:rounded-2xl sm:p-6"
        data-testid={testId}
      >
        <h2 id={titleId} className="text-[17px] font-bold leading-tight text-[#161f34]">
          {title}
        </h2>

        <div
          id={descriptionId}
          className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-[#475467]"
        >
          {children}
        </div>

        {error ? (
          <p
            className="mt-4 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] text-[#b42318]"
            role="alert"
            data-testid={`${testId}-error`}
          >
            {error}
          </p>
        ) : null}

        {/*
          "Voltar" primeiro no DOM (foco inicial e saída segura) e primeiro na
          coluna do celular, onde o polegar alcança o de baixo primeiro — que é a
          ação irreversível.
        */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={
              tone === "primary"
                ? "h-12 rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50 sm:min-w-[200px]"
                : "h-12 rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#475467] transition hover:bg-[#F9FBFF] disabled:opacity-50 sm:min-w-[200px]"
            }
            data-testid={`${testId}-confirm`}
          >
            {submitting ? confirmingLabel : confirmLabel}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-12 rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#1D2440] transition hover:bg-[#F9FBFF] disabled:opacity-50 sm:min-w-[120px]"
            data-testid={`${testId}-cancel`}
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// O HISTÓRICO
// ────────────────────────────────────────────────────────────────────────────

/**
 * Os matches que não prosseguiram.
 *
 * Só os ENCERRADOS aparecem: o match ATUAL já é o card principal, e repeti-lo
 * aqui faria a pessoa achar que tem duas lojas escolhidas.
 *
 * O texto é neutro. "Não houve acordo com a Loja A" descreve o que aconteceu; a
 * plataforma não sabe de quem partiu, não perguntou e não vai insinuar.
 */
function History({ entries }: { entries: SelectionHistoryEntry[] }) {
  const closed = entries.filter((entry) => entry.outcome === "no_agreement");
  if (closed.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl bg-[#F9FBFF] px-4 py-3" data-testid="handoff-history">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
        Negociações anteriores
      </p>
      <ul className="mt-2 space-y-1.5">
        {closed.map((entry, index) => (
          <li
            key={`${entry.store_name}-${entry.selected_at}-${index}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]"
            data-testid="handoff-history-item"
          >
            <span className="text-[#475467]">
              Não houve acordo com{" "}
              <span className="font-semibold text-[#1D2440]">{entry.store_name}</span>
            </span>
            <span className="font-semibold text-[#667085]">
              {formatMoneyValue(entry.amount) ?? "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// O MATCH ATIVO
// ────────────────────────────────────────────────────────────────────────────

/**
 * O card do handoff: com quem, por quanto, onde, e como falar.
 *
 * O WhatsApp é buscado NO CLIQUE, não no carregamento da tela. O número não vem
 * no DTO do detalhe — ele é resolvido pelo servidor numa chamada própria, que
 * registra o acesso. A tela nunca monta `wa.me` sozinha.
 */
function ActiveHandoff({
  saleRequestId,
  request,
  selected,
  inspection,
  scheduled,
  history,
  onChanged,
}: {
  saleRequestId: string | number;
  request: SaleRequest;
  selected: SaleRequestSelectedOffer;
  inspection: OwnerInspection | null;
  /** A solicitação está em `inspection_scheduled`. */
  scheduled: boolean;
  history: SelectionHistoryEntry[];
  onChanged: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  /**
   * §8 — a loja não tem WhatsApp comercial válido.
   *
   * Estado SEPARADO de `contactError`, e a separação é o ponto: um erro pinta a
   * caixa de vermelho e pede uma ação. Isto não é um erro — é a ausência de um
   * canal opcional, e o agendamento pelo portal continua inteiro ao lado. Tratar
   * os dois como a mesma coisa faria a pessoa achar que precisa consertar algo
   * antes de conseguir marcar a avaliação.
   *
   * Guarda a MENSAGEM, e não um booleano: a do servidor é mais útil que a
   * genérica ("...Use o endereço para procurá-la" diz o que fazer em seguida), e
   * a constante fica de reserva para o caso de ela vir vazia.
   */
  const [contactUnavailable, setContactUnavailable] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  async function handleWhatsapp() {
    setOpening(true);
    setContactError(null);
    setContactUnavailable(null);
    try {
      const { url } = await fetchHandoffWhatsapp(saleRequestId);
      // `noopener` obrigatório: sem ele a aba aberta recebe `window.opener` e
      // pode navegar esta página para onde quiser.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (failure) {
      // §8 — discriminado por CÓDIGO, nunca por texto da mensagem. A frase pode
      // ser reescrita amanhã; o código é contrato.
      if (
        failure instanceof SaleRequestError &&
        failure.code === HANDOFF_CODE.WHATSAPP_UNAVAILABLE
      ) {
        setContactUnavailable(failure.message?.trim() || WHATSAPP_UNAVAILABLE_NOTICE);
        return;
      }

      setContactError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível abrir a conversa agora."
      );
    } finally {
      setOpening(false);
    }
  }

  function openDialog() {
    openerRef.current = document.activeElement as HTMLElement | null;
    setError(null);
    setConfirming(true);
  }

  function closeDialog() {
    setConfirming(false);
    setError(null);
    openerRef.current?.focus();
  }

  async function confirmNoAgreement() {
    setSubmitting(true);
    setError(null);
    try {
      await reportNoAgreement(saleRequestId);
      setConfirming(false);
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível registrar agora."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const location = [selected.store_city].filter(Boolean).join(" · ");

  return (
    <section className={CARD} data-testid="owner-handoff">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#027A48]">
        Oferta aceita
      </p>

      <h2
        className="mt-1 text-[18px] font-bold leading-tight text-[#161f34]"
        data-testid="handoff-store-name"
      >
        {selected.store_name}
      </h2>

      <p
        className="mt-1 text-[26px] font-bold leading-none tracking-[-0.01em] text-[#161f34]"
        data-testid="handoff-amount"
      >
        {formatMoneyValue(selected.amount) ?? "—"}
      </p>

      <p className="mt-3 text-[13.5px] leading-relaxed text-[#475467]">
        {HANDOFF_CONTACT_INSTRUCTION}
      </p>

      {/*
        §1, §6 — as DUAS opções, anunciadas antes de qualquer botão.

        A frase vem acima do painel de agendamento e do botão de WhatsApp porque
        é ela que explica por que existem dois caminhos. Sem ela, a pessoa que vê
        primeiro o bloco "aguardando horários" conclui que precisa esperar antes
        de poder falar com a loja — e o WhatsApp, logo abaixo, parece um plano B
        para quando o portal falhar. São complementares, não alternativos.
      */}
      <p
        className="mt-2 text-[13.5px] leading-relaxed text-[#475467]"
        data-testid="handoff-two-paths"
      >
        {HANDOFF_TWO_PATHS_NOTICE}
      </p>

      {/*
        O ENDEREÇO COMERCIAL. É o segundo dado da loja que atravessa a fronteira
        (o primeiro é o nome), e existe por uma finalidade única: a pessoa precisa
        saber onde comparecer.
      */}
      {selected.store_address || location ? (
        <div className="mt-3 rounded-xl bg-[#F9FBFF] px-4 py-3" data-testid="handoff-address">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
            Endereço da loja
          </p>
          {selected.store_address ? (
            <p className="mt-1 text-[13.5px] leading-relaxed text-[#1D2440]">
              {selected.store_address}
            </p>
          ) : null}
          {location ? (
            <p className="mt-0.5 text-[13px] text-[#475467]">{location}</p>
          ) : null}
        </div>
      ) : null}

      {/*
        OPÇÃO A — AGENDAR PELO PORTAL (§1).

        O painel decide sozinho entre esperar a loja, escolher um horário e
        mostrar o que foi confirmado. Ele vem ANTES do WhatsApp porque é o caminho
        que a plataforma oferece; o WhatsApp é a saída para tudo o que o portal
        não modela — e continua disponível em todos os estados, inclusive depois
        de o horário estar marcado.
      */}
      <OwnerSchedulingPanel
        saleRequestId={saleRequestId}
        inspection={inspection}
        scheduled={scheduled}
        onChanged={onChanged}
      />

      <p
        className="mt-4 text-center text-[11px] font-semibold uppercase tracking-wide text-[#98a2b3]"
        data-testid="handoff-paths-separator"
      >
        ou
      </p>

      {/* OPÇÃO B — WHATSAPP. Nunca desaparece: §1 e §13. */}
      <button
        type="button"
        onClick={handleWhatsapp}
        disabled={opening}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-xl border border-[#0e62d8] bg-white px-5 text-sm font-bold text-[#0e62d8] transition hover:bg-[#F5F9FF] disabled:opacity-50"
        data-testid="handoff-whatsapp"
      >
        {opening ? "Abrindo…" : "Falar com a loja pelo WhatsApp"}
      </button>

      {/*
        §8 — a loja sem WhatsApp. Discreto, cinza, sem `role="alert"`: não é uma
        falha da pessoa nem do sistema, e o agendamento acima segue funcionando.
      */}
      {contactUnavailable ? (
        <p
          className="mt-2 text-center text-[12.5px] leading-relaxed text-[#667085]"
          data-testid="handoff-whatsapp-unavailable"
        >
          {contactUnavailable}
        </p>
      ) : null}

      {contactError ? (
        <p
          className="mt-3 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] text-[#b42318]"
          role="alert"
          data-testid="handoff-whatsapp-error"
        >
          {contactError}
        </p>
      ) : null}

      <p className="mt-3 text-[12.5px] leading-relaxed text-[#667085]">
        {HANDOFF_SCOPE_NOTICE}
      </p>

      <History entries={history} />

      {/*
        §17 — ação SECUNDÁRIA. Discreta de propósito: o caminho esperado é a
        negociação dar certo, e um botão vermelho e grande convidaria a encerrar
        a conversa no primeiro contratempo.
      */}
      <button
        type="button"
        onClick={openDialog}
        className="mt-4 w-full rounded-xl border border-[#E5E9F2] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#667085] transition hover:bg-[#F9FBFF]"
        data-testid="handoff-no-agreement-cta"
      >
        Não houve acordo com esta loja
      </button>

      {confirming ? (
        <Dialog
          testId="handoff-no-agreement-dialog"
          titleId="handoff-no-agreement-title"
          descriptionId="handoff-no-agreement-description"
          title="Confirma que não houve acordo com a loja selecionada?"
          confirmLabel="Confirmar que não houve acordo"
          confirmingLabel="Registrando…"
          submitting={submitting}
          error={error}
          onCancel={closeDialog}
          onConfirm={confirmNoAgreement}
          tone="neutral"
        >
          <p>{NO_AGREEMENT_DIALOG_NOTICE}</p>
          <p>
            Depois disso você poderá aceitar outra oferta já recebida ou receber
            novas ofertas.
          </p>
        </Dialog>
      ) : null}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// DEPOIS DE "NÃO HOUVE ACORDO"
// ────────────────────────────────────────────────────────────────────────────

/**
 * A saída B do §19: abrir uma rodada nova, com outro piso.
 *
 * A saída A — aceitar outra oferta que já chegou — não vive aqui: ela é a
 * própria lista de propostas, que volta a ser exibida em `handoff_failed`. Duas
 * telas para a mesma decisão fariam a pessoa escolher entre interfaces em vez de
 * entre lojas.
 */
function FailedHandoff({
  saleRequestId,
  round,
  history,
  hasOtherOffers,
  onChanged,
}: {
  saleRequestId: string | number;
  round: SaleRequestRound | null;
  history: SelectionHistoryEntry[];
  hasOtherOffers: boolean;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimum, setMinimum] = useState("");
  const openerRef = useRef<HTMLElement | null>(null);

  const currentMinimum = formatMoneyValue(round?.minimum_accepted_price ?? null);
  const lastClosed = history.find((entry) => entry.outcome === "no_agreement");

  function openDialog() {
    openerRef.current = document.activeElement as HTMLElement | null;
    setError(null);
    // O campo NASCE com o piso atual: quem só quer reabrir sem mudar o valor não
    // precisa digitá-lo de novo, e quem quer baixar vê de onde está partindo.
    setMinimum(
      round?.minimum_accepted_price ? String(Math.round(Number(round.minimum_accepted_price))) : ""
    );
    setConfirming(true);
  }

  function closeDialog() {
    setConfirming(false);
    setError(null);
    openerRef.current?.focus();
  }

  async function confirmRound() {
    setSubmitting(true);
    setError(null);
    try {
      await openNewRound(saleRequestId, minimum);
      setConfirming(false);
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível abrir a rodada."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={CARD} data-testid="owner-handoff-failed">
      <h2 className="text-[16px] font-bold leading-tight text-[#161f34]">
        {lastClosed
          ? `Não houve acordo com ${lastClosed.store_name}`
          : "Não houve acordo com a loja selecionada"}
      </h2>

      <p className="mt-1.5 text-[13px] leading-relaxed text-[#475467]">
        {hasOtherOffers
          ? "Você pode aceitar outra oferta já recebida ou abrir uma nova rodada de propostas."
          : "Você pode abrir uma nova rodada de propostas, com um novo valor mínimo."}
      </p>

      <History entries={history} />

      {hasOtherOffers ? (
        <p
          className="mt-4 text-center text-[11px] font-semibold uppercase tracking-wide text-[#98a2b3]"
          data-testid="handoff-or-separator"
        >
          ou
        </p>
      ) : null}

      <button
        type="button"
        onClick={openDialog}
        className="mt-3 h-12 w-full rounded-xl border border-[#0e62d8] bg-white px-5 text-sm font-bold text-[#0e62d8] transition hover:bg-[#F5F9FF]"
        data-testid="handoff-new-round-cta"
      >
        Receber novas ofertas
      </button>

      {confirming ? (
        <Dialog
          testId="handoff-new-round-dialog"
          titleId="handoff-new-round-title"
          descriptionId="handoff-new-round-description"
          title="Receber novas ofertas"
          confirmLabel="Iniciar nova rodada"
          confirmingLabel="Abrindo…"
          submitting={submitting}
          error={error}
          onCancel={closeDialog}
          onConfirm={confirmRound}
        >
          {currentMinimum ? (
            <p>
              Valor mínimo atual:{" "}
              <span className="font-semibold text-[#161f34]">{currentMinimum}</span>
            </p>
          ) : null}

          <label className="block">
            <span className="text-[12.5px] font-semibold text-[#1D2440]">
              Novo valor mínimo
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={minimum}
              onChange={(event) => setMinimum(event.target.value.replace(/\D/g, ""))}
              disabled={submitting}
              className="mt-1 h-12 w-full rounded-xl border border-[#E5E9F2] px-4 text-[15px] font-semibold text-[#161f34] outline-none focus:border-[#0e62d8] disabled:opacity-50"
              data-testid="handoff-new-round-minimum"
              placeholder="Ex.: 58000"
            />
          </label>

          <p>{NEW_ROUND_DIALOG_NOTICE}</p>
        </Dialog>
      ) : null}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * O ROTEADOR — e por que ele é o guard do §15.
 *
 * `handoff_failed` é testado PRIMEIRO, antes de qualquer coisa olhar para
 * `inspection`. A ordem é o mecanismo: a 4.9A preserva a agenda no banco e o
 * ponteiro `selected_offer_id` continua apontando para a seleção encerrada, então
 * o DTO de uma solicitação sem acordo PODE trazer `inspection.state === "scheduled"`
 * com `scheduled_at` preenchido. Se a condição do match ativo viesse antes — ou
 * se fosse escrita sobre a existência da inspeção em vez do STATUS —, a tela
 * anunciaria "Avaliação agendada" para uma visita que ninguém vai fazer.
 *
 * É por isso que nenhuma decisão desta árvore consulta `inspection`: quem manda é
 * o status da solicitação, que é o que a máquina de estados garante.
 */
export default function SaleRequestHandoff({
  saleRequestId,
  request,
  selected,
  inspection,
  round,
  history,
  hasOtherOffers,
  onChanged,
}: {
  saleRequestId: string | number;
  request: SaleRequest;
  selected: SaleRequestSelectedOffer | null;
  inspection: OwnerInspection | null;
  round: SaleRequestRound | null;
  history: SelectionHistoryEntry[];
  hasOtherOffers: boolean;
  onChanged: () => void;
}) {
  if (request.status === "handoff_failed") {
    return (
      <FailedHandoff
        saleRequestId={saleRequestId}
        round={round}
        history={history}
        hasOtherOffers={hasOtherOffers}
        onChanged={onChanged}
      />
    );
  }

  // Os DOIS estados vivos do match compartilham o mesmo card: mesma loja, mesmo
  // valor, mesmo endereço, mesmo WhatsApp e a mesma saída de "não houve acordo"
  // (§36 — ela não some quando o horário é confirmado). O que muda entre eles é
  // o painel de agendamento, e essa diferença é resolvida lá dentro.
  const scheduled = request.status === "inspection_scheduled";

  if ((request.status === "offer_selected" || scheduled) && selected) {
    return (
      <ActiveHandoff
        saleRequestId={saleRequestId}
        request={request}
        selected={selected}
        inspection={inspection}
        scheduled={scheduled}
        history={history}
        onChanged={onChanged}
      />
    );
  }

  return null;
}
