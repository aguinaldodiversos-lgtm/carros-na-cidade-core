"use client";

import { useParams, useRouter } from "next/navigation";
import { adminApi, type AdminUserDetail } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminAccountTypeBadge, AdminRoleBadge } from "@/components/admin/AdminAccountBadges";

/**
 * Admin U1 — detalhe de uma CONTA.
 *
 * Identidade + atividade, sem nenhuma ação. Os botões de operação comercial
 * (ativar/suspender/bloquear loja, conceder ou revogar plano, mexer em anúncio)
 * continuam em /admin/anunciantes/[advertiserId] — aqui há apenas o link.
 * Duplicá-los criaria duas telas capazes de escrever a mesma regra, e um dia as
 * duas divergiriam.
 */

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted">
        {label}
      </div>
      <div className="mt-1 break-words text-sm text-cnc-text">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-cnc-line bg-cnc-bg/40 px-4 py-3">
      <div className="text-xl font-bold text-cnc-text">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-cnc-muted">
        {label}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-cnc-line bg-white shadow-card">
      <h2 className="border-b border-cnc-line px-5 py-3 text-sm font-bold text-cnc-text">
        {title}
      </h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function AdminUsuarioDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, loading, error, reload } = useAdminFetch<{ ok: boolean; data: AdminUserDetail }>(
    () => adminApi.users.get(id),
    [id]
  );

  if (loading) return <AdminLoadingState />;
  if (error) return <AdminErrorState message={error} onRetry={reload} />;

  const user = data?.data;
  if (!user) return <AdminEmptyState message="Usuário não encontrado" />;

  const { activity } = user;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push("/admin/usuarios")}
          className="rounded-lg border border-cnc-line px-3 py-1.5 text-xs font-medium text-cnc-muted hover:bg-cnc-bg transition-colors"
        >
          ← Usuários
        </button>
        <h1 className="text-lg font-bold text-cnc-text">{user.name || "Sem nome"}</h1>
        <span className="font-mono text-xs text-cnc-muted">#{user.id}</span>
      </div>

      <Card title="Conta">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nome">{user.name || "—"}</Field>
          <Field label="E-mail">{user.email || "—"}</Field>
          <Field label="Tipo">
            <AdminAccountTypeBadge accountType={user.account_type} />
          </Field>
          <Field label="Papel">
            <AdminRoleBadge role={user.role} />
          </Field>
          {/* Plano EFETIVO — users.plan_id, a mesma fonte que decide os
              benefícios da conta. Nunca advertisers.plan. */}
          <Field label="Plano">{user.plan?.name || user.plan?.id || "Gratuito"}</Field>
          <Field label="E-mail verificado">{user.email_verified ? "Sim" : "Não"}</Field>
          <Field label="Cadastro">{fmtDate(user.created_at)}</Field>
          {/* Renderizado SÓ quando vigente. O backend já devolve null para
              travas vencidas — e isto não é bloqueio administrativo: é a
              proteção anti-força-bruta do login, que expira sozinha. */}
          {user.locked_until && (
            <Field label="Bloqueio temporário">
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                Até {fmtDate(user.locked_until)}
              </span>
            </Field>
          )}
        </div>
      </Card>

      <Card title="Atividade">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Lojas" value={activity.advertisers_count} />
          <Stat label="Anúncios ativos" value={activity.ads_active_count} />
          <Stat label="Anúncios (total)" value={activity.ads_total_count} />
          <Stat label="Procuras" value={activity.purchase_intents_count} />
          <Stat label="Veículos recebidos" value={activity.received_offers_count} />
        </div>
        {activity.purchase_intents_count > 0 && (
          <p className="mt-3 text-xs text-cnc-muted">
            {activity.purchase_intents_live_count} de {activity.purchase_intents_count} procuras
            estão ativas e dentro do prazo.
          </p>
        )}
      </Card>

      <Card title="Anunciantes vinculados">
        {user.advertisers.length === 0 ? (
          <p className="text-sm text-cnc-muted">
            Esta conta não possui loja. O cadastro de anunciante é criado apenas na publicação do
            primeiro anúncio.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-cnc-line">
                  {["ID", "Loja", "Cidade", "Status", "Criada", ""].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className="px-3 py-2 font-semibold uppercase tracking-wider text-cnc-muted whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Pode haver MAIS DE UMA loja: advertisers.user_id não tem
                    UNIQUE. A tabela lista todas em vez de assumir a primeira. */}
                {user.advertisers.map((adv) => (
                  <tr key={adv.id} className="border-t border-cnc-line/60">
                    <td className="px-3 py-2 font-mono text-cnc-muted">#{adv.id}</td>
                    <td className="px-3 py-2 font-medium text-cnc-text">{adv.name || "—"}</td>
                    <td className="px-3 py-2 text-cnc-muted whitespace-nowrap">
                      {adv.city ? `${adv.city.name}${adv.city.state ? `/${adv.city.state}` : ""}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <AdminStatusBadge status={adv.status} />
                    </td>
                    <td className="px-3 py-2 text-cnc-muted whitespace-nowrap">
                      {fmtDate(adv.created_at)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        onClick={() => router.push(`/admin/anunciantes/${adv.id}`)}
                        className="rounded-lg bg-primary px-3 py-1 text-[11px] font-semibold text-white hover:bg-primary-strong transition-colors"
                      >
                        Gerenciar anunciante
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {user.recent_purchase_intents.length > 0 && (
        <Card title="Compradores Ativos — últimas procuras">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-cnc-line">
                  {["Procura", "Cidade", "Status", "Publicada"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 font-semibold uppercase tracking-wider text-cnc-muted whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {user.recent_purchase_intents.map((pi) => (
                  <tr key={pi.id} className="border-t border-cnc-line/60">
                    <td className="px-3 py-2 font-medium text-cnc-text">
                      {[pi.brand, pi.model].filter(Boolean).join(" ") || pi.body_type || "—"}
                    </td>
                    <td className="px-3 py-2 text-cnc-muted whitespace-nowrap">
                      {pi.city ? `${pi.city.name}${pi.city.state ? `/${pi.city.state}` : ""}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <AdminStatusBadge status={pi.status || "—"} />
                    </td>
                    <td className="px-3 py-2 text-cnc-muted whitespace-nowrap">
                      {fmtDate(pi.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
