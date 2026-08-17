"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PurchaseIntentCityField, {
  type SelectedCity,
} from "@/components/account/PurchaseIntentCityField";
import SaleRequestPhotos from "@/components/account/SaleRequestPhotos";
import {
  DECLARED_CONDITION_OPTIONS,
  ISSUES_GUIDANCE_NOTICE,
  SALE_REQUEST_ACTIVE_LIMIT,
  SALE_REQUEST_LIMITS,
  SALE_REQUEST_PHOTOS,
  SaleRequestError,
  createSaleRequest,
  maxModelYear,
  type DeclaredCondition,
  type UploadedPhoto,
} from "@/lib/sale-requests/api";

/**
 * Formulário de "Venda seu carro para lojas".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE FORMULÁRIO NÃO PEDE
 * ────────────────────────────────────────────────────────────────────────────
 * PLACA. Não existe campo, não existe estado, não existe envio. A auditoria da
 * Fase 4.0 mostrou que a placa não é coletada em lugar nenhum do sistema hoje, e
 * coletá-la aqui criaria a primeira PII dessa classe sem nenhuma infraestrutura
 * de mascaramento para sustentá-la.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A CADEIA FIPE
 * ────────────────────────────────────────────────────────────────────────────
 * Marca → modelo → ano, cada passo alimentado pelo anterior. O que é enviado ao
 * servidor são os CÓDIGOS; o valor de mercado é cotado LÁ. O cliente nunca manda
 * um valor FIPE — se mandasse, um vendedor poderia publicar uma referência
 * fabricada com aparência de número oficial.
 *
 * A descrição FIPE do modelo vai INTEIRA (com a versão). O rótulo comercial
 * ("T-Cross") é derivado no servidor pelos mesmos helpers dos anúncios.
 */

const FIELD_CLASS =
  "h-12 w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5] disabled:bg-[#f6f7f9] disabled:text-[#94a3b8]";
const LABEL_CLASS = "mb-2 block text-sm font-semibold text-[#33405A]";

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
 * O sufixo é o combustível, não parte do ano. Enviar a string inteira como `year`
 * faria a validação de 4 dígitos recusar um valor perfeitamente correto.
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

