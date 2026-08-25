"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import VehicleEvaluationSheet, {
  Card,
  DataRow,
} from "@/components/account/VehicleEvaluationSheet";
import SaleRequestProposals from "@/components/account/SaleRequestProposals";
import SaleRequestHandoff from "@/components/account/SaleRequestHandoff";
import SaleRequestLegacyFlow from "@/components/account/SaleRequestLegacyFlow";
import {
  DECLARED_CONDITION_OPTIONS,
  NOT_INFORMED,
  STATUS_LABEL,
  cancelSaleRequest,
  formatFipe,
  formatMileage,
  formatMoneyValue,
  getSaleRequest,
  readBodyPaintIssue,
  readBodyPaintStatus,
  readCautionReport,
  readIpvaStatus,
  readLicensingStatus,
  readMechanicalCondition,
  readTireCondition,
  readYesNoUnknown,
  type SaleRequest,
  type SaleRequestProposal,
  type SaleRequestSelectedOffer,
} from "@/lib/sale-requests/api";
import type {
  OwnerInspection,
  PostInspectionDecision,
} from "@/lib/sale-requests/inspection";
import type { OwnerFinalDecision } from "@/lib/sale-requests/final-decision";
import type { SaleRequestRound, SelectionHistoryEntry } from "@/lib/sale-requests/handoff";

/**
 * Detalhe de UMA solicitação, para o dono.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AS PROPOSTAS VÊM PRIMEIRO (Fase 4.4)
 * ────────────────────────────────────────────────────────────────────────────
 * A seção "Propostas recebidas" fica ACIMA da ficha, logo depois das fotos. A
 * ficha é o que a pessoa já preencheu e já sabe; as propostas são a novidade e a
 * única decisão que ela tem para tomar aqui. Enterrá-las abaixo de vinte linhas
 * de declaração faria o proprietário rolar uma tela inteira do próprio
 * formulário para descobrir que alguém ofereceu dinheiro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A FICHA INTEIRA FICA VISÍVEL DEPOIS DE PUBLICADA
 * ────────────────────────────────────────────────────────────────────────────
 * Tudo o que a pessoa respondeu aparece aqui, agrupado nas mesmas seções do
 * formulário. Coletar dezoito respostas e depois só mostrar marca, ano e km
 * seria pedir trabalho sem devolver nada — e o dono não teria como conferir o
 * que as lojas vão ver.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * "NÃO INFORMADO" NUNCA VIRA "NÃO"
 * ────────────────────────────────────────────────────────────────────────────
 * Solicitações publicadas antes desta ficha existir têm NULL em todas as
 * colunas novas. NULL significa "a versão anterior do formulário não
 * perguntou", e é exibido como "Não informado" — nunca como "Não", que seria
 * uma declaração que o proprietário jamais fez.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEM EDIÇÃO, SEM PLACEHOLDER DE FUTURO
 * ────────────────────────────────────────────────────────────────────────────
 * A avaliação presencial agora EXISTE (Fase 4.5), e a tela deixou de dizer
 * "aguardando próxima etapa" para mostrar a etapa real: escolher o horário,
 * comparecer, e ver a proposta final.
 *
 * Continua não havendo PRAZO, cronômetro ou "próxima etapa em X dias". Não há
 * relógio nesta fase, e anunciar um faria a pessoa cobrar uma data que o sistema
 * não garante.
 *
 * Publicou, não edita campo economicamente relevante: mudar a quilometragem
 * debaixo de uma proposta já feita seria alterar o objeto do negócio depois da
 * oferta. E a quilometragem que a LOJA observa não sobrescreve a declarada — as
 * duas aparecem lado a lado, que é o que torna uma eventual redução de valor
 * compreensível.
 *
 * O cancelamento passou a ter um limite: depois de escolher uma proposta,
 * cancelar não é mais possível — nem durante a avaliação. O botão desaparece em
 * vez de devolver um erro a quem clicasse.
 */

const CONDITION_LABEL = new Map(DECLARED_CONDITION_OPTIONS.map((item) => [item.value, item.label]));

