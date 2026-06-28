"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  adminApi,
  type PlanRow,
  type HighlightRow,
  type HighlightSummary,
  type CommercialSettingsResponse,
  type CommercialSettings,
} from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminKpiCard } from "@/components/admin/AdminKpiCard";
import { AdminFiltersBar } from "@/components/admin/AdminFiltersBar";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";

type Tab = "planos" | "destaques" | "regras";

function money(n: number | string | undefined | null) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | undefined | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function commercialLayerLabel(priority_level: number, highlightActive: boolean) {
  // espelha src/modules/ads/filters/ads-ranking.sql.js#commercialLayerExpr
  if (highlightActive) return "4 — Destaque";
  if (priority_level >= 80) return "3 — Pro";
  if (priority_level >= 50) return "2 — Start";
  return "1 — Grátis";
}

export default function AdminComercialHub() {
  const [tab, setTab] = useState<Tab>("planos");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold text-cnc-text">Comercial</h1>
        <p className="mt-1 text-xs text-cnc-muted">
          Gestão de planos, destaques e regras comerciais globais. Mudanças sensíveis registram
          motivo em <code>admin_actions</code>.
        </p>
      </header>

      <nav className="flex items-center gap-1 border-b border-cnc-line">
        <TabButton current={tab} value="planos" onClick={() => setTab("planos")}>
          Planos
        </TabButton>
        <TabButton current={tab} value="destaques" onClick={() => setTab("destaques")}>
          Destaques
        </TabButton>
        <TabButton current={tab} value="regras" onClick={() => setTab("regras")}>
          Regras comerciais
        </TabButton>
      </nav>

      {tab === "planos" && <PlansTab />}
      {tab === "destaques" && <HighlightsTab />}
      {tab === "regras" && <CommercialRulesTab />}
    </div>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-cnc-muted hover:text-cnc-text"
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab Planos
// ─────────────────────────────────────────────────────────────
function PlansTab() {
  const router = useRouter();
  const list = useAdminFetch(() => adminApi.plans.list(), []);
  const [confirm, setConfirm] = useState<
    | { type: "none" }
    | { type: "toggle"; plan: PlanRow }
  >({ type: "none" });
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function showFlash(kind: "success" | "error", text: string) {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash((c) => (c?.text === text ? null : c)), 4000);
  }

  const plans = list.data?.data ?? [];
  const activePlans = plans.filter((p) => p.is_active).length;
  const totalSubscriptions = plans.reduce((sum, p) => sum + (p.active_subscriptions || 0), 0);

  async function handleToggle(plan: PlanRow, reason: string) {
    await adminApi.plans.setActive(plan.id, !plan.is_active, reason);
    setConfirm({ type: "none" });
    await list.reload();
    showFlash("success", `Plano ${plan.id} ${plan.is_active ? "desativado" : "ativado"}.`);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminKpiCard label="Planos ativos" value={activePlans} color="#059669" />
        <AdminKpiCard label="Planos totais" value={plans.length} />
        <AdminKpiCard label="Assinaturas ativas" value={totalSubscriptions} color="#1a56db" />
        <AdminKpiCard
          label="Planos públicos"
          value={plans.filter((p) => p.public_visible && p.is_active).length}
        />
      </div>

      {flash && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            flash.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-cnc-danger/40 bg-cnc-danger/10 text-cnc-danger"
          }`}
        >
          {flash.text}
        </div>
      )}

      <div className="flex items-center justify-end">
        <Link
          href="/admin/comercial/planos/novo"
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-strong transition-colors"
        >
          + Criar plano
        </Link>
      </div>

      {list.loading ? (
        <AdminLoadingState message="Carregando planos…" />
      ) : list.error ? (
        <AdminErrorState message={list.error} onRetry={list.reload} />
      ) : plans.length === 0 ? (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card">
          <AdminEmptyState message="Nenhum plano cadastrado." />
        </div>
      ) : (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-b border-cnc-line">
                  <Th>Slug</Th>
                  <Th>Nome</Th>
                  <Th>Tipo</Th>
                  <Th>Preço</Th>
                  <Th>Ad limit</Th>
                  <Th>Peso</Th>
                  <Th>Camada</Th>
                  <Th>Status</Th>
                  <Th>Assinaturas</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-t border-cnc-line/60">
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">{p.id}</td>
                    <td className="px-4 py-2.5 font-medium text-cnc-text max-w-[220px] truncate">
                      {p.name}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">{p.type}</td>
                    <td className="px-4 py-2.5 font-semibold text-cnc-text">{money(p.price)}</td>
                    <td className="px-4 py-2.5 text-center font-mono text-cnc-muted">
                      {p.ad_limit}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-cnc-muted">{p.weight}</td>
                    <td className="px-4 py-2.5 text-cnc-muted">
                      {commercialLayerLabel(p.priority_level, false)}
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminStatusBadge status={p.is_active ? "active" : "deleted"} />
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-cnc-muted">
                      {p.active_subscriptions}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link
                        href={`/admin/comercial/planos/${encodeURIComponent(p.id)}`}
                        className="text-xs font-semibold text-primary hover:underline mr-3"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirm({ type: "toggle", plan: p })}
                        className="text-xs font-semibold text-cnc-warning hover:underline"
                      >
                        {p.is_active ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirm.type === "toggle" && (
        <AdminActionDialog
          open
          title={confirm.plan.is_active ? "Desativar plano?" : "Ativar plano?"}
          description={`${confirm.plan.id} — ${confirm.plan.name}. Mudança de status registra em admin_actions.`}
          confirmLabel={confirm.plan.is_active ? "Desativar" : "Ativar"}
          confirmColor={confirm.plan.is_active ? "warning" : "primary"}
          showReason
          requireReason
          reasonPlaceholder="Motivo (registrado em admin_actions)"
          onConfirm={(reason) => handleToggle(confirm.plan, reason)}
          onCancel={() => setConfirm({ type: "none" })}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab Destaques
// ─────────────────────────────────────────────────────────────
function HighlightsTab() {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({ mode: "active" });
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({ mode: "active" });
  const [offset, setOffset] = useState(0);

  const list = useAdminFetch(
    () => adminApi.highlights.list({ ...activeFilters, limit: 30, offset }),
    [activeFilters, offset]
  );
  const summary = useAdminFetch<{ ok: boolean; data: HighlightSummary }>(
    () => adminApi.highlights.summary(),
    []
  );

  const rows = (list.data?.data ?? []) as HighlightRow[];
  const total = list.data?.total ?? 0;
  const counts = summary.data?.data ?? { active: 0, expiring: 0, expired: 0 };

  function handleSearch() {
    setOffset(0);
    setActiveFilters({ ...filters, mode: filters.mode || "active" });
  }
  function handleClear() {
    setFilters({ mode: "active" });
    setActiveFilters({ mode: "active" });
    setOffset(0);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <AdminKpiCard label="Destaques ativos" value={counts.active} color="#7c3aed" />
        <AdminKpiCard label="Vencendo (≤3d)" value={counts.expiring} color="#d97706" />
        <AdminKpiCard label="Expirados" value={counts.expired} color="#4b5563" />
      </div>

      <AdminFiltersBar
        filters={[
          {
            key: "mode",
            label: "Modo",
            type: "select",
            options: [
              { value: "active", label: "Ativos" },
              { value: "expiring", label: "Vencendo (≤3 dias)" },
              { value: "expired", label: "Expirados" },
            ],
          },
          { key: "city", label: "Cidade/UF", type: "text", placeholder: "São Paulo ou SP" },
          { key: "ad_id", label: "ID do anúncio", type: "text", placeholder: "Ex.: 83" },
        ]}
        values={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        onClear={handleClear}
      />

      <p className="text-[11px] text-cnc-muted-soft">
        Para aplicar, estender ou remover destaque, abra o anúncio — a mutation usa o endpoint
        existente <code>PATCH /api/admin/ads/:id/highlight</code> que já audita em{" "}
        <code>admin_actions</code> com <code>target_type=&apos;ad&apos;</code>.
      </p>

      {list.loading ? (
        <AdminLoadingState message="Carregando destaques…" />
      ) : list.error ? (
        <AdminErrorState message={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card">
          <AdminEmptyState message="Nenhum destaque encontrado." />
        </div>
      ) : (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-b border-cnc-line">
                  <Th>ID</Th>
                  <Th>Anúncio</Th>
                  <Th>Cidade</Th>
                  <Th>Anunciante</Th>
                  <Th>Plano</Th>
                  <Th>Highlight até</Th>
                  <Th>Status anúncio</Th>
                  <Th>Ação</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.ad_id} className="border-t border-cnc-line/60">
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">#{h.ad_id}</td>
                    <td className="px-4 py-2.5 font-medium text-cnc-text max-w-[260px] truncate">
                      {h.ad_title ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">
                      {h.ad_city && h.ad_state ? `${h.ad_city}/${h.ad_state}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">{h.advertiser_name ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">{h.user_plan_id ?? "—"}</td>
                    <td className="px-4 py-2.5 text-cnc-text whitespace-nowrap">
                      {fmtDate(h.highlight_until)}
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminStatusBadge status={h.ad_status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/anuncios/${h.ad_id}`)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Abrir anúncio →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination total={total} limit={30} offset={offset} onChange={setOffset} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab Regras comerciais
// ─────────────────────────────────────────────────────────────
function CommercialRulesTab() {
  const data = useAdminFetch<{ ok: boolean; data: CommercialSettingsResponse }>(
    () => adminApi.commercialSettings.get(),
    []
  );
  const [draft, setDraft] = useState<Partial<CommercialSettings>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (data.loading) return <AdminLoadingState message="Carregando regras…" />;
  if (data.error) return <AdminErrorState message={data.error} onRetry={data.reload} />;

  const current = data.data?.data?.settings;
  const ranges = data.data?.data?.ranges;
  const behaviors = data.data?.data?.duplicate_behaviors_supported ?? [
    "extend_duration",
    "replace",
    "block_duplicate",
  ];
  if (!current || !ranges) return <AdminErrorState message="Resposta inválida do backend." />;

  function val<K extends keyof CommercialSettings>(key: K): CommercialSettings[K] {
    return (draft[key] ?? current![key]) as CommercialSettings[K];
  }

  function setField<K extends keyof CommercialSettings>(key: K, value: CommercialSettings[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const hasChanges = Object.keys(draft).length > 0;

  // Status derivado do produto avulso: não há flag dedicada "boost ativo"
  // em platform_settings; o produto está efetivamente ativo enquanto ao
  // menos um tipo de documento (CPF/CNPJ) pode comprá-lo. Sem criar setting nova.
  const boostActive = Boolean(val("allow_boost_cpf") || val("allow_boost_cnpj"));
  const boostPriceReais = (val("boost_default_price_cents") || 0) / 100;
  const boostDays = val("boost_default_days");

  async function save() {
    if (!hasChanges) return;
    if (!reason.trim()) {
      setFlash({ kind: "error", text: "Informe um motivo para alterar regras comerciais." });
      return;
    }
    setBusy(true);
    try {
      await adminApi.commercialSettings.update(draft, reason.trim());
      setDraft({});
      setReason("");
      await data.reload();
      setFlash({ kind: "success", text: "Regras comerciais atualizadas." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao salvar.";
      setFlash({ kind: "error", text: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Estas configurações afetam o produto inteiro (preço/duração de destaque avulso, comportamento
        de compra duplicada, trava do plano Pro). Toda alteração registra motivo em{" "}
        <code>admin_actions</code>.
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
        <p className="text-[11px] font-bold uppercase tracking-wider text-cnc-muted">
          Produtos avulsos · Impulsionamentos
        </p>

        {/* Card de identidade do produto avulso "Destaque 7 dias".
            Reflete os valores vivos de platform_settings (commercial.boost_*)
            e atualiza conforme o admin edita os campos abaixo. NÃO é
            assinatura: não toca user_subscriptions nem users.plan_id. */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-cnc-text">Destaque {boostDays} dias</h2>
              <p className="mt-0.5 text-[11px] text-cnc-muted">
                Tipo: Produto avulso / impulsionamento · Fonte:{" "}
                <code>platform_settings</code> (commercial.boost_default_*)
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
                boostActive ? "bg-emerald-100 text-emerald-700" : "bg-cnc-bg text-cnc-muted"
              }`}
            >
              {boostActive ? "Ativo" : "Inativo"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryStat label="Preço atual" value={money(boostPriceReais)} />
            <SummaryStat label="Duração" value={`${boostDays} dias`} />
            <SummaryStat label="Cobrança" value="Avulsa (por anúncio)" />
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-cnc-muted-soft">
            Não altera o limite de anúncios, não libera vídeo 360, não altera a quantidade de fotos
            e não altera o plano do usuário. Pagamento avulso via Mercado Pago (rota{" "}
            <code>/api/payments/boost-7d/checkout</code>); o benefício aprovado aplica em{" "}
            <code>ads.highlight_until</code>. Não cria assinatura nem conta em{" "}
            <code>user_subscriptions</code>.
          </p>
        </div>

        <h3 className="text-xs font-bold uppercase tracking-wide text-cnc-muted">
          Editar configuração
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field
            label="Preço padrão (centavos)"
            hint={`Em R$ ${(ranges.boost_default_price_cents.min / 100).toFixed(2)}–${(ranges.boost_default_price_cents.max / 100).toFixed(2)} · gravado em centavos`}
          >
            <input
              type="number"
              min={ranges.boost_default_price_cents.min}
              max={ranges.boost_default_price_cents.max}
              value={val("boost_default_price_cents")}
              onChange={(e) => setField("boost_default_price_cents", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-cnc-muted-soft">
              Em R$: {(val("boost_default_price_cents") / 100).toFixed(2)}
            </p>
          </Field>

          <Field
            label="Duração padrão (dias)"
            hint={`Range: ${ranges.boost_default_days.min}–${ranges.boost_default_days.max}`}
          >
            <input
              type="number"
              min={ranges.boost_default_days.min}
              max={ranges.boost_default_days.max}
              value={val("boost_default_days")}
              onChange={(e) => setField("boost_default_days", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>

          <Field
            label="Limite máx. extensão (dias)"
            hint={`Range: ${ranges.boost_max_extension_days.min}–${ranges.boost_max_extension_days.max}`}
          >
            <input
              type="number"
              min={ranges.boost_max_extension_days.min}
              max={ranges.boost_max_extension_days.max}
              value={val("boost_max_extension_days")}
              onChange={(e) => setField("boost_max_extension_days", Number(e.target.value))}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <Field label="Comportamento em compra duplicada" hint="extend_duration soma os dias">
          <select
            value={val("boost_duplicate_behavior")}
            onChange={(e) =>
              setField(
                "boost_duplicate_behavior",
                e.target.value as CommercialSettings["boost_duplicate_behavior"]
              )
            }
            className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
          >
            {behaviors.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-xs text-cnc-text">
            <input
              type="checkbox"
              checked={val("allow_boost_cpf")}
              onChange={(e) => setField("allow_boost_cpf", e.target.checked)}
            />
            Permitir compra de destaque por CPF
          </label>
          <label className="flex items-center gap-2 text-xs text-cnc-text">
            <input
              type="checkbox"
              checked={val("allow_boost_cnpj")}
              onChange={(e) => setField("allow_boost_cnpj", e.target.checked)}
            />
            Permitir compra de destaque por CNPJ
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-4">
        <h2 className="text-sm font-bold text-cnc-text">Trava técnica</h2>
        <Field
          label="Pro ad_limit_guard"
          hint={`Limite máximo efetivo de anúncios do plano Pro. Range: ${ranges.pro_ad_limit_guard.min}–${ranges.pro_ad_limit_guard.max}`}
        >
          <input
            type="number"
            min={ranges.pro_ad_limit_guard.min}
            max={ranges.pro_ad_limit_guard.max}
            value={val("pro_ad_limit_guard")}
            onChange={(e) => setField("pro_ad_limit_guard", Number(e.target.value))}
            className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
          />
        </Field>
      </section>

      <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-3">
        <h2 className="text-sm font-bold text-cnc-text">Confirmar mudança</h2>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo — obrigatório (ex.: 'ajuste comercial Q3 2026')"
          rows={3}
          maxLength={500}
          className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={!hasChanges || busy}
            onClick={() => setDraft({})}
            className="rounded-lg border border-cnc-line px-4 py-2 text-xs font-semibold text-cnc-muted disabled:opacity-50"
          >
            Descartar mudanças
          </button>
          <button
            type="button"
            disabled={!hasChanges || busy || !reason.trim()}
            onClick={save}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-strong disabled:opacity-50"
          >
            {busy ? "Salvando…" : "Salvar regras"}
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
      <span className="font-semibold text-cnc-text">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-cnc-muted-soft">{hint}</span>}
    </label>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-amber-200/70 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-cnc-muted-soft">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold text-cnc-text">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  );
}