export default function SaleRequestForm({ basePath = "/dashboard" }: { basePath?: string }) {
  const router = useRouter();

  const [brands, setBrands] = useState<FipeOption[]>([]);
  const [brandCode, setBrandCode] = useState("");
  const [models, setModels] = useState<FipeOption[]>([]);
  const [modelCode, setModelCode] = useState("");
  const [years, setYears] = useState<FipeOption[]>([]);
  const [yearCode, setYearCode] = useState("");

  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);

  const [mileage, setMileage] = useState("");
  const [transmission, setTransmission] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [condition, setCondition] = useState<DeclaredCondition | "">("");
  const [knownIssues, setKnownIssues] = useState("");
  const [city, setCity] = useState<SelectedCity | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const mileageNumber = Number(String(mileage).replace(/\D/g, ""));
  const photosOk =
    photos.length >= SALE_REQUEST_PHOTOS.MIN && photos.length <= SALE_REQUEST_PHOTOS.MAX;

  const canSubmit =
    Boolean(brandName) &&
    Boolean(modelName) &&
    Boolean(year) &&
    Number.isFinite(mileageNumber) &&
    mileageNumber >= 0 &&
    mileageNumber <= SALE_REQUEST_LIMITS.MILEAGE_MAX &&
    Boolean(transmission) &&
    Boolean(fuelType) &&
    Boolean(condition) &&
    knownIssues.length <= SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX &&
    Boolean(city) &&
    photosOk &&
    !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !city || !condition) return;

    setSubmitting(true);
    setFormError(null);

    try {
      const { sale_request: created } = await createSaleRequest({
        city_id: city.id,
        brand: brandName,
        fipe_model_description: modelName,
        year,
        mileage: String(mileageNumber),
        transmission,
        fuel_type: fuelType,
        declared_condition: condition,
        known_issues: knownIssues.trim() ? knownIssues.trim() : null,
        images: photos.map((photo) => photo.storage_key),
        fipe_brand_code: brandCode,
        fipe_model_code: modelCode,
        fipe_year_code: yearCode,
      });

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

  return (
    <form onSubmit={handleSubmit} className="grid gap-6" data-testid="sale-request-form" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL_CLASS}>Marca</span>
          <select
            className={FIELD_CLASS}
            value={brandCode}
            onChange={(event) => setBrandCode(event.target.value)}
            data-testid="sale-request-brand"
          >
            <option value="">Escolha a marca</option>
            {brands.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Modelo e versão</span>
          <select
            className={FIELD_CLASS}
            value={modelCode}
            onChange={(event) => setModelCode(event.target.value)}
            disabled={!brandCode || loadingModels}
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
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Ano</span>
          <select
            className={FIELD_CLASS}
            value={yearCode}
            onChange={(event) => setYearCode(event.target.value)}
            disabled={!modelCode || loadingYears}
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
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Quilometragem</span>
          <input
            className={FIELD_CLASS}
            value={mileage}
            onChange={(event) => setMileage(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Ex.: 45000"
            data-testid="sale-request-mileage"
          />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Câmbio</span>
          <select
            className={FIELD_CLASS}
            value={transmission}
            onChange={(event) => setTransmission(event.target.value)}
            data-testid="sale-request-transmission"
          >
            <option value="">Escolha o câmbio</option>
            {TRANSMISSIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Combustível</span>
          <select
            className={FIELD_CLASS}
            value={fuelType}
            onChange={(event) => setFuelType(event.target.value)}
            data-testid="sale-request-fuel"
          >
            <option value="">Escolha o combustível</option>
            {FUEL_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="block">
        <legend className={LABEL_CLASS}>Estado de conservação</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DECLARED_CONDITION_OPTIONS.map((item) => (
            <label
              key={item.value}
              className={`flex cursor-pointer items-start gap-3 rounded-[14px] border px-4 py-3 transition ${
                condition === item.value
                  ? "border-[#1F66E5] bg-[#F5F9FF]"
                  : "border-[#E5E9F2] bg-white hover:bg-[#F9FBFF]"
              }`}
            >
              <input
                type="radio"
                name="declared_condition"
                value={item.value}
                checked={condition === item.value}
                onChange={() => setCondition(item.value)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-[#1D2440]">{item.label}</span>
                <span className="block text-xs text-[#64748b]">{item.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/*
        Hint NEUTRO, no mesmo tom das demais ajudas do formulário — sem caixa de
        alerta, sem âmbar, sem ícone de atenção. Orientação sobre o que escrever
        não é advertência.
      */}
      <label className="block" data-testid="sale-request-issues-field">
        <span className={LABEL_CLASS}>Problemas conhecidos (opcional)</span>
        <textarea
          className="min-h-[120px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 py-3 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
          value={knownIssues}
          maxLength={SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX}
          onChange={(event) => setKnownIssues(event.target.value)}
          placeholder="Ex.: ar-condicionado precisa de reparo, pneus dianteiros gastos."
          data-testid="sale-request-issues"
        />
        <span
          className="mt-1 block text-xs text-[#64748b]"
          data-testid="sale-request-issues-guidance"
        >
          {ISSUES_GUIDANCE_NOTICE} ({knownIssues.length}/{SALE_REQUEST_LIMITS.KNOWN_ISSUES_MAX})
        </span>
      </label>

      <PurchaseIntentCityField
        value={city}
        onChange={setCity}
        helpText="A cidade define quais lojas poderão avaliar o seu veículo."
      />

      <SaleRequestPhotos photos={photos} onChange={setPhotos} disabled={submitting} />

      {formError ? (
        <p
          className="rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm text-[#b42318]"
          role="alert"
          data-testid="sale-request-error"
        >
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="h-12 w-full rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:w-auto sm:min-w-[280px]"
        data-testid="sale-request-submit"
      >
        {submitting ? "Enviando…" : "Enviar meu carro para as lojas"}
      </button>
    </form>
  );
}
