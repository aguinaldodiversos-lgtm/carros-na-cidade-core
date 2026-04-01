"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fetchDashboardPayloadClient } from "@/lib/dashboard/fetch-dashboard-me-client";
import type { DashboardPayload } from "@/lib/dashboard-types";
import type { SessionAccountType } from "@/lib/auth/redirects";
import SellWizardLayout from "./new-ad-wizard/SellWizardLayout";
import {
  StepConditions,
  StepFinalize,
  StepHighlight,
  StepListingInfo,
  StepOptionals,
  StepPhotos,
  StepVehicle,
} from "./new-ad-wizard/WizardSteps";
import {
  STEP_COUNT,
  STEP_LABELS,
  WIZARD_STORAGE_KEY,
  type WizardFormState,
  type SellerType,
} from "./new-ad-wizard/types";
import { parseCurrency } from "./new-ad-wizard/currency";
import CompleteProfileGate from "./CompleteProfileGate";

type Props = {
  initialType: SellerType;
};

const INITIAL_FORM: WizardFormState = {
  sellerType: "particular",
  step: 0,
  fipeVehicleType: "carros",
  fipeBrandCode: "",
  fipeModelCode: "",
  fipeYearCode: "",
  brandLabel: "",
  modelLabel: "",
  yearModel: "",
  yearManufacture: "",
  versionLabel: "",
  color: "",
  armored: false,
  fuel: "Flex",
  transmission: "Automático",
  bodyStyle: "Sedã",
  fipeValue: "",
  mileage: "",
  price: "",
  description: "",
  cityId: null,
  city: "",
  state: "",
  plateFinal: "",
  whatsapp: "",
  phone: "",
  acceptTerms: false,
  optionalIds: [],
  conditionIds: [],
  boostOptionId: null,
};

function validateStep(step: number, form: WizardFormState, photoCount: number): string | null {
  switch (step) {
    case 0:
      if (!form.fipeBrandCode || !form.brandLabel) return "Selecione a marca.";
      if (!form.fipeModelCode || !form.modelLabel) return "Selecione o modelo.";
      if (!form.yearModel) return "Selecione o ano do modelo.";
      if (!form.yearManufacture) return "Selecione o ano de fabricação.";
      if (!form.fipeYearCode || !form.versionLabel) return "Selecione a versão.";
      if (!form.color) return "Selecione a cor.";
      return null;
    case 1:
      if (!form.mileage.trim()) return "Informe a quilometragem.";
      if (!form.price.trim() || parseCurrency(form.price) <= 0)
        return "Informe o preço do anúncio.";
      return null;
    case 2:
      if (photoCount < 1) return "Adicione pelo menos uma foto.";
      return null;
    case 3:
    case 4:
    case 5:
      return null;
    case 6:
      if (!form.state.trim() || form.state.length !== 2) return "Selecione a UF.";
      if (form.cityId == null || !Number.isFinite(form.cityId)) {
        return "Selecione uma cidade válida da lista para continuar.";
      }
      if (!form.city.trim()) return "Selecione uma cidade válida da lista para continuar.";
      if (!form.whatsapp.trim() && !form.phone.trim()) return "Informe WhatsApp ou telefone.";
      if (!form.acceptTerms) return "Aceite os termos para publicar.";
      return null;
    default:
      return null;
  }
}

function buildTitle(form: WizardFormState) {
  const t = [form.yearModel, form.brandLabel, form.modelLabel, form.versionLabel]
    .filter(Boolean)
    .join(" ")
    .trim();
  return t || "Novo anúncio";
}

function clampStep(value: number) {
  return Math.min(Math.max(value, 0), STEP_COUNT - 1);
}

