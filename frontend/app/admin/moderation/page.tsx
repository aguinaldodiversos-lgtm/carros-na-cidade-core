"use client";

/**
 * UI mínima da fila de moderação (Tarefa 3 da rodada de validação).
 *
 * Consome:
 *   GET /api/admin/moderation/ads (com filtros opcionais)
 *
 * O guard do layout (`useAdminGuard`) garante que usuário comum nunca
 * chega aqui — o backend ainda revalida via `requireAdmin()`. Visual
 * segue o padrão dos demais painéis (`Admin*Card`, mesmas cores e
 * espaçamentos), sem refazer layout.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { adminApi, type ModerationAdRow } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";

function fmtMoney(n: string | number | null | undefined) {
  const v = typeof n === "string" ? Number(n) : n;
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtPercent(value: string | number | null | undefined) {
  const v = typeof value === "string" ? Number(value) : value;
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

const SEVERITY_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  low: { bg: "#e7f3ee", fg: "#15643c", label: "low" },
  medium: { bg: "#fff5d6", fg: "#7a5c00", label: "medium" },
  high: { bg: "#fde4ce", fg: "#9a3412", label: "high" },
  critical: { bg: "#fde2e1", fg: "#991b1b", label: "critical" },
};

function SeverityBadge({ level }: { level: string }) {
  const cfg = SEVERITY_STYLE[level] ?? SEVERITY_STYLE.low;
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      {cfg.label}
    </span>
  );
}

function reasonsTopCodes(reasons: ModerationAdRow["risk_reasons"]): string[] {
  if (!reasons) return [];
  const arr = Array.isArray(reasons)
    ? reasons
    : (() => {
        try {
          const parsed = JSON.parse(String(reasons));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
  return arr.slice(0, 3).map((r) => String(r?.code || "")).filter(Boolean);
}

export default function ModerationListPage() {
  const [severity, setSeverity] = useState<string>("");
  const [belowFipe, setBelowFipe] = useState<boolean>(false);
  const [cityId, setCityId] = useState<string>("");

  const queryParams = useMemo(() => {
    const p: Record<string, string | number | boolean> = {};
    if (severity) p.severity = severity;
    if (belowFipe) p.below_fipe_only = true;
    if (cityId.trim()) p.city_id = Number(cityId);
    return p;
  }, [severity, belowFipe, cityId]);

  const ads = useAdminFetch<{
    ok: boolean;
    data: ModerationAdRow[];
    total: number;
  }>(() => adminApi.moderation.list(queryParams), [queryParams]);

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1a56db]">
            Fila de moderação
          </h1>
          <p className="mt-1 text-sm text-[#5e6b85]">
            Anúncios em <code>pending_review</code> aguardando decisão. Ordenados
            por <strong>risk_score</strong> ↓ e data de criação ↑.
          </p>
        </div>
        <div className="text-sm text-[#5e6b85]" aria-live="polite">
          {ads.data ? `${ads.data.total ?? 0} anúncio(s) na fila` : ""}
        </div>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#e2e7f1] bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-medium text-[#1f2c47]">
          Severidade:
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="rounded-md border border-[#d7ddea] bg-white px-2 py-1 text-sm"
          >
            <option value="">Todas</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-[#1f2c47]">
          City ID:
          <input
            type="text"
            value={cityId}
            onChange={(e) => setCityId(e.target.value.replace(/\D/g, ""))}
            placeholder="ex: 42"
            className="w-24 rounded-md border border-[#d7ddea] px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-[#1f2c47]">
          <input
            type="checkbox"
            checked={belowFipe}
            onChange={(e) => setBelowFipe(e.target.checked)}
          />
          Apenas abaixo da FIPE (≤ -20%)
        </label>
      </section>

      {ads.loading && <AdminLoadingState />}
      {ads.error && <AdminErrorState message={String(ads.error)} />}

      {ads.data && (
        <div className="overflow-hidden rounded-xl border border-[#e2e7f1] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafe] text-left text-[12px] uppercase tracking-wide text-[#5e6b85]">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Veículo</th>
                <th className="px-3 py-2">Cidade</th>
                <th className="px-3 py-2">Anunciante</th>
                <th className="px-3 py-2 text-right">Preço</th>
                <th className="px-3 py-2 text-right">FIPE</th>
                <th className="px-3 py-2 text-right">Δ%</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2">Nível</th>
                <th className="px-3 py-2">Motivos</th>
                <th className="px-3 py-2">Criado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {ads.data.data.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-3 py-8 text-center text-[#5e6b85]"
                  >
                    Nenhum anúncio aguardando moderação.
                  </td>
                </tr>
              )}
              {ads.data.data.map((row) => {
                const top = reasonsTopCodes(row.risk_reasons);
                return (
                  <tr
                    key={row.id}
                    className="border-t border-[#e2e7f1] hover:bg-[#fafbff]"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-[#5e6b85]">
                      {row.id}
                    </td>
                    <td className="px-3 py-2 font-bold text-[#1f2c47]">
                      {row.brand} {row.model}{" "}
                      <span className="text-[#5e6b85]">{row.year}</span>
                    </td>
                    <td className="px-3 py-2 text-[#34405e]">
                      {row.city ?? "—"}/{row.state ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[#34405e]">
                      {row.advertiser_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-[#0e62d8]">
                      {fmtMoney(row.price)}
                    </td>
                    <td className="px-3 py-2 text-right text-[#34405e]">
                      {fmtMoney(row.fipe_reference_value)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtPercent(row.fipe_diff_percent)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-[#1f2c47]">
                      {row.risk_score}
                    </td>
                    <td className="px-3 py-2">
                      <SeverityBadge level={row.risk_level} />
                    </td>
                    <td className="px-3 py-2 text-[12px] text-[#5e6b85]">
                      {top.length > 0 ? top.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-[#5e6b85]">
                      {fmtDate(row.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/moderation/${row.id}`}
                        className="rounded-md bg-[#1a56db] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1849b0]"
                      >
                        Revisar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
