"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/**
 * Uma linha de dado.
 *
 * `value` nulo vira "Não informado" em cinza claro — visualmente distinto de um
 * valor real, para que a ausência não se pareça com resposta.
 */
function DataRow({ label, value }: { label: string; value: string | null }) {
  const filled = Boolean(value);
  return (
    <div className="flex flex-col gap-0.5 border-b border-[#F2F4F7] py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-[13px] text-[#64748b]">{label}</dt>
      <dd
        className={`text-[13px] sm:text-right ${
          filled ? "font-semibold text-[#1D2440]" : "text-[#98A2B3]"
        }`}
      >
        {value || NOT_INFORMED}
      </dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <h2 className="mb-1 text-[13px] font-bold text-[#161f34]">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

/** Condição mecânica + a descrição do problema, quando existe. */
function MechanicalRow({
  label,
  condition,
  notes,
}: {
  label: string;
  condition: Parameters<typeof readMechanicalCondition>[0];
  notes: string | null;
}) {
  return (
    <>
      <DataRow label={label} value={readMechanicalCondition(condition)} />
      {notes ? (
        <p className="-mt-1 mb-2 whitespace-pre-line rounded-xl bg-[#F9FBFF] px-3 py-2 text-[12px] leading-relaxed text-[#475467]">
          {notes}
        </p>
      ) : null}
    </>
  );
}

/** Valor com um complemento monetário entre parênteses, quando houver. */
function withAmount(base: string | null, amount: string | null): string | null {
  if (!base) return null;
  const money = formatMoneyValue(amount);
  return money ? `${base} (${money})` : base;
}

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
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card title="Dados do veículo">
          <DataRow label="Ano" value={String(request.year)} />
          <DataRow label="Quilometragem" value={formatMileage(request.mileage)} />
          <DataRow
            label="Câmbio"
            value={TRANSMISSION_LABEL[request.transmission] || request.transmission}
          />
          <DataRow label="Combustível" value={FUEL_LABEL[request.fuel_type] || request.fuel_type} />
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

        <Card title="Estado geral e pneus">
          <DataRow
            label="Estado geral"
            value={CONDITION_LABEL.get(request.declared_condition) || request.declared_condition}
          />
          <DataRow label="Pneus" value={readTireCondition(request.tire_condition)} />
        </Card>

        <Card title="Pendências e documentação">
          <DataRow
            label="Financiamento ativo"
            value={withAmount(
              readYesNoUnknown(request.financing_status),
              request.financing_balance
            )}
          />
          <DataRow
            label="Multas pendentes"
            value={withAmount(readYesNoUnknown(request.fines_status), request.fines_amount)}
          />
          <DataRow
            label="IPVA"
            value={withAmount(readIpvaStatus(request.ipva_status), request.ipva_amount_due)}
          />
          <DataRow label="Licenciamento" value={readLicensingStatus(request.licensing_status)} />
        </Card>

        <Card title="Histórico do veículo">
          <DataRow label="Laudo cautelar" value={readCautionReport(request.caution_report_status)} />
          <DataRow
            label="Passagem por leilão"
            value={readYesNoUnknown(request.auction_history)}
          />
          <DataRow
            label="Colisão ou sinistro conhecido"
            value={readYesNoUnknown(request.collision_history)}
          />
        </Card>

        <Card title="Mecânica">
          <MechanicalRow
            label="Motor"
            condition={request.engine_condition}
            notes={request.engine_notes}
          />
          <MechanicalRow
            label="Câmbio"
            condition={request.gearbox_condition}
            notes={request.gearbox_notes}
          />
          <MechanicalRow
            label="Suspensão"
            condition={request.suspension_condition}
            notes={request.suspension_notes}
          />
        </Card>

        <Card title="Lataria e pintura">
          <DataRow label="Situação" value={readBodyPaintStatus(request.body_paint_status)} />
          {/*
            A linha de detalhes só existe quando o estado declarado é "possui
            detalhes". Mostrá-la vazia para quem respondeu "nenhum detalhe"
            sugeriria uma pergunta sem resposta onde a resposta foi dada.
          */}
          {request.body_paint_status === "issues" ? (
            <DataRow label="Detalhes" value={bodyPaintIssuesLabel} />
          ) : null}
          {request.body_paint_notes ? (
            <DataRow label="Onde" value={request.body_paint_notes} />
          ) : null}
        </Card>
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