const TRANSMISSION_LABEL: Record<string, string> = {
  automatico: "Automático",
  manual: "Manual",
  cvt: "CVT",
};

const FUEL_LABEL: Record<string, string> = {
  flex: "Flex",
  gasolina: "Gasolina",
  etanol: "Etanol",
  diesel: "Diesel",
  hibrido: "Híbrido",
  eletrico: "Elétrico",
};





export default function SaleRequestDetail({ id }: { id: string }) {
  const router = useRouter();

  const [request, setRequest] = useState<SaleRequest | null>(null);
  const [proposals, setProposals] = useState<SaleRequestProposal[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<SaleRequestSelectedOffer | null>(null);
  const [inspection, setInspection] = useState<OwnerInspection | null>(null);
  const [finalDecision, setFinalDecision] = useState<PostInspectionDecision | null>(null);
  /** Fase 4.6 — a resposta do proprietário à proposta final. */
  const [ownerDecision, setOwnerDecision] = useState<OwnerFinalDecision | null>(null);
  /** Fase 4.7 — a rodada aberta e o histórico de matches. */
  const [round, setRound] = useState<SaleRequestRound | null>(null);
  const [selectionHistory, setSelectionHistory] = useState<SelectionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  /**
   * Contador de recargas. Incrementá-lo re-dispara o efeito de carga.
   *
   * É o que a seção de propostas usa quando o servidor recusa uma seleção
   * obsoleta (a loja aumentou entre a renderização e o clique): a tela precisa
   * do estado novo, e um `router.refresh()` não serve — este componente busca os
   * dados no cliente, e o refresh do App Router só revalidaria o servidor, sem
   * tocar neste estado.
   */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let alive = true;
    void getSaleRequest(id)
      .then((response) => {
        if (!alive) return;
        setRequest(response.sale_request);
        // Coerção defensiva: uma resposta inesperada não pode quebrar a tela
        // inteira do detalhe por causa da seção de propostas.
        setProposals(Array.isArray(response.proposals) ? response.proposals : []);
        setSelectedOffer(response.selected_offer ?? null);
        setInspection(response.inspection ?? null);
        setFinalDecision(response.final_decision ?? null);
        setOwnerDecision(response.owner_final_decision ?? null);
        setRound(response.round ?? null);
        // Coerção defensiva, como a de `proposals`: uma resposta inesperada não
        // pode derrubar a tela inteira por causa do histórico.
        setSelectionHistory(
          Array.isArray(response.selection_history) ? response.selection_history : []
        );
      })
      .catch((failure) => {
        if (alive) {
          setError(
            failure instanceof Error ? failure.message : "Não foi possível carregar a solicitação."
          );
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id, reloadToken]);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      const response = await cancelSaleRequest(id);
      setRequest(response.sale_request);
      // A disputa acabou: as propostas somem da tela junto com o cancelamento.
      setProposals([]);
      setConfirming(false);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível cancelar.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-[#64748b]" data-testid="sale-request-detail-loading">
        Carregando…
      </p>
    );
  }

  if (!request) {
    return (
      <div data-testid="sale-request-detail-error">
        <p
          className="rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm text-[#b42318]"
          role="alert"
        >
          {error || "Solicitação não encontrada."}
        </p>
        <Link
          href="/dashboard/vender-para-lojas"
          className="mt-4 inline-block text-sm font-semibold text-[#0e62d8] hover:underline"
        >
          ← Voltar para minhas solicitações
        </Link>
      </div>
    );
  }

  const open = request.status === "receiving_offers";
  const fipe = formatFipe(request.fipe_reference_value);
  const minimumPrice = formatMoneyValue(request.minimum_accepted_price);

  const bodyPaintIssues = request.body_paint_issues;
  const bodyPaintIssuesLabel =
    bodyPaintIssues && bodyPaintIssues.length > 0
      ? bodyPaintIssues.map((issue) => readBodyPaintIssue(issue)).filter(Boolean).join(", ")
      : null;

  return (
    <div data-testid="sale-request-detail">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">
          {request.brand} {request.model}
        </h1>
        {/*
          TRÊS estados, três tratamentos — e não "aberta vs. resto".
          Antes da Fase 4.4 o ternário bastava, porque o "resto" era só
          `cancelled`. Com `offer_selected` no mesmo ramo, uma solicitação que
          acabou de receber uma escolha apareceria com o MESMO cinza apagado de
          uma cancelada: dois desfechos opostos com a mesma cara.

          O azul não é decoração. Ele diz que algo aconteceu e que o estado é
          ativo — verde é "recebendo", cinza é "encerrada sem desfecho".

          O TOM foi medido, não escolhido no olho. O primeiro candidato foi
          `#EFF4FF`, o azul mais claro da paleta: contra o fundo desta área
          (`rgb(242,243,247)`) ele computa `rgb(239,244,255)` — três pontos de
          diferença em dois canais. A pílula sumia e sobrava só o texto azul
          solto, sem a forma que distingue um selo de estado de uma palavra
          qualquer ao lado do título.

          `#D1E0FF` com `#1849a9` resolve as duas coisas: a pílula aparece
          contra o fundo, e o texto tem ~6:1 sobre ela — folga sobre o mínimo de
          4,5:1 para este tamanho em negrito.
        */}
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
            open
              ? "bg-[#ECFDF3] text-[#027A48]"
              : request.status === "offer_selected"
                ? "bg-[#D1E0FF] text-[#1849a9]"
                : "bg-[#F2F4F7] text-[#475467]"
          }`}
          data-testid="sale-request-detail-status"
        >
          {STATUS_LABEL[request.status]}
        </span>
      </div>

      <p className="mt-1 text-sm text-[#64748b]">{request.fipe_model_description}</p>

      {request.images.length > 0 ? (
        <ul
          className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
          data-testid="sale-request-gallery"
        >
          {request.images.map((url, index) => (
            <li
              key={url}
              className="overflow-hidden rounded-[14px] border border-[#E5E9F2] bg-[#F9FBFF]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={index === 0 ? "Foto de capa do veículo" : `Foto ${index + 1} do veículo`}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        PROPOSTAS RECEBIDAS (Fase 4.4) — acima da ficha, de propósito.

        O componente decide sozinho o que mostrar: a lista enquanto a disputa
        está aberta, o painel da escolhida depois da seleção, e nada quando a
        solicitação foi cancelada. Concentrar essa decisão nele mantém esta tela
        sem uma cadeia de ternários sobre `status` que teria de ser mantida em
        sincronia com a de lá.
      */}
      <div className="mt-5">
        <SaleRequestProposals
          saleRequestId={request.id}
          proposals={proposals}
          selected={selectedOffer}
          status={request.status}
          inspectionStarted={Boolean(inspection || finalDecision)}
          onSelected={(selected) => {
            // A resposta do POST veio de dentro da transação que travou a
            // solicitação — é autoritativa. Aplicá-la aqui evita um GET extra e,
            // mais importante, evita a janela em que a tela mostraria a lista
            // antiga de propostas ao lado de uma escolha já feita.
            setSelectedOffer(selected);
            setProposals([]);
            setRequest((current) =>
              current ? { ...current, status: "offer_selected" } : current
            );

            /*
              §17 — A AGENDA NÃO ATRAVESSA A RESSELEÇÃO.

              Aceitar outra oferta cria uma SELEÇÃO nova, e desde a migration 061
              a agenda pertence à seleção: o match novo nasce sem agenda nenhuma.
              O backend já responde assim (`getInspectionForRequest` parte de
              `selected_offer_id` → seleção atual → inspeção daquela seleção).

              Quem não sabia disso era este estado local. Vindo de
              `handoff_failed`, `inspection` ainda guarda a agenda da loja A — o
              DTO a devolve, porque o ponteiro da seleção encerrada é preservado
              de propósito. Sem esta limpeza, os dados da loja A sobreviveriam à
              troca até a próxima recarga, e o painel da loja B leria o
              `scheduled_at` de um negócio que já acabou.

              Zerar os três é o mesmo argumento do `setProposals([])` logo acima:
              o que era verdade sobre o match anterior não é verdade sobre este.
            */
            setInspection(null);
            setFinalDecision(null);
            setOwnerDecision(null);

            router.refresh();
          }}
          onStale={() => setReloadToken((value) => value + 1)}
        />
      </div>

      {/*
        FASE 4.7 — o HANDOFF DIRETO.

        Substituiu o painel de avaliação presencial da 4.5. A plataforma deixou
        de agendar visita, registrar inspeção e intermediar proposta final: ela
        entrega o contato comercial da loja aceita, e a negociação acontece entre
        as duas partes.

        Fica logo abaixo do bloco de propostas porque é a CONTINUAÇÃO dele: a
        pessoa aceitou uma oferta ali em cima, e o que acontece a seguir é isto.
        O componente decide sozinho entre o match ativo e o "não houve acordo".

        `hasOtherOffers` alimenta o separador "ou" do §38: em `handoff_failed`
        com outras propostas na tela, a nova rodada é a SEGUNDA saída; sem elas,
        é a única.
      */}
      <div className="mt-4">
        <SaleRequestHandoff
          saleRequestId={request.id}
          request={request}
          selected={selectedOffer}
          inspection={inspection}
          round={round}
          history={selectionHistory}
          hasOtherOffers={proposals.length > 0}
          onChanged={() => setReloadToken((value) => value + 1)}
        />
      </div>

      {/*
        LEGADO 4.5/4.6 — somente leitura.

        As solicitações que viveram o fluxo antigo continuam mostrando a
        avaliação registrada e a proposta final. Nenhuma delas tem ação: os
        writers foram aposentados e os formulários não existem mais.

        ────────────────────────────────────────────────────────────────────────
        A CONDIÇÃO MUDOU NA 4.9B, E TINHA DE MUDAR
        ────────────────────────────────────────────────────────────────────────
        Era `inspection || finalDecision`. Fazia sentido enquanto NENHUMA
        inspeção nova podia nascer: entre a 4.7 e a 4.9A os três writers da
        agenda respondiam 409, então a mera existência de uma inspeção provava
        que a linha era antiga.

        A 4.9B reabriu o agendamento. Agora toda solicitação que marca um horário
        tem `inspection` preenchida — e com a condição antiga cada uma delas
        ganharia, logo abaixo do painel de agendamento VIVO, um cartão anunciando
        "Histórico — esta solicitação passou pelo fluxo anterior da plataforma".
        Duas leituras opostas do mesmo agendamento, na mesma tela.

        O que distingue de verdade uma linha do fluxo antigo é o que só ele
        produzia: a ficha OBSERVADA e a proposta final. Nenhum writer vivo escreve
        qualquer um dos dois.
      */}
      {inspection?.observed || finalDecision || ownerDecision ? (
        <div className="mt-4">
          <SaleRequestLegacyFlow
            request={request}
            inspection={inspection}
            decision={finalDecision}
            ownerDecision={ownerDecision}
          />
        </div>
      ) : null}

      {/*
        Duas colunas a partir de `md`, uma no mobile. Os cartões são
        independentes, então a grade pode reorganizá-los sem quebrar leitura
        nenhuma — e o detalhe não vira um painel único ilegível.
      */}
      {/*
        A ficha é renderizada pelo componente COMPARTILHADO com a área do
        lojista. As duas telas mostram a mesma declaração porque leem o mesmo
        código — e não porque duas cópias foram mantidas alinhadas à mão.

        O card "Dados do veículo" entra como `leading` por ser específico desta
        tela: ele traz a data de publicação, que é informação do DONO sobre a
        própria solicitação.
      */}
      <div className="mt-5">
        <VehicleEvaluationSheet
          evaluation={request}
          declaredConditionLabel={
            CONDITION_LABEL.get(request.declared_condition) || request.declared_condition
          }
          leading={
            <Card title="Dados do veículo">
              <DataRow label="Ano" value={String(request.year)} />
              <DataRow label="Quilometragem" value={formatMileage(request.mileage)} />
              <DataRow
                label="Câmbio"
                value={TRANSMISSION_LABEL[request.transmission] || request.transmission}
              />
              <DataRow
                label="Combustível"
                value={FUEL_LABEL[request.fuel_type] || request.fuel_type}
              />
              <DataRow
                label="Cidade"
                value={`${request.city.name}${request.city.state ? ` - ${request.city.state}` : ""}`}
              />
              {fipe ? <DataRow label="Referência FIPE" value={fipe} /> : null}

              {/*
                O PISO que ESTA pessoa declarou (4.3.3).
                Fica aqui, e não só na tela do lojista, porque é a declaração
                econômica dela: precisa poder conferir contra o que decidiu. Não
                é editável nesta fase — mudar o piso depois que as lojas já
                viram a oportunidade alteraria a regra da disputa no meio dela.

                `null` (solicitação anterior à regra) simplesmente não rende
                linha: escrever "R$ 0,00" afirmaria que ela aceita qualquer
                valor.
              */}
              {minimumPrice ? (
                <DataRow label="Valor mínimo informado" value={minimumPrice} />
              ) : null}
              <DataRow
                label="Publicada em"
                value={new Date(request.created_at).toLocaleDateString("pt-BR")}
              />
            </Card>
          }
        />
      </div>

      {request.known_issues ? (
        <section className="mt-4 rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <h2 className="text-[13px] font-bold text-[#161f34]">Observações adicionais</h2>
          <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[#475467]">
            {request.known_issues}
          </p>
        </section>
      ) : null}

      {error ? (
        <p
          className="mt-5 rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm text-[#b42318]"
          role="alert"
          data-testid="sale-request-detail-cancel-error"
        >
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="mt-6">
          {confirming ? (
            <div
              className="rounded-[16px] border border-[#E5E9F2] bg-[#F9FBFF] p-4"
              data-testid="sale-request-cancel-confirm"
            >
              <p className="text-sm font-semibold text-[#1D2440]">Cancelar esta solicitação?</p>
              <p className="mt-1 text-sm text-[#64748b]">
                Ela sai da lista das lojas e continua no seu histórico. Não é possível reativá-la.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={cancelling}
                  className="h-12 rounded-xl bg-[#b42318] px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  data-testid="sale-request-cancel-confirm-button"
                >
                  {cancelling ? "Cancelando…" : "Sim, cancelar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={cancelling}
                  className="h-12 rounded-xl border border-[#E5E9F2] bg-white px-5 text-sm font-bold text-[#1D2440] transition hover:bg-[#F9FBFF] disabled:opacity-50"
                >
                  Manter recebendo ofertas
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-12 w-full rounded-xl border border-[#FECDCA] bg-white px-5 text-sm font-bold text-[#b42318] transition hover:bg-[#FEF3F2] sm:w-auto sm:min-w-[240px]"
              data-testid="sale-request-cancel-button"
            >
              Cancelar solicitação
            </button>
          )}
        </div>
      ) : request.status !== "cancelled" ? (
        /*
          Depois da seleção NÃO há botão de cancelar, e a ausência é a mensagem.
          Renderizá-lo desabilitado, ou renderizá-lo para receber um 409, diria
          que a reversão existe e está indisponível — quando ela simplesmente não
          existe nesta fase.

          A condição é `!== "cancelled"` e não uma igualdade com `offer_selected`
          porque os quatro estados da 4.5 têm exatamente o mesmo comportamento:
          nenhum deles aceita cancelamento. Uma igualdade faria o botão REAPARECER
          quando a avaliação fosse agendada — e ele levaria a um 409.

          Os blocos acima já dizem o que está acontecendo; esta linha só fecha o
          assunto do cancelamento para quem procurava o botão.
        */
        <p className="mt-6 text-sm text-[#64748b]" data-testid="sale-request-selected-note">
          Você já selecionou uma proposta. Esta solicitação não recebe mais propostas e não
          pode ser cancelada.
        </p>
      ) : (
        <p className="mt-6 text-sm text-[#64748b]" data-testid="sale-request-cancelled-note">
          Esta solicitação foi cancelada e permanece no seu histórico.
        </p>
      )}
    </div>
  );
}
