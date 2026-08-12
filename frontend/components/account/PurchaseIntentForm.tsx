"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PurchaseIntentCityField, {
  type SelectedCity,
} from "@/components/account/PurchaseIntentCityField";
import {
  BODY_TYPE_OPTIONS,
  PURCHASE_INTENT_LIMITS,
  PURCHASE_TIMEFRAME_OPTIONS,
  TRANSMISSION_OPTIONS,
  createPurchaseIntent,
  type PurchaseIntentType,
  type PurchaseTimeframe,
} from "@/lib/purchase-intents/api";
import { deriveCommercialModel } from "@/lib/vehicle/commercial-model";

/**
 * Formulário de publicação da procura.
 *
 * Mobile-first: uma coluna por padrão, duas só a partir de `sm` e apenas onde
 * os campos são curtos. Marca, modelo, câmbio e cidade nunca dividem linha no
 * celular.
 *
 * Os dois modos moram na MESMA página — nada de wizard. São seis campos no
 * máximo; um passo a passo aqui só adicionaria cliques.
 */

const FIELD_CLASS =
  "h-12 w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5] disabled:bg-[#f6f7f9] disabled:text-[#94a3b8]";
const LABEL_CLASS = "mb-2 block text-sm font-semibold text-[#33405A]";

type FipeOption = { code: string; name: string };

/** Modelo comercial + a descrição FIPE que o representa. */
type ModelChoice = { slug: string; label: string; fipeName: string };

/**
 * Reduz a lista da FIPE a modelos COMERCIAIS.
 *
 * A FIPE devolve centenas de descrições completas ("T-Cross 200 TSI 1.0 Flex
 * 12V 5p Aut.", "T-Cross Highline 1.4 …") — pedir ao comprador que escolha uma
 * versão específica seria pedir precisão que ele não tem, e gravaria uma
 * procura estreita demais para casar com qualquer estoque.
 *
 * O valor enviado ao backend é a descrição FIPE REPRESENTATIVA, não o rótulo
 * reduzido. O backend roda a MESMA `deriveCommercialModel` e chega ao mesmo
 * resultado — enviar o rótulo já reduzido quebraria os casos de cabeça numérica
 * ("5 Luxury 1.5 TB FWD" → "Omoda 5"), porque "Omoda 5" não volta a derivar
 * para si mesmo.
 */
