"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PurchaseIntentCityField, {
  type SelectedCity,
} from "@/components/account/PurchaseIntentCityField";
import SaleRequestPhotos from "@/components/account/SaleRequestPhotos";
import SaleRequestSectionCard from "@/components/account/SaleRequestSectionCard";
import SaleRequestChoiceGroup from "@/components/account/SaleRequestChoiceGroup";
import SaleRequestFinancialSection from "@/components/account/SaleRequestFinancialSection";
import SaleRequestHistorySection from "@/components/account/SaleRequestHistorySection";
import SaleRequestMechanicsSection from "@/components/account/SaleRequestMechanicsSection";
import SaleRequestBodyPaintSection from "@/components/account/SaleRequestBodyPaintSection";
import SaleRequestSummary from "@/components/account/SaleRequestSummary";
import {
  DECLARED_CONDITION_OPTIONS,
  ISSUES_GUIDANCE_NOTICE,
  SALE_REQUEST_ACTIVE_LIMIT,
  SALE_REQUEST_LIMITS,
  TIRE_CONDITION_OPTIONS,
  SaleRequestError,
  createSaleRequest,
  maxModelYear,
  type UploadedPhoto,
} from "@/lib/sale-requests/api";
import {
  EMPTY_ANSWERS,
  buildMissingMessage,
  buildValidationState,
  fieldDomId,
  toCreatePayload,
  type SaleRequestAnswers,
  type SaleRequestFormState,
} from "@/lib/sale-requests/evaluation";

/**
 * Ficha preliminar de avaliação — "Enviar meu carro para as lojas".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE FORMULÁRIO NÃO PEDE
 * ────────────────────────────────────────────────────────────────────────────
 * PLACA, RENAVAM, CPF, documento, telefone, endereço, banco e conta. Não existe
 * campo, não existe estado, não existe envio. O produto avalia o CARRO; a
 * auditoria da Fase 4.0 mostrou que nenhum desses dados é coletado hoje em lugar
 * nenhum do sistema, e o primeiro a ser coletado seria também o primeiro sem
 * nenhuma infraestrutura de mascaramento para sustentá-lo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A CADEIA FIPE (preservada da 4.1)
 * ────────────────────────────────────────────────────────────────────────────
 * Marca → modelo → ano, cada passo alimentado pelo anterior. O que vai para o
 * servidor são os CÓDIGOS; o valor de mercado é cotado LÁ. O cliente nunca manda
 * um valor FIPE pronto — se mandasse, um vendedor poderia publicar uma
 * referência fabricada com aparência de número oficial.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O ESTADO É MÍNIMO; O RESTO É DERIVADO
 * ────────────────────────────────────────────────────────────────────────────
 * Existem `answers` (o que a pessoa respondeu), a cadeia FIPE, a cidade e as
 * fotos. Progresso, seções completas, lista de faltantes, mensagem de erro e o
 * veredito de completude NÃO são estado: saem de `buildValidationState` a cada
 * render. Guardá-los criaria uma segunda verdade, e a segunda verdade é a que
 * fica velha.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O CTA NÃO FICA CINZA POR CAMPO FALTANTE
 * ────────────────────────────────────────────────────────────────────────────
 * Ver o comentário no botão, em `SaleRequestSummary`. Aqui fica a outra metade:
 * o clique com a ficha incompleta NÃO chama a API, marca `attempted`, e leva o
 * foco ao primeiro requisito pendente.
 */

const FIELD_CLASS =
  "h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-[#1D2440] outline-none transition focus:border-[#1F66E5] disabled:bg-[#f6f7f9] disabled:text-[#94a3b8]";
const LABEL_CLASS = "mb-2 block text-[13px] font-semibold text-[#33405A]";

type FipeOption = { code: string; name: string };

async function fetchFipe(path: string): Promise<FipeOption[]> {
  const response = await fetch(path, { cache: "no-store" });
  const json = (await response.json().catch(() => null)) as { data?: unknown } | null;
  if (!response.ok || !Array.isArray(json?.data)) return [];
  return json.data.filter(
    (item): item is FipeOption =>
      Boolean(item) &&
      typeof (item as FipeOption).code === "string" &&
      typeof (item as FipeOption).name === "string"
  );
}

