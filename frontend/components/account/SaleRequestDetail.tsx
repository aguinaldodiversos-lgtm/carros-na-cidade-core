"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import VehicleEvaluationSheet, {
  Card,
  DataRow,
} from "@/components/account/VehicleEvaluationSheet";
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
} from "@/lib/sale-requests/api";

/**
 * Detalhe de UMA solicitação, para o dono.
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
 * Nada de "0 ofertas", "maior lance" ou "aguardando avaliação": essas entidades
 * chegam nas fases 4.3–4.5, e anunciá-las agora faria a pessoa esperar por algo
 * que o produto não entrega.
 *
 * O cancelamento continua sendo a ÚNICA ação. Publicou, não edita campo
 * economicamente relevante — quando os lances existirem, mudar a quilometragem
 * debaixo de uma oferta já feita seria alterar o objeto do negócio depois da
 * proposta.
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSaleRequest(id)
      .then((response) => {
        if (alive) setRequest(response.sale_request);
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
  }, [id]);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      const response = await cancelSaleRequest(id);
      setRequest(response.sale_request);
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
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
            open ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#F2F4F7] text-[#475467]"
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
      ) : (
        <p className="mt-6 text-sm text-[#64748b]" data-testid="sale-request-cancelled-note">
          Esta solicitação foi cancelada e permanece no seu histórico.
        </p>
      )}
    </div>
  );
}
