"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DealerOfferPanel from "@/components/account/DealerOfferPanel";
import VehicleEvaluationSheet, {
  Card,
  DataRow,
} from "@/components/account/VehicleEvaluationSheet";
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

/** Galeria simples: capa grande + miniaturas clicáveis. Sem biblioteca. */
function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div
        className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-dashed border-[#D6DEEB] bg-[#F9FBFF] text-[#C3CDDE]"
        data-testid="dealer-detail-no-photos"
      >
        <span className="text-[13px] font-semibold">Sem fotos</span>
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];

  return (
    <div data-testid="dealer-detail-gallery">
      <div className="relative overflow-hidden rounded-2xl border border-[#E5E9F2] bg-[#F9FBFF]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current} alt={alt} className="aspect-[4/3] w-full object-cover" />
        <span className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
          {Math.min(active, images.length - 1) + 1}/{images.length}
        </span>
      </div>

      {images.length > 1 ? (
        <ul className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((url, index) => (
            <li key={url}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Ver foto ${index + 1}`}
                aria-current={index === active}
                className={`block w-full overflow-hidden rounded-lg border transition ${
                  index === active
                    ? "border-[#0e62d8] ring-1 ring-[#0e62d8]"
                    : "border-[#E5E9F2] hover:border-[#cfe0fb]"
                }`}
                data-testid="dealer-detail-thumb"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
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

      <header className="mb-5 mt-3">
        <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">
          Avaliação de veículo para compra
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748b]">
          Analise as informações declaradas e envie sua proposta preliminar.
        </p>
      </header>

      {/*
        Uma coluna no mobile; duas a partir de `lg`, com o painel de proposta na
        direita. O painel NÃO é sticky: numa tela de 800px de altura ele cobriria
        a ficha, que é justamente o que o lojista veio ler.
      */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Gallery images={opportunity.images} alt={`Foto de ${describeVehicle(opportunity)}`} />

          <div className="mt-5">
            <h2 className="text-[18px] font-bold text-[#161f34]">
              {describeVehicle(opportunity)}
            </h2>
            <p className="mt-0.5 text-[13px] text-[#64748b]">
              {opportunity.fipe_model_description}
            </p>
            <p className="mt-1 text-[12px] text-[#98A2B3]">
              {formatCity(opportunity.city)}
              <span className="mx-1">·</span>
              Recebendo propostas
              <span className="mx-1">·</span>
              publicado {formatPublishedAt(opportunity.created_at)}
            </p>
          </div>

          <div className="mt-4">
            <VehicleEvaluationSheet
              evaluation={opportunity.evaluation}
              declaredConditionLabel={
                DECLARED_CONDITION_LABEL[opportunity.declared_condition] ||
                opportunity.declared_condition
              }
              leading={
                <Card title="Dados do veículo">
                  <DataRow label="Ano" value={String(opportunity.year)} />
                  <DataRow label="Quilometragem" value={formatMileage(opportunity.mileage)} />
                  <DataRow
                    label="Câmbio"
                    value={
                      TRANSMISSION_LABEL[opportunity.transmission] || opportunity.transmission
                    }
                  />
                  <DataRow
                    label="Combustível"
                    value={FUEL_LABEL[opportunity.fuel_type] || opportunity.fuel_type}
                  />
                  <DataRow label="Cidade" value={formatCity(opportunity.city)} />
                  {/*
                    "Referência FIPE", com a data do snapshot. NUNCA "Valor do
                    veículo": a solicitação não tem preço pedido, e confundir os
                    dois faria o lojista propor contra um número que ninguém
                    pediu.
                  */}
                  <DataRow label="Referência FIPE" value={fipe} />
                </Card>
              }
            />
          </div>

          {opportunity.known_issues ? (
            <section className="mt-4 rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <h2 className="text-[13px] font-bold text-[#161f34]">
                Observações do proprietário
              </h2>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[#475467]">
                {opportunity.known_issues}
              </p>
            </section>
          ) : null}
        </div>

        {/*
          No mobile o painel fica ABAIXO da galeria e da ficha (ordem do DOM), que
          é a sequência natural: olhar o carro, ler a ficha, propor.
        */}
        <div className="min-w-0">
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
      </div>
    </section>
  );
}
