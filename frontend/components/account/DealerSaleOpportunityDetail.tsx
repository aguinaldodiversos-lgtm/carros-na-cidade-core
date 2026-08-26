"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DealerOfferPanel from "@/components/account/DealerOfferPanel";
import DealerHandoffPanel from "@/components/account/DealerHandoffPanel";
import DealerSchedulingPanel from "@/components/account/DealerSchedulingPanel";
import VehicleEvaluationSheet from "@/components/account/VehicleEvaluationSheet";
import OpportunityGallery from "@/components/account/opportunity/OpportunityGallery";
import OpportunityMarketReference from "@/components/account/opportunity/OpportunityMarketReference";
import OpportunitySafetyNotice from "@/components/account/opportunity/OpportunitySafetyNotice";
import OpportunitySellerNotes from "@/components/account/opportunity/OpportunitySellerNotes";
import OpportunityVehicleInfo, {
  VEHICLE_INFO_ICON,
} from "@/components/account/opportunity/OpportunityVehicleInfo";
import {
  DECLARED_CONDITION_LABEL,
  FUEL_LABEL,
  TRANSMISSION_LABEL,
  describeVehicle,
  fetchSaleOpportunity,
  formatCity,
  formatMileage,
  formatPublishedAt,
  type DealerOfferState,
  type DealerSaleOpportunityDetail as Detail,
} from "@/lib/sale-requests/dealer-api";

/**
 * AVALIAÇÃO DE VEÍCULO PARA COMPRA — a central de decisão do lojista.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A PERGUNTA QUE A PÁGINA RESPONDE, NA ORDEM EM QUE ELA É FEITA
 * ════════════════════════════════════════════════════════════════════════════
 * Que veículo é este → como ele está → quanto o dono quer → qual a maior oferta
 * → qual foi a minha → como isso se compara à FIPE → o que merece atenção →
 * quero ofertar?
 *
 * As sete primeiras são LEITURA e moram na coluna esquerda e no cartão de
 * referência. A oitava é AÇÃO, e por isso a coluna direita não sai da tela
 * enquanto se rola a esquerda.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DUAS COLUNAS QUE NÃO COMPARTILHAM LINHAS (§6)
 * ════════════════════════════════════════════════════════════════════════════
 * Cada coluna é um invólucro que vira `display: contents` no celular e `block`
 * no desktop.
 *
 * Isto não é preciosismo de CSS — é o que resolve dois requisitos que se
 * contradizem. No desktop as colunas precisam ser INDEPENDENTES: numa grade
 * comum, "Informações do veículo" (baixinho) e "Referência de mercado" (alto)
 * dividiriam uma linha, e a menor ganharia um vão do tamanho da diferença. No
 * celular a ordem precisa ser ENTRELAÇADA: negociação e FIPE sobem para antes da
 * ficha (§37), e isso é impossível se as três estiverem presas dentro de um
 * invólucro.
 *
 * `display: contents` dissolve o invólucro no celular — os filhos passam a ser
 * itens diretos do flex do pai, e as classes `order-*` funcionam. No desktop o
 * invólucro volta a existir e empilha os seus.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SEM MENU LATERAL (§4)
 * ════════════════════════════════════════════════════════════════════════════
 * A tela não esconde a barra: ela não é montada. `AccountPanelShell` reconhece
 * esta rota (`lib/account/focus-routes.ts`) e retorna antes de construir a
 * moldura do painel. O cabeçalho global do site continua vindo do layout raiz.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A FICHA CONTINUA SENDO O COMPONENTE COMPARTILHADO COM A TELA DO DONO
 * ════════════════════════════════════════════════════════════════════════════
 * Quem publica precisa poder confiar que a loja lê exatamente o que ele
 * declarou. As duas telas mostram a mesma declaração porque leem o mesmo
 * código — não porque duas cópias foram mantidas alinhadas à mão.
 */

