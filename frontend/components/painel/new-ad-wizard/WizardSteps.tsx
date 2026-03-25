"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FipeOption } from "@/lib/fipe/fipe-provider";
import { fetchFipeQuote, listFipeBrands, listFipeModels, listFipeYears } from "@/lib/fipe/fipe-client";
import { CONDITION_ITEMS, OPTIONAL_ITEMS, VEHICLE_COLORS } from "./constants";
import { formatCurrencyInput, formatKm, parseCurrency, parseKmDigits } from "./currency";
import { fabricationYearChoices, uniqueModelYears, versionsForYear } from "./fipe-years";
import type { WizardFormState } from "./types";
import ChipSelect from "./ChipSelect";
import { FinalizeLocationFields } from "./FinalizeLocationFields";
import type { DashboardPayload } from "@/lib/dashboard-types";
import type { SessionAccountType } from "@/lib/auth/redirects";

const selectClass =
  "w-full rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1D2440] outline-none transition focus:border-[#AFC6FF] focus:bg-white";

const labelClass = "mb-2 block text-sm font-semibold text-[#1D2440]";

type Patch = (partial: Partial<WizardFormState>) => void;

export function StepVehicle({ state, patch }: { state: WizardFormState; patch: Patch }) {
  const [brands, setBrands] = useState<FipeOption[]>([]);
  const [models, setModels] = useState<FipeOption[]>([]);
  const [yearOptions, setYearOptions] = useState<FipeOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFipeBrands(state.fipeVehicleType)
      .then((data) => {
        if (!cancelled) setBrands(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Não foi possível carregar marcas da FIPE.");
      });
    return () => {
      cancelled = true;
    };
  }, [state.fipeVehicleType]);

  useEffect(() => {
    if (!state.fipeBrandCode) {
      setModels([]);
      return;
    }
    let cancelled = false;
    listFipeModels(state.fipeVehicleType, state.fipeBrandCode)
      .then((data) => {
        if (!cancelled) setModels(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Não foi possível carregar modelos.");
      });
    return () => {
      cancelled = true;
    };
  }, [state.fipeBrandCode, state.fipeVehicleType]);

  useEffect(() => {
    if (!state.fipeBrandCode || !state.fipeModelCode) {
      setYearOptions([]);
      return;
    }
    let cancelled = false;
    listFipeYears(state.fipeVehicleType, state.fipeBrandCode, state.fipeModelCode)
      .then((data) => {
        if (!cancelled) setYearOptions(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Não foi possível carregar anos/versões.");
      });
    return () => {
      cancelled = true;
    };
  }, [state.fipeBrandCode, state.fipeModelCode, state.fipeVehicleType]);

  const modelYears = useMemo(() => uniqueModelYears(yearOptions), [yearOptions]);
  const selectedModelYear = state.yearModel ? parseInt(state.yearModel, 10) : null;
  const versionChoices = useMemo(
    () => versionsForYear(yearOptions, Number.isFinite(selectedModelYear) ? selectedModelYear : null),
    [yearOptions, selectedModelYear]
  );

  const fabYears = useMemo(
    () => fabricationYearChoices(Number.isFinite(selectedModelYear) ? selectedModelYear : null),
    [selectedModelYear]
  );

  const onBrandChange = useCallback(
    (code: string) => {
      const label = brands.find((b) => b.code === code)?.name ?? "";
      patch({
        fipeBrandCode: code,
        brandLabel: label,
        fipeModelCode: "",
        modelLabel: "",
        fipeYearCode: "",
        yearModel: "",
        yearManufacture: "",
        versionLabel: "",
        fipeValue: "",
      });
    },
    [brands, patch]
  );

  const onModelChange = useCallback(
    (code: string) => {
      const label = models.find((m) => m.code === code)?.name ?? "";
      patch({
        fipeModelCode: code,
        modelLabel: label,
        fipeYearCode: "",
        yearModel: "",
        yearManufacture: "",
        versionLabel: "",
        fipeValue: "",
      });
    },
    [models, patch]
  );

  const onYearModelChange = useCallback(
    (y: string) => {
      patch({
        yearModel: y,
        fipeYearCode: "",
        yearManufacture: "",
        versionLabel: "",
        fipeValue: "",
      });
    },
    [patch]
  );

  const onVersionChange = useCallback(
    async (yearCode: string) => {
      const opt = yearOptions.find((o) => o.code === yearCode);
      patch({
        fipeYearCode: yearCode,
        versionLabel: opt?.name ?? "",
      });
      if (!state.fipeBrandCode || !state.fipeModelCode || !yearCode) return;
      try {
        const quote = await fetchFipeQuote(
          state.fipeVehicleType,
          state.fipeBrandCode,
          state.fipeModelCode,
          yearCode
        );
        const priceNum = parseCurrency(quote.price);
        const formatted =
          priceNum > 0
            ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(priceNum)
            : "";
        patch({
          fipeValue: formatted,
          fuel: quote.fuel || state.fuel,
          yearModel: quote.modelYear?.trim() || state.yearModel,
        });
      } catch {
        // mantém FIPE manual nas etapas seguintes
      }
    },
    [patch, state.fipeBrandCode, state.fipeModelCode, state.fipeVehicleType, state.fuel, state.yearModel, yearOptions]
  );

  return (
    <div className="space-y-6">
      {loadError ? (
        <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </div>
      ) : null}

      <p className="text-sm leading-7 text-[#6E748A]">
        Revise os dados antes de continuar — algumas informações não poderão ser alteradas depois.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={labelClass}>
            Marca <span className="text-red-500">*</span>
          </span>
          <select
            className={selectClass}
            value={state.fipeBrandCode}
            onChange={(e) => onBrandChange(e.target.value)}
          >
            <option value="">Escolha uma...</option>
            {brands.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>
            Modelo <span className="text-red-500">*</span>
          </span>
          <select
            className={selectClass}
            value={state.fipeModelCode}
            disabled={!state.fipeBrandCode}
            onChange={(e) => onModelChange(e.target.value)}
          >
            <option value="">Escolha uma...</option>
            {models.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={labelClass}>
            Ano do modelo <span className="text-red-500">*</span>
          </span>
          <select
            className={selectClass}
            value={state.yearModel}
            disabled={!yearOptions.length}
            onChange={(e) => onYearModelChange(e.target.value)}
          >
            <option value="">Escolha uma...</option>
            {modelYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>
            Ano de fabricação <span className="text-red-500">*</span>
          </span>
          <select
            className={selectClass}
            value={state.yearManufacture}
            disabled={!state.yearModel}
            onChange={(e) => patch({ yearManufacture: e.target.value })}
          >
            <option value="">Escolha uma...</option>
            {fabYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className={labelClass}>
            Versão <span className="text-red-500">*</span>
          </span>
          <select
            className={selectClass}
            value={state.fipeYearCode}
            disabled={!state.yearModel || !versionChoices.length}
            onChange={(e) => void onVersionChange(e.target.value)}
          >
            <option value="">Escolha uma...</option>
            {versionChoices.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>
          Cor <span className="text-red-500">*</span>
        </span>
        <select className={selectClass} value={state.color} onChange={(e) => patch({ color: e.target.value })}>
          <option value="">Escolha uma...</option>
          {VEHICLE_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="flex cursor-pointer items-center gap-3 rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3">
        <input
          type="checkbox"
          checked={state.armored}
          onChange={(e) => patch({ armored: e.target.checked })}
          className="h-4 w-4 rounded border-[#C5D1E8]"
        />
        <span className="text-sm font-semibold text-[#1D2440]">Blindado</span>
      </label>
    </div>
  );
}

export function StepListingInfo({ state, patch }: { state: WizardFormState; patch: Patch }) {
  const priceNumber = parseCurrency(state.price);
  const fipeNumber = parseCurrency(state.fipeValue);
  const delta = priceNumber - fipeNumber;
  const pct = fipeNumber > 0 ? (delta / fipeNumber) * 100 : 0;
  const below = fipeNumber > 0 && priceNumber > 0 && priceNumber < fipeNumber;

  return (
    <div className="space-y-6">
      <p className="text-sm leading-7 text-[#6E748A]">
        Use um valor competitivo para aumentar suas chances de venda. Quilometragem e preço são os únicos campos numéricos
        principais desta etapa.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={labelClass}>
            Quilometragem <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            className={selectClass}
            value={state.mileage ? formatKm(state.mileage) : ""}
            onChange={(e) => patch({ mileage: parseKmDigits(e.target.value) })}
            placeholder="Ex.: 32.500"
          />
        </label>
        <label className="block">
          <span className={labelClass}>
            Preço <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            className={selectClass}
            value={state.price}
            onChange={(e) => patch({ price: formatCurrencyInput(e.target.value) })}
            placeholder="R$ 0,00"
          />
        </label>
      </div>

      <p className="text-xs text-[#98A2B3]">
        A descrição do anúncio fica na etapa final, para manter esta etapa só com quilometragem e preço como campos
        editáveis principais.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[22px] border border-[#E5E9F2] bg-[#FBFCFF] p-5">
          <div className="text-sm font-semibold text-[#4B536A]">Seu preço</div>
          <div className="mt-2 text-2xl font-extrabold text-[#1D2440]">
            {priceNumber > 0 ? formatCurrencyInput(state.price) : "—"}
          </div>
        </div>
        <div className="rounded-[22px] border border-[#D8E8D8] bg-[#F5FCF5] p-5">
          <div className="text-sm font-semibold text-[#4B536A]">Referência FIPE</div>
          <div className="mt-2 text-2xl font-extrabold text-[#1D2440]">
            {fipeNumber > 0 ? state.fipeValue : "Preencha a etapa do veículo"}
          </div>
        </div>
        <div className="rounded-[22px] border border-[#E5E9F2] bg-white p-5">
          <div className="text-sm font-semibold text-[#4B536A]">Faixa de mercado</div>
          <div
            className={`mt-2 text-lg font-bold ${fipeNumber > 0 ? (below ? "text-green-600" : "text-orange-600") : "text-[#6E748A]"}`}
          >
            {fipeNumber > 0
              ? `${below ? "Abaixo" : "Acima"} da FIPE • ${Math.abs(pct).toFixed(1).replace(".", ",")}%`
              : "Consulte a FIPE na etapa anterior"}
          </div>
        </div>
      </div>
    </div>
  );
}

type PhotoProps = {
  photos: File[];
  previews: string[];
  coverIndex: number;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
  onSetCover: (index: number) => void;
};

export function StepPhotos({ photos, previews, coverIndex, onFiles, onRemove, onSetCover }: PhotoProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const list = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    mergeFiles(list);
  };

  function mergeFiles(incoming: File[]) {
    const next = [...photos, ...incoming].slice(0, 10);
    onFiles(next);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-7 text-[#6E748A]">
        Fotos claras e bem iluminadas geram mais contatos. Você pode arrastar imagens para a área abaixo ou clicar para
        selecionar.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed px-6 py-10 text-center transition ${
          dragOver ? "border-[#2F67F6] bg-[#F2F7FF]" : "border-[#B9C8E8] bg-[#F8FBFF] hover:border-[#2F67F6]"
        }`}
      >
        <span className="text-lg font-bold text-[#1D2440]">Adicionar fotos</span>
        <span className="mt-2 max-w-md text-sm text-[#6E748A]">Até 10 imagens. Formatos JPG ou PNG.</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = Array.from(e.target.files || []);
            mergeFiles(list);
            e.target.value = "";
          }}
        />
      </label>

      {previews.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {previews.map((src, index) => (
            <div
              key={`${src}-${index}`}
              className="overflow-hidden rounded-[22px] border border-[#E5E9F2] bg-white shadow-sm"
            >
              <div className="aspect-[4/3] bg-[#EDF2FB]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[#EEF2F7] p-3">
                <button
                  type="button"
                  onClick={() => onSetCover(index)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    coverIndex === index ? "bg-[#2F67F6] text-white" : "bg-[#EEF4FF] text-[#2F67F6]"
                  }`}
                >
                  {coverIndex === index ? "Capa" : "Usar como capa"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="rounded-full border border-[#E5E9F2] px-3 py-1.5 text-xs font-bold text-[#B42318]"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StepOptionals({ state, patch }: { state: WizardFormState; patch: Patch }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6E748A]">Toque para marcar os itens que o veículo possui.</p>
      <ChipSelect
        items={OPTIONAL_ITEMS}
        selected={state.optionalIds}
        onToggle={(id) =>
          patch({
            optionalIds: state.optionalIds.includes(id)
              ? state.optionalIds.filter((x) => x !== id)
              : [...state.optionalIds, id],
          })
        }
      />
    </div>
  );
}

export function StepConditions({ state, patch }: { state: WizardFormState; patch: Patch }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6E748A]">Selecione as condições que se aplicam ao veículo ou ao negócio.</p>
      <ChipSelect
        items={CONDITION_ITEMS}
        selected={state.conditionIds}
        onToggle={(id) =>
          patch({
            conditionIds: state.conditionIds.includes(id)
              ? state.conditionIds.filter((x) => x !== id)
              : [...state.conditionIds, id],
          })
        }
      />
    </div>
  );
}

export function StepHighlight({
  state,
  patch,
  boostOptions,
}: {
  state: WizardFormState;
  patch: Patch;
  boostOptions: { id: string; label: string; description: string; price: number; days: number }[];
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[#DCE6F7] bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FF_100%)] p-6">
        <h3 className="text-xl font-extrabold text-[#1D2440]">Destaque no Carros na Cidade</h3>
        <p className="mt-2 text-sm leading-7 text-[#5C647C]">
          Anúncios em destaque aparecem com mais visibilidade, melhor posicionamento nas buscas locais e entrada em vitrines
          especiais da sua região.
        </p>
      </div>

      {boostOptions.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => patch({ boostOptionId: null })}
            className={`rounded-[22px] border p-5 text-left transition ${
              state.boostOptionId == null
                ? "border-[#2F67F6] bg-[#EEF4FF]"
                : "border-[#E5E9F2] bg-white hover:border-[#C7D7F8]"
            }`}
          >
            <div className="text-sm font-bold text-[#2F67F6]">Sem destaque agora</div>
            <p className="mt-2 text-sm text-[#5C647C]">Publique primeiro e impulsione depois pelo painel.</p>
          </button>
          {boostOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => patch({ boostOptionId: opt.id })}
              className={`rounded-[22px] border p-5 text-left transition ${
                state.boostOptionId === opt.id
                  ? "border-[#2F67F6] bg-[#EEF4FF]"
                  : "border-[#E5E9F2] bg-white hover:border-[#C7D7F8]"
              }`}
            >
              <div className="text-lg font-extrabold text-[#1D2440]">{opt.label}</div>
              <p className="mt-2 text-sm text-[#5C647C]">{opt.description}</p>
              <div className="mt-3 text-sm font-bold text-[#2F67F6]">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(opt.price)} · {opt.days}{" "}
                dias
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border border-[#E5E9F2] bg-white p-6 text-sm leading-7 text-[#5C647C]">
          Após publicar, você poderá impulsionar o anúncio pelo painel em{" "}
          <Link href="/planos" className="font-bold text-[#2F67F6] underline">
            Planos e destaques
          </Link>
          .
        </div>
      )}
    </div>
  );
}

export function StepFinalize({
  state,
  patch,
  dashboard,
  dashboardError,
  sessionAccountType,
}: {
  state: WizardFormState;
  patch: Patch;
  dashboard: DashboardPayload | null;
  dashboardError: string | null;
  sessionAccountType: SessionAccountType | null;
}) {
  const title = useMemo(
    () =>
      [state.yearModel, state.brandLabel, state.modelLabel, state.versionLabel].filter(Boolean).join(" ").trim() ||
      "Novo anúncio",
    [state.brandLabel, state.modelLabel, state.versionLabel, state.yearModel]
  );

  const isLojistaAccount = sessionAccountType === "CNPJ";
  const isCnpjDashboard = dashboard?.user.type === "CNPJ";
  const hasSlots =
    dashboard && typeof dashboard.stats.available_limit === "number" && dashboard.stats.available_limit > 0;

  const showLojistaPlanUi = isLojistaAccount && (isCnpjDashboard || dashboard === null);
  const showLojistaFree = isLojistaAccount && isCnpjDashboard && hasSlots;
  const showLojistaNoSlots = isLojistaAccount && isCnpjDashboard && !hasSlots;
  const showPfOrParticularPayment = sessionAccountType !== "CNPJ";

  return (
    <div className="space-y-8">
      <div className="rounded-[24px] border border-[#E5E9F2] bg-[#FBFCFF] p-6">
        <div className="text-sm font-bold uppercase tracking-[0.14em] text-[#2F67F6]">Resumo</div>
        <h3 className="mt-2 text-2xl font-extrabold text-[#1D2440]">{title}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-[#6E748A]">Preço</div>
            <div className="text-lg font-bold text-[#1F66E5]">{state.price || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#6E748A]">Quilometragem</div>
            <div className="text-lg font-bold text-[#1D2440]">
              {state.mileage ? `${formatKm(state.mileage)} km` : "—"}
            </div>
          </div>
        </div>
      </div>

      {dashboardError ? (
        <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {dashboardError}
        </div>
      ) : null}

      {showPfOrParticularPayment ? (
        <div className="rounded-[24px] border border-[#DCE6F7] bg-white p-6">
          <h4 className="text-lg font-extrabold text-[#1D2440]">Publicação e pagamento (pessoa física)</h4>
          <p className="mt-2 text-sm leading-7 text-[#5C647C]">
            O valor da publicação e eventuais destaques seguem o plano vigente no portal. Você poderá concluir o pagamento
            após revisar os dados, conforme regras do checkout integrado (Mercado Pago quando aplicável).
          </p>
          <Link href="/planos" className="mt-3 inline-block text-sm font-bold text-[#2F67F6] underline">
            Ver planos e valores
          </Link>
        </div>
      ) : null}

      {showLojistaPlanUi && !showPfOrParticularPayment ? (
        <div className="rounded-[24px] border border-[#DCE6F7] bg-white p-6">
          <h4 className="text-lg font-extrabold text-[#1D2440]">Lojista — plano e vagas</h4>
          {showLojistaFree ? (
            <p className="mt-2 text-sm leading-7 text-[#15803D]">
              Seu plano atual inclui vagas para anúncios. Você pode publicar{" "}
              <span className="font-bold">sem cobrança individual</span> por esta publicação, dentro do limite disponível (
              {dashboard?.stats.available_limit} restantes).
            </p>
          ) : showLojistaNoSlots ? (
            <p className="mt-2 text-sm leading-7 text-[#5C647C]">
              Não há vagas disponíveis no plano atual ou é necessário assinar um plano para lojistas.{" "}
              <Link href="/planos" className="font-bold text-[#2F67F6] underline">
                Ver planos para lojistas
              </Link>
            </p>
          ) : (
            <p className="mt-2 text-sm leading-7 text-[#5C647C]">
              Não foi possível carregar vagas do plano agora. Você ainda pode tentar publicar; o sistema validará no
              servidor.{" "}
              <Link href="/planos" className="font-bold text-[#2F67F6] underline">
                Ver planos para lojistas
              </Link>
            </p>
          )}
        </div>
      ) : null}

      <label className="block">
        <span className={labelClass}>Descrição do anúncio (opcional)</span>
        <textarea
          value={state.description}
          onChange={(e) => patch({ description: e.target.value })}
          rows={5}
          placeholder="Destaque diferenciais, estado de conservação e histórico de revisões."
          className={`${selectClass} min-h-[120px] resize-y`}
        />
      </label>

      <FinalizeLocationFields state={state} patch={patch} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={labelClass}>WhatsApp</span>
          <input
            className={selectClass}
            value={state.whatsapp}
            onChange={(e) => patch({ whatsapp: e.target.value })}
            placeholder="(11) 99999-9999"
          />
        </label>
        <label className="block">
          <span className={labelClass}>Telefone</span>
          <input
            className={selectClass}
            value={state.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            placeholder="(11) 3333-3333"
          />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] p-4">
        <input
          type="checkbox"
          checked={state.acceptTerms}
          onChange={(e) => patch({ acceptTerms: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-[#C5D1E8]"
        />
        <span className="text-sm leading-7 text-[#5C647C]">
          Confirmo que as informações são verdadeiras e autorizo a publicação conforme as regras do portal.
        </span>
      </label>
    </div>
  );
}
