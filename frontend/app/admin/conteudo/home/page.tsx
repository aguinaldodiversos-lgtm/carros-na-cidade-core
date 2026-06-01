"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, type HomeHeroDto, type HomeHeroPatch } from "@/lib/admin/api";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";

/**
 * Gestão da Home — Hero (Fase 4.1).
 *
 * Fluxo:
 *   1. load() → GET /api/admin/home/hero (snapshot atual).
 *   2. Form edita um draft local; upload de imagem é IMEDIATO (POST
 *      multipart) e devolve URL pública R2, mas só é GRAVADO no banco
 *      após o admin clicar "Publicar" e informar motivo.
 *   3. "Publicar" abre AdminActionDialog (reason obrigatório) → PATCH.
 *   4. Após PATCH ok, BFF dispara revalidate da Home (transparente).
 */

type SaveStatus = "idle" | "saving" | "saved" | "error";

function asString(v: string | null | undefined): string {
  return typeof v === "string" ? v : "";
}

export default function AdminHomePage() {
  const [hero, setHero] = useState<HomeHeroDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Draft local
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageDesktopUrl, setImageDesktopUrl] = useState<string | null>(null);
  const [imageMobileUrl, setImageMobileUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingVariant, setUploadingVariant] = useState<null | "desktop" | "mobile">(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const desktopInputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminApi.home.getHero();
      const data = res.data;
      setHero(data);
      setTitle(asString(data?.title));
      setSubtitle(asString(data?.subtitle));
      setCtaLabel(asString(data?.cta_label));
      setCtaUrl(asString(data?.cta_url));
      setImageAlt(asString(data?.image_alt));
      setImageDesktopUrl(data?.image_desktop_url ?? null);
      setImageMobileUrl(data?.image_mobile_url ?? null);
      setIsActive(data?.is_active ?? true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const dirty = useMemo(() => {
    if (!hero) return false;
    return (
      title !== asString(hero.title) ||
      subtitle !== asString(hero.subtitle) ||
      ctaLabel !== asString(hero.cta_label) ||
      ctaUrl !== asString(hero.cta_url) ||
      imageAlt !== asString(hero.image_alt) ||
      imageDesktopUrl !== (hero.image_desktop_url ?? null) ||
      imageMobileUrl !== (hero.image_mobile_url ?? null) ||
      isActive !== hero.is_active
    );
  }, [hero, title, subtitle, ctaLabel, ctaUrl, imageAlt, imageDesktopUrl, imageMobileUrl, isActive]);

  async function handleUpload(file: File, variant: "desktop" | "mobile") {
    setUploadError(null);
    setUploadingVariant(variant);
    try {
      const res = await adminApi.home.uploadImage(file, variant);
      if (variant === "desktop") setImageDesktopUrl(res.data.url);
      else setImageMobileUrl(res.data.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploadingVariant(null);
    }
  }

  async function handleConfirmPublish(reason: string) {
    if (!hero) return;
    setSaveStatus("saving");
    setSaveError(null);

    const patch: HomeHeroPatch = {};
    if (title !== asString(hero.title)) patch.title = title.trim() || null;
    if (subtitle !== asString(hero.subtitle)) patch.subtitle = subtitle.trim() || null;
    if (ctaLabel !== asString(hero.cta_label)) patch.cta_label = ctaLabel.trim() || null;
    if (ctaUrl !== asString(hero.cta_url)) patch.cta_url = ctaUrl.trim() || null;
    if (imageAlt !== asString(hero.image_alt)) patch.image_alt = imageAlt.trim() || null;
    if (imageDesktopUrl !== (hero.image_desktop_url ?? null)) {
      patch.image_desktop_url = imageDesktopUrl;
    }
    if (imageMobileUrl !== (hero.image_mobile_url ?? null)) {
      patch.image_mobile_url = imageMobileUrl;
    }
    if (isActive !== hero.is_active) patch.is_active = isActive;

    try {
      const res = await adminApi.home.updateHero(patch, reason);
      setHero(res.data);
      setSaveStatus("saved");
      setConfirmOpen(false);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Erro ao salvar");
      throw err; // mantém o modal aberto exibindo o erro
    }
  }

  if (loading) return <AdminLoadingState message="Carregando conteúdo da Home…" />;
  if (loadError) return <AdminErrorState message={loadError} onRetry={() => void load()} />;
  if (!hero) return <AdminErrorState message="Seção home_hero não encontrada" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold text-cnc-text">Conteúdo · Home — Hero</h1>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            hero.is_active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-cnc-line/40 text-cnc-muted"
          }`}
        >
          {hero.is_active ? "Ativo" : "Inativo"} · v{hero.version}
        </span>
        <span className="text-[11px] text-cnc-muted-soft">
          Última atualização: {new Date(hero.updated_at).toLocaleString("pt-BR")}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Form */}
        <form
          className="space-y-4 rounded-xl border border-cnc-line bg-white p-5 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirmOpen(true);
          }}
        >
          <Field
            id="title"
            label="Título"
            hint="Aparece como H1 no hero (até 140 caracteres)."
          >
            <input
              id="title"
              type="text"
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
            />
          </Field>

          <Field
            id="subtitle"
            label="Subtítulo"
            hint="Linha curta de copy abaixo do título (até 240 caracteres)."
          >
            <textarea
              id="subtitle"
              rows={2}
              maxLength={240}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cta_label" label="Texto do botão" hint="Máx. 40 caracteres.">
              <input
                id="cta_label"
                type="text"
                maxLength={40}
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
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
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
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
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
              className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <ImageField
              label="Imagem desktop (horizontal)"
              currentUrl={imageDesktopUrl}
              uploading={uploadingVariant === "desktop"}
              inputRef={desktopInputRef}
              onPick={() => desktopInputRef.current?.click()}
              onClear={() => setImageDesktopUrl(null)}
              onChange={(file) => void handleUpload(file, "desktop")}
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            />
            <ImageField
              label="Imagem mobile (opcional)"
              currentUrl={imageMobileUrl}
              uploading={uploadingVariant === "mobile"}
              inputRef={mobileInputRef}
              onPick={() => mobileInputRef.current?.click()}
              onClear={() => setImageMobileUrl(null)}
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
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-cnc-line text-primary"
            />
            <label htmlFor="is_active" className="text-xs font-semibold text-cnc-text">
              Banner ativo na Home pública
            </label>
            <span className="ml-auto text-[11px] text-cnc-muted-soft">
              Desativar mantém o conteúdo salvo mas faz a Home cair no fallback.
            </span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={!dirty || saveStatus === "saving"}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-strong transition-colors disabled:opacity-50"
            >
              {saveStatus === "saving" ? "Publicando…" : "Publicar"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={saveStatus === "saving" || uploadingVariant !== null}
              className="rounded-lg border border-cnc-line px-4 py-2 text-xs font-semibold text-cnc-muted hover:bg-cnc-bg transition-colors disabled:opacity-50"
            >
              Descartar alterações
            </button>
            {saveStatus === "saved" && (
              <span className="text-xs font-semibold text-emerald-700" role="status" aria-live="polite">
                Publicado com sucesso.
              </span>
            )}
            {saveStatus === "error" && saveError && (
              <span className="text-xs font-semibold text-cnc-danger" role="alert" aria-live="assertive">
                {saveError}
              </span>
            )}
          </div>
        </form>

        {/* Preview */}
        <aside className="space-y-3">
          <h2 className="text-sm font-bold text-cnc-text">Pré-visualização</h2>
          <HeroPreview
            title={title}
            subtitle={subtitle}
            ctaLabel={ctaLabel}
            ctaUrl={ctaUrl}
            imageDesktopUrl={imageDesktopUrl}
            imageAlt={imageAlt}
            isActive={isActive}
          />
          <p className="text-[11px] text-cnc-muted-soft leading-relaxed">
            A pré-visualização aproxima o resultado final. Após publicar, a Home
            pública pode levar até 60s para refletir o conteúdo novo.
          </p>
        </aside>
      </div>

      <AdminActionDialog
        open={confirmOpen}
        title="Publicar alterações no hero da Home"
        description="Esta ação será registrada em admin_actions com motivo obrigatório."
        confirmLabel="Publicar"
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
            e.target.value = ""; // permite re-upload do mesmo arquivo
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
              Banner desativado — fallback ativo
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
