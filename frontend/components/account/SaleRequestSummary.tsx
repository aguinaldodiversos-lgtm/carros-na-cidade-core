"use client";

import { PUBLISH_ACCURACY_NOTICE } from "@/lib/sale-requests/handoff";

import {
  SALE_REQUEST_PHOTOS,
  formatMoneyValue,
  moneyToDecimal,
  readBodyPaintStatus,
  readCautionReport,
  readIpvaStatus,
  readLicensingStatus,
  readMechanicalCondition,
  readTireCondition,
  readYesNoUnknown,
  DECLARED_CONDITION_OPTIONS,
} from "@/lib/sale-requests/api";
import {
  resolveCautionReportStatus,
  type SaleRequestFormState,
  type ValidationState,
} from "@/lib/sale-requests/evaluation";

/**
 * Resumo da ficha — a coluna direita.
 *
 * É uma LEITURA do estado do formulário, sem estado próprio e sem cache. Tudo
 * aqui é derivado a cada render a partir das mesmas duas entradas que o resto da
 * tela usa (`state` e `validation`), então é impossível o resumo discordar dos
 * campos: não existe um segundo lugar onde a verdade possa envelhecer.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NADA É INVENTADO
 * ────────────────────────────────────────────────────────────────────────────
 * Campo não respondido aparece como travessão. Nunca "Não", nunca "Bom", nunca
 * "Quitado". Um valor padrão aqui seria lido pelo dono como o que a loja vai
 * ver — e ele publicaria uma declaração que não fez.
 */

const EMPTY = "—";

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string | null;
  strong?: boolean;
}) {
  const filled = Boolean(value);
  return (
    <div className="flex items-baseline justify-between gap-3 py-[7px]">
      <dt className="text-[12px] leading-tight text-[#64748b]">{label}</dt>
      <dd
        className={`shrink-0 text-right text-[12px] leading-tight ${
          filled ? "font-semibold text-[#1D2440]" : "text-[#98A2B3]"
        } ${strong && filled ? "text-[13px]" : ""}`}
      >
        {value || EMPTY}
      </dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#F2F4F7] pt-3">
      <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#98A2B3]">
        {title}
      </h4>
      <dl>{children}</dl>
    </section>
  );
}

/** Ícone de carro/câmera do placeholder. SVG inline — sem biblioteca. */
function PhotoPlaceholder() {
  return (
    <div
      className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D6DEEB] bg-[#F9FBFF] text-[#98A2B3]"
      data-testid="sale-request-summary-placeholder"
    >
      <svg
        viewBox="0 0 40 40"
        className="h-8 w-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 14h4l2.4-3.4h15.2L30 14h4v12H6z" />
        <circle cx="20" cy="20" r="4.6" />
      </svg>
      <span className="text-[11px] font-semibold">Adicione fotos do veículo</span>
    </div>
  );
}

