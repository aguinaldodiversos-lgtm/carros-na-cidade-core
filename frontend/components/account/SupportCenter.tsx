"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTicket,
  getMyTicket,
  listMyTickets,
  replyToMyTicket,
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_LIMITS,
  SUPPORT_STATUS_LABEL,
  type SupportMessage,
  type SupportTicket,
  type SupportTicketStatus,
} from "@/lib/support/api";

/**
 * Centro de atendimento do painel — COMPARTILHADO entre particular
 * (/dashboard) e lojista (/dashboard-loja). Montado por duas páginas finas que
 * só passam o basePath. Fluxos: lista de chamados → abrir chamado (form) →
 * conversa em thread com caixa de resposta. Estados de loading/vazio/erro
 * tratados em todos os caminhos.
 *
 * O conteúdo (assunto/mensagens) é renderizado como TEXTO puro (React escapa
 * por padrão) — nunca via dangerouslySetInnerHTML — então input do usuário não
 * vira HTML no DOM.
 */

type Props = { basePath: "/dashboard" | "/dashboard-loja" };

const STATUS_STYLES: Record<SupportTicketStatus, string> = {
  aberto: "bg-[#e6f0ff] text-[#0e62d8]",
  em_andamento: "bg-[#fef3c7] text-[#b45309]",
  resolvido: "bg-[#dcfce7] text-[#15803d]",
};

function StatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {SUPPORT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function fmtDate(d?: string | null) {
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

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0e62d8] border-t-transparent" />
      <span className="text-sm text-[#64748b]">{label}</span>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6 text-center">
      <p className="text-sm font-semibold text-[#b91c1c]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg bg-[#0e62d8] px-4 py-1.5 text-xs font-bold text-white hover:brightness-110"
      >
        Tentar novamente
      </button>
    </div>
  );
}

export default function SupportCenter({ basePath }: Props) {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [mode, setMode] = useState<"list" | "new">("list");

  const [activeId, setActiveId] = useState<number | null>(null);
  const [thread, setThread] = useState<{
    ticket: SupportTicket;
    messages: SupportMessage[];
  } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await listMyTickets();
      setTickets(res.tickets ?? []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Falha ao carregar seus chamados.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openTicket = useCallback(async (id: number) => {
    setActiveId(id);
    setMode("list");
    setThread(null);
    setThreadError(null);
    setThreadLoading(true);
    try {
      const res = await getMyTicket(id);
      setThread({ ticket: res.ticket, messages: res.messages ?? [] });
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : "Falha ao carregar a conversa.");
    } finally {
      setThreadLoading(false);
    }
  }, []);

  // Deep-link do e-mail (?ticket=ID) — abre direto a conversa. Lido do window
  // para não exigir Suspense do useSearchParams.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("ticket");
    const id = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isInteger(id) && id > 0) {
      openTicket(id);
    }
  }, [openTicket]);

  function backToList() {
    setActiveId(null);
    setThread(null);
    setThreadError(null);
    setMode("list");
  }

  // ── Thread aberta ──────────────────────────────────────────────────────
  if (activeId !== null) {
    return (
      <ThreadView
        loading={threadLoading}
        error={threadError}
        data={thread}
        onRetry={() => openTicket(activeId)}
        onBack={backToList}
        onReplied={(updated, message) => {
          setThread((prev) =>
            prev ? { ticket: updated, messages: [...prev.messages, message] } : prev
          );
          // Mantém a lista coerente ao voltar.
          setTickets((prev) =>
            prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev
          );
        }}
      />
    );
  }

  // ── Novo chamado ───────────────────────────────────────────────────────
  if (mode === "new") {
    return (
      <NewTicketForm
        onCancel={() => setMode("list")}
        onCreated={async (ticket) => {
          await loadList();
          openTicket(ticket.id);
        }}
      />
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0f172a]">Atendimento</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Abra um chamado e converse com o nosso time. Respondemos por aqui e avisamos por
            e-mail.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode("new")}
          className="inline-flex h-11 items-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] hover:brightness-110"
        >
          + Abrir chamado
        </button>
      </div>

      {loadingList ? (
        <Spinner label="Carregando seus chamados…" />
      ) : listError ? (
        <ErrorBox message={listError} onRetry={loadList} />
      ) : !tickets || tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#cfd8e8] bg-white p-10 text-center">
          <p className="text-sm font-semibold text-[#334155]">
            Você ainda não abriu nenhum chamado.
          </p>
          <p className="mt-1 text-sm text-[#94a3b8]">
            Precisa de ajuda? Abra um chamado e a gente responde.
          </p>
          <button
            type="button"
            onClick={() => setMode("new")}
            className="mt-4 inline-flex h-10 items-center rounded-xl border border-[#cfe0fc] bg-[#f0f6ff] px-4 text-sm font-bold text-[#0e62d8] hover:bg-[#e6f0ff]"
          >
            + Abrir chamado
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => openTicket(t.id)}
                className="flex w-full items-center gap-4 rounded-2xl border border-[#e8ecf4] bg-white p-4 text-left transition hover:border-[#cfe0fc] hover:bg-[#f8fbff]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-[#1d2538]">{t.subject}</span>
                    <span className="shrink-0 font-mono text-[11px] text-[#94a3b8]">#{t.id}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#64748b]">
                    Última atividade: {fmtDate(t.last_message_at)}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Novo chamado
