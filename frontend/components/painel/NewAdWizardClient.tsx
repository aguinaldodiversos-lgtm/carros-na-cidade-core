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
  draftPhotoUrls: [],
};

/**
 * Validação por passo no novo fluxo de 5 passos (mockup `pag1 anuncios.png`):
 *   0 — Veículo   (StepVehicle)
 *   1 — Preço     (StepListingInfo)
 *   2 — Fotos     (StepPhotos)
 *   3 — Descrição (StepOptionals + StepConditions — sem campos obrigatórios)
 *   4 — Revisão   (StepFinalize + StepHighlight — exige UF/cidade/termos)
 */
function validateStep(step: number, form: WizardFormState): string | null {
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
      if (form.draftPhotoUrls.length < 1) return "Adicione pelo menos uma foto.";
      return null;
    case 3:
      // Opcionais e condições não são obrigatórios.
      return null;
    case 4:
      if (!form.state.trim() || form.state.length !== 2) return "Selecione a UF.";
      if (form.cityId == null || !Number.isFinite(form.cityId)) {
        return "Selecione uma cidade válida da lista para continuar.";
      }
      if (!form.city.trim()) return "Selecione uma cidade válida da lista para continuar.";
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

function publishReasonRequiresProfileCompletion(reason: string | null | undefined) {
  const normalized = String(reason || "").toLowerCase();
  if (!normalized) return false;
  if (/(limite|plano|vaga|pagamento|checkout)/i.test(normalized)) return false;
  return /(cpf|cnpj|documento|cadastro|verificar|verificado)/i.test(normalized);
}

function dashboardRequiresProfileCompletion(dashboard: DashboardPayload | null) {
  if (!dashboard) return false;
  if (dashboard.user.type === "pending") return true;
  if (dashboard.user.document_verified === false) return true;
  return (
    dashboard.publish_eligibility?.allowed === false &&
    publishReasonRequiresProfileCompletion(dashboard.publish_eligibility.reason)
  );
}

export default function NewAdWizardClient({ initialType }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<WizardFormState>({ ...INITIAL_FORM, sellerType: initialType });
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [uploadingPreviews, setUploadingPreviews] = useState<string[]>([]);
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
        draftPhotoUrls: Array.isArray(parsed.draftPhotoUrls)
          ? parsed.draftPhotoUrls.filter(
              (u): u is string => typeof u === "string" && u.trim().length > 0
            )
          : [],
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
      uploadingPreviews.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [uploadingPreviews]);

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

  async function handleAddPhotos(files: File[]) {
    const maxNew = 10 - form.draftPhotoUrls.length - uploadingPreviews.length;
    const toUpload = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, maxNew));
    if (!toUpload.length) return;

    const newPreviews = toUpload.map((f) => URL.createObjectURL(f));
    setUploadingPreviews((prev) => [...prev, ...newPreviews]);
    setPhotoUploading(true);
    setPhotoUploadError("");

    const fd = new FormData();
    toUpload.forEach((f) => fd.append("photos", f));

    try {
      const res = await fetch("/api/painel/anuncios/upload-draft-photos", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        urls?: string[];
        message?: string;
      };
      if (!res.ok || !data.ok || !Array.isArray(data.urls)) {
        throw new Error(data.message || "Erro ao enviar fotos.");
      }
      patch({
        draftPhotoUrls: [
          ...form.draftPhotoUrls,
          ...data.urls.filter((u: string) => u.trim().length > 0),
        ],
      });
    } catch (e) {
      setPhotoUploadError(e instanceof Error ? e.message : "Erro ao enviar fotos.");
    } finally {
      newPreviews.forEach((u) => URL.revokeObjectURL(u));
      setUploadingPreviews((prev) => prev.filter((p) => !newPreviews.includes(p)));
      setPhotoUploading(false);
    }
  }

  function removePhoto(index: number) {
    patch({ draftPhotoUrls: form.draftPhotoUrls.filter((_, i) => i !== index) });
  }

  function setPhotoCover(index: number) {
    if (index === 0) return;
    const urls = [...form.draftPhotoUrls];
    const [url] = urls.splice(index, 1);
    urls.unshift(url);
    patch({ draftPhotoUrls: urls });
  }

  function goNext() {
    const err = validateStep(step, form);
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
    const firstError = [0, 1, 2, 3, 4].map((s) => validateStep(s, form)).find(Boolean);
    const err = firstError ?? null;
    if (err) {
      setSubmitState("error");
      setSubmitMessage(err);
      return;
    }

    if (form.draftPhotoUrls.length === 0) {
      setSubmitState("error");
      setSubmitMessage("Adicione pelo menos uma foto do veículo.");
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
      payload.append("acceptTerms", form.acceptTerms ? "true" : "false");
      payload.append("armored", form.armored ? "true" : "false");
      payload.append("optionalFeatures", JSON.stringify(form.optionalIds));
      payload.append("conditionFlags", JSON.stringify(form.conditionIds));
      if (form.boostOptionId) {
        payload.append("boostOptionId", form.boostOptionId);
      }

      payload.append("draftPhotoUrls", JSON.stringify(form.draftPhotoUrls));

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
      setSubmitMessage(result?.message || "Anúncio publicado com sucesso!");

      const backendRedirect =
        result?.result?.redirectTo || result?.result?.redirect_to || result?.result?.url || "";

      const defaultRedirect =
        sessionAccountType === "CNPJ"
          ? "/dashboard-loja/meus-anuncios"
          : "/dashboard/meus-anuncios";

      const redirectTo =
        typeof backendRedirect === "string" && backendRedirect.trim()
          ? backendRedirect
          : defaultRedirect;

      setTimeout(() => router.push(redirectTo), 1200);
    } catch (e) {
      setSubmitState("error");
      setSubmitMessage(e instanceof Error ? e.message : "Erro ao publicar.");
    }
  }

  const stepTitle = STEP_LABELS[step];
  const stepSubtitle: Record<number, string> = {
    0: "Informe os principais dados do seu carro.",
    1: "Defina preço e quilometragem com apoio da referência de mercado.",
    2: "Adicione fotos para destacar seu anúncio.",
    3: "Marque os opcionais e a condição do veículo, e descreva se quiser.",
    4: "Revise os dados, escolha como destacar e publique.",
  };

  const isAnunciarRoute = pathname.includes("/anunciar/novo");

  const breadcrumb = (
    <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-cnc-muted">
      {isAnunciarRoute ? (
        <>
          <Link href="/" className="transition hover:text-primary">
            Início
          </Link>
          <span>›</span>
          <Link href="/anunciar" className="transition hover:text-primary">
            Anunciar
          </Link>
          <span>›</span>
          <span>Novo anúncio</span>
        </>
      ) : (
        <>
          <Link href="/painel" className="transition hover:text-primary">
            Painel
          </Link>
          <span>›</span>
          <Link href="/painel/anuncios" className="transition hover:text-primary">
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
          ? "border-cnc-success/30 bg-cnc-success/5 text-cnc-success"
          : "border-cnc-danger/30 bg-cnc-danger/5 text-cnc-danger"
      }`}
    >
      {submitMessage}
    </div>
  ) : null;

  const footer = (
    <div className="mt-10 flex flex-col-reverse gap-3 border-t border-cnc-line pt-8 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={goBack}
        disabled={step === 0}
        data-testid="wizard-back-btn"
        className="inline-flex items-center justify-center rounded-2xl border border-cnc-line bg-cnc-surface px-6 py-3.5 text-base font-bold text-cnc-text-strong transition hover:bg-cnc-bg disabled:cursor-not-allowed disabled:opacity-40"
      >
        ← Voltar
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {step < STEP_COUNT - 1 ? (
          <button
            type="button"
            onClick={goNext}
            data-testid="wizard-next-btn"
            className="cnc-btn-primary px-8 py-3.5 text-base"
          >
            Continuar →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitState === "submitting"}
            data-testid="wizard-submit-btn"
            className="cnc-btn-primary px-8 py-3.5 text-base"
          >
            {submitState === "submitting" ? "Publicando..." : "Publicar anúncio"}
          </button>
        )}
      </div>
    </div>
  );

  if (!dashboardFetchDone) {
    return (
      <div className="min-h-[40vh] bg-cnc-bg px-4 py-16 text-center text-sm text-cnc-muted">
        Carregando fluxo de anúncio…
      </div>
    );
  }

  if (dashboardRequiresProfileCompletion(dashboard)) {
    return (
      <div className="min-h-screen bg-cnc-bg px-4 py-10">
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
      {/*
        Renderização agrupada — 5 passos visuais (mockup `pag1 anuncios.png`)
        sobre os 7 componentes existentes em WizardSteps.tsx. Mudar
        STEP_COUNT em types.ts mantém a navegação coerente; o agrupamento
        físico acontece aqui.
      */}
      {step === 0 ? <StepVehicle state={form} patch={patch} /> : null}
      {step === 1 ? <StepListingInfo state={form} patch={patch} /> : null}
      {step === 2 ? (
        <StepPhotos
          uploadedUrls={form.draftPhotoUrls}
          uploadingPreviews={uploadingPreviews}
          uploading={photoUploading}
          uploadError={photoUploadError}
          onAddFiles={handleAddPhotos}
          onRemove={removePhoto}
          onSetCover={setPhotoCover}
        />
      ) : null}
      {step === 3 ? (
        <div className="space-y-10">
          <StepOptionals state={form} patch={patch} />
          <StepConditions state={form} patch={patch} />
        </div>
      ) : null}
      {step === 4 ? (
        <div className="space-y-10">
          <StepFinalize
            state={form}
            patch={patch}
            dashboard={dashboard}
            dashboardError={dashboardError}
            sessionAccountType={sessionAccountType}
          />
          <StepHighlight state={form} patch={patch} boostOptions={boostOptions} />
        </div>
      ) : null}
    </SellWizardLayout>
  );
}