export default function NewAdWizardClient({ initialType }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<WizardFormState>({ ...INITIAL_FORM, sellerType: initialType });
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">(
    "idle"
  );
  const [submitMessage, setSubmitMessage] = useState("");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [sessionAccountType, setSessionAccountType] = useState<SessionAccountType | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dashboardReload, setDashboardReload] = useState(0);
  const [dashboardFetchDone, setDashboardFetchDone] = useState(false);

  const step = form.step;

  const patch = useCallback((partial: Partial<WizardFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    if (sessionAccountType === "CNPJ") {
      setForm((prev) => ({ ...prev, sellerType: "lojista" }));
    } else if (sessionAccountType === "CPF") {
      setForm((prev) => ({ ...prev, sellerType: "particular" }));
    }
  }, [sessionAccountType]);

  useEffect(() => {
    const t = dashboard?.user?.type;
    if (t === "CPF" || t === "CNPJ" || t === "pending") {
      setSessionAccountType(t);
    }
  }, [dashboard]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WIZARD_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<WizardFormState>) : {};
      const params = new URLSearchParams(window.location.search);
      const tipo = params.get("tipo");
      const stepParam = params.get("step");
      const n = stepParam ? parseInt(stepParam, 10) : NaN;
      const urlHasStep = Number.isFinite(n) && n >= 1 && n <= STEP_COUNT;
      const urlStep = urlHasStep
        ? n - 1
        : typeof parsed.step === "number"
          ? clampStep(parsed.step)
          : 0;

      setForm({
        ...INITIAL_FORM,
        ...parsed,
        cityId: typeof parsed.cityId === "number" ? parsed.cityId : null,
        sellerType:
          tipo === "lojista"
            ? "lojista"
            : parsed.sellerType === "lojista"
              ? "lojista"
              : initialType,
        step: urlStep,
      });
    } catch {
      setForm((prev) => ({ ...prev, sellerType: initialType }));
    }
    setHydrated(true);
  }, [initialType]);

  const syncUrl = useCallback(
    (nextStep: number) => {
      const params = new URLSearchParams(searchParams.toString());
      const tipo =
        sessionAccountType === "CNPJ"
          ? "lojista"
          : sessionAccountType === "CPF"
            ? "particular"
            : form.sellerType;
      params.set("tipo", tipo);
      params.set("step", String(nextStep + 1));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, sessionAccountType, form.sellerType]
  );

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(form));
    } catch {
      // ignore
    }
  }, [form, hydrated]);

  useEffect(() => {
    return () => {
      previews.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [previews]);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardPayloadClient()
      .then((result) => {
        if (!result.ok) {
          if (result.status === 401) {
            if (!cancelled) {
              setDashboard(null);
              setDashboardError(null);
            }
            return;
          }
          throw new Error("Falha ao carregar painel.");
        }
        if (!cancelled) {
          setDashboard(result.payload);
          setDashboardError(null);
        }
      })
      .catch(() => {
        if (!cancelled)
          setDashboardError(
            "Não foi possível verificar seu plano. Você ainda pode salvar o rascunho."
          );
      })
      .finally(() => {
        if (!cancelled) setDashboardFetchDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [step, dashboardReload]);

  const boostOptions = dashboard?.boost_options ?? [];

  const title = useMemo(() => buildTitle(form), [form]);

  function handlePhotoFiles(next: File[]) {
    previews.forEach((u) => URL.revokeObjectURL(u));
    const urls = next.map((f) => URL.createObjectURL(f));
    setPhotos(next);
    setPreviews(urls);
    setCoverIndex(0);
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(previews[index]);
    const nextFiles = photos.filter((_, i) => i !== index);
    const nextPrev = previews.filter((_, i) => i !== index);
    setPhotos(nextFiles);
    setPreviews(nextPrev);
    setCoverIndex(0);
  }

  function setCover(index: number) {
    if (index === 0) {
      setCoverIndex(0);
      return;
    }
    const nextFiles = [...photos];
    const [f] = nextFiles.splice(index, 1);
    nextFiles.unshift(f);
    const nextPrev = [...previews];
    const [u] = nextPrev.splice(index, 1);
    nextPrev.unshift(u);
    setPhotos(nextFiles);
    setPreviews(nextPrev);
    setCoverIndex(0);
  }

  function goNext() {
    const err = validateStep(step, form, photos.length);
    if (err) {
      setSubmitState("error");
      setSubmitMessage(err);
      return;
    }
    setSubmitMessage("");
    setSubmitState("idle");
    if (step < STEP_COUNT - 1) {
      const next = step + 1;
      patch({ step: next });
      syncUrl(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goBack() {
    setSubmitMessage("");
    setSubmitState("idle");
    if (step > 0) {
      const next = step - 1;
      patch({ step: next });
      syncUrl(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSubmit() {
    const firstError = [0, 1, 2, 6].map((s) => validateStep(s, form, photos.length)).find(Boolean);
    const err = firstError ?? null;
    if (err) {
      setSubmitState("error");
      setSubmitMessage(err);
      return;
    }

    setSubmitState("submitting");
    setSubmitMessage("");

    try {
      const payload = new FormData();
      payload.append("brand", form.brandLabel);
      payload.append("model", form.modelLabel);
      payload.append("version", form.versionLabel);
      payload.append("yearModel", form.yearModel);
      payload.append("yearManufacture", form.yearManufacture);
      payload.append("mileage", form.mileage);
      payload.append("price", form.price);
      payload.append("fipeValue", form.fipeValue);
      payload.append("city", form.city);
      payload.append("state", form.state);
      payload.append("cityId", String(form.cityId));
      payload.append("fuel", form.fuel);
      payload.append("transmission", form.transmission);
      payload.append("bodyStyle", form.bodyStyle);
      payload.append("color", form.color);
      payload.append("plateFinal", form.plateFinal);
      payload.append("title", title);
      payload.append("description", form.description);
      payload.append("whatsapp", form.whatsapp);
      payload.append("phone", form.phone);
      payload.append("acceptTerms", form.acceptTerms ? "true" : "false");
      payload.append("armored", form.armored ? "true" : "false");
      payload.append("optionalFeatures", JSON.stringify(form.optionalIds));
      payload.append("conditionFlags", JSON.stringify(form.conditionIds));
      if (form.boostOptionId) {
        payload.append("boostOptionId", form.boostOptionId);
      }

      photos.forEach((file, index) => {
        payload.append("photos", file, file.name || `foto-${index + 1}.jpg`);
      });

      const response = await fetch("/api/painel/anuncios", {
        method: "POST",
        body: payload,
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const base =
          typeof result?.message === "string" && result.message.trim()
            ? result.message
            : "Não foi possível publicar o anúncio.";
        const withDetails =
          process.env.NODE_ENV === "development" && result?.details != null
            ? `${base} (${JSON.stringify(result.details)})`
            : base;
        throw new Error(withDetails);
      }

      try {
        window.localStorage.removeItem(WIZARD_STORAGE_KEY);
      } catch {
        // ignore
      }

      setSubmitState("success");
      setSubmitMessage(result?.message || "Anúncio enviado com sucesso.");

      const redirectTo =
        result?.result?.redirectTo || result?.result?.redirect_to || result?.result?.url || "";

      if (typeof redirectTo === "string" && redirectTo.trim()) {
        setTimeout(() => router.push(redirectTo), 800);
      }
    } catch (e) {
      setSubmitState("error");
      setSubmitMessage(e instanceof Error ? e.message : "Erro ao publicar.");
    }
  }

  const stepTitle = STEP_LABELS[step];
  const stepSubtitle: Record<number, string> = {
    0: "Selecione os dados estruturais do veículo para continuar.",
    1: "Defina preço e quilometragem com apoio da referência de mercado.",
    2: "Mostre o veículo com imagens de qualidade.",
    3: "Marque os equipamentos e opcionais.",
    4: "Informe condições e histórico relevantes.",
    5: "Escolha se deseja destacar o anúncio.",
    6: "Revise, descreva se quiser, informe contato e publique.",
  };

  const isAnunciarRoute = pathname.includes("/anunciar/novo");

  const breadcrumb = (
    <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[#6E748A]">
      {isAnunciarRoute ? (
        <>
          <Link href="/" className="transition hover:text-[#1F66E5]">
            Início
          </Link>
          <span>›</span>
          <Link href="/anunciar" className="transition hover:text-[#1F66E5]">
            Anunciar
          </Link>
          <span>›</span>
          <span>Novo anúncio</span>
        </>
      ) : (
        <>
          <Link href="/painel" className="transition hover:text-[#1F66E5]">
            Painel
          </Link>
          <span>›</span>
          <Link href="/painel/anuncios" className="transition hover:text-[#1F66E5]">
            Anúncios
          </Link>
          <span>›</span>
          <span>Novo anúncio</span>
        </>
      )}
    </nav>
  );

  const messageSlot = submitMessage ? (
    <div
      className={`mt-6 rounded-[18px] border px-4 py-3 text-sm leading-7 ${
        submitState === "success"
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {submitMessage}
    </div>
  ) : null;

  const footer = (
    <div className="mt-10 flex flex-col-reverse gap-3 border-t border-[#EEF2F7] pt-8 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={goBack}
        disabled={step === 0}
        className="inline-flex items-center justify-center rounded-[20px] border border-[#E5E9F2] bg-white px-6 py-3.5 text-base font-bold text-[#1D2440] transition hover:bg-[#F9FBFF] disabled:cursor-not-allowed disabled:opacity-40"
      >
        ← Voltar
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {step < STEP_COUNT - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center justify-center rounded-[20px] bg-[#2F67F6] px-8 py-3.5 text-base font-bold text-white shadow-[0_12px_30px_rgba(47,103,246,0.24)] transition hover:bg-[#1F66E5]"
          >
            Continuar →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitState === "submitting"}
            className="inline-flex items-center justify-center rounded-[20px] bg-[#2F67F6] px-8 py-3.5 text-base font-bold text-white shadow-[0_12px_30px_rgba(47,103,246,0.24)] transition hover:bg-[#1F66E5] disabled:opacity-60"
          >
            {submitState === "submitting" ? "Publicando..." : "Publicar anúncio"}
          </button>
        )}
      </div>
    </div>
  );

  if (!dashboardFetchDone) {
    return (
      <div className="min-h-[40vh] bg-[#F5F7FB] px-4 py-16 text-center text-sm text-[#6E748A]">
        Carregando fluxo de anúncio…
      </div>
    );
  }

  if (dashboard?.user?.type === "pending") {
    return (
      <div className="min-h-screen bg-[#F5F7FB] px-4 py-10">
        <div className="mx-auto max-w-7xl">
          <CompleteProfileGate
            onCompleted={() => {
              setDashboardFetchDone(false);
              setDashboardReload((n) => n + 1);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <SellWizardLayout
      currentStep={step}
      breadcrumb={breadcrumb}
      title={stepTitle}
      subtitle={stepSubtitle[step]}
      messageSlot={messageSlot}
      footer={footer}
    >
      {step === 0 ? <StepVehicle state={form} patch={patch} /> : null}
      {step === 1 ? <StepListingInfo state={form} patch={patch} /> : null}
      {step === 2 ? (
        <StepPhotos
          photos={photos}
          previews={previews}
          coverIndex={coverIndex}
          onFiles={handlePhotoFiles}
          onRemove={removePhoto}
          onSetCover={setCover}
        />
      ) : null}
      {step === 3 ? <StepOptionals state={form} patch={patch} /> : null}
      {step === 4 ? <StepConditions state={form} patch={patch} /> : null}
      {step === 5 ? <StepHighlight state={form} patch={patch} boostOptions={boostOptions} /> : null}
      {step === 6 ? (
        <StepFinalize
          state={form}
          patch={patch}
          dashboard={dashboard}
          dashboardError={dashboardError}
          sessionAccountType={sessionAccountType}
        />
      ) : null}
    </SellWizardLayout>
  );
}