// ─────────────────────────────────────────────────────────────────────────
function NewTicketForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (ticket: SupportTicket) => void | Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      subject.trim().length >= SUPPORT_LIMITS.SUBJECT_MIN &&
      subject.trim().length <= SUPPORT_LIMITS.SUBJECT_MAX &&
      body.trim().length >= SUPPORT_LIMITS.BODY_MIN &&
      body.trim().length <= SUPPORT_LIMITS.BODY_MAX &&
      !submitting
    );
  }, [subject, body, submitting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createTicket({
        subject: subject.trim(),
        category: category || undefined,
        body: body.trim(),
      });
      await onCreated(res.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o chamado.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm font-bold text-[#0e62d8] hover:underline"
      >
        ← Voltar
      </button>
      <h1 className="text-2xl font-extrabold text-[#0f172a]">Abrir chamado</h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-[#e8ecf4] bg-white p-5"
      >
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
            Assunto
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={SUPPORT_LIMITS.SUBJECT_MAX}
            placeholder="Resuma o que você precisa"
            className="mt-1 h-11 w-full rounded-xl border border-[#dfe4ef] px-3 text-sm text-[#1d2538] focus:border-[#0e62d8] focus:outline-none focus:ring-1 focus:ring-[#0e62d8]/30"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
            Categoria (opcional)
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-[#dfe4ef] bg-white px-3 text-sm text-[#1d2538] focus:border-[#0e62d8] focus:outline-none focus:ring-1 focus:ring-[#0e62d8]/30"
          >
            <option value="">Selecione…</option>
            {SUPPORT_CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
            Mensagem
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={SUPPORT_LIMITS.BODY_MAX}
            rows={6}
            placeholder="Descreva com detalhes o que está acontecendo"
            className="mt-1 w-full rounded-xl border border-[#dfe4ef] px-3 py-2 text-sm text-[#1d2538] focus:border-[#0e62d8] focus:outline-none focus:ring-1 focus:ring-[#0e62d8]/30"
          />
          <p className="mt-1 text-right text-[11px] text-[#94a3b8]">
            {body.trim().length}/{SUPPORT_LIMITS.BODY_MAX}
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-[#fef2f2] px-3 py-2 text-sm font-semibold text-[#b91c1c]">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-xl border border-[#dfe4ef] px-4 text-sm font-bold text-[#64748b] hover:bg-[#f8fafc]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="h-11 rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Enviar chamado"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Conversa (thread)
// ─────────────────────────────────────────────────────────────────────────
function ThreadView({
  loading,
  error,
  data,
  onRetry,
  onBack,
  onReplied,
}: {
  loading: boolean;
  error: string | null;
  data: { ticket: SupportTicket; messages: SupportMessage[] } | null;
  onRetry: () => void;
  onBack: () => void;
  onReplied: (ticket: SupportTicket, message: SupportMessage) => void;
}) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = reply.trim();
    if (!data || trimmed.length < SUPPORT_LIMITS.BODY_MIN || sending) return;
    setSending(true);
    setReplyError(null);
    try {
      const res = await replyToMyTicket(data.ticket.id, trimmed);
      onReplied(res.ticket, res.message);
      setReply("");
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Não foi possível enviar a resposta.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-bold text-[#0e62d8] hover:underline">
        ← Meus chamados
      </button>

      {loading ? (
        <Spinner label="Carregando conversa…" />
      ) : error ? (
        <ErrorBox message={error} onRetry={onRetry} />
      ) : !data ? (
        <ErrorBox message="Conversa não encontrada." onRetry={onRetry} />
      ) : (
        <>
          <div className="rounded-2xl border border-[#e8ecf4] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold text-[#0f172a]">{data.ticket.subject}</h1>
                <p className="mt-0.5 text-xs text-[#94a3b8]">
                  Chamado #{data.ticket.id} · aberto em {fmtDate(data.ticket.created_at)}
                </p>
              </div>
              <StatusBadge status={data.ticket.status} />
            </div>
          </div>

          <div className="space-y-3">
            {data.messages.map((m) => {
              const isUser = m.author_role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      isUser
                        ? "bg-[#0e62d8] text-white"
                        : "border border-[#e8ecf4] bg-white text-[#1d2538]"
                    }`}
                  >
                    <p className={`text-[11px] font-bold ${isUser ? "text-white/70" : "text-[#94a3b8]"}`}>
                      {isUser ? "Você" : "Suporte"} · {fmtDate(m.created_at)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {data.ticket.status === "resolvido" && (
            <p className="rounded-xl bg-[#f0fdf4] px-4 py-2 text-center text-xs font-semibold text-[#15803d]">
              Este chamado está resolvido. Se responder, ele reabre automaticamente.
            </p>
          )}

          <form
            onSubmit={handleReply}
            className="space-y-3 rounded-2xl border border-[#e8ecf4] bg-white p-4"
          >
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={SUPPORT_LIMITS.BODY_MAX}
              rows={4}
              placeholder="Escreva sua resposta"
              className="w-full rounded-xl border border-[#dfe4ef] px-3 py-2 text-sm text-[#1d2538] focus:border-[#0e62d8] focus:outline-none focus:ring-1 focus:ring-[#0e62d8]/30"
            />
            {replyError && (
              <p className="rounded-lg bg-[#fef2f2] px-3 py-2 text-sm font-semibold text-[#b91c1c]">
                {replyError}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={reply.trim().length < SUPPORT_LIMITS.BODY_MIN || sending}
                className="h-11 rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Enviando…" : "Responder"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
