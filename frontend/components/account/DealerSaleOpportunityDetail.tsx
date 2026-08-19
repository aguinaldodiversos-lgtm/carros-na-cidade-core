"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DealerOfferPanel from "@/components/account/DealerOfferPanel";
import VehicleEvaluationSheet from "@/components/account/VehicleEvaluationSheet";
import {
  DECLARED_CONDITION_LABEL,
  FUEL_LABEL,
  TRANSMISSION_LABEL,
  describeVehicle,
  fetchSaleOpportunity,
  formatCity,
  formatFipeReference,
  formatMileage,
  formatPublishedAt,
  readTireCondition,
  NOT_INFORMED,
  type DealerOfferState,
  type DealerSaleOpportunityDetail as Detail,
} from "@/lib/sale-requests/dealer-api";

/**
 * Avaliação de veículo para compra — o detalhe.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O SUBTÍTULO NÃO DIZ "ENVIE SUA PROPOSTA PARA O VENDEDOR"
 * ────────────────────────────────────────────────────────────────────────────
 * Porque o lojista não se comunica com o vendedor. A proposta vai para o
 * PORTAL, que controla o fluxo. Uma frase que sugira contato direto criaria a
 * expectativa de um canal que não existe — e a primeira pessoa a procurá-lo
 * seria justamente quem acabou de propor.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A FICHA É O COMPONENTE COMPARTILHADO COM A TELA DO DONO
 * ────────────────────────────────────────────────────────────────────────────
 * Quem publica precisa poder confiar que a loja lê exatamente o que ele
 * declarou. As duas telas mostram a mesma declaração porque leem o mesmo
 * código — não porque duas cópias foram mantidas alinhadas à mão.
 *
 * O que NÃO é compartilhado: as ações. A tela do dono tem cancelamento; esta
 * tem proposta. Nenhuma das duas conhece o botão da outra.
 */

/**
 * Galeria: foto principal grande + miniaturas. Sem biblioteca.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A PROPORÇÃO MUDOU DE 4:3 PARA 16:10
 * ────────────────────────────────────────────────────────────────────────────
 * Em 1440, a coluna de conteúdo tem ~740px. Em 4:3 a foto ficava com 555px de
 * ALTURA — mais alta que a área útil da janela, empurrando o resumo, a ficha e
 * qualquer noção de "o que mais tem nesta página" para baixo da dobra. O lojista
 * abria uma mesa de decisão e via uma foto.
 *
 * 16:10 dá ~460px: continua sendo o elemento dominante da tela, e ainda sobra
 * viewport para o começo do resumo. É a proporção da referência, que usa um
 * formato ainda mais cinematográfico.
 *
 * As miniaturas viraram uma FAIXA de rolagem horizontal em vez de uma grade.
 * Com doze fotos, a grade de 5-6 colunas criava duas fileiras de quadrados que
 * competiam com a foto principal; a faixa mantém a altura fixa e deixa a
 * quantidade crescer para o lado.
 */
