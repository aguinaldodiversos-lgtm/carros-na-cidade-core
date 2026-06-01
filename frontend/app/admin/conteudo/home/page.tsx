"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adminApi,
  type HomeHeroBannerDto,
  type HomeHeroPatch,
} from "@/lib/admin/api";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";

/**
 * Gestão da Home — Carrossel de 3 banners (Fase 4.1.1).
 *
 * Modelo de estado
 * ----------------
 * Para cada banner (1, 2, 3) mantemos:
 *   - server: snapshot que voltou do backend (referência de "limpo")
 *   - draft: o que o admin está editando
 *   - dirty: derivado (draft != server)
 *
 * EDIÇÃO ISOLADA: editar Banner 1 muda apenas drafts[1], nunca drafts[2/3].
 * Salvar Banner 1 só chama PATCH /home/hero/1 — backend garante o resto.
 *
 * Trocar de aba com alterações pendentes NÃO descarta o draft — ele
 * permanece em memória. Um aviso visual mostra que há rascunho em outras
 * abas. Recarregar a página descarta drafts.
 */

type Position = 1 | 2 | 3;
const POSITIONS: readonly Position[] = [1, 2, 3];

type Draft = {
  title: string;
  subtitle: string;
  cta_label: string;
  cta_url: string;
  image_alt: string;
  image_desktop_url: string | null;
  image_mobile_url: string | null;
  is_active: boolean;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

function asString(v: string | null | undefined): string {
  return typeof v === "string" ? v : "";
}

function toDraft(b: HomeHeroBannerDto): Draft {
  return {
    title: asString(b.title),
    subtitle: asString(b.subtitle),
    cta_label: asString(b.cta_label),
    cta_url: asString(b.cta_url),
    image_alt: asString(b.image_alt),
    image_desktop_url: b.image_desktop_url ?? null,
    image_mobile_url: b.image_mobile_url ?? null,
    is_active: b.is_active,
  };
}

function isDirty(server: HomeHeroBannerDto | undefined, draft: Draft | undefined): boolean {
  if (!server || !draft) return false;
  return (
    draft.title !== asString(server.title) ||
    draft.subtitle !== asString(server.subtitle) ||
    draft.cta_label !== asString(server.cta_label) ||
    draft.cta_url !== asString(server.cta_url) ||
    draft.image_alt !== asString(server.image_alt) ||
    draft.image_desktop_url !== (server.image_desktop_url ?? null) ||
    draft.image_mobile_url !== (server.image_mobile_url ?? null) ||
    draft.is_active !== server.is_active
  );
}

function buildPatch(server: HomeHeroBannerDto, draft: Draft): HomeHeroPatch {
  const patch: HomeHeroPatch = {};
  if (draft.title !== asString(server.title)) patch.title = draft.title.trim() || null;
  if (draft.subtitle !== asString(server.subtitle))
    patch.subtitle = draft.subtitle.trim() || null;
  if (draft.cta_label !== asString(server.cta_label))
    patch.cta_label = draft.cta_label.trim() || null;
  if (draft.cta_url !== asString(server.cta_url))
    patch.cta_url = draft.cta_url.trim() || null;
  if (draft.image_alt !== asString(server.image_alt))
    patch.image_alt = draft.image_alt.trim() || null;
  if (draft.image_desktop_url !== (server.image_desktop_url ?? null))
    patch.image_desktop_url = draft.image_desktop_url;
  if (draft.image_mobile_url !== (server.image_mobile_url ?? null))
    patch.image_mobile_url = draft.image_mobile_url;
  if (draft.is_active !== server.is_active) patch.is_active = draft.is_active;
  return patch;
}

export default function AdminHomePage() {
  const [servers, setServers] = useState<Record<Position, HomeHeroBannerDto | undefined>>({
    1: undefined,
    2: undefined,
    3: undefined,
  });
  const [drafts, setDrafts] = useState<Record<Position, Draft | undefined>>({
    1: undefined,
    2: undefined,
    3: undefined,
  });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<Position>(1);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingVariant, setUploadingVariant] = useState<null | "desktop" | "mobile">(null);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const desktopInputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminApi.home.listHero();
      const list = res.data.banners || [];
      const nextServers: Record<Position, HomeHeroBannerDto | undefined> = {
        1: undefined,
        2: undefined,
        3: undefined,
      };
      const nextDrafts: Record<Position, Draft | undefined> = {
        1: undefined,
        2: undefined,
        3: undefined,
      };
      for (const b of list) {
        if (b.position === 1 || b.position === 2 || b.position === 3) {
          nextServers[b.position] = b;
          nextDrafts[b.position] = toDraft(b);
        }
      }
      setServers(nextServers);
      setDrafts(nextDrafts);
      setSaveStatus("idle");
      setSaveError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Calculamos dirty por banner para mostrar marcador nas tabs.
  const dirtyByPosition = useMemo(() => {
    const out: Record<Position, boolean> = { 1: false, 2: false, 3: false };
    for (const p of POSITIONS) out[p] = isDirty(servers[p], drafts[p]);
    return out;
  }, [servers, drafts]);

  const activeServer = servers[active];
  const activeDraft = drafts[active];
  const dirty = dirtyByPosition[active];

  const activeCountAfterSave = useMemo(() => {
    // Quantos banners ficariam ativos se este draft virasse o estado final.
    // Usa drafts dos outros e draft do ativo.
    return POSITIONS.filter((p) => {
      const d = drafts[p];
      return d ? d.is_active : Boolean(servers[p]?.is_active);
    }).length;
  }, [drafts, servers]);

  function patchActiveDraft(partial: Partial<Draft>) {
    setDrafts((prev) => {
      const cur = prev[active];
      if (!cur) return prev;
      return { ...prev, [active]: { ...cur, ...partial } };
    });
    if (saveStatus !== "idle") setSaveStatus("idle");
    if (saveError) setSaveError(null);
  }

  async function handleUpload(file: File, variant: "desktop" | "mobile") {
    setUploadError(null);
    setUploadingVariant(variant);
    try {
      const res = await adminApi.home.uploadImage(active, file, variant);
      if (variant === "desktop") patchActiveDraft({ image_desktop_url: res.data.url });
      else patchActiveDraft({ image_mobile_url: res.data.url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploadingVariant(null);
    }
  }

  function clearImage(variant: "desktop" | "mobile") {
    if (variant === "desktop") patchActiveDraft({ image_desktop_url: null });
    else patchActiveDraft({ image_mobile_url: null });
  }

  function discardActive() {
    if (!activeServer) return;
    setDrafts((prev) => ({ ...prev, [active]: toDraft(activeServer) }));
    setSaveStatus("idle");
    setSaveError(null);
  }

  async function handleConfirmPublish(reason: string) {
    if (!activeServer || !activeDraft) return;
    const patch = buildPatch(activeServer, activeDraft);
    if (Object.keys(patch).length === 0) {
      setConfirmOpen(false);
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const res = await adminApi.home.updateBanner(active, patch, reason);
      setServers((prev) => ({ ...prev, [active]: res.data }));
      setDrafts((prev) => ({ ...prev, [active]: toDraft(res.data) }));
      setSaveStatus("saved");
      setConfirmOpen(false);
    } catch (err) {
      setSaveStatus("error");
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      setSaveError(msg);
      throw err; // mantém o modal aberto exibindo o erro
    }
  }

  if (loading) return <AdminLoadingState message="Carregando carrossel da Home…" />;
  if (loadError) return <AdminErrorState message={loadError} onRetry={() => void load()} />;
  if (!activeServer || !activeDraft)
    return <AdminErrorState message="Banners do hero não inicializados — rode a migration 034." />;

  const willDeactivateLastActive =
    activeServer.is_active && !activeDraft.is_active && activeCountAfterSave === 0;

  /**
   * Validação client-side espelhando regras do backend — evita um round-trip
   * que vai falhar com 400. NÃO substitui a validação do backend (autoridade
   * final); só antecipa a mensagem para o admin.
   *
   * Regras:
   *   1. Se há imagem desktop OU mobile no draft, image_alt é obrigatório.
   *   2. Para ativar um banner, precisa ter pelo menos título ou uma imagem.
   *   3. CTA url precisa começar com '/' (não '//') ou ser http(s).
   */
  const clientValidationError: string | null = (() => {
    const hasImage = Boolean(activeDraft.image_desktop_url || activeDraft.image_mobile_url);
    if (hasImage && !activeDraft.image_alt.trim()) {
      return "Informe o texto alternativo (alt) — obrigatório quando há imagem.";
    }
    if (activeDraft.is_active) {
      const hasAny = activeDraft.title.trim() || hasImage;
      if (!hasAny) {
        return "Para ativar este banner, defina ao menos um título ou uma imagem.";
      }
    }
    const cta = activeDraft.cta_url.trim();
    if (cta) {
      if (cta.startsWith("//")) return "Link do botão inválido — use /caminho ou https://...";
      if (!cta.startsWith("/")) {
        try {
          const u = new URL(cta);
          if (u.protocol !== "http:" && u.protocol !== "https:") {
            return "Link do botão deve ser /caminho ou https://...";
          }
        } catch {
          return "Link do botão deve ser /caminho ou https://...";
        }
      }
    }
    return null;
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold text-cnc-text">Conteúdo · Home — Carrossel</h1>
        <span className="rounded-full bg-cnc-line/40 px-2 py-0.5 text-[11px] font-semibold text-cnc-muted">
          {activeCountAfterSave} ativo{activeCountAfterSave === 1 ? "" : "s"} de 3
        </span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Banners">
        {POSITIONS.map((p) => {
          const s = servers[p];
          const d = dirtyByPosition[p];
          const isCur = p === active;
          return (
            <button
              key={p}
              role="tab"
              aria-selected={isCur}
              type="button"
              onClick={() => setActive(p)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                isCur
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-cnc-line bg-white text-cnc-text hover:bg-cnc-bg"
              }`}
            >
              Banner {p}
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  s?.is_active
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-cnc-line/40 text-cnc-muted"
                }`}
              >
                {s?.is_active ? "Ativo" : "Inativo"}
              </span>
              {d && (
                <span
                  className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"
                  title="Alterações pendentes"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <form
          className="space-y-4 rounded-xl border border-cnc-line bg-white p-5 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirmOpen(true);
          }}
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-cnc-muted-soft">
            <span>
              <strong>v{activeServer.version}</strong> · atualizado em{" "}
              {new Date(activeServer.updated_at).toLocaleString("pt-BR")}
            </span>
            {activeServer.image_desktop_url && (
              <span className="rounded-full bg-cnc-line/40 px-2 py-0.5">desktop ✓</span>
            )}
            {activeServer.image_mobile_url && (
              <span className="rounded-full bg-cnc-line/40 px-2 py-0.5">mobile ✓</span>
            )}
          </div>

          <Field id="title" label="Título" hint="Aparece como H1 (até 140 caracteres).">
            <input
              id="title"
              type="text"
              maxLength={140}
              value={activeDraft.title}
              onChange={(e) => patchActiveDraft({ title: e.target.value })}
              className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
            />
          </Field>

          <Field id="subtitle" label="Subtítulo" hint="Linha curta (até 240 caracteres).">
            <textarea
              id="subtitle"
              rows={2}
              maxLength={240}
              value={activeDraft.subtitle}
              onChange={(e) => patchActiveDraft({ subtitle: e.target.value })}
              className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cta_label" label="Texto do botão" hint="Máx. 40 caracteres.">
              <input
                id="cta_label"
                type="text"
                maxLength={40}
                value={activeDraft.cta_label}
                onChange={(e) => patchActiveDraft({ cta_label: e.target.value })}
                className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
              />
            </Field>
            <Field
              id="cta_url"
              label="Link do botão"
              hint="Caminho interno (/comprar) ou URL http/https."
            >
              <input
                id="cta_url"
                type="text"
                maxLength={500}
                value={activeDraft.cta_url}
                onChange={(e) => patchActiveDraft({ cta_url: e.target.value })}
                placeholder="/comprar"
                className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
              />
            </Field>
          </div>

          <Field
            id="image_alt"
            label="Texto alternativo da imagem (alt)"
            hint="Obrigatório quando há imagem desktop configurada."
          >
            <input
              id="image_alt"
              type="text"
              maxLength={240}
              value={activeDraft.image_alt}
              onChange={(e) => patchActiveDraft({ image_alt: e.target.value })}
              className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <ImageField
              label="Imagem desktop (horizontal)"
              currentUrl={activeDraft.image_desktop_url}
              uploading={uploadingVariant === "desktop"}
              inputRef={desktopInputRef}
              onPick={() => desktopInputRef.current?.click()}
              onClear={() => clearImage("desktop")}
              onChange={(file) => void handleUpload(file, "desktop")}
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            />
            <ImageField
              label="Imagem mobile (opcional)"
              currentUrl={activeDraft.image_mobile_url}
              uploading={uploadingVariant === "mobile"}
              inputRef={mobileInputRef}
              onPick={() => mobileInputRef.current?.click()}
              onClear={() => clearImage("mobile")}
              onChange={(file) => void handleUpload(file, "mobile")}
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            />
          </div>

          {uploadError && (
            <p
              role="alert"
              className="rounded-md border border-cnc-danger/40 bg-cnc-danger/10 px-3 py-2 text-xs font-medium text-cnc-danger"
            >
              {uploadError}
            </p>
          )}

          <div className="flex items-center gap-3 rounded-lg border border-cnc-line/60 bg-cnc-bg/40 px-3 py-2.5">
            <input
              id="is_active"
              type="checkbox"
              checked={activeDraft.is_active}
              onChange={(e) => patchActiveDraft({ is_active: e.target.checked })}
              className="h-4 w-4 rounded border-cnc-line text-primary"
            />
            <label htmlFor="is_active" className="text-xs font-semibold text-cnc-text">
              Banner {active} ativo no carrossel
            </label>
            <span className="ml-auto text-[11px] text-cnc-muted-soft">
              Desativar mantém o conteúdo salvo, mas o banner sai do carrossel público.
            </span>
          </div>

          {willDeactivateLastActive && (
            <p
              role="alert"
              className="rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
            >
              Atenção: este é o último banner ativo. Ao publicar, a Home pública cairá no
              fallback hardcoded.
            </p>
          )}

          {clientValidationError && (
            <p
              role="alert"
              className="rounded-md border border-cnc-danger/40 bg-cnc-danger/10 px-3 py-2 text-xs font-medium text-cnc-danger"
            >
              {clientValidationError}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={!dirty || saveStatus === "saving" || Boolean(clientValidationError)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-strong transition-colors disabled:opacity-50"
            >
              {saveStatus === "saving" ? "Publicando…" : `Publicar Banner ${active}`}
            </button>
            <button
              type="button"
              onClick={discardActive}
              disabled={!dirty || saveStatus === "saving" || uploadingVariant !== null}
              className="rounded-lg border border-cnc-line px-4 py-2 text-xs font-semibold text-cnc-muted hover:bg-cnc-bg transition-colors disabled:opacity-50"
            >
              Descartar alterações
            </button>
            {saveStatus === "saved" && (
              <span
                className="text-xs font-semibold text-emerald-700"
                role="status"
                aria-live="polite"
              >
                Banner {active} publicado.
              </span>
            )}
            {saveStatus === "error" && saveError && (
              <span
                className="text-xs font-semibold text-cnc-danger"
                role="alert"
                aria-live="assertive"
              >
                {saveError}
              </span>
            )}
          </div>
        </form>

        {/* Preview */}
        <aside className="space-y-3">
          <h2 className="text-sm font-bold text-cnc-text">Pré-visualização · Banner {active}</h2>
          <HeroPreview
            title={activeDraft.title}
            subtitle={activeDraft.subtitle}
            ctaLabel={activeDraft.cta_label}
            ctaUrl={activeDraft.cta_url}
            imageDesktopUrl={activeDraft.image_desktop_url}
            imageAlt={activeDraft.image_alt}
            isActive={activeDraft.is_active}
          />
          <p className="text-[11px] text-cnc-muted-soft leading-relaxed">
            Apenas o banner editado é enviado. Os outros banners ficam intactos até serem
            editados em suas próprias abas. Pode levar até 60s para refletir na Home.
          </p>
        </aside>
      </div>

      <AdminActionDialog
        open={confirmOpen}
        title={`Publicar Banner ${active}`}
        description="A alteração será registrada em admin_actions com motivo obrigatório. Os demais banners não serão alterados."
        confirmLabel={`Publicar Banner ${active}`}
        confirmColor="primary"
        showReason
        requireReason
        reasonPlaceholder="Motivo (ex.: campanha sazonal, ajuste de copy)"
        onConfirm={handleConfirmPublish}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── Subcomponentes ──

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-cnc-text mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-cnc-muted-soft">{hint}</p>}
    </div>
  );
}

function ImageField({
  label,
  currentUrl,
  uploading,
  inputRef,
  onPick,
  onClear,
  onChange,
  accept,
}: {
  label: string;
  currentUrl: string | null;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: () => void;
  onClear: () => void;
  onChange: (file: File) => void;
  accept: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-cnc-text mb-1">{label}</label>
      <div className="rounded-lg border border-dashed border-cnc-line bg-cnc-bg/40 p-3">
        {currentUrl ? (
          <div className="space-y-2">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md bg-cnc-line/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPick}
                disabled={uploading}
                className="rounded-md border border-cnc-line bg-white px-2.5 py-1 text-[11px] font-semibold text-cnc-text hover:bg-cnc-bg disabled:opacity-50"
              >
                {uploading ? "Enviando…" : "Trocar"}
              </button>
              <button
                type="button"
                onClick={onClear}
                disabled={uploading}
                className="rounded-md border border-cnc-line bg-white px-2.5 py-1 text-[11px] font-semibold text-cnc-danger hover:bg-cnc-bg disabled:opacity-50"
              >
                Remover
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPick}
            disabled={uploading}
            className="w-full rounded-md border border-cnc-line bg-white px-3 py-6 text-xs font-semibold text-cnc-muted hover:bg-cnc-bg disabled:opacity-50"
          >
            {uploading ? "Enviando…" : "Selecionar imagem"}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onChange(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function HeroPreview({
  title,
  subtitle,
  ctaLabel,
  ctaUrl,
  imageDesktopUrl,
  imageAlt,
  isActive,
}: {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
  imageDesktopUrl: string | null;
  imageAlt: string;
  isActive: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#0b1f3a] shadow-card">
      {imageDesktopUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageDesktopUrl}
          alt={imageAlt || ""}
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b1f3a] to-[#1a3a6a]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b1f3a] via-[#0b1f3a]/70 to-transparent" />
      <div className="relative min-h-[180px] p-5 sm:min-h-[220px]">
        <div className="max-w-xs">
          <h3 className="text-base font-extrabold leading-tight text-white sm:text-lg">
            {title || <span className="text-white/40">Título…</span>}
          </h3>
          {subtitle && <p className="mt-2 text-xs leading-snug text-white/85">{subtitle}</p>}
          {ctaLabel && ctaUrl && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-white">
              {ctaLabel} →
            </span>
          )}
          {!isActive && (
            <p className="mt-3 inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">
              Banner desativado — fora do carrossel
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
