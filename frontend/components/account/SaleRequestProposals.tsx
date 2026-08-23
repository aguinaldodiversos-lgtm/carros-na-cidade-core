"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SELECTION_CODE,
  SaleRequestError,
  formatMoneyValue,
  selectSaleRequestOffer,
  type SaleRequestProposal,
  type SaleRequestSelectedOffer,
} from "@/lib/sale-requests/api";
import {
  ACCEPT_DIALOG_NOTICE,
  OWNER_ACCEPT_CONFIRMATION_NOTICE,
  OWNER_OFFER_COMMITMENT_NOTICE,
} from "@/lib/sale-requests/handoff";

/**
 * "Propostas recebidas" — a mesa de decisão do proprietário (Fase 4.4).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * UMA LINHA POR LOJA, NUNCA O HISTÓRICO
 * ────────────────────────────────────────────────────────────────────────────
 * A loja que subiu de 62.500 para 65.000 aparece UMA vez, valendo 65.000. O
 * histórico existe no banco para auditoria e não é interface: cinco linhas da
 * mesma loja fariam o proprietário achar que há cinco interessados, e a decisão
 * mais importante do produto seria tomada sobre uma contagem falsa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A MAIOR APARECE PRIMEIRO E NÃO TEM NENHUM PRIVILÉGIO
 * ────────────────────────────────────────────────────────────────────────────
 * A ordem vem do servidor (valor decrescente) e a etiqueta "Maior proposta" vem
 * junto — nenhuma das duas é calculada aqui, para que a marcação nunca discorde
 * da ordenação.
 *
 * Todas as propostas têm o MESMO botão, com o mesmo peso visual. Nada de
 * "Recomendada", nada de botão desabilitado nas menores, nada de aviso
 * perguntando se a pessoa tem certeza de recusar mais dinheiro. Quem vende
 * pondera coisas que este sistema não conhece — a loja que já conhece, a que
 * fica perto, a que atendeu melhor —, e uma interface que empurra para o maior
 * valor é um leilão automático disfarçado de escolha.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTA TELA NÃO MOSTRA
 * ────────────────────────────────────────────────────────────────────────────
 * Nenhum contato: sem telefone, sem WhatsApp, sem e-mail, sem "falar com a
 * loja". Nenhum nome de pessoa, nenhum CNPJ, nenhum identificador interno. E
 * nenhuma observação enviada junto da proposta — ela é interna e não é canal de
 * conversa. A API não devolve nada disso; a tela não teria o que esconder.
 */

