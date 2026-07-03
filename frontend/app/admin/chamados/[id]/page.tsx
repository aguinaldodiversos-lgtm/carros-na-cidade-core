"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  adminApi,
  SUPPORT_STATUS_LABEL,
  type SupportTicketDetail,
  type SupportTicketStatus,
} from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

const ACCOUNT_LABEL: Record<string, string> = {
  CNPJ: "Lojista",
  CPF: "Particular",
  pending: "Cadastro incompleto",
};

function fmtDate(d: string | undefined | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AdminChamadoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const ticket = useAdminFetch<{ ok: boolean; data: SupportTicketDetail }>(
    () => adminApi.support.get(id),
    [id]
  );

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [busyStatus, setBusyStatus] = useState<SupportTicketStatus | null>(null);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function showFlash(kind: "success" | "error", text: string) {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash((c) => (c?.text === text ? null : c)), 4000);
  }

  if (ticket.loading) return <AdminLoadingState message="Carregando chamado…" />;
  if (ticket.error) return <AdminErrorState message={ticket.error} onRetry={ticket.reload} />;

  const d = ticket.data?.data;
  if (!d) return <AdminEmptyState message="Chamado não encontrado" />;

  const t = d.ticket;
  const messages = d.messages ?? [];

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await adminApi.support.reply(t.id, body);
      setReply("");
      await ticket.reload();
      showFlash("success", "Resposta enviada. O usuário foi avisado por e-mail.");
    } catch (err) {
      showFlash("error", err instanceof Error ? err.message : "Falha ao enviar resposta.");
    } finally {
      setSending(false);
    }
  }

  async function handleStatus(status: SupportTicketStatus) {
    if (busyStatus) return;
    setBusyStatus(status);
    try {
      await adminApi.support.changeStatus(t.id, status);
      await ticket.reload();
      showFlash("success", `Status alterado para "${SUPPORT_STATUS_LABEL[status]}".`);
    } catch (err) {
      showFlash("error", err instanceof Error ? err.message : "Falha ao mudar status.");
    } finally {
      setBusyStatus(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/chamados")}
          className="rounded-lg border border-cnc-line px-3 py-1.5 text-xs font-medium text-cnc-muted hover:bg-cnc-bg transition-colors"
        >
          ← Voltar
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-lg font-bold text-cnc-text">{t.subject}</h1>
          <p className="text-xs text-cnc-muted">
            Chamado #{t.id} · aberto em {fmtDate(t.created_at)} · última atividade{" "}
            {fmtDate(t.last_message_at)}
          </p>
        </div>
        <AdminStatusBadge status={t.status} />
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Conversa + resposta */}
        <div className="lg:col-span-2 space-y-4">
          <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-3">
            <h2 className="text-sm font-bold text-cnc-text">Conversa</h2>
            {messages.length === 0 ? (
              <p className="text-xs text-cnc-muted-soft italic">Sem mensagens.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const isAdmin = m.author_role === "admin";
                  return (
                    <div key={m.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          isAdmin
                            ? "bg-primary text-white"
                            : "border border-cnc-line bg-cnc-bg/40 text-cnc-text"
                        }`}
                      >
                        <p
                          className={`text-[11px] font-bold ${
                            isAdmin ? "text-white/70" : "text-cnc-muted-soft"
                          }`}
                        >
                          {isAdmin ? "Suporte (admin)" : t.user_name || "Usuário"} ·{" "}
                          {fmtDate(m.created_at)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <form
            onSubmit={handleReply}
            className="space-y-3 rounded-xl border border-cnc-line bg-white p-5 shadow-card"
          >
            <h2 className="text-sm font-bold text-cnc-text">Responder</h2>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={5000}
              rows={4}
              placeholder="Escreva a resposta ao usuário"
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-cnc-muted-soft">
                Ao responder, o chamado vira “Em andamento” e o usuário é avisado por e-mail.
              </p>
              <button
                type="submit"
                disabled={!reply.trim() || sending}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-strong transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Enviando…" : "Enviar resposta"}
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar: autor + status */}
        <div className="space-y-4">
          <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-3">
            <h2 className="text-sm font-bold text-cnc-text">Autor</h2>
            <div className="grid grid-cols-1 gap-y-3 text-xs">
              <Info label="Nome" value={t.user_name ?? "—"} />
              <Info label="E-mail" value={t.user_email ?? "—"} />
              <Info
                label="Tipo de conta"
                value={ACCOUNT_LABEL[t.user_account_type] ?? t.user_account_type}
              />
              <Info label="Categoria" value={t.category ?? "—"} />
              <Info label="Usuário" value={t.user_id ? `#${t.user_id}` : "Conta removida"} />
            </div>
          </section>

          <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
            <h2 className="text-sm font-bold text-cnc-text mb-3">Status</h2>
            <div className="flex flex-wrap gap-2">
              {t.status !== "em_andamento" && (
                <ActionBtn
                  label="Marcar em andamento"
                  color="bg-cnc-warning text-white"
                  disabled={busyStatus !== null}
                  onClick={() => handleStatus("em_andamento")}
                />
              )}
              {t.status !== "resolvido" && (
                <ActionBtn
                  label="Marcar resolvido"
                  color="bg-cnc-success text-white"
                  disabled={busyStatus !== null}
                  onClick={() => handleStatus("resolvido")}
                />
              )}
              {t.status !== "aberto" && (
                <ActionBtn
                  label="Reabrir"
                  color="bg-cnc-muted text-white"
                  disabled={busyStatus !== null}
                  onClick={() => handleStatus("aberto")}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted">
        {label}
      </span>
      <p className="break-words text-cnc-text font-medium">{value}</p>
    </div>
  );
}

function ActionBtn({
  label,
  color,
  onClick,
  disabled,
}: {
  label: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
    >
      {label}
    </button>
  );
}