export default function DealerSaleOpportunityDetail({
  id,
  basePath = "/dashboard-loja",
}: {
  id: string;
  basePath?: string;
}) {
  const [opportunity, setOpportunity] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A loja escolhida no feed chega pela URL e acompanha o detalhe inteiro —
  // leitura e proposta. Sem ela, um lojista com duas lojas veria o 409 de novo
  // ao abrir um card que já tinha escolhido de qual loja estava olhando.
  const searchParams = useSearchParams();
  const advertiserId = searchParams.get("loja");
  const backQuery = advertiserId ? `?loja=${encodeURIComponent(advertiserId)}` : "";
  const backHref = `${basePath}/oportunidades/veiculos${backQuery}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOpportunity(await fetchSaleOpportunity(id, advertiserId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível carregar o veículo."
      );
      setOpportunity(null);
    } finally {
      setLoading(false);
    }
  }, [id, advertiserId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * O painel devolve o estado novo depois de enviar (ou depois de uma recusa que
   * trouxe o líder atualizado). Aplicá-lo aqui evita um GET extra: a resposta do
   * POST já é autoritativa, porque veio de dentro da transação que travou a
   * solicitação.
   */
  const applyOfferState = (next: DealerOfferState) => {
    setOpportunity((current) => (current ? { ...current, ...next } : current));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0e62d8] border-t-transparent" />
        <span className="text-sm text-[#64748b]">Carregando veículo…</span>
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <section className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6" data-testid="dealer-detail-error">
        <Link
          href={backHref}
          className="text-sm font-semibold text-[#0e62d8] hover:underline"
        >
          ← Voltar para oportunidades
        </Link>
        <div className="mt-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6 text-center">
          <p className="text-sm text-[#b42318]">{error || "Veículo não encontrado."}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 h-11 rounded-xl border border-[#fecaca] bg-white px-5 text-sm font-bold text-[#b42318] transition hover:bg-[#fff5f5]"
          >
            Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  const vehicleLabel = describeVehicle(opportunity);

  /**
   * A ficha técnica curta (§13).
   *
   * Cinco itens, e só estes cinco: portas, cor, placa e chassi aparecem na
   * referência visual mas não existem no contrato — ver o cabeçalho de
   * `OpportunityVehicleInfo`.
   */
  const vehicleInfoItems = [
    { label: "Ano", value: String(opportunity.year), icon: VEHICLE_INFO_ICON.calendar },
    {
      label: "Quilometragem",
      value: formatMileage(opportunity.mileage),
      icon: VEHICLE_INFO_ICON.gauge,
    },
    {
      label: "Combustível",
      value: FUEL_LABEL[opportunity.fuel_type] || opportunity.fuel_type,
      icon: VEHICLE_INFO_ICON.fuel,
    },
    {
      label: "Câmbio",
      value: TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission,
      icon: VEHICLE_INFO_ICON.gear,
    },
    {
      label: "Localização",
      value: formatCity(opportunity.city),
      icon: VEHICLE_INFO_ICON.pin,
    },
  ];

  return (
    <section
      className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:py-7"
      data-testid="dealer-sale-opportunity-detail"
    >
      {/* ── CABEÇALHO DA PÁGINA (§8) ────────────────────────────────────── */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0e62d8] hover:underline"
        data-testid="dealer-detail-back"
      >
        <span aria-hidden="true">←</span> Voltar para oportunidades
      </Link>

      <header className="mb-4 mt-2 lg:mb-5">
        <h1 className="text-[23px] font-bold leading-tight tracking-[-0.01em] text-[#161f34] sm:text-[28px]">
          Avaliação de veículo para compra
        </h1>
        {/*
          O subtítulo acompanha o estado. Para a loja escolhida, "envie sua
          oferta" é uma instrução impossível: não há mais oferta a enviar, e o
          formulário nem está na tela. Manter a frase fixa faria a página pedir
          uma ação que ela mesma removeu.

          A ordem dos testes importa: `owner_final_decision` é checado ANTES de
          `is_selected`, porque os dois são verdadeiros ao mesmo tempo — quem
          respondeu também está selecionado.
        */}
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#667085]">
          {opportunity.owner_final_decision
            ? opportunity.owner_final_decision.type === "accepted"
              ? "O proprietário aceitou a sua proposta final. A decisão comercial está registrada."
              : "O proprietário não aceitou a proposta final. Esta avaliação está encerrada."
            : opportunity.is_selected
              ? "O proprietário aceitou a oferta da sua loja e recebeu os dados de contato."
              : "Analise as informações declaradas pelo vendedor e envie sua oferta."}
        </p>
      </header>

      {/*
        A GRADE. 64/36 a partir de 1024 e 68/32 a partir de 1280 (§6/§41): em
        1024 a coluna comercial precisa dos ~360px que o formulário exige, e em
        1440 a de leitura é que aproveita a sobra.

        `lg:items-start` NÃO é cosmético: sem ele, o item de grade estica para a
        altura da linha e `position: sticky` deixa de ter espaço para deslizar —
        o painel ficaria parado sem nenhum erro visível.
      */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,64fr)_minmax(0,36fr)] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,68fr)_minmax(0,32fr)]">
        {/* ══ COLUNA ESQUERDA — VEÍCULO E ANÁLISE ══════════════════════════ */}
        <div className="contents lg:block lg:space-y-4">
          {/* 1 — IDENTIDADE DO VEÍCULO + GALERIA, no mesmo cartão (§9/§10) */}
          <section className="order-1 rounded-2xl border border-[#E5E9F2] bg-white p-3.5 sm:p-5">
            <div className="mb-3">
              {/*
                "Particular" é um FATO deste produto, não um rótulo decorativo:
                todo veículo aqui vem de pessoa física. É o que diferencia esta
                tela do estoque de lojista.
              */}
              <span className="inline-flex items-center rounded-md bg-[#F4F3FF] px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide leading-none text-[#5925DC]">
                Particular
              </span>

              <h2 className="mt-2 text-[21px] font-bold leading-tight text-[#161f34] sm:text-[26px]">
                {vehicleLabel}
              </h2>

              <p className="mt-0.5 text-[13px] leading-snug text-[#667085]">
                {opportunity.fipe_model_description}
              </p>

              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-[#98A2B3]">
                <span className="inline-flex items-center gap-1 font-medium text-[#475467]">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                    <circle cx="12" cy="10" r="2.4" />
                  </svg>
                  {formatCity(opportunity.city)}
                </span>
                <span aria-hidden="true">·</span>
                {/*
                  O estado real, e não um rótulo fixo. Chegar aqui com
                  `is_selected` significa que ESTA loja venceu — a API devolve 404
                  para as demais depois da decisão —, então a linha nunca diz
                  "selecionada" para quem perdeu.
                */}
                <span>
                  {opportunity.is_selected ? "Proposta selecionada" : "Recebendo propostas"}
                </span>
                <span aria-hidden="true">·</span>
                <span>publicado {formatPublishedAt(opportunity.created_at)}</span>
              </p>
            </div>

            <OpportunityGallery images={opportunity.images} vehicleLabel={vehicleLabel} />
          </section>

          {/* 7 no celular / 2 no desktop — INFORMAÇÕES DO VEÍCULO (§13) */}
          <div className="order-4 min-w-0">
            <OpportunityVehicleInfo items={vehicleInfoItems} />
          </div>

          {/* 8 no celular / 3 no desktop — CONDIÇÃO DECLARADA (§15 a §17) */}
          <div className="order-5 min-w-0" data-testid="dealer-detail-condition">
            {/*
              O título diz DE QUEM é a declaração (§15/§17). "Condição do
              veículo" soaria como verificação da plataforma — e a plataforma não
              vistoria nada: ela transporta o que o proprietário respondeu.

              Fica FORA do componente compartilhado de propósito: a tela do dono
              usa a mesma ficha e lá não existe "vendedor" — ele É o vendedor.
            */}
            <h2 className="mb-2.5 text-[14px] font-bold text-[#161f34]">
              Condição declarada pelo vendedor
            </h2>
            <VehicleEvaluationSheet
              evaluation={opportunity.evaluation}
              declaredConditionLabel={
                DECLARED_CONDITION_LABEL[opportunity.declared_condition] ||
                opportunity.declared_condition
              }
              conditionSectionTitle="Conservação"
            />
          </div>

          {/* 9 no celular / 4 no desktop — OBSERVAÇÕES + PONTOS (§18/§19) */}
          <div className="order-6 min-w-0">
            <OpportunitySellerNotes
              knownIssues={opportunity.known_issues}
              mileage={opportunity.mileage}
              images={opportunity.images}
              evaluation={opportunity.evaluation}
            />
          </div>
        </div>

        {/*
          ══ COLUNA DIREITA — ÁREA COMERCIAL (§21) ═════════════════════════
          `lg:sticky lg:top-20`: 80px deixa a coluna 16px abaixo do cabeçalho
          global de 64px (§31). O `sticky` só existe a partir de `lg` — no
          celular a coluna é parte da pilha e grudá-la cobriria a ficha, que é
          exatamente o que o lojista veio ler.
        */}
        <div className="contents lg:sticky lg:top-20 lg:block lg:space-y-4">
          {/*
            2 — NEGOCIAÇÃO.

            `id="proposta"` é o destino de "Fazer oferta" no card do feed: quem já
            decidiu abrir a página para ofertar cai no formulário, e não no topo.
            `scroll-mt` compensa o cabeçalho fixo — sem ele a âncora encosta o
            painel embaixo da barra e o campo de valor fica meio escondido.
          */}
          <div id="proposta" className="order-2 min-w-0 scroll-mt-20">
            {opportunity.is_selected ? (
              /*
                FASE 4.7 + 4.9B — o aceite, e SÓ o agendamento de volta.

                A 4.5 mostrava aqui três formulários: propor horários, registrar
                avaliação e apresentar proposta final. A 4.7 removeu os três; a
                4.9B devolveu o PRIMEIRO, e apenas ele. Os outros dois continuam
                fora do produto, e não por omissão da tela: `completeInspection` e
                `submitPostInspectionDecision` seguem respondendo 409
                `LEGACY_FLOW_RETIRED`. Não há formulário porque não há escrita.
              */
              <>
                <DealerHandoffPanel
                  selectedAmount={opportunity.selected_amount}
                  legacyDecision={opportunity.final_decision}
                />
                <DealerSchedulingPanel
                  saleRequestId={opportunity.id}
                  advertiserId={advertiserId}
                  inspection={opportunity.inspection}
                  status={opportunity.status}
                  onChanged={() => void load()}
                />
              </>
            ) : (
              <DealerOfferPanel
                saleRequestId={opportunity.id}
                advertiserId={advertiserId}
                state={{
                  current_highest_offer: opportunity.current_highest_offer,
                  my_offer: opportunity.my_offer,
                  is_leading: opportunity.is_leading,
                  offers_count: opportunity.offers_count,
                }}
                fipeReferenceValue={opportunity.fipe_reference_value}
                minimumAcceptedPrice={opportunity.minimum_accepted_price}
                onSubmitted={applyOfferState}
              />
            )}
          </div>

          {/* 3 — REFERÊNCIA DE MERCADO (§32 a §34) */}
          <div className="order-3 min-w-0">
            <OpportunityMarketReference
              fipeReferenceValue={opportunity.fipe_reference_value}
              fipeReferenceAt={opportunity.fipe_reference_at}
              minimumAcceptedPrice={opportunity.minimum_accepted_price}
            />
          </div>

          {/* 10 no celular / 3 no desktop — AVISO DE SEGURANÇA (§35) */}
          <div className="order-7 min-w-0">
            <OpportunitySafetyNotice />
          </div>
        </div>
      </div>
    </section>
  );
}