/** Cartão de uma proposta. Nome, cidade, valor, e um botão. */
function ProposalCard({
  proposal,
  disabled,
  onSelect,
}: {
  proposal: SaleRequestProposal;
  disabled: boolean;
  onSelect: () => void;
}) {
  const amount = formatMoneyValue(proposal.amount);

  return (
    <li
      className="rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      data-testid="sale-request-proposal"
      data-proposal-id={String(proposal.id)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight text-[#161f34]">
            {proposal.store_name}
          </p>
          {proposal.store_city ? (
            <p className="mt-0.5 text-[12.5px] leading-tight text-[#667085]">
              {proposal.store_city}
            </p>
          ) : null}
        </div>

        {/*
          A etiqueta é INFORMATIVA. Ela diz um fato ("este é o maior valor
          atual"), não uma instrução — por isso é um selo discreto ao lado do
          nome, e não um destaque que reorganize o cartão inteiro.
        */}
        {proposal.is_highest ? (
          <span
            className="inline-flex shrink-0 items-center rounded-md bg-[#ECFDF3] px-2 py-1 text-[11px] font-bold leading-none text-[#027A48]"
            data-testid="sale-request-proposal-highest"
          >
            Maior proposta
          </span>
        ) : null}
      </div>

      {/*
        O valor é o elemento dominante do cartão: é o que a pessoa compara entre
        um cartão e outro, e comparar números pequenos em varredura vertical é
        justamente onde a leitura erra.
      */}
      <p
        className="mt-3 text-[24px] font-bold leading-none tracking-[-0.01em] text-[#161f34] sm:text-[26px]"
        data-testid="sale-request-proposal-amount"
      >
        {amount}
      </p>

      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="mt-4 h-12 w-full rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50 sm:w-auto sm:min-w-[200px]"
        data-testid="sale-request-proposal-select"
      >
        Aceitar oferta
      </button>
    </li>
  );
}

/**
 * O diálogo de confirmação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UM DIÁLOGO, E NÃO UM CLIQUE DIRETO
 * ────────────────────────────────────────────────────────────────────────────
 * A seleção é irreversível: encerra a disputa e não pode ser desfeita nem
 * trocada. Uma ação irreversível a um toque de distância, num cartão que a
 * pessoa está rolando para comparar, é um acidente esperando acontecer no
 * celular.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A COPY DIZ EXATAMENTE O QUE ACONTECE — E MUDOU NA FASE 4.7
 * ────────────────────────────────────────────────────────────────────────────
 * A versão da 4.4 dizia que a seleção era "preliminar" e que o valor "ainda
 * poderá ser revisto". Fazia sentido enquanto a plataforma ia registrar uma
 * avaliação e uma proposta final: a escolha era mesmo um passo intermediário.
 *
 * A 4.7 tirou tudo isso do produto. Aceitar uma oferta virou o COMPROMISSO das
 * duas partes — o lojista ofertou porque quer comprar por aquele valor, e quem
 * aceita confirma que quer vender nas condições declaradas. Chamar isso de
 * "preliminar" enfraqueceria a oferta de propósito e convidaria a renegociar por
 * esporte, que é o que o §4 recusa.
 *
 * O que a copy diz agora: a avaliação presencial CONFIRMA as informações, e
 * divergências relevantes podem levar a loja a revisar o valor ou desistir.
 * Continua não existindo aqui, e não pode passar a existir: "Venda concluída",
 * "Negócio fechado", "Pagamento garantido" ou "Parabéns".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ACESSIBILIDADE
 * ────────────────────────────────────────────────────────────────────────────
 * `role="dialog"` + `aria-modal` + `aria-labelledby`/`aria-describedby`: o leitor
 * de tela anuncia o título e o texto ao abrir, em vez de largar o usuário num
 * botão solto. O foco vai para "Voltar" — a opção NÃO destrutiva —, `Escape`
 * fecha, e o foco volta para o botão que abriu (senão ele reaparece no topo do
 * documento, e quem navega por teclado perde o lugar na lista).
 *
 * O foco é MANTIDO dentro do diálogo por um ciclo de Tab explícito. Sem isso o
 * teclado sai por trás do overlay e passeia pelos cartões que o diálogo está
 * cobrindo — inclusive pelos outros botões "Aceitar oferta".
 */
function ConfirmDialog({
  proposal,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  proposal: SaleRequestProposal;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Um envio em curso não é cancelável: a transação já está no servidor, e
      // fechar aqui só faria a tela parar de ouvir a resposta de uma escolha que
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
      // O clique no fundo fecha, como todo overlay do projeto. Durante o envio
      // não fecha, pela mesma razão do Escape.
      onClick={() => {
        if (!submitting) onCancel();
      }}
      onKeyDown={onKeyDown}
      data-testid="sale-request-select-overlay"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-request-select-title"
        aria-describedby="sale-request-select-description"
        // Sem isto, o clique DENTRO do painel borbulharia até o overlay e
        // fecharia o diálogo — inclusive o clique em "Aceitar oferta".
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[440px] rounded-t-2xl bg-white p-5 shadow-[0_20px_40px_rgba(16,24,40,0.16)] sm:rounded-2xl sm:p-6"
        data-testid="sale-request-select-dialog"
      >
        <h2
          id="sale-request-select-title"
          className="text-[17px] font-bold leading-tight text-[#161f34]"
        >
          Aceitar oferta
        </h2>

        <div
          id="sale-request-select-description"
          className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-[#475467]"
        >
          {/*
            FASE 4.7 — a COPY MUDOU, e a mudança é de produto, não de estilo.
            ────────────────────────────────────────────────────────────────
            A versão da 4.4 dizia "Esta seleção é preliminar. O valor ainda
            poderá ser revisto". Estava certa naquele produto: a plataforma ia
            registrar uma avaliação e uma proposta final, e a seleção era mesmo
            um passo intermediário.

            Agora não é. Aceitar uma oferta é o COMPROMISSO das duas partes — o
            lojista ofertou porque quer comprar por aquele valor, e quem aceita
            confirma que quer vender nas condições que declarou. Chamar isso de
            "preliminar" enfraqueceria artificialmente a oferta e convidaria a
            renegociar por esporte, que é exatamente o que o §4 recusa.

            O que continua verdadeiro — e está logo abaixo — é que a avaliação
            presencial CONFIRMA as informações, e que divergências relevantes
            podem levar a loja a revisar ou desistir.
          */}
          <p>
            Você está aceitando a oferta de{" "}
            <span className="font-semibold text-[#161f34]">{proposal.store_name}</span> e vai
            seguir para a avaliação presencial com esta loja.
          </p>
          <p>{ACCEPT_DIALOG_NOTICE}</p>
          <p>{OWNER_ACCEPT_CONFIRMATION_NOTICE}</p>
        </div>

        {/*
          O valor é repetido no diálogo de propósito: entre tocar no cartão e
          confirmar, o cartão sai da tela no celular — e confirmar uma escolha
          irreversível sem ver o número é o erro que o diálogo existe para
          evitar.
        */}
        <p className="mt-4 rounded-xl bg-[#F9FBFF] px-4 py-3 text-[15px] font-bold text-[#161f34]">
          {formatMoneyValue(proposal.amount)}
        </p>

        {error ? (
          <p
            className="mt-4 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] text-[#b42318]"
            role="alert"
            data-testid="sale-request-select-error"
          >
            {error}
          </p>
        ) : null}

        {/*
          "Voltar" primeiro no DOM (é o foco inicial e a saída segura) e primeiro
          na tela do celular, onde a coluna empilha de cima para baixo e o polegar
          alcança o de baixo primeiro — que é a ação destrutiva, e deve exigir
          alcance.
        */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="h-12 rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50 sm:min-w-[190px]"
            data-testid="sale-request-select-confirm"
          >
            {submitting ? "Aceitando…" : "Aceitar oferta"}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-12 rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#1D2440] transition hover:bg-[#F9FBFF] disabled:opacity-50 sm:min-w-[120px]"
            data-testid="sale-request-select-cancel"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * O estado DEPOIS da escolha (§18).
 *
 * Mostra a loja, a cidade e o valor selecionado, e diz onde a pessoa está no
 * processo: "Aguardando próxima etapa".
 *
 * NÃO há botão de contato, e não há telefone nem WhatsApp — não porque estejam
 * escondidos, mas porque não existem nesta fase para nenhum dos dois lados. Um
 * botão inerte aqui prometeria um canal e produziria exatamente a reclamação que
 * ele deveria evitar.
 *
 * As propostas perdedoras somem da tela junto com a decisão: mantê-las ao lado
 * da vencedora convidaria a uma comparação sobre algo que já não pode ser
 * mudado.
 */
function SelectedOfferPanel({
  selected,
  compact,
}: {
  selected: SaleRequestSelectedOffer;
  /**
   * `true` quando a avaliação presencial JÁ COMEÇOU (Fase 4.5).
   *
   * Sem isto, o painel continuava anunciando "Aguardando próxima etapa" e "as
   * próximas etapas serão disponibilizadas aqui" com a próxima etapa
   * renderizada logo abaixo — pedindo à pessoa que esperasse por algo que já
   * estava na tela, e empurrando a informação nova para baixo de um bloco que
   * não tinha mais o que dizer.
   *
   * No modo compacto ele volta a ser o que passou a ser: o CABEÇALHO do
   * negócio — com quem, por quanto — enquanto o estado atual é contado pelo
   * bloco da avaliação.
   */
  compact: boolean;
}) {
  return (
    <section
      className="rounded-2xl border border-[#ABEFC6] bg-[#F6FEF9] p-4 sm:p-5"
      data-testid="sale-request-selected-offer"
    >
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-[#027A48]">
        Proposta selecionada
      </h2>

      <p className="mt-3 text-[16px] font-bold leading-tight text-[#161f34]">
        {selected.store_name}
      </p>
      {selected.store_city ? (
        <p className="mt-0.5 text-[12.5px] text-[#667085]">{selected.store_city}</p>
      ) : null}

      <p
        className="mt-3 text-[26px] font-bold leading-none tracking-[-0.01em] text-[#161f34]"
        data-testid="sale-request-selected-amount"
      >
        {formatMoneyValue(selected.amount)}
      </p>

      {compact ? null : (
        <>
          <p className="mt-4 inline-flex items-center rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-[#027A48] ring-1 ring-[#ABEFC6]">
            Aguardando próxima etapa
          </p>

          <p className="mt-3 text-[13px] leading-relaxed text-[#475467]">
            A proposta foi selecionada. As próximas etapas de avaliação serão
            disponibilizadas aqui.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * A seção inteira: lista, diálogo e estado escolhido.
 *
 * `onSelected` devolve ao detalhe a proposta escolhida — a resposta do POST já é
 * autoritativa (veio de dentro da transação que travou a solicitação), então a
 * tela se atualiza sem um GET extra.
 *
 * `onStale` pede ao detalhe que RECARREGUE. É o único erro desta tela que se
 * resolve sem sair dela: a loja aumentou a proposta entre a renderização e o
 * clique, e o servidor recusou a oferta obsoleta (§9) — recarregar traz o valor
 * atual e o botão volta a funcionar.
 */
export default function SaleRequestProposals({
  saleRequestId,
  proposals,
  selected,
  status,
  inspectionStarted,
  onSelected,
  onStale,
}: {
  saleRequestId: string | number;
  proposals: SaleRequestProposal[];
  selected: SaleRequestSelectedOffer | null;
  status: string;
  /**
   * A avaliação presencial já começou (Fase 4.5)?
   *
   * Quando sim, este bloco vira o CABEÇALHO do negócio e para de anunciar
   * "aguardando próxima etapa" — a próxima etapa está renderizada logo abaixo.
   */
  inspectionStarted: boolean;
  onSelected: (selected: SaleRequestSelectedOffer) => void;
  onStale: () => void;
}) {
  const [confirming, setConfirming] = useState<SaleRequestProposal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guarda o botão que abriu o diálogo para devolver o foco ao fechar.
  const openerRef = useRef<HTMLElement | null>(null);

  const closeDialog = useCallback(() => {
    setConfirming(null);
    setError(null);
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);

  async function handleConfirm() {
    if (!confirming) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await selectSaleRequestOffer(saleRequestId, confirming.id);
      onSelected(response.selected);
      setConfirming(null);
      openerRef.current = null;
    } catch (failure) {
      const code = failure instanceof SaleRequestError ? failure.code : null;

      if (code === SELECTION_CODE.OFFER_STALE) {
        // A tela está desatualizada. Fecha o diálogo e recarrega: insistir no
        // mesmo botão só produziria o mesmo 409.
        setConfirming(null);
        openerRef.current = null;
        setError(null);
        onStale();
        return;
      }

      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível selecionar a proposta."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // A ORDEM DESTES DOIS RAMOS É O COMPORTAMENTO (Fase 4.7)
  // ────────────────────────────────────────────────────────────────────────
  // Em `handoff_failed` a solicitação AINDA TEM `selected_offer` — o ponteiro
  // continua apontando para a loja com quem não houve acordo, porque é ela que o
  // card de handoff mostra.
  //
  // Se o ramo do painel de selecionada viesse primeiro, a tela de resseleção
  // exibiria a loja que acabou de falhar e NENHUMA das outras ofertas — deixando
  // a saída A do §19 sem interface. Por isso o estado é testado antes.
  // E em `offer_selected` o painel também NÃO aparece: quem ocupa esse espaço
  // agora é o card de HANDOFF, que mostra a mesma loja e o mesmo valor MAIS o
  // endereço e o botão de WhatsApp.
  //
  // Renderizar os dois empilharia dois cartões dizendo "Loja Atibaia — R$
  // 65.000,00" um sobre o outro, e o de cima ainda prometeria "as próximas
  // etapas de avaliação serão disponibilizadas aqui" — uma frase que a 4.7
  // tornou falsa.
  //
  // O painel sobrevive para os estados LEGADOS (4.5/4.6): lá o card de handoff
  // não é montado, e ele continua sendo a única âncora da comparação.
  if (status === "handoff_failed" || status === "offer_selected") {
    // Cai direto na lista abaixo (vazia em `offer_selected`, com as outras
    // ofertas em `handoff_failed`).
  } else if (selected) {
    return <SelectedOfferPanel selected={selected} compact={inspectionStarted} />;
  }

  // ────────────────────────────────────────────────────────────────────────
  // FASE 4.7 — A LISTA VOLTA EM `handoff_failed` (§38)
  // ────────────────────────────────────────────────────────────────────────
  // Era `status !== "receiving_offers"`, e estava certo: depois da escolha não
  // havia segunda decisão a tomar.
  //
  // Agora há. Quando a negociação com a loja aceita não prossegue, as OUTRAS
  // ofertas da mesma rodada voltam a ser aceitáveis — é a saída A do §19, e
  // manter a igualdade antiga deixaria a tela de resseleção sem nada para
  // resselecionar.
  //
  // Cancelada continua sumindo inteira: não há disputa a mostrar, e um estado
  // vazio dizendo "nenhuma proposta" seria falso — pode ter havido várias antes.
  if (status !== "receiving_offers" && status !== "handoff_failed") return null;

  return (
    <section data-testid="sale-request-proposals">
      <h2 className="text-[15px] font-bold text-[#161f34]">
        {status === "handoff_failed" ? "Outras ofertas recebidas" : "Propostas recebidas"}
      </h2>

      {proposals.length === 0 ? (
        <p
          className="mt-2 rounded-2xl border border-dashed border-[#D6DEEB] bg-[#F9FBFF] px-4 py-6 text-center text-[13px] text-[#667085]"
          data-testid="sale-request-proposals-empty"
        >
          Nenhuma proposta recebida ainda. As lojas da sua cidade estão avaliando o veículo.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-[#667085]">
            {proposals.length === 1
              ? "1 loja enviou proposta."
              : `${proposals.length} lojas enviaram proposta.`}{" "}
            Você pode escolher qualquer uma delas.
          </p>

          {/*
            §5 — o aviso de compromisso, VISÍVEL antes de qualquer clique.
            ─────────────────────────────────────────────────────────────
            Fica acima dos cartões e não dentro do diálogo por um motivo: o
            diálogo é lido por quem já decidiu, e este texto existe para
            informar a decisão — que a oferta é uma intenção REAL de compra, e
            que o valor está sujeito à confirmação das condições.

            Discreto no peso visual, mas presente: um alerta chamativo aqui
            faria a tela parecer um aviso de risco, e não há risco nenhum em
            aceitar uma oferta legítima.
          */}
          <p
            className="mt-3 rounded-xl bg-[#F9FBFF] px-4 py-3 text-[12.5px] leading-relaxed text-[#667085]"
            data-testid="sale-request-offer-commitment"
          >
            {OWNER_OFFER_COMMITMENT_NOTICE}
          </p>

          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {proposals.map((proposal) => (
              <ProposalCard
                key={String(proposal.id)}
                proposal={proposal}
                disabled={submitting}
                onSelect={() => {
                  openerRef.current = document.activeElement as HTMLElement | null;
                  setError(null);
                  setConfirming(proposal);
                }}
              />
            ))}
          </ul>
        </>
      )}

      {confirming ? (
        <ConfirmDialog
          proposal={confirming}
          submitting={submitting}
          error={error}
          onCancel={closeDialog}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}
    </section>
  );
}
