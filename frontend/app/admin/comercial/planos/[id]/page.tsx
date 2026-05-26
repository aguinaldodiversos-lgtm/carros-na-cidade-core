"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  adminApi,
  type PlanRow,
  type PlanCreatePayload,
  type PlanPatchPayload,
  type PlanType,
  type PlanBillingModel,
} from "@/lib/admin/api";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";

const PLAN_TYPES: PlanType[] = ["CPF", "CNPJ"];
const BILLING_MODELS: PlanBillingModel[] = ["free", "one_time", "monthly"];

type Mode = "create" | "edit";

function commercialLayerLabel(priority_level: number) {
  if (priority_level >= 80) return "3 — Pro";
  if (priority_level >= 50) return "2 — Start";
  return "1 — Grátis (ou abaixo de Start)";
}

type Draft = {
  id: string;
  name: string;
  type: PlanType;
  price: number;
  ad_limit: number;
  priority_level: number;
  weight: number;
  billing_model: PlanBillingModel;
  validity_days: number | null;
  max_photos: number;
  monthly_highlight_credits: number;
  description: string;
  benefitsText: string;
  sort_order: number;
  is_active: boolean;
  is_featured_enabled: boolean;
  has_store_profile: boolean;
  recommended: boolean;
  video_360_enabled: boolean;
  public_visible: boolean;
};

const EMPTY_DRAFT: Draft = {
  id: "",
  name: "",
  type: "CNPJ",
  price: 0,
  ad_limit: 0,
  priority_level: 0,
  weight: 1,
  billing_model: "free",
  validity_days: null,
  max_photos: 8,
  monthly_highlight_credits: 0,
  description: "",
  benefitsText: "",
  sort_order: 50,
  is_active: false,
  is_featured_enabled: false,
  has_store_profile: false,
  recommended: false,
  video_360_enabled: false,
  public_visible: true,
};

function planToDraft(p: PlanRow): Draft {
  const benefits = Array.isArray(p.benefits)
    ? p.benefits
    : typeof p.benefits === "string"
      ? (() => {
          try {
            return JSON.parse(p.benefits);
          } catch {
            return [];
          }
        })()
      : [];
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    price: typeof p.price === "string" ? parseFloat(p.price) : p.price,
    ad_limit: p.ad_limit,
    priority_level: p.priority_level,
    weight: p.weight,
    billing_model: p.billing_model,
    validity_days: p.validity_days,
    max_photos: p.max_photos,
    monthly_highlight_credits: p.monthly_highlight_credits,
    description: p.description,
    benefitsText: (Array.isArray(benefits) ? benefits : []).join("\n"),
    sort_order: p.sort_order,
    is_active: p.is_active,
    is_featured_enabled: p.is_featured_enabled,
    has_store_profile: p.has_store_profile,
    recommended: p.recommended,
    video_360_enabled: p.video_360_enabled,
    public_visible: p.public_visible,
  };
}

