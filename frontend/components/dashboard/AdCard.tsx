"use client";

import Image from "next/image";
import Link from "next/link";
import type { DashboardAd } from "@/lib/dashboard-types";
import {
  AD_BADGE_STYLE,
  resolveAdBadgeVariant,
  type AdBadgeVariant,
} from "@/lib/dashboard/ad-status-badge";

type AdCardProps = {
  ad: DashboardAd;
  busy?: boolean;
  onToggleStatus: (ad: DashboardAd) => void;
  onDelete: (ad: DashboardAd) => void;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("pt-BR");
}

// Variant + estilo + função pura vivem em `frontend/lib/dashboard/ad-status-badge.ts`
// para que possam ser cobertos por testes sem DOM.
type BadgeVariant = AdBadgeVariant;
const BADGE_STYLE = AD_BADGE_STYLE;
const resolveBadgeVariant = resolveAdBadgeVariant;

function StatusBadge({ status, highlighted }: { status: string; highlighted: boolean }) {
  const variant = resolveBadgeVariant(status, highlighted);
  const cfg = BADGE_STYLE[variant];
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase text-white"
      style={{ background: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

export default function AdCard({ ad, busy = false, onToggleStatus, onDelete }: AdCardProps) {
  const isActive = ad.status === "active";
  const isPausedish = ad.status === "paused";
  // Fase 4.10A: `blocked` entra aqui. Sem isso o botão de status ficava
  // habilitado, rotulado "Aguardando", e o clique só produzia um 410 — o dono
  // via um botão que não fazia nada e não entendia por quê.
  const isBlocked = ad.status === "blocked";
  const isModeration = ad.status === "pending_review" || ad.status === "rejected" || isBlocked;
  const moderationMessage = isBlocked
    ? "Este anúncio foi temporariamente bloqueado pela administração do Carros na Cidade."
    : ad.status === "rejected"
      ? "Este anúncio foi rejeitado. Verifique os dados ou entre em contato com o suporte."
      : ad.status === "pending_review"
        ? "Este anúncio está em análise de segurança. Assim que aprovado, ele aparecerá no portal."
        : null;
  // Rótulo destinado ao dono, resolvido no backend. Só existe quando bloqueado.
  const blockedReasonMessage = isBlocked ? (ad.moderation?.blocked_message ?? null) : null;

  return (
    <article className="overflow-hidden rounded-2xl border border-[#dfe4ef] bg-white shadow-[0_3px_18px_rgba(10,20,40,0.07)]">
      <div className="relative h-[180px] w-full">
        <Image
          src={ad.image_url}
          alt={ad.title}
          fill
          className="object-cover"
          unoptimized={!ad.image_url.startsWith("/")}
        />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="line-clamp-2 text-lg font-extrabold leading-tight text-[#1d2538]">
            {ad.title}
          </h3>
          <StatusBadge status={ad.status} highlighted={ad.is_featured} />
        </div>

        <p className="text-2xl font-extrabold text-[#0e62d8]">{formatMoney(ad.price)}</p>

        {moderationMessage && (
          <div
            role="status"
            data-testid={isBlocked ? `ad-blocked-notice-${ad.id}` : undefined}
            className={
              isBlocked
                ? "space-y-1 rounded-xl border border-[#f4ced6] bg-[#fff4f6] p-3 text-sm text-[#8a2036]"
                : "rounded-xl border border-[#f4dca8] bg-[#fff8e6] p-3 text-sm text-[#7c5b00]"
            }
          >
            <p>{moderationMessage}</p>
            {blockedReasonMessage && (
              <p>
                <strong className="font-bold">Motivo:</strong> {blockedReasonMessage}
              </p>
            )}
            {isBlocked && <p>Entre em contato com o suporte caso precise de mais informações.</p>}
          </div>
        )}

        <div className="grid gap-2 rounded-xl border border-[#e2e7f1] bg-[#f8fafe] p-3 text-sm text-[#4f5b76] sm:grid-cols-2">
          <p>
            <strong className="font-bold text-[#1f2c47]">Status:</strong>{" "}
            {BADGE_STYLE[resolveBadgeVariant(ad.status, ad.is_featured)].label}
          </p>
          <p>
            <strong className="font-bold text-[#1f2c47]">Visualizacoes:</strong>{" "}
            {ad.views.toLocaleString("pt-BR")}
          </p>
          <p>
            <strong className="font-bold text-[#1f2c47]">Expira em:</strong>{" "}
            {formatDate(ad.expires_at)}
          </p>
          <p>
            <strong className="font-bold text-[#1f2c47]">Destaque ate:</strong>{" "}
            {formatDate(ad.featured_until)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/anunciar/editar/${ad.id}`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d7ddea] text-sm font-bold text-[#34405e] transition hover:bg-[#f2f5fb]"
          >
            Editar
          </Link>
          <button
            type="button"
            onClick={() => onToggleStatus(ad)}
            disabled={busy || isModeration}
            title={
              isBlocked
                ? "Anúncios bloqueados pela administração só podem ser reativados pelo suporte."
                : isModeration
                  ? "Anúncios em análise ou rejeitados não podem ser pausados/ativados."
                  : undefined
            }
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d7ddea] text-sm font-bold text-[#34405e] transition hover:bg-[#f2f5fb] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isActive ? "Pausar" : isPausedish ? "Ativar" : isBlocked ? "Bloqueado" : "Aguardando"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(ad)}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#f4ced6] bg-[#fff4f6] text-sm font-bold text-[#bf2848] transition hover:bg-[#ffecef] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Excluir
          </button>
          {isActive ? (
            <Link
              href={`/impulsionar/${ad.id}`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#f15a24_0%,#f1892f_100%)] text-sm font-bold text-white transition hover:brightness-110"
            >
              Impulsionar
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title="Apenas anúncios ativos podem receber destaque."
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#cbd5e1] text-sm font-bold text-white opacity-70"
            >
              Impulsionar
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
