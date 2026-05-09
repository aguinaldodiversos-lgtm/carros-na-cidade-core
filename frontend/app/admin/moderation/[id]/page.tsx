"use client";

/**
 * Detalhe de moderação — exibe ad + signals + events e expõe as três
 * ações terminais (approve / reject / request-correction). Cada ação é
 * server-side via POST /api/admin/moderation/ads/:id/:action.
 *
 * Visual segue padrão admin existente. Sem layout novo, sem componente
 * novo de chrome. Erros do backend (status incorreto, motivo vazio, etc.)
 * são propagados via `adminFetch`.
 */

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import {
  adminApi,
  type ModerationAdDetail,
  type ModerationRiskReason,
} from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";

function fmtMoney(n: unknown) {
  const v = typeof n === "string" ? Number(n) : (n as number | null | undefined);
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPercent(n: unknown) {
  const v = typeof n === "string" ? Number(n) : (n as number | null | undefined);
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

const SEVERITY: Record<string, { bg: string; fg: string }> = {
  low: { bg: "#e7f3ee", fg: "#15643c" },
  medium: { bg: "#fff5d6", fg: "#7a5c00" },
  high: { bg: "#fde4ce", fg: "#9a3412" },
  critical: { bg: "#fde2e1", fg: "#991b1b" },
};

function parseReasons(raw: unknown): ModerationRiskReason[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ModerationRiskReason[];
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? (p as ModerationRiskReason[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw))
    return raw.filter((u): u is string => typeof u === "string");
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p))
        return p.filter((u): u is string => typeof u === "string");
    } catch {
      /* noop */
    }
  }
  return [];
}