export default function AdminPlanForm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mode: Mode = id === "novo" ? "create" : "edit";

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loaded, setLoaded] = useState(mode === "create");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (mode !== "edit") return;
    let cancelled = false;
    (async () => {
      try {
        const r = await adminApi.plans.get(id);
        if (cancelled) return;
        setDraft(planToDraft(r.data));
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Erro ao carregar plano");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, mode]);

  if (!loaded && !loadError) return <AdminLoadingState message="Carregando plano…" />;
  if (loadError) return <AdminErrorState message={loadError} />;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function parseBenefits(raw: string): string[] {
    return raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleSubmit() {
    if (busy) return;
    if (!reason.trim()) {
      setFlash({ kind: "error", text: "Motivo é obrigatório." });
      return;
    }
    setBusy(true);
    try {
      const benefits = parseBenefits(draft.benefitsText);
      if (mode === "create") {
        const payload: PlanCreatePayload = {
          id: draft.id,
          name: draft.name,
          type: draft.type,
          price: draft.price,
          ad_limit: draft.ad_limit,
          priority_level: draft.priority_level,
          weight: draft.weight,
          billing_model: draft.billing_model,
          validity_days: draft.validity_days,
          max_photos: draft.max_photos,
          monthly_highlight_credits: draft.monthly_highlight_credits,
          description: draft.description,
          benefits,
          sort_order: draft.sort_order,
          is_active: draft.is_active,
          is_featured_enabled: draft.is_featured_enabled,
          has_store_profile: draft.has_store_profile,
          recommended: draft.recommended,
          video_360_enabled: draft.video_360_enabled,
          public_visible: draft.public_visible,
        };
        await adminApi.plans.create(payload, reason.trim());
        router.push("/admin/comercial");
      } else {
        const patch: PlanPatchPayload = {
          name: draft.name,
          type: draft.type,
          price: draft.price,
          ad_limit: draft.ad_limit,
          priority_level: draft.priority_level,
          weight: draft.weight,
          billing_model: draft.billing_model,
          validity_days: draft.validity_days,
          max_photos: draft.max_photos,
          monthly_highlight_credits: draft.monthly_highlight_credits,
          description: draft.description,
          benefits,
          sort_order: draft.sort_order,
          is_active: draft.is_active,
          is_featured_enabled: draft.is_featured_enabled,
          has_store_profile: draft.has_store_profile,
          recommended: draft.recommended,
          video_360_enabled: draft.video_360_enabled,
          public_visible: draft.public_visible,
        };
        await adminApi.plans.update(id, patch, reason.trim());
        setFlash({ kind: "success", text: "Plano atualizado." });
        setReason("");
      }
    } catch (err) {
      setFlash({ kind: "error", text: err instanceof Error ? err.message : "Falha ao salvar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/comercial")}
          className="rounded-lg border border-cnc-line px-3 py-1.5 text-xs font-medium text-cnc-muted hover:bg-cnc-bg transition-colors"
        >
          ← Voltar
        </button>
        <h1 className="text-lg font-bold text-cnc-text">
          {mode === "create" ? "Criar plano" : `Editar plano: ${draft.id}`}
        </h1>
      </div>

      {flash && (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            flash.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-cnc-danger/40 bg-cnc-danger/10 text-cnc-danger"
          }`}
        >
          {flash.text}
        </div>
      )}

      <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-4">
        <h2 className="text-sm font-bold text-cnc-text">Identidade</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Slug (id único)" hint="Minúsculas, números, hífens. Imutável após criação.">
            <input
              type="text"
              value={draft.id}
              onChange={(e) => set("id", e.target.value)}
              disabled={mode === "edit"}
              placeholder="ex.: cnpj-store-pro"
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm disabled:bg-cnc-bg/60"
            />
          </Field>
          <Field label="Nome">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Tipo">
            <select
              value={draft.type}
              onChange={(e) => set("type", e.target.value as PlanType)}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            >
              {PLAN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modelo de cobrança">
            <select
              value={draft.billing_model}
              onChange={(e) => set("billing_model", e.target.value as PlanBillingModel)}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            >
              {BILLING_MODELS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descrição (max 1000)">
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Benefícios (um por linha, max 30)">
            <textarea
              value={draft.benefitsText}
              onChange={(e) => set("benefitsText", e.target.value)}
              rows={4}
              placeholder={"Ate 20 anuncios ativos\nAte 12 fotos por anuncio"}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-4">
        <h2 className="text-sm font-bold text-cnc-text">Preço e limites</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Preço (R$)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.price}
              onChange={(e) => set("price", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Limite de anúncios" hint="0 = sem limite explícito">
            <input
              type="number"
              min={0}
              max={100000}
              value={draft.ad_limit}
              onChange={(e) => set("ad_limit", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Max fotos por anúncio" hint="0..50">
            <input
              type="number"
              min={0}
              max={50}
              value={draft.max_photos}
              onChange={(e) => set("max_photos", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Validity days" hint="null = sem expiração">
            <input
              type="number"
              min={0}
              max={3650}
              value={draft.validity_days ?? ""}
              onChange={(e) =>
                set("validity_days", e.target.value === "" ? null : Number(e.target.value))
              }
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Créditos mensais de destaque" hint="0..100">
            <input
              type="number"
              min={0}
              max={100}
              value={draft.monthly_highlight_credits}
              onChange={(e) => set("monthly_highlight_credits", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Sort order" hint="Menor primeiro na UI">
            <input
              type="number"
              min={-10000}
              max={10000}
              value={draft.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-4">
        <h2 className="text-sm font-bold text-cnc-text">Ranking e exposição</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field
            label="Priority level (0..200)"
            hint={`Camada comercial efetiva: ${commercialLayerLabel(draft.priority_level)}`}
          >
            <input
              type="number"
              min={0}
              max={200}
              value={draft.priority_level}
              onChange={(e) => set("priority_level", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Weight (1..10)" hint="Peso do produto (UI/comprador)">
            <input
              type="number"
              min={1}
              max={10}
              value={draft.weight}
              onChange={(e) => set("weight", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
          ⚠️ <strong>priority_level</strong> é o que o ranking público usa em runtime (
          <code>commercialLayerExpr</code>): &gt;=80 vira camada 3 (Pro), &gt;=50 vira camada 2
          (Start), abaixo disso é camada 1. Mudar este valor move o plano de camada
          imediatamente em todas as buscas.
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Toggle label="Ativo" value={draft.is_active} onChange={(v) => set("is_active", v)} />
          <Toggle
            label="Visível ao público"
            value={draft.public_visible}
            onChange={(v) => set("public_visible", v)}
          />
          <Toggle
            label="Permite destaque"
            value={draft.is_featured_enabled}
            onChange={(v) => set("is_featured_enabled", v)}
          />
          <Toggle
            label="Perfil de loja"
            value={draft.has_store_profile}
            onChange={(v) => set("has_store_profile", v)}
          />
          <Toggle
            label="Recomendado"
            value={draft.recommended}
            onChange={(v) => set("recommended", v)}
          />
          <Toggle
            label="Vídeo 360"
            value={draft.video_360_enabled}
            onChange={(v) => set("video_360_enabled", v)}
          />
        </div>
      </section>

      <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-3">
        <h2 className="text-sm font-bold text-cnc-text">Confirmar</h2>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (obrigatório — registrado em admin_actions)"
          rows={3}
          maxLength={500}
          className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/comercial")}
            disabled={busy}
            className="rounded-lg border border-cnc-line px-4 py-2 text-xs font-semibold text-cnc-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !reason.trim() || !draft.id || !draft.name}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-strong disabled:opacity-50"
          >
            {busy ? "Salvando…" : mode === "create" ? "Criar plano" : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="block font-semibold text-cnc-text mb-1">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-cnc-muted-soft">{hint}</span>}
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-cnc-text">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-cnc-line"
      />
      <span>{label}</span>
    </label>
  );
}