/**
 * `yearCode` da FIPE ("2020-1") → ano civil.
 *
 * O sufixo é o combustível, não parte do ano. Enviar a string inteira como
 * `year` faria a validação de 4 dígitos recusar um valor perfeitamente correto.
 */
function yearFromFipeCode(code: string): string {
  const match = /^(\d{4})/.exec(String(code || "").trim());
  return match ? match[1] : "";
}

const TRANSMISSIONS = [
  { value: "automatico", label: "Automático" },
  { value: "manual", label: "Manual" },
  { value: "cvt", label: "CVT" },
];

const FUEL_TYPES = [
  { value: "flex", label: "Flex" },
  { value: "gasolina", label: "Gasolina" },
  { value: "etanol", label: "Etanol" },
  { value: "diesel", label: "Diesel" },
  { value: "hibrido", label: "Híbrido" },
  { value: "eletrico", label: "Elétrico" },
];

/**
 * Leva o foco ao primeiro requisito pendente.
 *
 * `preventScroll` no foco e `scrollIntoView` depois, nesta ordem: o scroll
 * automático do foco é instantâneo e para com o campo colado no topo da
 * viewport, muitas vezes atrás do cabeçalho. Fazendo o scroll em separado, o
 * campo fica CENTRALIZADO e a pessoa vê a pergunta e o contexto ao redor.
 *
 * Quando o alvo é um contêiner (a cidade, que é um componente com estado
 * próprio), o foco vai para o primeiro controle interno — não para a `div`.
 */
function focusField(field: string) {
  if (typeof document === "undefined") return;

  const target = document.getElementById(fieldDomId(field));
  if (!target) return;

  const focusable = target.matches("input, select, textarea, button")
    ? target
    : target.querySelector<HTMLElement>("input, select, textarea, button");

  (focusable ?? target).focus({ preventScroll: true });
  target.scrollIntoView({ behavior: "smooth", block: "center" });
}