export default function SaleRequestSummary({
  state,
  validation,
  coverPhotoUrl,
  cityLabel,
  transmissionLabel,
  fuelLabel,
  submitting,
  attempted,
}: {
  state: SaleRequestFormState;
  validation: ValidationState;
  coverPhotoUrl: string | null;
  cityLabel: string | null;
  transmissionLabel: string | null;
  fuelLabel: string | null;
  submitting: boolean;
  /** Já houve tentativa de envio? Muda o tom do cartão de status. */
  attempted: boolean;
}) {
  const vehicleTitle = [state.brandName, state.modelName].filter(Boolean).join(" ").trim();

  const specLine = [state.year, fuelLabel, transmissionLabel].filter(Boolean).join(" · ");

  const conditionLabel =
    DECLARED_CONDITION_OPTIONS.find((item) => item.value === state.condition)?.label ?? null;

  const mileageLabel = (() => {
    const digits = String(state.mileage).replace(/\D/g, "");
    if (digits === "") return null;
    return `${Number(digits).toLocaleString("pt-BR")} km`;
  })();

  // O saldo só aparece quando a resposta que o justifica foi dada — a mesma
  // regra do payload, para que o resumo mostre exatamente o que será enviado.
  const financingLabel = (() => {
    const base = readYesNoUnknown(state.financingStatus || null);
    if (!base) return null;
    if (state.financingStatus !== "yes") return base;
    const amount = formatMoneyValue(moneyToDecimal(state.financingBalance));
    return amount ? `${base} (${amount})` : base;
  })();

  const finesLabel = (() => {
    const base = readYesNoUnknown(state.finesStatus || null);
    if (!base) return null;
    if (state.finesStatus !== "yes") return base;
    const amount = formatMoneyValue(moneyToDecimal(state.finesAmount));
    return amount ? `${base} (${amount})` : base;
  })();

  const ipvaLabel = (() => {
    const base = readIpvaStatus(state.ipvaStatus || null);
    if (!base) return null;
    if (state.ipvaStatus !== "installments" && state.ipvaStatus !== "open") return base;
    const amount = formatMoneyValue(moneyToDecimal(state.ipvaAmountDue));
    return amount ? `${base} (${amount})` : base;
  })();

  const cautionLabel = readCautionReport(
    resolveCautionReportStatus(state.cautionReportHas, state.cautionReportResult)
  );

  const bodyPaintLabel = (() => {
    const base = readBodyPaintStatus(state.bodyPaintStatus || null);
    if (!base) return null;
    if (state.bodyPaintStatus !== "issues") return base;
    const count = state.bodyPaintIssues.length;
    return count > 0 ? `${base} (${count})` : base;
  })();

  return (
    <aside
      className="lg:sticky lg:top-6"
      aria-label="Resumo da ficha do veículo"
      data-testid="sale-request-summary"
    >
      <div className="rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <h3 className="mb-3 text-[13px] font-bold text-[#161f34]">Resumo do veículo</h3>

        {coverPhotoUrl ? (
          // `img` e não `next/image`: a URL vem do R2 em runtime, e o otimizador
          // do Next exigiria o host configurado no build.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverPhotoUrl}
            alt="Primeira foto enviada do veículo"
            className="aspect-[4/3] w-full rounded-xl border border-[#E5E9F2] object-cover"
            data-testid="sale-request-summary-photo"
          />
        ) : (
          <PhotoPlaceholder />
        )}

        <p
          className="mt-3 text-[14px] font-bold leading-tight text-[#161f34]"
          data-testid="sale-request-summary-title"
        >
          {vehicleTitle || "Veículo a definir"}
        </p>
        <p className="mt-0.5 text-[12px] text-[#64748b]">{specLine || EMPTY}</p>
        <p className="mt-0.5 text-[12px] text-[#64748b]">{cityLabel || EMPTY}</p>

        <dl className="mt-3 border-t border-[#F2F4F7] pt-1">
          <Row label="Quilometragem" value={mileageLabel} strong />
          <Row label="Estado geral" value={conditionLabel} />
          <Row label="Pneus" value={readTireCondition(state.tireCondition || null)} />
        </dl>

        <div className="mt-3 grid gap-3">
          <Group title="Pendências e documentação">
            <Row label="Financiamento" value={financingLabel} />
            <Row label="Multas pendentes" value={finesLabel} />
            <Row label="IPVA" value={ipvaLabel} />
            <Row label="Licenciamento" value={readLicensingStatus(state.licensingStatus || null)} />
          </Group>

          <Group title="Histórico">
            <Row label="Laudo cautelar" value={cautionLabel} />
            <Row label="Passagem por leilão" value={readYesNoUnknown(state.auctionHistory || null)} />
            <Row
              label="Colisão / sinistro"
              value={readYesNoUnknown(state.collisionHistory || null)}
            />
          </Group>

          <Group title="Mecânica">
            <Row label="Motor" value={readMechanicalCondition(state.engineCondition || null)} />
            <Row label="Câmbio" value={readMechanicalCondition(state.gearboxCondition || null)} />
            <Row
              label="Suspensão"
              value={readMechanicalCondition(state.suspensionCondition || null)}
            />
          </Group>

          <Group title="Lataria e fotos">
            <Row label="Lataria e pintura" value={bodyPaintLabel} />
            <Row
              label="Fotos"
              value={
                state.photoCount > 0
                  ? `${state.photoCount} de ${SALE_REQUEST_PHOTOS.MAX}`
                  : null
              }
            />
          </Group>
        </div>
      </div>

      {/* ── Status + CTA ─────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {validation.isComplete ? (
          <p
            className="flex items-start gap-2 rounded-xl border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2.5 text-[12px] font-semibold text-[#027A48]"
            data-testid="sale-request-ready"
          >
            <span aria-hidden="true">✓</span>
            <span>
              Pronto para análise
              <span className="mt-0.5 block font-normal text-[#067647]">
                A ficha está completa.
              </span>
            </span>
          </p>
        ) : (
          <p
            className={`rounded-xl border px-3 py-2.5 text-[12px] ${
              attempted
                ? "border-[#FDA29B] bg-[#FEF3F2] font-semibold text-[#b42318]"
                : "border-[#E5E9F2] bg-[#F9FBFF] text-[#475467]"
            }`}
            data-testid="sale-request-not-ready"
          >
            {attempted
              ? `Faltam ${validation.missing.length} ${
                  validation.missing.length === 1 ? "resposta" : "respostas"
                } para enviar.`
              : "Complete as informações ao lado para continuar."}
          </p>
        )}

        <button
          type="submit"
          // ────────────────────────────────────────────────────────────────
          // NUNCA DESABILITADO POR CAMPO FALTANTE
          // ────────────────────────────────────────────────────────────────
          // Só `submitting` desabilita, e isso é um estado OPERACIONAL: a
          // requisição está em voo e um segundo clique criaria uma solicitação
          // duplicada.
          //
          // Faltar resposta NÃO desabilita. O clique com a ficha incompleta é
          // justamente o momento em que a pessoa PEDE para saber o que falta —
          // e um botão cinza responde a esse pedido com silêncio. Era o defeito
          // que motivou esta remodelação.
          disabled={submitting}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0e62d8] px-4 text-[14px] font-bold text-white shadow-[0_6px_18px_rgba(14,98,216,0.24)] transition hover:bg-[#0b53b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e62d8] disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="sale-request-submit"
        >
          {submitting ? null : (
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17.5 2.5L9 11" />
              <path d="M17.5 2.5l-5.4 15-3-6.5-6.6-3z" />
            </svg>
          )}
          {submitting ? "Enviando…" : "Enviar meu carro para as lojas"}
        </button>

        {/*
          §7 — a responsabilidade de DECLARAR CORRETAMENTE, dita antes de publicar.
          ─────────────────────────────────────────────────────────────────────
          Não é um termo de aceite e não vira formulário técnico: a pessoa
          declara o que conhece do próprio carro. O que este texto adiciona é a
          CONSEQUÊNCIA — uma divergência relevante na avaliação presencial pode
          fazer a loja revisar ou retirar a oferta.

          Fica junto do botão porque é aqui que a decisão acontece. No topo do
          formulário, vinte campos antes, ninguém lembraria dele.
        */}
        <p
          className="mt-3 text-[11.5px] leading-relaxed text-[#667085]"
          data-testid="sale-request-accuracy-notice"
        >
          {PUBLISH_ACCURACY_NOTICE}
        </p>
      </div>

      {/* ── Progresso e checklist ────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-[#E5E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-bold text-[#161f34]">Progresso da ficha</h3>
          <span className="text-[12px] font-bold text-[#0e62d8]">{validation.progress}%</span>
        </div>

        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#EEF2F7]"
          role="progressbar"
          aria-valuenow={validation.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso da ficha"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              validation.isComplete ? "bg-[#12B76A]" : "bg-[#0e62d8]"
            }`}
            style={{ width: `${validation.progress}%` }}
          />
        </div>

        <ul className="mt-3 grid gap-1.5" data-testid="sale-request-checklist">
          {validation.sections.map((section) => (
            <li
              key={section.key}
              className="flex items-center gap-2 text-[12px]"
              data-testid={`checklist-${section.key}`}
              data-complete={section.complete ? "true" : "false"}
            >
              {/*
                O símbolo carrega o estado junto da cor: "✓" quando concluída e
                "•" quando não. Só mudar o verde para o cinza deixaria a lista
                ilegível para quem não distingue as duas.
              */}
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  section.complete
                    ? "bg-[#ECFDF3] text-[#027A48]"
                    : "bg-[#F2F4F7] text-[#98A2B3]"
                }`}
              >
                {section.complete ? "✓" : "•"}
              </span>
              <span className={section.complete ? "text-[#1D2440]" : "text-[#64748b]"}>
                {section.label}
              </span>
              <span className="sr-only">
                {section.complete ? "concluída" : "ainda não respondida"}
              </span>
            </li>
          ))}

          <li className="flex items-center gap-2 text-[12px] text-[#98A2B3]">
            <span
              aria-hidden="true"
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#F2F4F7] text-[10px] font-bold"
            >
              ○
            </span>
            <span>Observações adicionais</span>
            <span className="rounded-full bg-[#F2F4F7] px-1.5 text-[10px] font-semibold text-[#475467]">
              Opcional
            </span>
          </li>
        </ul>
      </div>
    </aside>
  );
}