export function collapseToCommercialModels(models: FipeOption[], brand: string): ModelChoice[] {
  const bySlug = new Map<string, ModelChoice>();

  for (const model of models) {
    const commercial = deriveCommercialModel(model.name, { brand });
    if (!commercial?.slug) continue;
    if (bySlug.has(commercial.slug)) continue;
    bySlug.set(commercial.slug, {
      slug: commercial.slug,
      label: commercial.label,
      fipeName: model.name,
    });
  }

  return [...bySlug.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

async function fetchFipe(path: string): Promise<FipeOption[]> {
  const res = await fetch(path, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
  if (!res.ok || !Array.isArray(json?.data)) return [];
  return json.data.filter(
    (item): item is FipeOption =>
      Boolean(item) &&
      typeof (item as FipeOption).code === "string" &&
      typeof (item as FipeOption).name === "string"
  );
}

export default function PurchaseIntentForm({ basePath = "/dashboard" }: { basePath?: string }) {
  const router = useRouter();

  const [intentType, setIntentType] = useState<PurchaseIntentType>("specific_model");
  const [brands, setBrands] = useState<FipeOption[]>([]);
  const [brandCode, setBrandCode] = useState("");
  const [models, setModels] = useState<FipeOption[]>([]);
  const [modelSlug, setModelSlug] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [bodyType, setBodyType] = useState("");
  const [transmission, setTransmission] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [city, setCity] = useState<SelectedCity | null>(null);
  const [timeframe, setTimeframe] = useState<PurchaseTimeframe | "">("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandName = useMemo(
    () => brands.find((item) => item.code === brandCode)?.name ?? "",
    [brands, brandCode]
  );

  const modelChoices = useMemo(
    () => (brandName ? collapseToCommercialModels(models, brandName) : []),
    [models, brandName]
  );

  useEffect(() => {
    let alive = true;
    void fetchFipe("/api/fipe/brands?vehicleType=carros").then((rows) => {
      if (alive) setBrands(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!brandCode) {
      setModels([]);
      setModelSlug("");
      return;
    }
    let alive = true;
    setLoadingModels(true);
    setModelSlug("");
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

  const priceNumber = Number(maxPrice.replace(/\D/g, ""));

  /**
   * O botão só habilita com o formulário inteiro válido. Isso é UX, não
   * segurança: o backend revalida tudo, e é ele quem decide.
   */
  const canSubmit =
    !submitting &&
    Boolean(transmission) &&
    Boolean(timeframe) &&
    Boolean(city) &&
    Number.isFinite(priceNumber) &&
    priceNumber >= PURCHASE_INTENT_LIMITS.MAX_PRICE_MIN &&
    (intentType === "specific_model" ? Boolean(brandCode && modelSlug) : Boolean(bodyType));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !city) return;

    setSubmitting(true);
    setError(null);
    try {
      const chosen = modelChoices.find((item) => item.slug === modelSlug);
      await createPurchaseIntent({
        intent_type: intentType,
        transmission,
        max_price: priceNumber,
        purchase_timeframe: timeframe as PurchaseTimeframe,
        city_id: city.id,
        ...(intentType === "specific_model"
          ? { brand: brandName, model: chosen?.fipeName ?? "" }
          : { body_type: bodyType }),
      });
      router.push(`${basePath}/minhas-procuras?published=1`);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível publicar a procura. Tente novamente."
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="purchase-intent-form">
      <fieldset className="rounded-2xl border border-[#e8ecf4] bg-white p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-[#33405A]">O que você procura?</legend>
        <div className="mt-2 space-y-3">
          {(
            [
              ["specific_model", "Já sei qual carro quero"],
              ["open_category", "Quero receber opções"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[14px] border border-[#E5E9F2] px-4 py-3 text-[15px] text-[#1D2440] transition has-[:checked]:border-[#1F66E5] has-[:checked]:bg-[#f5f8ff]"
            >
              <input
                type="radio"
                name="intent_type"
                value={value}
                checked={intentType === value}
                onChange={() => {
                  setIntentType(value);
                  setError(null);
                }}
                className="h-5 w-5 accent-[#0e62d8]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {intentType === "specific_model" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLASS}>Marca</span>
            <select
              className={FIELD_CLASS}
              value={brandCode}
              onChange={(event) => setBrandCode(event.target.value)}
              data-testid="purchase-intent-brand"
            >
              <option value="">Selecione a marca</option>
              {brands.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={LABEL_CLASS}>Modelo</span>
            <select
              className={FIELD_CLASS}
              value={modelSlug}
              onChange={(event) => setModelSlug(event.target.value)}
              disabled={!brandCode || loadingModels}
              data-testid="purchase-intent-model"
            >
              <option value="">
                {!brandCode
                  ? "Escolha a marca primeiro"
                  : loadingModels
                    ? "Carregando modelos…"
                    : "Selecione o modelo"}
              </option>
              {modelChoices.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <label className="block">
          <span className={LABEL_CLASS}>Tipo de carroceria</span>
          <select
            className={FIELD_CLASS}
            value={bodyType}
            onChange={(event) => setBodyType(event.target.value)}
            data-testid="purchase-intent-body-type"
          >
            <option value="">Selecione a carroceria</option>
            {BODY_TYPE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL_CLASS}>Câmbio</span>
          <select
            className={FIELD_CLASS}
            value={transmission}
            onChange={(event) => setTransmission(event.target.value)}
            data-testid="purchase-intent-transmission"
          >
            <option value="">Selecione o câmbio</option>
            {TRANSMISSION_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Até quanto pretende pagar?</span>
          <input
            className={FIELD_CLASS}
            // `inputMode="numeric"` abre o teclado numérico no celular sem as
            // setas de incremento que o type="number" traz no desktop.
            inputMode="numeric"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))}
            placeholder="Ex.: 95000"
            data-testid="purchase-intent-max-price"
          />
          <span className="mt-1 block text-xs text-[#64748b]">
            Valor em reais, sem pontos. Mínimo de R$ 1.000.
          </span>
        </label>
      </div>

      <PurchaseIntentCityField value={city} onChange={setCity} />

      <label className="block">
        <span className={LABEL_CLASS}>Quando pretende comprar?</span>
        <select
          className={FIELD_CLASS}
          value={timeframe}
          onChange={(event) => setTimeframe(event.target.value as PurchaseTimeframe)}
          data-testid="purchase-intent-timeframe"
        >
          <option value="">Selecione o prazo</option>
          {PURCHASE_TIMEFRAME_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p
          className="rounded-[14px] border border-[#F4C7C3] bg-[#FFF4F3] px-4 py-3 text-sm text-[#B42318]"
          role="alert"
          data-testid="purchase-intent-form-error"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="h-12 w-full rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:w-auto sm:min-w-[240px]"
        data-testid="purchase-intent-submit"
      >
        {submitting ? "Publicando…" : "Publicar minha procura"}
      </button>

      <p className="text-xs leading-relaxed text-[#64748b]">
        Sua procura fica ativa por 30 dias. As lojas da cidade escolhida verão o veículo que você
        procura — nunca os seus dados de contato.
      </p>
    </form>
  );
}