export default function SaleRequestForm({ basePath = "/dashboard" }: { basePath?: string }) {
  const router = useRouter();

  // ── Cadeia FIPE ───────────────────────────────────────────────────────────
  const [brands, setBrands] = useState<FipeOption[]>([]);
  const [brandCode, setBrandCode] = useState("");
  const [models, setModels] = useState<FipeOption[]>([]);
  const [modelCode, setModelCode] = useState("");
  const [years, setYears] = useState<FipeOption[]>([]);
  const [yearCode, setYearCode] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);

  // ── Respostas, cidade e fotos ─────────────────────────────────────────────
  const [answers, setAnswers] = useState<SaleRequestAnswers>(EMPTY_ANSWERS);
  const [city, setCity] = useState<SelectedCity | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);

  // ── Envio ─────────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update(patch: Partial<SaleRequestFormState>) {
    setAnswers((current) => ({ ...current, ...patch }) as SaleRequestAnswers);
  }

  useEffect(() => {
    let alive = true;
    void fetchFipe("/api/fipe/brands?vehicleType=carros").then((rows) => {
      if (alive) setBrands(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Trocar a marca invalida modelo E ano: manter o ano de outro modelo enviaria
  // um par de códigos que não descreve carro nenhum.
  useEffect(() => {
    setModels([]);
    setModelCode("");
    setYears([]);
    setYearCode("");
    if (!brandCode) return;

    let alive = true;
    setLoadingModels(true);
    void fetchFipe(`/api/fipe/models/${encodeURIComponent(brandCode)}?vehicleType=carros`)
      .then((rows) => {
        if (alive) setModels(rows);
      })
      .finally(() => {
        if (alive) setLoadingModels(false);
      });

    return () => {
      alive = false;
    };
  }, [brandCode]);

  useEffect(() => {
    setYears([]);
    setYearCode("");
    if (!brandCode || !modelCode) return;

    let alive = true;
    setLoadingYears(true);
    void fetchFipe(
      `/api/fipe/years/${encodeURIComponent(brandCode)}/${encodeURIComponent(modelCode)}?vehicleType=carros`
    )
      .then((rows) => {
        if (alive) setYears(rows);
      })
      .finally(() => {
        if (alive) setLoadingYears(false);
      });

    return () => {
      alive = false;
    };
  }, [brandCode, modelCode]);

  const brandName = useMemo(
    () => brands.find((item) => item.code === brandCode)?.name ?? "",
    [brands, brandCode]
  );
  const modelName = useMemo(
    () => models.find((item) => item.code === modelCode)?.name ?? "",
    [models, modelCode]
  );
  const year = yearFromFipeCode(yearCode);

  /**
   * O estado COMPLETO da ficha: respostas + o que é derivado de outra fonte.
   *
   * A cidade entra como `cityId` e só existe quando veio da LISTA. É a correção
   * do defeito que motivou esta tela: o campo de cidade continua exibindo o
   * texto digitado mesmo sem nenhuma cidade escolhida, então "tem texto" nunca
   * pode ser confundido com "tem cidade".
   */
  const state: SaleRequestFormState = useMemo(
    () => ({
      ...answers,
      brandName,
      modelName,
      year,
      cityId: city?.id ?? null,
      photoCount: photos.length,
    }),
    [answers, brandName, modelName, year, city, photos.length]
  );

  const validation = useMemo(() => buildValidationState(state), [state]);

  /**
   * Mensagem de um campo — só DEPOIS da primeira tentativa de envio.
   *
   * Antes disso todo campo está pendente, e pintar de vermelho um formulário
   * recém-aberto seria acusar a pessoa de não ter feito o que ela ainda nem
   * começou. Depois da tentativa, o erro fica vivo e some sozinho quando o campo
   * é respondido — porque a mensagem é derivada do estado, não guardada.
   */
  function errorFor(field: string): string | null {
    if (!attempted) return null;
    return validation.missing.find((item) => item.field === field)?.message ?? null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setAttempted(true);

    if (!validation.isComplete) {
      // NÃO chama a API. A pessoa acabou de pedir para saber o que falta —
      // responder com uma requisição e um 400 seria dar a resposta pela pior
      // via possível.
      setFormError(buildMissingMessage(validation.missing));
      focusField(validation.missing[0].field);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const { sale_request: created } = await createSaleRequest(
        toCreatePayload(state, {
          photoKeys: photos.map((photo) => photo.storage_key),
          fipeBrandCode: brandCode,
          fipeModelCode: modelCode,
          fipeYearCode: yearCode,
        })
      );

      router.push(`${basePath}/vender-para-lojas/${created.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof SaleRequestError && error.code === "SALE_REQUEST_ACTIVE_LIMIT_REACHED") {
        setFormError(
          `Você já tem ${SALE_REQUEST_ACTIVE_LIMIT} solicitações recebendo ofertas. Cancele uma para publicar outra.`
        );
      } else {
        setFormError(
          error instanceof Error ? error.message : "Não foi possível publicar a solicitação."
        );
      }
      setSubmitting(false);
    }
  }

  const transmissionLabel =
    TRANSMISSIONS.find((item) => item.value === answers.transmission)?.label ?? null;
  const fuelLabel = FUEL_TYPES.find((item) => item.value === answers.fuelType)?.label ?? null;
  const cityLabel = city ? `${city.name}${city.state ? ` - ${city.state}` : ""}` : null;

  return (
    <form onSubmit={handleSubmit} data-testid="sale-request-form" noValidate>
      {/* ── Cabeçalho da ficha ───────────────────────────────────────────── */}
      <header className="mb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">
              Enviar meu carro para as lojas
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#64748b]">
              Preencha a ficha do veículo para que os lojistas façam uma avaliação inicial.
            </p>
          </div>

          <div className="shrink-0 sm:w-56">
            <p
              className="text-right text-[12px] font-semibold text-[#475467]"
              data-testid="sale-request-progress-label"
            >
              {validation.completedSections} de {validation.totalSections} etapas essenciais
            </p>
            <div
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#EEF2F7]"
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
          </div>
        </div>
      </header>

      {/*
        `minmax(0, 1fr)` na coluna principal, e não `1fr`: uma trilha `1fr` tem
        largura mínima automática, então um filho largo (uma galeria, um select
        com texto comprido) EMPURRA a grade e produz scroll horizontal na página
        inteira. Com `minmax(0, ...)` a coluna pode encolher e o conteúdo largo
        rola dentro do próprio bloco.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start xl:grid-cols-[minmax(0,1fr)_348px]">
        <div className="grid min-w-0 gap-4">
          {/* ── 1. Dados do veículo ─────────────────────────────────────── */}
          <SaleRequestSectionCard
            index={1}
            title="Dados do veículo"
            icon="car"
            anchorId="section-vehicle"
            complete={validation.sections[0].complete}
            showStatus={attempted}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="block min-w-0">
                <span className={LABEL_CLASS}>Marca</span>
                <select
                  id={fieldDomId("brand")}
                  className={`${FIELD_CLASS} ${errorFor("brand") ? "border-[#FDA29B]" : "border-[#E5E9F2]"}`}
                  value={brandCode}
                  onChange={(event) => setBrandCode(event.target.value)}
                  aria-invalid={Boolean(errorFor("brand")) || undefined}
                  data-testid="sale-request-brand"
                >
                  <option value="">Escolha a marca</option>
                  {brands.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {errorFor("brand") ? (
                  <span role="alert" className="mt-1 block text-xs font-medium text-[#b42318]">
                    {errorFor("brand")}
                  </span>
                ) : null}
              </label>

              <label className="block min-w-0">
                <span className={LABEL_CLASS}>Modelo e versão</span>
                <select
                  id={fieldDomId("model")}
                  className={`${FIELD_CLASS} ${errorFor("model") ? "border-[#FDA29B]" : "border-[#E5E9F2]"}`}
                  value={modelCode}
                  onChange={(event) => setModelCode(event.target.value)}
                  disabled={!brandCode || loadingModels}
                  aria-invalid={Boolean(errorFor("model")) || undefined}
                  data-testid="sale-request-model"
                >
                  <option value="">
                    {loadingModels
                      ? "Carregando modelos…"
                      : brandCode
                        ? "Escolha o modelo"
                        : "Escolha a marca primeiro"}
                  </option>
                  {models.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {errorFor("model") ? (
                  <span role="alert" className="mt-1 block text-xs font-medium text-[#b42318]">
                    {errorFor("model")}
                  </span>
                ) : null}
              </label>

              <label className="block min-w-0">
                <span className={LABEL_CLASS}>Ano</span>
                <select
                  id={fieldDomId("year")}
                  className={`${FIELD_CLASS} ${errorFor("year") ? "border-[#FDA29B]" : "border-[#E5E9F2]"}`}
                  value={yearCode}
                  onChange={(event) => setYearCode(event.target.value)}
                  disabled={!modelCode || loadingYears}
                  aria-invalid={Boolean(errorFor("year")) || undefined}
                  data-testid="sale-request-year"
                >
                  <option value="">
                    {loadingYears
                      ? "Carregando anos…"
                      : modelCode
                        ? "Escolha o ano"
                        : "Escolha o modelo primeiro"}
                  </option>
                  {years
                    .filter((item) => {
                      const parsed = Number(yearFromFipeCode(item.code));
                      return (
                        Number.isFinite(parsed) &&
                        parsed >= SALE_REQUEST_LIMITS.YEAR_MIN &&
                        parsed <= maxModelYear()
                      );
                    })
                    .map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                </select>
                {errorFor("year") ? (
                  <span role="alert" className="mt-1 block text-xs font-medium text-[#b42318]">
                    {errorFor("year")}
                  </span>
                ) : null}
              </label>

              <label className="block min-w-0">
                <span className={LABEL_CLASS}>Quilometragem</span>
                <div className="relative">
                  <input
                    id={fieldDomId("mileage")}
                    className={`${FIELD_CLASS} pr-11 ${errorFor("mileage") ? "border-[#FDA29B]" : "border-[#E5E9F2]"}`}
                    // Exibe com separador de milhar; o estado guarda só dígitos.
                    value={
                      answers.mileage === ""
                        ? ""
                        : Number(answers.mileage).toLocaleString("pt-BR")
                    }
                    onChange={(event) =>
                      update({ mileage: event.target.value.replace(/\D/g, "").slice(0, 7) })
                    }
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="85.000"
                    aria-invalid={Boolean(errorFor("mileage")) || undefined}
                    data-testid="sale-request-mileage"
                  />
                  <span
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-[#98A2B3]"
                    aria-hidden="true"
                  >
                    km
                  </span>
                </div>
                {errorFor("mileage") ? (
                  <span role="alert" className="mt-1 block text-xs font-medium text-[#b42318]">
                    {errorFor("mileage")}
                  </span>
                ) : null}
              </label>

              <label className="block min-w-0">
                <span className={LABEL_CLASS}>Câmbio</span>
                <select
                  id={fieldDomId("transmission")}
                  className={`${FIELD_CLASS} ${errorFor("transmission") ? "border-[#FDA29B]" : "border-[#E5E9F2]"}`}
                  value={answers.transmission}
                  onChange={(event) => update({ transmission: event.target.value })}
                  aria-invalid={Boolean(errorFor("transmission")) || undefined}
                  data-testid="sale-request-transmission"
                >
                  <option value="">Escolha o câmbio</option>
                  {TRANSMISSIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {errorFor("transmission") ? (
                  <span role="alert" className="mt-1 block text-xs font-medium text-[#b42318]">
                    {errorFor("transmission")}
                  </span>
                ) : null}
              </label>

              <label className="block min-w-0">
                <span className={LABEL_CLASS}>Combustível</span>
                <select
                  id={fieldDomId("fuel_type")}
                  className={`${FIELD_CLASS} ${errorFor("fuel_type") ? "border-[#FDA29B]" : "border-[#E5E9F2]"}`}
                  value={answers.fuelType}
                  onChange={(event) => update({ fuelType: event.target.value })}
                  aria-invalid={Boolean(errorFor("fuel_type")) || undefined}
                  data-testid="sale-request-fuel"
                >
                  <option value="">Escolha o combustível</option>
                  {FUEL_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {errorFor("fuel_type") ? (
                  <span role="alert" className="mt-1 block text-xs font-medium text-[#b42318]">
                    {errorFor("fuel_type")}
                  </span>
                ) : null}
              </label>
            </div>

            {/*
              O contêiner leva o `id` do campo porque o componente de cidade tem
              estado próprio e não expõe o input. `focusField` desce até o
              primeiro controle interno.
            */}
            <div className="mt-4" id={fieldDomId("city")}>
              <PurchaseIntentCityField
                value={city}
                onChange={setCity}
                error={errorFor("city")}
                helpText="A cidade define quais lojas poderão avaliar o seu veículo."
              />
            </div>
          </SaleRequestSectionCard>

          {/* ── 2. Estado geral ─────────────────────────────────────────── */}
          <SaleRequestSectionCard
            index={2}
            title="Estado geral"
            icon="star"
            anchorId="section-condition"
            complete={validation.sections[1].complete}
            showStatus={attempted}
          >
            <SaleRequestChoiceGroup
              field="declared_condition"
              legend="Como você descreve o estado do veículo?"
              options={DECLARED_CONDITION_OPTIONS}
              value={answers.condition}
              onChange={(value) => update({ condition: value })}
              layout="cards"
              error={errorFor("declared_condition")}
            />
          </SaleRequestSectionCard>

          {/* ── 3. Pneus ────────────────────────────────────────────────── */}
          <SaleRequestSectionCard
            index={3}
            title="Pneus"
            icon="tire"
            anchorId="section-tires"
            complete={validation.sections[2].complete}
            showStatus={attempted}
          >
            <SaleRequestChoiceGroup
              field="tire_condition"
              legend="Como estão os pneus?"
              options={TIRE_CONDITION_OPTIONS}
              value={answers.tireCondition}
              onChange={(value) => update({ tireCondition: value })}
              layout="stack"
              error={errorFor("tire_condition")}
            />
          </SaleRequestSectionCard>

          {/* ── 4. Pendências financeiras e documentação ────────────────── */}
          <SaleRequestSectionCard
            index={4}
            title="Pendências financeiras e documentação"
            icon="document"
            anchorId="section-financial"
            complete={validation.sections[3].complete}
            showStatus={attempted}
          >
            <SaleRequestFinancialSection state={state} update={update} errorFor={errorFor} />
          </SaleRequestSectionCard>

          {/* ── 5. Histórico do veículo ─────────────────────────────────── */}
          <SaleRequestSectionCard
            index={5}
            title="Histórico do veículo"
            icon="history"
            anchorId="section-history"
            complete={validation.sections[4].complete}
            showStatus={attempted}
          >
            <SaleRequestHistorySection state={state} update={update} errorFor={errorFor} />
          </SaleRequestSectionCard>

          {/* ── 6. Mecânica ─────────────────────────────────────────────── */}
          <SaleRequestSectionCard
            index={6}
            title="Mecânica"
            icon="engine"
            anchorId="section-mechanics"
            description="Responda pelo que você conhece do veículo. Isto não substitui uma avaliação mecânica."
            complete={validation.sections[5].complete}
            showStatus={attempted}
          >
            <SaleRequestMechanicsSection state={state} update={update} errorFor={errorFor} />
          </SaleRequestSectionCard>

          {/* ── 7. Lataria e pintura ────────────────────────────────────── */}
          <SaleRequestSectionCard
            index={7}
            title="Lataria e pintura"
            icon="paint"
            anchorId="section-body-paint"
            complete={validation.sections[6].complete}
            showStatus={attempted}
          >
            <SaleRequestBodyPaintSection state={state} update={update} errorFor={errorFor} />
          </SaleRequestSectionCard>

          {/* ── 8. Fotos ────────────────────────────────────────────────── */}
          <SaleRequestSectionCard
            index={8}
            title="Fotos do veículo"
            icon="camera"
            anchorId="section-photos"
            complete={validation.sections[7].complete}
            showStatus={attempted}
          >
            <div id={fieldDomId("photos")}>
              <SaleRequestPhotos
                photos={photos}
                onChange={setPhotos}
                disabled={submitting}
                error={errorFor("photos")}
              />
            </div>
          </SaleRequestSectionCard>

          {/* ── 9. Observações adicionais (OPCIONAL) ────────────────────── */}
          <SaleRequestSectionCard
            index={9}
            title="Observações adicionais"
            icon="note"
            anchorId="section-notes"
            optional
            description="Conte aqui alguma informação importante sobre o veículo que não apareceu nas perguntas anteriores."
          >
            <label className="block" data-testid="sale-request-issues-field">
              <span className={LABEL_CLASS}>Algo mais que a loja deve saber?</span>
              <textarea
                className="min-h-[110px] w-full rounded-xl border border-[#E5E9F2] bg-white px-3.5 py-2.5 text-[15px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
                value={answers.notes}
                maxLength={SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX}
                onChange={(event) => update({ notes: event.target.value })}
                placeholder="Ex.: revisões sempre feitas na concessionária; ar-condicionado precisa de reparo."
                data-testid="sale-request-issues"
              />
              <span
                className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#64748b]"
                data-testid="sale-request-issues-guidance"
              >
                <span>{ISSUES_GUIDANCE_NOTICE}</span>
                <span aria-hidden="true">
                  {answers.notes.length}/{SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX}
                </span>
              </span>
            </label>
          </SaleRequestSectionCard>

          {/*
            O erro fica junto do CTA no desktop (coluna direita) e logo acima
            dele no mobile, onde o resumo desce para o fim do fluxo. Uma cópia
            só, aqui embaixo, atende os dois casos sem duplicar `role="alert"` —
            dois alertas idênticos seriam lidos duas vezes pelo leitor de tela.
          */}
          {formError ? (
            <p
              className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] font-medium text-[#b42318]"
              role="alert"
              data-testid="sale-request-error"
            >
              {formError}
            </p>
          ) : null}
        </div>

        <SaleRequestSummary
          state={state}
          validation={validation}
          coverPhotoUrl={photos[0]?.url ?? null}
          cityLabel={cityLabel}
          transmissionLabel={transmissionLabel}
          fuelLabel={fuelLabel}
          submitting={submitting}
          attempted={attempted}
        />
      </div>
    </form>
  );
}