export default function ModerationDetailPage() {
  const params = useParams<{ id: string }>();
  const adId = String(params?.id ?? "");
  const router = useRouter();

  const detail = useAdminFetch<{ ok: boolean; data: ModerationAdDetail }>(
    () => adminApi.moderation.detail(adId),
    [adId]
  );

  const [action, setAction] = useState<"reject" | "request" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (detail.loading) return <AdminLoadingState />;
  if (detail.error)
    return <AdminErrorState message={String(detail.error)} />;
  if (!detail.data) return null;

  const { ad, signals, events } = detail.data.data;
  const reasons = parseReasons(ad.risk_reasons);
  const images = parseImages(ad.images);

  async function doApprove() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await adminApi.moderation.approve(adId);
      router.push("/admin/moderation");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function doSubmitWithReason(kind: "reject" | "request") {
    if (!reason.trim()) {
      setErrorMsg("O motivo é obrigatório.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (kind === "reject") {
        await adminApi.moderation.reject(adId, reason.trim());
      } else {
        await adminApi.moderation.requestCorrection(adId, reason.trim());
      }
      router.push("/admin/moderation");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-6">
      <nav className="mb-4 text-sm text-[#5e6b85]">
        <Link href="/admin/moderation" className="hover:text-[#1a56db]">
          ← Voltar para a fila
        </Link>
      </nav>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1f2c47]">{ad.title}</h1>
          <p className="mt-1 text-sm text-[#5e6b85]">
            ID #{ad.id} · {ad.brand} {ad.model} {ad.year} · {ad.city ?? "—"}/
            {ad.state ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold uppercase"
            style={{
              background: SEVERITY[ad.risk_level]?.bg ?? "#eef0f4",
              color: SEVERITY[ad.risk_level]?.fg ?? "#1f2c47",
            }}
          >
            {ad.risk_level} · score {ad.risk_score}
          </span>
          <span className="rounded-full bg-[#fff5d6] px-2.5 py-1 text-xs font-bold uppercase text-[#7a5c00]">
            {ad.status}
          </span>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {/* Fotos */}
          <section className="rounded-xl border border-[#e2e7f1] bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#5e6b85]">
              Fotos ({images.length})
            </h2>
            {images.length === 0 ? (
              <p className="text-sm text-[#5e6b85]">Nenhuma foto vinculada.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.slice(0, 12).map((src, idx) => (
                  <div
                    key={`${src}-${idx}`}
                    className="relative aspect-[4/3] overflow-hidden rounded-md bg-[#f4f6fc]"
                  >
                    <Image
                      src={src}
                      alt={`Foto ${idx + 1}`}
                      fill
                      className="object-cover"
                      unoptimized={!src.startsWith("/")}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Dados do veículo */}
          <section className="rounded-xl border border-[#e2e7f1] bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#5e6b85]">
              Dados do veículo
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-[#5e6b85]">Marca</dt>
              <dd className="font-semibold text-[#1f2c47]">{ad.brand}</dd>
              <dt className="text-[#5e6b85]">Modelo</dt>
              <dd className="font-semibold text-[#1f2c47]">{ad.model}</dd>
              <dt className="text-[#5e6b85]">Ano</dt>
              <dd className="font-semibold text-[#1f2c47]">{ad.year}</dd>
              <dt className="text-[#5e6b85]">Quilometragem</dt>
              <dd className="font-semibold text-[#1f2c47]">
                {ad.mileage != null ? Number(ad.mileage).toLocaleString("pt-BR") : "—"} km
              </dd>
              <dt className="text-[#5e6b85]">Preço anunciado</dt>
              <dd className="font-bold text-[#0e62d8]">{fmtMoney(ad.price)}</dd>
              <dt className="text-[#5e6b85]">FIPE de referência</dt>
              <dd className="font-semibold text-[#1f2c47]">
                {fmtMoney(ad.fipe_reference_value)}
              </dd>
              <dt className="text-[#5e6b85]">Diferença vs FIPE</dt>
              <dd className="font-semibold text-[#9a3412]">
                {fmtPercent(ad.fipe_diff_percent)}
              </dd>
            </dl>

            {ad.description && (
              <div className="mt-4 rounded-md bg-[#f8fafe] p-3 text-sm text-[#34405e]">
                <strong className="block text-[#1f2c47]">Descrição:</strong>
                <p className="mt-1 whitespace-pre-line">{ad.description}</p>
              </div>
            )}
          </section>

          {/* Sinais de risco */}
          <section className="rounded-xl border border-[#e2e7f1] bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#5e6b85]">
              Sinais de risco
            </h2>
            {reasons.length === 0 && signals.length === 0 ? (
              <p className="text-sm text-[#5e6b85]">Nenhum sinal registrado.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(reasons.length > 0 ? reasons : signals.map((s) => ({
                  code: s.signal_code,
                  message: s.message,
                  severity: s.severity,
                  scoreDelta: s.score_delta,
                  metadata: s.metadata,
                }))).map((r, idx) => (
                  <li
                    key={`${r.code}-${idx}`}
                    className="rounded-md border border-[#e2e7f1] bg-[#f8fafe] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase"
                          style={{
                            background: SEVERITY[r.severity]?.bg ?? "#eef0f4",
                            color: SEVERITY[r.severity]?.fg ?? "#1f2c47",
                          }}
                        >
                          {r.severity}
                        </span>
                        <code className="text-xs text-[#1f2c47]">{r.code}</code>
                      </div>
                      <span className="text-xs text-[#5e6b85]">
                        +{r.scoreDelta ?? 0}
                      </span>
                    </div>
                    {r.message && (
                      <p className="mt-1 text-[13px] text-[#34405e]">
                        {r.message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Histórico */}
          <section className="rounded-xl border border-[#e2e7f1] bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#5e6b85]">
              Histórico de eventos
            </h2>
            {events.length === 0 ? (
              <p className="text-sm text-[#5e6b85]">Sem eventos registrados.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#eff2f7] pb-2 last:border-b-0 last:pb-0"
                  >
                    <div>
                      <code className="text-xs text-[#1f2c47]">{ev.event_type}</code>
                      {ev.from_status && ev.to_status && (
                        <span className="ml-2 text-[12px] text-[#5e6b85]">
                          {ev.from_status} → {ev.to_status}
                        </span>
                      )}
                      {ev.reason && (
                        <p className="mt-0.5 text-[12px] text-[#34405e]">
                          {ev.reason}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-[#5e6b85]">
                      {fmtDateTime(ev.created_at)} · {ev.actor_role ?? "system"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {/* Anunciante */}
          <section className="rounded-xl border border-[#e2e7f1] bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#5e6b85]">
              Anunciante
            </h2>
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="text-[#5e6b85]">Nome</dt>
                <dd className="font-semibold text-[#1f2c47]">
                  {ad.advertiser_name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[#5e6b85]">Empresa</dt>
                <dd className="text-[#1f2c47]">
                  {ad.advertiser_company ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[#5e6b85]">User ID</dt>
                <dd className="font-mono text-xs text-[#1f2c47]">
                  {ad.advertiser_user_id ?? "—"}
                </dd>
              </div>
            </dl>
          </section>

          {/* Ações */}
          <section className="rounded-xl border border-[#e2e7f1] bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#5e6b85]">
              Ação de moderação
            </h2>
            {errorMsg && (
              <p className="mb-3 rounded-md border border-[#f4ced6] bg-[#fff4f6] p-2 text-[13px] text-[#bf2848]">
                {errorMsg}
              </p>
            )}

            {action === null && (
              <div className="space-y-2">
                <button
                  type="button"
                  data-testid="moderation-approve"
                  onClick={doApprove}
                  disabled={submitting}
                  className="w-full rounded-md bg-[#198754] px-3 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  Aprovar e tornar ativo
                </button>
                <button
                  type="button"
                  data-testid="moderation-reject-open"
                  onClick={() => {
                    setAction("reject");
                    setReason("");
                  }}
                  className="w-full rounded-md border border-[#bf2848] px-3 py-2 text-sm font-bold text-[#bf2848] transition hover:bg-[#fff4f6]"
                >
                  Rejeitar
                </button>
                <button
                  type="button"
                  data-testid="moderation-request-open"
                  onClick={() => {
                    setAction("request");
                    setReason("");
                  }}
                  className="w-full rounded-md border border-[#d97706] px-3 py-2 text-sm font-bold text-[#9a3412] transition hover:bg-[#fff5d6]"
                >
                  Solicitar correção
                </button>
              </div>
            )}

            {action !== null && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#1f2c47]">
                  Motivo (obrigatório)
                  <textarea
                    data-testid="moderation-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-[#d7ddea] p-2 text-sm"
                    placeholder={
                      action === "reject"
                        ? "Ex.: Foto não confere com o veículo descrito."
                        : "Ex.: Adicione foto da traseira do veículo."
                    }
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid="moderation-confirm"
                    onClick={() => doSubmitWithReason(action)}
                    disabled={submitting || !reason.trim()}
                    className="flex-1 rounded-md bg-[#1a56db] px-3 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                  >
                    {action === "reject" ? "Confirmar rejeição" : "Enviar solicitação"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAction(null);
                      setReason("");
                      setErrorMsg(null);
                    }}
                    className="rounded-md border border-[#d7ddea] px-3 py-2 text-sm font-semibold text-[#34405e]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