function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div
        className="flex aspect-[16/10] w-full items-center justify-center rounded-xl border border-dashed border-[#D6DEEB] bg-[#F7F9FC] text-[#98A2B3]"
        data-testid="dealer-detail-no-photos"
      >
        <span className="text-[13px] font-semibold">Sem fotos</span>
      </div>
    );
  }

  const index = Math.min(active, images.length - 1);
  const current = images[index];

  return (
    <div data-testid="dealer-detail-gallery">
      <div className="relative overflow-hidden rounded-xl bg-[#F1F4F9]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current} alt={alt} className="aspect-[16/10] w-full object-cover" />
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-[11.5px] font-semibold leading-none text-white backdrop-blur-sm">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          {index + 1} / {images.length}
        </span>
      </div>

      {images.length > 1 ? (
        <ul className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {images.map((url, position) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(position)}
                aria-label={`Ver foto ${position + 1}`}
                aria-current={position === index}
                className={`block w-[92px] overflow-hidden rounded-lg border-2 transition sm:w-[108px] ${
                  position === index
                    ? "border-[#0e62d8]"
                    : "border-transparent opacity-70 hover:opacity-100"
                }`}
                data-testid="dealer-detail-thumb"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="aspect-[4/3] w-full bg-[#F1F4F9] object-cover"
                  loading="lazy"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Um dado do resumo: ícone + rótulo + valor, na grade do card único. */
function SummaryItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F7FC] text-[#0e62d8]"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] leading-tight text-[#98A2B3]">{label}</span>
        <span className="block truncate text-[13.5px] font-semibold leading-tight text-[#1D2440]">
          {value}
        </span>
      </span>
    </div>
  );
}

/** Ícones do resumo. SVG inline — sem trocar o sistema de ícones do projeto. */
const ICON = {
  calendar: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  gauge: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4-5" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v16M7 7v4a5 5 0 0 0 10 0V7" />
      <circle cx="7" cy="5.5" r="1.6" />
      <circle cx="17" cy="5.5" r="1.6" />
    </svg>
  ),
  fuel: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 20V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15M4 20h10" />
      <path d="M16 9l2 2v6a1.6 1.6 0 0 0 3 0V8l-2.5-2.5" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4l2.3 4.9 5.2.7-3.8 3.6 1 5.2L12 16l-4.7 2.4 1-5.2L4.5 9.6l5.2-.7z" />
    </svg>
  ),
  tire: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  ),
} as const;

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
      <section data-testid="dealer-detail-error">
        <Link
          href={`${basePath}/oportunidades/veiculos${backQuery}`}
          className="text-sm font-semibold text-[#0e62d8] hover:underline"
        >
          ← Veículos para avaliação
        </Link>
        <div className="mt-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6 text-center">
          <p className="text-sm text-[#b42318]">
            {error || "Veículo não encontrado."}
          </p>
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

  const fipe = formatFipeReference(
    opportunity.fipe_reference_value,
    opportunity.fipe_reference_at
  );

  return (
    <section data-testid="dealer-sale-opportunity-detail">
      <Link
        href={`${basePath}/oportunidades/veiculos${backQuery}`}
        className="text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        ← Veículos para avaliação
      </Link>

      {/* Cabeçalho compacto: uma linha de título, uma de subtítulo. */}
      <header className="mb-4 mt-2">
        <h1 className="text-[21px] font-bold leading-tight tracking-[-0.01em] text-[#161f34] sm:text-[25px]">
          Avaliação de veículo para compra
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#667085]">
          Analise as informações declaradas e envie sua proposta preliminar.
        </p>
      </header>

      {/*
        ────────────────────────────────────────────────────────────────────────
        A ORDEM NO CELULAR NÃO É A ORDEM NO DESKTOP
        ────────────────────────────────────────────────────────────────────────
        No desktop a ficha e o painel são colunas paralelas, e o lojista escolhe
        para onde olhar. No celular tudo vira uma pilha, e a pilha natural do DOM
        colocava o painel DEPOIS da ficha inteira — vinte e poucas linhas de
        declaração antes de qualquer chance de propor.

        Por isso a ordem no mobile é explícita: veículo, resumo, PROPOSTA, ficha,
        observações. Quem já decidiu propõe sem atravessar a página; quem quer
        conferir a ficha rola e ela está logo abaixo.

        O painel NÃO é sticky: numa janela de 800px ele cobriria a ficha, que é
        exatamente o que o lojista veio ler.
      */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_366px] lg:items-start lg:gap-5">
        {/* 1 — VEÍCULO + GALERIA, no mesmo cartão */}
        <section className="order-1 overflow-hidden rounded-2xl border border-[#E5E9F2] bg-white p-3.5 sm:p-4 lg:col-start-1 lg:row-start-1">
          <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h2 className="text-[19px] font-bold leading-tight text-[#161f34] sm:text-[21px]">
              {describeVehicle(opportunity)}
            </h2>
            {/*
              "Particular" é um FATO deste produto, não um rótulo decorativo:
              todo veículo aqui vem de pessoa física. É o que diferencia esta
              tela do estoque de lojista.
            */}
            <span className="inline-flex items-center rounded-md bg-[#F4F3FF] px-2 py-1 text-[11px] font-bold leading-none text-[#5925DC]">
              Particular
            </span>
          </div>

          <p className="mb-1 text-[13px] leading-snug text-[#667085]">
            {opportunity.fipe_model_description}
          </p>

          <p className="mb-3.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-[#98A2B3]">
            <span className="inline-flex items-center gap-1 font-medium text-[#475467]">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
              {formatCity(opportunity.city)}
            </span>
            <span aria-hidden="true">·</span>
            <span>Recebendo propostas</span>
            <span aria-hidden="true">·</span>
            <span>publicado {formatPublishedAt(opportunity.created_at)}</span>
          </p>

          <Gallery images={opportunity.images} alt={`Foto de ${describeVehicle(opportunity)}`} />
        </section>

        {/*
          2 — RESUMO, um cartão só.
          A versão anterior gerava seis linhas empilhadas dentro de um card de
          ficha. Aqui é uma grade de ícone+rótulo+valor, que se lê em varredura
          horizontal em vez de leitura linha a linha.
        */}
        <section className="order-2 rounded-2xl border border-[#E5E9F2] bg-white p-4 lg:col-start-1 lg:row-start-2">
          <h2 className="mb-3 text-[13px] font-bold text-[#161f34]">Resumo do veículo</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3">
            <SummaryItem label="Ano" value={String(opportunity.year)} icon={ICON.calendar} />
            <SummaryItem
              label="Quilometragem"
              value={formatMileage(opportunity.mileage)}
              icon={ICON.gauge}
            />
            <SummaryItem
              label="Câmbio"
              value={TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission}
              icon={ICON.gear}
            />
            <SummaryItem
              label="Combustível"
              value={FUEL_LABEL[opportunity.fuel_type] || opportunity.fuel_type}
              icon={ICON.fuel}
            />
            <SummaryItem
              label="Estado geral"
              value={
                DECLARED_CONDITION_LABEL[opportunity.declared_condition] ||
                opportunity.declared_condition
              }
              icon={ICON.star}
            />
            <SummaryItem
              label="Pneus"
              value={readTireCondition(opportunity.evaluation.tire_condition) || NOT_INFORMED}
              icon={ICON.tire}
            />
          </div>

          {/*
            "Referência FIPE" fecha o resumo, separada por uma linha e em tom
            secundário. É âncora de mercado, NUNCA "valor do veículo": a
            solicitação não tem preço pedido, e confundir os dois faria o lojista
            propor contra um número que ninguém pediu.
          */}
          <p className="mt-3.5 border-t border-[#F2F4F7] pt-3 text-[12.5px] text-[#667085]">
            Referência FIPE{" "}
            <span className="font-semibold text-[#1D2440]">{fipe || NOT_INFORMED}</span>
          </p>
        </section>

        {/* 3 — PROPOSTA (no mobile vem AQUI, antes da ficha) */}
        <div className="order-3 min-w-0 lg:col-start-2 lg:row-start-1">
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
            onSubmitted={applyOfferState}
          />
        </div>

        {/* 4 — FICHA DECLARADA */}
        <div className="order-4 min-w-0 lg:col-start-1 lg:row-start-3">
          <h2 className="mb-2.5 text-[13px] font-bold text-[#161f34]">
            Situação declarada pelo proprietário
          </h2>
          <VehicleEvaluationSheet
            evaluation={opportunity.evaluation}
            declaredConditionLabel={
              DECLARED_CONDITION_LABEL[opportunity.declared_condition] ||
              opportunity.declared_condition
            }
            /*
              "Conservação" só AQUI. O cartão "Resumo do veículo" logo acima já
              traz um dado rotulado "Estado geral", e repetir esse texto como
              título de seção faria o leitor procurar a diferença entre os dois.
              A tela do dono não tem esse resumo e mantém o título original.
            */
            conditionSectionTitle="Conservação"
          />
        </div>

        {/* 5 — OBSERVAÇÕES */}
        {opportunity.known_issues ? (
          <section className="order-5 rounded-2xl border border-[#E5E9F2] bg-white p-4 lg:col-start-1 lg:row-start-4">
            <h2 className="text-[13px] font-bold text-[#161f34]">Problemas informados</h2>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[#475467]">
              {opportunity.known_issues}
            </p>
          </section>
        ) : null}
      </div>
    </section>
  );
}
